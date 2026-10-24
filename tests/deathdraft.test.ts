import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { WHEEL, type TeamSeason } from '../src/data/wheel'
import { ROUNDS } from '../src/config'
import { PLAYERS } from '../src/engine/pool'
import { POSITIONS, type Pos } from '../src/engine/positions'
import { makeRng } from '../src/engine/rng'
import { buy, extraSpins, rank, staffAt } from '../src/engine/tree'
import type { Opponent, Player } from '../src/engine/types'
import { afterRespec, die, draftKey, freshProgress, levelSeed, resetProgress, settledProgress, type Progress } from '../src/state/campaign'
import {
  afterLeave,
  begun,
  clearDraft,
  clearDrafts,
  countedRng,
  draftAttempt,
  draftStaff,
  keepsDraft,
  leaveLoses,
  loadDraft,
  saveDraft,
  type DraftSave,
  type DraftState,
} from '../src/state/draftsave'
import { bare, Draft, landOn, posOf, reseat, seatCarry } from '../src/ui/Draft'
import { buildReels } from '../src/ui/SpinReels'

/**
 * THE DEATH MATCH SAVES ITS DRAFT IN PROGRESS THE SAME WAY (his word, 2026-10-24, on the coordinator's
 * item: "fix it the same way, save the draft in progress"). `keepsDraft('death')` was false by design
 * in 167d3ad, so a reload there re-dealt the same five landings onto an empty board, and walking out
 * with men in cost no life and dealt a brand-new wheel.
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

const run = (over: Partial<Progress> = {}): Progress => ({ ...freshProgress(), seed: 31337, plays: 6, stars: Array.from({ length: ROUNDS }, (_, i) => (i < 6 ? 2 : 0)), ...over })
const opponent = (OPP as Opponent[])[6]
const BY = new Map(PLAYERS.map((p) => [p.name, p]))

/** A real five, one man a ring, PG to C — and a man with another season that plays his ring. */
const FIVE: string[] = (() => {
  const used = new Set<string>()
  return POSITIONS.map((x) => {
    const p = PLAYERS.find((q) => !used.has(q.player) && posOf(q.name).length === 1 && posOf(q.name)[0] === x && PLAYERS.some((r) => r.player === q.player && r.name !== q.name && posOf(r.name).includes(x)))!
    used.add(p.player)
    return p.name
  })
})()
/** Another season of the SF, eligible at SF: what a Version respin on the draft hands back. */
const RESPUN = PLAYERS.find((r) => r.player === BY.get(FIVE[2])!.player && r.name !== FIVE[2] && posOf(r.name).includes('SF'))!.name
/** A man off the wheel My team could bring in for the PG: a PG, nobody already on the five. */
const NEW_PG = PLAYERS.find((q) => posOf(q.name).length === 1 && posOf(q.name)[0] === 'PG' && !FIVE.map(bare).includes(q.player))!.name

const blank = (over: Partial<DraftState> = {}): DraftState => ({ draws: 0, slots: {}, landed: null, last: null, upcoming: null, after: null, reels: null, hold: null, used: {}, dead: false, wide: 'team', board: null, boosts: [], ...over })
/** A carried five's draft, as the screen hands it over: the five in its rings, nothing landed. */
const carried = (over: Partial<DraftState> = {}) => blank({ slots: seatCarry(FIVE), ...over })
const keep = (p: Progress, level: number, s: DraftState, carry: string[] | null, ranks = {}) => saveDraft('death', { ...draftAttempt(p, level), ...s, ranks, carry })
const render = (wallet: Progress, resume: DraftState | null, carry: Player[] | null, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(Draft, {
      opponent,
      seed: levelSeed(wallet, 7),
      teamName: 'Haifa Jets',
      wallet,
      death: true,
      salary: true,
      carry,
      wear: wallet.wear,
      onSim: () => {},
      onBack: () => {},
      onRoster: () => {},
      resume,
      ...extra,
    }),
  )

describe('BEFORE: what his report found in the death match', () => {
  it('— is gone: a kept death draft is written and read, and a walk out spends nothing', () => {
    expect(keepsDraft('death')).toBe(true)
    const p = run()
    keep(p, 7, carried(), FIVE)
    expect(store.has(draftKey('death'))).toBe(true)
    expect(store.has('game7.death.v2.draft')).toBe(true) // its own key, beside its own save
    expect(loadDraft('death', 7, p)).not.toBeNull()
    expect(afterLeave('death', p, true)).toEqual({ progress: p, keep: true }) // no attempt spent: no new wheel
    expect(leaveLoses('death')).toBe(false) // Home in one tap
    clearDraft('death', 7)
  })
})

describe('a reload continues the same draft — level 1 of a run, dealt onto an empty board', () => {
  it('two men in and a landing on the reels: the reopened draft carries on, and the next landings are the ones it would have dealt', () => {
    const p = run({ plays: 0, stars: Array.from({ length: ROUNDS }, () => 0) })
    const seed = levelSeed(p, 1)
    // the wheel straight through: draw, land, draft the first man who fits — three times
    const deal = (rng: ReturnType<typeof countedRng>, slots: Partial<Record<Pos, string>>, n: number) => {
      const got: TeamSeason[] = []
      for (let k = 0; k < n; k++) {
        const open = POSITIONS.filter((x) => !slots[x])
        const taken = new Set(Object.values(slots).map((x) => bare(x!)))
        const t = landOn(taken, open, () => rng.next())!
        buildReels(t, WHEEL, () => rng.next(), 1, null, null)
        const man = t.p.find((m) => !taken.has(bare(m)) && posOf(m).some((x) => open.includes(x)))!
        slots[posOf(man).find((x) => open.includes(x))!] = man
        got.push(t)
      }
      return got
    }
    const straight = deal(countedRng(seed), {}, 4)
    // the same two picks, then a reload
    const r = countedRng(seed)
    const slots: Partial<Record<Pos, string>> = {}
    deal(r, slots, 2)
    keep(p, 1, blank({ draws: r.draws(), slots: { ...slots } }), null)
    const back = loadDraft('death', 1, p)!
    expect(back.slots).toEqual(slots)
    expect(back.carry).toBeNull()
    const again = deal(countedRng(back.seed, back.draws), { ...back.slots }, 2)
    expect(again).toEqual(straight.slice(2)) // not the first two again: the wheel picks up where it stood
    clearDraft('death', 1)
  })

  it('the draft screen opens on it: the men in their rings, in the steel room', () => {
    const p = run({ plays: 0 })
    const html = render(p, blank({ slots: { PG: FIVE[0], C: FIVE[4] }, draws: 30 }), null)
    expect(html).toContain('2 OF 5')
    expect(html).toContain('st-steel')
  })
})

describe('a carried five’s draft, kept across My team (Draft.tsx reseat)', () => {
  const was = carried({ slots: { ...seatCarry(FIVE), SF: RESPUN }, used: { fo_respin: 1 }, board: [4, 3, 2, 1, 0], draws: 12 })
  const kept = (): DraftSave => ({ ...draftAttempt(run(), 7), ...was, ranks: {}, carry: [...FIVE] })

  it('nothing changed in My team: the draft exactly as it was left — the respun season, the charge spent, the board', () => {
    expect(reseat(kept(), [...FIVE])).toEqual(kept())
    const html = render(run({ nodes: { fo_respin: 1 } }), kept(), FIVE.map((n) => BY.get(n)!))
    expect(html).toContain(RESPUN.replace(/'/g, '&#x27;'))
  })

  it('My team swapped the PG: the new man is seated, the SF keeps the season respun on the draft, the charge stays spent, the board goes back to the staff’s', () => {
    const now = [NEW_PG, ...FIVE.slice(1)]
    const r = reseat(kept(), now)
    expect(r.slots.PG).toBe(NEW_PG)
    expect(r.slots.SF).toBe(RESPUN)
    expect(Object.values(r.slots)).not.toContain(FIVE[0])
    expect(r.used).toEqual({ fo_respin: 1 }) // walking to My team refunds nothing…
    expect(r.draws).toBe(12) // …and replays no respin already rolled
    expect(r.board).toBeNull()
    expect(r.carry).toEqual(now)
  })

  it('My team swapped out the man who was respun: his respun season goes with him', () => {
    const newSf = PLAYERS.find((q) => posOf(q.name).length === 1 && posOf(q.name)[0] === 'SF' && !FIVE.map(bare).includes(q.player))!.name
    const now = [...FIVE.slice(0, 2), newSf, ...FIVE.slice(3)]
    const r = reseat(kept(), now)
    expect(Object.values(r.slots)).not.toContain(RESPUN)
    expect(Object.values(r.slots).sort()).toEqual([...now].sort())
  })

  it('a draft that began on an empty board, and now has a five carried in (a replay won with another five): the five, and no landing left over', () => {
    const fresh: DraftSave = { ...draftAttempt(run(), 20), ...blank({ slots: { PG: NEW_PG }, landed: WHEEL[3], last: WHEEL[3], reels: buildReels(WHEEL[3], WHEEL, makeRng(2).next, 1), used: { fo_spin: 1 } }), ranks: {}, carry: null }
    const r = reseat(fresh, [...FIVE])
    expect(r.slots).toEqual(seatCarry(FIVE))
    expect(r.landed).toBeNull()
    expect(r.reels).toBeNull()
    expect(r.used).toEqual({ fo_spin: 1 })
  })

  it('App reads every kept death draft against the five My team carries, before the draft takes it', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/return kept && death \? reseat\(kept, carryNames\) : kept/)
    expect(app).toMatch(/carryNames\?\.join\('\|'\)\]/)
  })

  it('a man worn out since the draft was kept is still a worn-out man on it: the dock sends him to My team', () => {
    const wear = Object.fromEntries(FIVE.map((n) => [n, 40]))
    wear[FIVE[1]] = 5 // a series elsewhere wore him to the floor
    const p = run({ wear, roster: FIVE })
    const html = render(p, kept(), FIVE.map((n) => BY.get(n)!), { onMyTeam: () => {} })
    expect(html).toContain('1 man is worn out')
    expect(html).toContain('replace him in My team')
  })
})

describe('nothing about a series, the lives or the run comes back with a kept draft', () => {
  it('results are banked at the sim, and the sim clears the level’s draft before the night is committed', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    const sim = app.slice(app.indexOf('const sim = ('), app.indexOf('const finish = ('))
    expect(sim.indexOf('clearDraft(cm, level)')).toBeGreaterThan(0)
    expect(sim.indexOf('clearDraft(cm, level)')).toBeLessThan(sim.indexOf('commit(cm, settled)'))
    // and a run that ended takes every draft it kept with it, in the same breath
    expect(sim).toMatch(/if \(death && !result\.won && prog\.lives === 0\) clearDrafts\(cm\)/)
    expect(sim.indexOf('clearDrafts(cm)')).toBeLessThan(sim.indexOf('commit(cm, settled)'))
  })

  it('a loss a life absorbs: the reload finds the life spent and no draft to resume', () => {
    const p = run({ roster: FIVE, lives: 1 })
    keep(p, 7, carried(), FIVE)
    // the sim: banked, and the level's draft cleared
    const settled = settledProgress('death', p, { level: 7, won: false, stars: 0, games: 4, five: FIVE, heal: 0, dur: () => 60 })
    clearDraft('death', 7)
    expect(settled.lives).toBe(0)
    expect(settled.plays).toBe(p.plays + 1)
    expect(loadDraft('death', 7, settled)).toBeNull()
  })

  it('a death clears every draft the run kept — and none of them would match the new run anyway', () => {
    const p = run({ roster: FIVE, lives: 0 })
    keep(p, 7, carried(), FIVE)
    keep(p, 3, carried(), FIVE)
    clearDrafts('death')
    expect(store.has(draftKey('death'))).toBe(false)
    // belt and braces: a fresh run (or the Saving point's rung) is dealt on a new seed
    keep(p, 7, carried(), FIVE)
    const dead = die(p)
    expect(dead.seed).not.toBe(p.seed)
    expect(loadDraft('death', 7, dead)).toBeNull()
    const caught = die(run({ roster: FIVE, lives: 0, stars: Array.from({ length: ROUNDS }, (_, i) => (i < 25 ? 2 : 0)), nodes: { surv_life: 1, surv_save: 1 }, spent: 2 }))
    expect(caught.checkpoint).toBe(20)
    expect(loadDraft('death', 7, caught)).toBeNull()
    clearDrafts('death')
  })

  it('a reset of the death match takes its drafts with it', () => {
    keep(run(), 7, carried(), FIVE)
    resetProgress('death')
    expect(store.has('game7.death.v2.draft')).toBe(false)
  })

  it('a respec keeps the draft — clearing it would re-deal its landings — and takes the handed-back ranks off it at once', () => {
    const p = run({ roster: FIVE, nodes: { fo_spin: 2, fo_respin: 1, surv_life: 1 }, lives: 1, spent: 6 })
    keep(p, 7, carried({ used: { fo_respin: 1 } }), FIVE, { fo_spin: 2, fo_respin: 1, surv_life: 1 })
    const r = afterRespec(p)
    expect(r.lives).toBe(0) // the life in hand went back with its star, as ruled — no life minted
    const back = loadDraft('death', 7, r)!
    expect(back).not.toBeNull()
    expect(begun(back)).toBe(true)
    const s = staffAt(r, draftStaff(back, r.nodes))
    expect(extraSpins(s, true)).toBe(0)
    expect(rank(s, 'fo_respin')).toBe(0)
    clearDraft('death', 7)
  })

  it('a rank bought while a carried draft is under way starts with the next one; Survival counts at once', () => {
    const p = run({ roster: FIVE })
    keep(p, 7, carried({ used: { fo_respin: 1 } }), FIVE, {})
    const bought = buy(buy(p, 'surv_life')!, 'fo_spin')!
    const back = loadDraft('death', 7, bought)!
    const s = staffAt(bought, draftStaff(back, bought.nodes))
    expect(rank(s, 'fo_spin')).toBe(0)
    expect(rank(s, 'surv_life')).toBe(1)
    clearDraft('death', 7)
  })

  it('the death match keeps a draft but sells no boosts', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/onBoost=\{\s*!death && !CREATOR/)
    const p = run({ plays: 0 })
    expect(render(p, null, null, { onBoost: () => true })).not.toContain('Boosts for this level')
  })
})
