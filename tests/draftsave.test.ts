import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { WHEEL, type TeamSeason } from '../src/data/wheel'
import { POSITIONS, type Pos } from '../src/engine/positions'
import { makeRng } from '../src/engine/rng'
import type { Opponent } from '../src/engine/types'
import { draftKey, freshProgress, levelSeed, resetProgress, resetTutorialSaves, saveKey, type Progress } from '../src/state/campaign'
import {
  afterLeave,
  clearDraft,
  countedRng,
  draftAttempt,
  keepsDraft,
  LEAVE_SPENDS_ATTEMPT,
  leaveLoses,
  loadDraft,
  saveDraft,
  type DraftSave,
  type DraftState,
} from '../src/state/draftsave'
import { setViewMode } from '../src/state/viewmode'
import { bare, Draft, landOn, posOf } from '../src/ui/Draft'
import { buildReels } from '../src/ui/SpinReels'

/**
 * HIS REPORT, 2026-10-23: "Reloading lets you see the whole draft before you make it. Where the wheel
 * lands depends only on the save, the level and the attempt number; your picks don't change it ...
 * Reloading mid-draft wipes your picks but doesn't count as an attempt, so the identical five
 * landings come back ... Leaving after one pick is the faster version: it counts as an attempt with
 * no loss and no star cost, and gives a completely new wheel." His fix: "save the draft in progress
 * (picks plus which spin you're on), so a reload or re-entry continues the same draft."
 */

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  get length() {
    return store.size
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

const ladder = (over: Partial<Progress> = {}): Progress => ({ ...freshProgress(), seed: 4242, plays: 3, ...over })

/**
 * THE DRAFT SCREEN'S WHEEL, step for step: the next landing drawn while the wheel is idle, the spin
 * landing there and building its reels, then the first man of the landed roster who fits an open
 * ring drafted at it. The same calls, in the same order, off the same stream.
 */
function wheel(rng: ReturnType<typeof countedRng>, slots: Partial<Record<Pos, string>> = {}) {
  let upcoming: TeamSeason | null = null
  let landed: TeamSeason | null = null
  let reels: ReturnType<typeof buildReels> | null = null
  const open = () => POSITIONS.filter((x) => !slots[x])
  const taken = () => new Set(Object.values(slots).map((n) => bare(n!)))
  return {
    slots,
    get landed() {
      return landed
    },
    get upcoming() {
      return upcoming
    },
    get reels() {
      return reels
    },
    restore(s: DraftState) {
      upcoming = s.upcoming
      landed = s.landed
      reels = s.reels
    },
    predraw() {
      if (!landed && !upcoming) upcoming = landOn(taken(), open(), () => rng.next())
    },
    spin() {
      this.predraw()
      landed = upcoming
      upcoming = null
      reels = buildReels(landed!, WHEEL, () => rng.next(), 1, null, reels)
      return landed!
    },
    pick() {
      const name = landed!.p.find((n) => !taken().has(bare(n)) && posOf(n).some((x) => open().includes(x)))!
      slots[posOf(name).find((x) => open().includes(x))!] = name
      landed = null
      this.predraw()
      return name
    },
  }
}
const state = (w: ReturnType<typeof wheel>, rng: ReturnType<typeof countedRng>): DraftState => ({
  draws: rng.draws(),
  slots: { ...w.slots },
  landed: w.landed,
  last: w.landed,
  upcoming: w.upcoming,
  reels: w.reels,
  hold: null,
  used: { fo_spin: 1 },
  dead: false,
  wide: 'team',
  board: null,
})

describe('the wheel is one counted stream', () => {
  it('deals exactly the numbers makeRng deals, so a seed lands where it always landed', () => {
    const a = makeRng(91)
    const b = countedRng(91)
    for (let i = 0; i < 500; i++) expect(b.next()).toBe(a.next())
    expect(b.draws()).toBe(500)
  })

  it('and replayed to a count, it carries on from exactly there', () => {
    const a = countedRng(91)
    for (let i = 0; i < 237; i++) a.next()
    const b = countedRng(91, 237)
    for (let i = 0; i < 300; i++) expect(b.next()).toBe(a.next())
  })
})

describe('a reload continues the same draft (his report)', () => {
  it('two men in and a third landing showing: the reopened draft deals the same next landings', () => {
    const p = ladder()
    const seed = levelSeed(p, 6)
    // straight through, nobody leaves
    const r1 = countedRng(seed)
    const a = wheel(r1)
    const straight: string[] = []
    for (let k = 0; k < 5; k++) {
      straight.push(a.spin().team)
      a.pick()
    }
    // the same picks, with a reload after the third landing
    const r2 = countedRng(seed)
    const b = wheel(r2)
    const seen: string[] = []
    for (let k = 0; k < 2; k++) {
      seen.push(b.spin().team)
      b.pick()
    }
    seen.push(b.spin().team)
    saveDraft('campaign', { ...draftAttempt(p, 6), ...state(b, r2) })

    const back = loadDraft('campaign', 6, p)!
    expect(back).not.toBeNull()
    expect(back.slots).toEqual(b.slots)
    expect(back.landed).toBe(b.landed) // the same row of the wheel, not a copy
    expect(back.reels).toEqual(b.reels)
    const r3 = countedRng(back.seed, back.draws)
    const c = wheel(r3, { ...back.slots })
    c.restore(back)
    c.pick()
    for (let k = 3; k < 5; k++) {
      seen.push(c.spin().team)
      c.pick()
    }
    expect(seen).toEqual(straight)
    clearDraft('campaign', 6)
  })

  it('keeps every field the draft runs on, and a spin caught mid-reel comes back as its landing', () => {
    const p = ladder()
    const s: DraftSave = {
      ...draftAttempt(p, 9),
      draws: 412,
      slots: { PG: 'Stephen Curry \'16' },
      landed: WHEEL[17],
      last: WHEEL[17],
      upcoming: null,
      reels: { team: { rows: ['A', 'B'], at: 1 }, year: { rows: ['1990'], at: 0 }, nonce: 5, held: 'year' },
      hold: 'team',
      used: { fo_spin: 1, fo_respin: 2 },
      dead: false,
      wide: 'decade',
      board: [4, 3, 2, 1, 0],
    }
    saveDraft('salary', s)
    expect(loadDraft('salary', 9, p)).toEqual(s)
    clearDraft('salary', 9)
  })
})

describe('a kept draft belongs to its attempt', () => {
  const p = ladder()
  const keep = () => {
    const r = countedRng(levelSeed(p, 4))
    const w = wheel(r)
    w.spin()
    w.pick()
    w.spin()
    saveDraft('campaign', { ...draftAttempt(p, 4), ...state(w, r) })
  }

  it('is not read at another level', () => {
    keep()
    expect(loadDraft('campaign', 4, p)).not.toBeNull()
    expect(loadDraft('campaign', 5, p)).toBeNull()
    clearDraft('campaign', 4)
  })

  it('is not read by another ladder, a reset one, or a save that went back in time', () => {
    keep()
    expect(loadDraft('campaign', 4, { ...p, seed: 7 })).toBeNull() // another ladder, or a Reset
    expect(loadDraft('campaign', 4, { ...p, plays: 2 })).toBeNull() // dealt at 3, the save says 2
    expect(loadDraft('salary', 4, p)).toBeNull() // the cap keeps its own
    clearDraft('campaign', 4)
  })

  it('IS still read after a series at another level moved the play count on, and keeps its own seed', () => {
    keep()
    const later = { ...p, plays: p.plays + 2 }
    const back = loadDraft('campaign', 4, later)!
    expect(back).not.toBeNull()
    expect(back.plays).toBe(p.plays)
    expect(back.seed).toBe(levelSeed(p, 4))
    expect(back.seed).not.toBe(levelSeed(later, 4))
    clearDraft('campaign', 4)
  })

  it('is ignored when what is stored does not read back exactly', () => {
    const good = { ...draftAttempt(p, 2), draws: 3, slots: {}, landed: null, last: null, upcoming: WHEEL[0], reels: null, hold: null, used: {}, dead: false, wide: 'team' }
    const put = (over: Record<string, unknown>) => store.set(draftKey('campaign'), JSON.stringify({ 2: { ...good, upcoming: 'BOS|1986', v: 1, ...over } }))
    put({})
    expect(loadDraft('campaign', 2, p)?.upcoming?.team).toBe('Boston Celtics')
    put({ upcoming: 'XYZ|1890' }) // a team-season this build does not have
    expect(loadDraft('campaign', 2, p)).toBeNull()
    put({ seed: 1 }) // a seed its attempt does not deal
    expect(loadDraft('campaign', 2, p)).toBeNull()
    put({ slots: { QB: 'Tom Brady' } })
    expect(loadDraft('campaign', 2, p)).toBeNull()
    put({ v: 2 })
    expect(loadDraft('campaign', 2, p)).toBeNull()
    store.set(draftKey('campaign'), '{not json')
    expect(loadDraft('campaign', 2, p)).toBeNull()
    store.delete(draftKey('campaign'))
  })
})

describe('when a kept draft ends', () => {
  const p = ladder()
  const put = (m: 'campaign' | 'salary', level: number) => saveDraft(m, { ...draftAttempt(p, level), draws: 0, slots: {}, landed: null, last: null, upcoming: null, reels: null, hold: null, used: {}, dead: false, wide: 'team', board: null })

  it('the sim clears that level and only that level', () => {
    put('campaign', 3)
    put('campaign', 8)
    clearDraft('campaign', 3)
    expect(loadDraft('campaign', 3, p)).toBeNull()
    expect(loadDraft('campaign', 8, p)).not.toBeNull()
    clearDraft('campaign', 8)
    expect(store.has(draftKey('campaign'))).toBe(false)
  })

  it('App clears it at the sim, before the night is banked, and never bumps the play count on a walk out itself', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    const sim = app.slice(app.indexOf('const sim = ('), app.indexOf('const finish = ('))
    expect(sim.indexOf('clearDraft(cm, level)')).toBeGreaterThan(0)
    expect(sim.indexOf('clearDraft(cm, level)')).toBeLessThan(sim.indexOf('commit(cm, settled)'))
    // every walk out goes through the one rule
    expect(app).not.toMatch(/plays: prog\.plays \+ 1/)
    expect(app.match(/walkOut\(started/g)?.length).toBe(2) // Home, and the map
  })

  it('a Reset of the ladder takes its drafts with it, and the tutorial keeps its own apart', () => {
    put('campaign', 5)
    setViewMode('tutorial')
    try {
      expect(draftKey('campaign')).toBe(`${saveKey('campaign')}.draft`)
      expect(draftKey('campaign')).toBe('game7.tut.campaign.v2.draft')
      expect(loadDraft('campaign', 5, p)).toBeNull() // the real ladder's draft is not the tutorial's
      put('campaign', 5)
      expect(loadDraft('campaign', 5, p)).not.toBeNull()
      resetTutorialSaves()
      expect(loadDraft('campaign', 5, p)).toBeNull()
    } finally {
      setViewMode('scout')
    }
    expect(loadDraft('campaign', 5, p)).not.toBeNull() // the tutorial's reset never touched it
    resetProgress('campaign')
    expect(store.has('game7.campaign.v2.draft')).toBe(false)
  })
})

describe('walking out of a draft (one rule, his call)', () => {
  const p = ladder({ plays: 7 })

  it('ships as: the campaign and the cap keep the draft and do not count the walk out', () => {
    expect(LEAVE_SPENDS_ATTEMPT).toBe(false)
    for (const m of ['campaign', 'salary'] as const) {
      expect(afterLeave(m, p, true)).toEqual({ progress: p, keep: true })
      expect(afterLeave(m, p, false)).toEqual({ progress: p, keep: true })
      expect(leaveLoses(m)).toBe(false) // so Home goes in one tap
    }
  })

  it('flipped, a walk out with a man in spends the attempt and drops the draft — the instant reroll', () => {
    const out = afterLeave('campaign', p, true, false, true)
    expect(out.progress.plays).toBe(8)
    expect(out.keep).toBe(false)
    expect(levelSeed(out.progress, 4)).not.toBe(levelSeed(p, 4)) // a brand-new wheel
    expect(afterLeave('campaign', p, false, false, true)).toEqual({ progress: p, keep: true })
    expect(leaveLoses('campaign', true)).toBe(true)
  })

  it('a wheel that ran dry ends its attempt whatever the rule', () => {
    const out = afterLeave('salary', p, true, true)
    expect(out.progress.plays).toBe(8)
    expect(out.keep).toBe(false)
  })

  it('the death match is as it was: no kept draft, and a walk out with men on the board spends the attempt', () => {
    expect(keepsDraft('death')).toBe(false)
    saveDraft('death', { ...draftAttempt(p, 1), draws: 0, slots: {}, landed: null, last: null, upcoming: null, reels: null, hold: null, used: {}, dead: false, wide: 'team', board: null })
    expect(store.has(draftKey('death'))).toBe(false)
    expect(loadDraft('death', 1, p)).toBeNull()
    expect(afterLeave('death', p, true)).toEqual({ progress: { ...p, plays: 8 }, keep: false })
    expect(afterLeave('death', p, false)).toEqual({ progress: p, keep: false })
    expect(leaveLoses('death')).toBe(true) // Home still asks twice there
  })
})

describe('the draft screen opens on a kept draft', () => {
  const opponent = (OPP as Opponent[])[3]
  const wallet = ladder()
  const t = WHEEL.find((x) => x.p.length >= 10 && x.y >= 2000)!
  const pg = t.p.find((n) => posOf(n).includes('PG'))!
  const c = WHEEL.find((x) => x !== t && x.p.some((n) => posOf(n).includes('C') && !posOf(n).includes('PG')))!.p.find((n) => posOf(n).includes('C') && !posOf(n).includes('PG'))!
  const render = (resume: DraftState | null) =>
    renderToStaticMarkup(
      createElement(Draft, {
        opponent,
        seed: levelSeed(wallet, 4),
        teamName: 'Haifa Jets',
        wallet,
        onSim: () => {},
        onBack: () => {},
        onRoster: () => {},
        resume,
      }),
    )

  it('with its men in their rings and its landing on the reels', () => {
    const html = render({ draws: 40, slots: { PG: pg, C: c }, landed: t, last: t, upcoming: null, reels: buildReels(t, WHEEL, makeRng(1).next, 1), hold: null, used: {}, dead: false, wide: 'team', board: null })
    expect(html).toContain('2 OF 5')
    expect(html).toContain(pg.replace(/'/g, '&#x27;'))
    expect(html).toContain(c.replace(/'/g, '&#x27;'))
    expect(html).toContain(`<div class="spin-team ">${t.team}</div>`)
    expect(html).toContain('Spin 3 of 5 — it lands on')
  })

  it('and a draft with nothing kept opens as it always did', () => {
    const html = render(null)
    expect(html).toContain('0 OF 5')
    expect(html).not.toContain('wheel-card')
  })
})
