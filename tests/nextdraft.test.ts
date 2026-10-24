import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { WHEEL } from '../src/data/wheel'
import { ROUNDS } from '../src/config'
import { PLAYERS } from '../src/engine/pool'
import { makeRng } from '../src/engine/rng'
import { balance, buy, buyBoost, duraBoost, extraSpins, paceMastery, rank, respec, staffAt, type NodeId } from '../src/engine/tree'
import type { Opponent } from '../src/engine/types'
import { afterRespec, callsPlan, freshProgress, levelSeed, planFor, type Progress } from '../src/state/campaign'
import { begun, clearDraft, draftAttempt, draftStaff, draftsUnderway, loadDraft, saveDraft, type DraftSave, type DraftState } from '../src/state/draftsave'
import { Draft, posOf } from '../src/ui/Draft'
import { buildReels } from '../src/ui/SpinReels'
import { Tree } from '../src/ui/Tree'

/**
 * A NODE BOUGHT DURING A DRAFT IN PROGRESS APPLIES FROM THE NEXT DRAFT (his word, 2026-10-24:
 * "Accept all (Recommended)"). Since 167d3ad the draft is kept across a walk out to the map — where the
 * staff tree is — so a player could see a landing, walk out, buy Extra spin and come back to respin
 * that very landing. A draft now keeps the staff it began with; the draft and its sim read the save
 * AS that staff (engine/tree.ts `staffAt`), and the tree says a rank bought mid-draft starts with the
 * next draft.
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

const rich = (over: Partial<Progress> = {}): Progress => ({ ...freshProgress(), seed: 4242, plays: 3, stars: Array.from({ length: ROUNDS }, () => 2), ...over })
const opponent = (OPP as Opponent[])[3]
const t = WHEEL.find((x) => x.p.length >= 10 && x.y >= 2000)!
const pg = t.p.find((n) => posOf(n).includes('PG'))!

/** A draft as the screen hands it over: nothing yet (dealt, the first landing drawn), or a landing on the reels. */
const fresh = (): DraftState => ({ draws: 4, slots: {}, landed: null, last: null, upcoming: WHEEL[7], after: null, reels: null, hold: null, used: {}, dead: false, wide: 'team', board: null, boosts: [] })
const landed = (over: Partial<DraftState> = {}): DraftState => ({ ...fresh(), draws: 40, upcoming: null, landed: t, last: t, reels: buildReels(t, WHEEL, makeRng(1).next, 1), ...over })

/** App's write: the draft's state, its attempt, and the staff it plays with (App.tsx `onSave`). */
const keep = (p: Progress, level: number, s: DraftState, ranks: Partial<Record<NodeId, number>>) =>
  saveDraft('campaign', { ...draftAttempt(p, level), ...s, ranks, carry: null })
/** App's read as the level opens: the kept draft, the ranks it plays with, and the save as that staff. */
const open = (p: Progress, level: number) => {
  const resume = loadDraft('campaign', level, p)
  const ranks = draftStaff(resume, p.nodes)
  return { resume, ranks, staffed: staffAt(p, ranks) }
}
const render = (wallet: Progress, resume: DraftState | null, level = 4) =>
  renderToStaticMarkup(createElement(Draft, { opponent, seed: levelSeed(wallet, level), teamName: 'Haifa Jets', wallet, onSim: () => {}, onBack: () => {}, onRoster: () => {}, resume }))

describe('the staff a draft under way plays with (engine/tree.ts staffAt)', () => {
  it('a rank bought since is not there; a rank handed back since is gone; the rest is the live save', () => {
    const p = rich({ nodes: { fo_spin: 3, scout_wheel: 1, coach_optimal: 2 } })
    const s = staffAt(p, { fo_spin: 1, scout_wheel: 2, coach_optimal: 2 })
    expect(rank(s, 'fo_spin')).toBe(1) // two bought since: not this draft's
    expect(rank(s, 'scout_wheel')).toBe(1) // one handed back since (a respec, a rebuy): gone at once
    expect(rank(s, 'coach_optimal')).toBe(2)
    expect(balance(s)).toBe(balance(p)) // the stars are the live ones
    expect(s.spent).toBe(p.spent)
    expect(staffAt(p, null)).toBe(p) // not begun: the live save, untouched
  })

  it('the Survival branch is the death match’s RUN and reads live: Iron men bought mid-draft lifts the five at once', () => {
    const p = rich({ nodes: { surv_life: 1, surv_save: 1, surv_sub: 1, surv_dura: 2, fo_spin: 1 } })
    const s = staffAt(p, { fo_spin: 1, surv_dura: 0 })
    expect(duraBoost(s)).toBe(20)
    expect(rank(s, 'surv_life')).toBe(1)
    expect(rank(s, 'surv_sub')).toBe(1)
  })
})

describe('when a draft has begun (state/draftsave.ts begun)', () => {
  it('a draft dealt onto an empty board begins at its first spin — the line the boosts are bought behind', () => {
    expect(begun(fresh())).toBe(false) // opened, the first landing drawn for Sight seeing: not begun
    const filmed: DraftState = { ...fresh(), boosts: ['film'] }
    expect(begun(filmed)).toBe(false) // a boost bought before the first spin is not a spin
    expect(begun(landed())).toBe(true)
    expect(begun({ ...fresh(), slots: { PG: pg } })).toBe(true)
  })

  it('a carried five turns no wheel: it begins with the first charge it spends', () => {
    const carried = { ...fresh(), upcoming: null, slots: { PG: pg }, carry: [pg, 'b', 'c', 'd', 'e'] }
    expect(begun(carried)).toBe(false)
    expect(begun({ ...carried, used: { fo_respin: 1 } })).toBe(true)
  })
})

describe('his case: see a landing, walk out, buy Extra spin, come back', () => {
  const p = rich()

  it('BEFORE the rule this is what happened: the landing came back with a Respin team chip on it', () => {
    // the draft handed the live save — which is what App did
    expect(render(buy(p, 'fo_spin')!, landed())).toContain('Respin team')
    expect(render(p, landed())).not.toContain('Respin team')
  })

  it('now the kept draft plays with the staff it began with: no respin on the landing he saw', () => {
    // opened with no Extra spin, spun — the draft is written with the ranks it opened with
    const first = open(p, 4)
    expect(first.resume).toBeNull()
    keep(p, 4, landed(), first.ranks)
    // walks out, buys a rank of Extra spin on the map
    const bought = buy(p, 'fo_spin')!
    expect(rank(bought, 'fo_spin')).toBe(1)
    // and comes back to the same landing
    const again = open(bought, 4)
    expect(again.resume!.landed).toBe(t)
    expect(rank(again.staffed, 'fo_spin')).toBe(0)
    expect(extraSpins(again.staffed)).toBe(0)
    expect(render(again.staffed, again.resume)).not.toContain('Respin team')
    // the save itself owns the rank — it is the next draft's
    expect(balance(again.staffed)).toBe(balance(bought))
    clearDraft('campaign', 4)
  })

  it('the next draft has it: the same level once this one is simmed, and any level opened after the purchase', () => {
    const first = open(p, 4)
    keep(p, 4, landed(), first.ranks)
    const bought = buy(p, 'fo_spin')!
    // another level, opened after the purchase
    expect(rank(open(bought, 9).staffed, 'fo_spin')).toBe(1)
    // the sim clears level 4's draft: its next attempt deals with the rank
    clearDraft('campaign', 4)
    const next = open({ ...bought, plays: bought.plays + 1 }, 4)
    expect(next.resume).toBeNull()
    expect(rank(next.staffed, 'fo_spin')).toBe(1)
    expect(render(next.staffed, landed())).toContain('Respin team')
  })

  it('a rank bought BEFORE the first spin is this draft’s: opened, walked out unspun, bought, back', () => {
    keep(p, 4, fresh(), open(p, 4).ranks) // opened: dealt, nothing landed
    const bought = buy(p, 'fo_spin')!
    const back = open(bought, 4)
    expect(back.resume).not.toBeNull()
    expect(begun(back.resume!)).toBe(false)
    expect(rank(back.staffed, 'fo_spin')).toBe(1) // nothing had landed: it was always going to have it
    // and from the first spin on, that is the staff it keeps
    keep(bought, 4, landed(), back.ranks)
    const more = buy(bought, 'fo_spin')!
    expect(rank(open(more, 4).staffed, 'fo_spin')).toBe(1)
    clearDraft('campaign', 4)
  })

  it('Sight seeing bought mid-draft does not show this draft’s next landing', () => {
    keep(p, 4, landed({ upcoming: WHEEL[12], landed: null, last: t, slots: { PG: pg } }), open(p, 4).ranks)
    const bought = buy(buy(p, 'scout_ratings')!, 'scout_wheel')!
    const back = open(bought, 4)
    const html = render(back.staffed, back.resume)
    expect(html).not.toContain('sight seeing says so')
    expect(render(bought, back.resume)).toContain('sight seeing says so') // what the live save would have shown
    clearDraft('campaign', 4)
  })

  it('a Playbook bought mid-draft: no plan on this night — the card and the sim read the same staff', () => {
    const p2 = rich({ nodes: { coach_optimal: 1, coach_manual: 1 } })
    keep(p2, 4, landed(), open(p2, 4).ranks)
    const bought = buy(p2, 'coach_tactics')!
    expect(callsPlan('campaign', bought)).toBe(true)
    const back = open(bought, 4)
    expect(callsPlan('campaign', back.staffed)).toBe(false)
    expect(planFor('campaign', back.staffed, PLAYERS.slice(0, 5).map((x) => x.name))).toBeNull()
    expect(paceMastery(back.staffed)).toBe(0)
    clearDraft('campaign', 4)
  })
})

describe('a respec mid-draft cannot be a double dip', () => {
  it('the stars come back and the kept draft loses the ranks at once; buying them again gives back no more than it began with', () => {
    const p = rich({ nodes: { fo_spin: 2, fo_respin: 1 }, spent: 2 + 2 })
    keep(p, 4, landed(), open(p, 4).ranks)
    const back = respec(p)
    expect(balance(back)).toBe(balance(p) + 4)
    const kept = open(back, 4)
    expect(kept.resume!.landed).toBe(t) // the draft is not thrown away (that would re-deal its landings)
    expect(extraSpins(kept.staffed)).toBe(0)
    expect(rank(kept.staffed, 'fo_respin')).toBe(0)
    const rebought = buy(buy(buy(back, 'fo_spin')!, 'fo_spin')!, 'fo_spin')!
    expect(extraSpins(open(rebought, 4).staffed)).toBe(2) // three bought, two began the draft
    clearDraft('campaign', 4)
  })

  it('the death match’s respec too (used lives stay bought, as ruled)', () => {
    const p = rich({ nodes: { fo_spin: 1, surv_life: 2 }, lives: 1, spent: 1 + 2 })
    const r = afterRespec(p)
    expect(r.nodes).toEqual({ surv_life: 1 })
    expect(extraSpins(staffAt(r, { fo_spin: 1, surv_life: 2 }), true)).toBe(0)
    expect(rank(staffAt(r, { fo_spin: 1, surv_life: 2 }), 'surv_life')).toBe(1) // Survival: live
  })
})

describe('kept with the draft, and said on the tree', () => {
  it('the ranks round-trip; a draft kept before the rule reads back with none, and is given the tree as it stands', () => {
    const p = rich({ nodes: { fo_spin: 1 } })
    keep(p, 6, landed(), { fo_spin: 1, coach_optimal: 2 })
    expect(loadDraft('campaign', 6, p)!.ranks).toEqual({ fo_spin: 1, coach_optimal: 2 })
    // a draft written on 2026-10-23, before `ranks`
    const raw = JSON.parse(store.get('game7.campaign.v2.draft')!)
    delete raw[6].ranks
    delete raw[6].carry
    store.set('game7.campaign.v2.draft', JSON.stringify(raw))
    const old = loadDraft('campaign', 6, p)!
    expect(old.ranks).toBeNull()
    expect(old.carry).toBeNull()
    expect(draftStaff(old, p.nodes)).toEqual(p.nodes)
    // a ranks list that does not read back exactly is not trusted: the live tree again
    raw[6].ranks = { fo_spin: 'three' }
    store.set('game7.campaign.v2.draft', JSON.stringify(raw))
    expect(loadDraft('campaign', 6, p)!.ranks).toBeNull()
    clearDraft('campaign', 6)
  })

  it('the tree names the drafts under way — begun ones only — and says a rank bought now starts with the next draft', () => {
    const p = rich()
    keep(p, 3, fresh(), {})
    const tree = (underway: number[], death = false) =>
      renderToStaticMarkup(createElement(Tree, { wallet: p, death, salary: death, underway, onBuy: () => {}, onRespec: () => {}, onBack: () => {} }))
    expect(draftsUnderway('campaign', p)).toEqual([]) // opened, not spun
    keep(p, 7, landed(), {})
    keep(p, 12, landed(), {})
    expect(draftsUnderway('campaign', p)).toEqual([7, 12])
    expect(tree([])).toContain('A rank bought mid-draft starts with the next draft.')
    expect(tree([7])).toContain('A rank bought mid-draft starts with the next draft — level 7’s is under way.')
    expect(tree([7, 12])).toContain('levels 7 and 12 have theirs under way.')
    expect(tree([], true)).toContain('starts with the next draft; Survival ranks count at once.')
    for (const l of [3, 7, 12]) clearDraft('campaign', l)
  })

  it('App hands the draft and the sim the same staffed save, and writes the ranks with the draft', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/const draftRanks = prog \? draftStaff\(resume, prog\.nodes\) : null/)
    expect(app).toMatch(/const staffed = prog \? staffAt\(prog, draftRanks\) : null/)
    expect(app).toMatch(/wallet=\{staffed!\}/)
    expect(app).toMatch(/tactics=\{callsPlan\(cm, staffed!\) \? prog\.tactics : null\}/)
    expect(app).toMatch(/const plan = planFor\(cm, staffed, five\.map/)
    expect(app).toMatch(/ranks: draftRanks, carry: carryNames/)
    expect(app).toMatch(/underway=\{draftsUnderway\(cm, prog\)\}/)
    // the boosts are still bought with the live stars, before the first spin, as they were
    expect(app).toMatch(/const next = buyBoost\(prog, id, held\)/)
  })

  it('a boost is still paid out of the live balance the staffed save shows', () => {
    const p = rich({ nodes: { fo_spin: 2 }, spent: 3 })
    const paid = buyBoost(p, 'timeout', [])!
    expect(balance(staffAt(paid, { fo_spin: 1 }))).toBe(balance(paid))
    // and a Timeout is one more respin on top of the staff the draft began with
    expect(extraSpins(staffAt(paid, { fo_spin: 1 }), false, ['timeout'])).toBe(2)
  })
})

describe('a kept draft’s staff, read whole', () => {
  it('the kept draft as App writes it reads back with its attempt, state and ranks', () => {
    const p = rich()
    const s: DraftSave = { ...draftAttempt(p, 5), ...landed(), ranks: { fo_spin: 2 }, carry: null }
    saveDraft('campaign', s)
    expect(loadDraft('campaign', 5, p)).toEqual(s)
    clearDraft('campaign', 5)
  })
})
