import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { WHEEL, type TeamSeason } from '../src/data/wheel'
import { ROUNDS } from '../src/config'
import { night, odds } from '../src/engine/odds'
import { PLAYERS } from '../src/engine/pool'
import { POSITIONS, type Pos } from '../src/engine/positions'
import { simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { DEFAULT_TACTICS } from '../src/engine/tactics'
import {
  balance,
  BOOST,
  BOOST_MAX,
  buy,
  buyBoost,
  canBoost,
  canBuy,
  extraSpins,
  frontier,
  HOT_HAND,
  migrate,
  NODE,
  NODES,
  price,
  PRICING,
  respec,
  sameRosterUses,
  scoutsPicks,
  tierOpen,
  treeCost,
  type Branch,
  type BoostId,
  type NodeId,
  type Wallet,
} from '../src/engine/tree'
import type { Opponent } from '../src/engine/types'
import { freshProgress, levelSeed, loadProgress, saveKey, saveProgress, type Progress } from '../src/state/campaign'
import { afterLeave, clearDraft, countedRng, draftAttempt, hasSpun, loadDraft, saveDraft, type DraftSave, type DraftState } from '../src/state/draftsave'
import { bare, Draft, fillQueue, franchiseLanding, landable, landOn, posOf } from '../src/ui/Draft'
import { Tree } from '../src/ui/Tree'
import { buildReels } from '../src/ui/SpinReels'

/**
 * THE STAR ECONOMY (his rulings, 2026-10-23): "B, optionally combined with A's milder version. Also,
 * we can add in game extra boosts single use for harder stages" — then, on the spec: tier nodes
 * "Build as listed"; "Yes, the milder pricing"; boosts "Build as listed".
 *
 * The problem it fixes: 25 ranks at one star each were bought out by about level 10 of 150 at his
 * pace, and after that stars bought nothing.
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

/** A ladder cleared up to and including level `n` (two stars a level), so it stands on level n + 1. */
const cleared = (n: number): number[] => Array.from({ length: ROUNDS }, (_, i) => (i < n ? 2 : 0))
const wallet = (over: Partial<Wallet> = {}): Wallet => ({ stars: cleared(ROUNDS), spent: 0, nodes: {}, pricing: PRICING, ...over })
const branch = (b: Branch) => NODES.filter((n) => n.branch === b)
const sum = (b: Branch, death = false) => branch(b).reduce((a, n) => a + n.ranks * price(n.id, death), 0)

describe('A — the milder pricing: a rank costs its row in the branch plus one', () => {
  it('Scout 7★, Front office 23★, Coach 27★ — 57 stars for the 25 ranks', () => {
    expect(sum('Scout')).toBe(7)
    expect(sum('Front office')).toBe(23)
    expect(sum('Coach')).toBe(27)
    expect(treeCost(['Scout', 'Front office', 'Coach'])).toBe(57)
    expect(['Scout', 'Front office', 'Coach'].flatMap((b) => branch(b as Branch)).reduce((a, n) => a + n.ranks, 0)).toBe(25)
    // row by row
    expect([0, 1, 2, 3].map((d) => NODES.filter((n) => n.branch === 'Front office' && n.depth === d).map((n) => price(n.id)))).toEqual([[1], [2], [3], [4]])
  })

  it('payroll room sits on its top row and stays one star; Survival stays one star a rank', () => {
    expect(price('cap')).toBe(1)
    for (const n of branch('Survival')) expect(price(n.id), n.id).toBe(1)
  })

  it('the death match keeps one star a rank for EVERY node — its economy is not touched', () => {
    for (const n of NODES) expect(price(n.id, true), n.id).toBe(1)
    expect(treeCost(['Scout', 'Front office', 'Coach'], true)).toBe(25)
    const w = wallet({ nodes: { fo_spin: 1, fo_respin: 1, fo_decade: 1 }, spent: 3 })
    expect(buy(w, 'fo_division', true)!.spent).toBe(4) // one star, as it always was
    expect(buy(w, 'fo_division')!.spent).toBe(7) // four on the ladders that have the new prices
  })

  it('a buy charges the node its own price, and a balance short of it cannot buy', () => {
    let w = wallet({ stars: [3, ...cleared(0).slice(1)] }) // three stars earned
    w = buy(w, 'scout_ratings')!
    expect(w.spent).toBe(1)
    expect(buy(w, 'scout_wheel')!.spent).toBe(3) // two more
    const poor = { ...w, stars: [2, ...w.stars.slice(1)] } // one left
    expect(canBuy(poor, 'scout_wheel')).toBe(false)
    expect(buy(poor, 'scout_wheel')).toBeNull()
    expect(canBuy(poor, 'scout_wheel', true)).toBe(true) // the death match still sells it for one
  })
})

describe('B — the Dynasty branch, one node a tier, opening as the ladder reaches it', () => {
  it('prices 3★, 4★ and 5★ a rank, 19 stars for the branch', () => {
    expect([price('dyn_same'), price('dyn_spin'), price('dyn_pick')]).toEqual([3, 4, 5])
    expect([NODE.dyn_same.ranks, NODE.dyn_spin.ranks, NODE.dyn_pick.ranks]).toEqual([2, 2, 1])
    expect(sum('Dynasty')).toBe(19)
    expect([NODE.dyn_same.opensAt, NODE.dyn_spin.opensAt, NODE.dyn_pick.opensAt]).toEqual([31, 91, 121])
  })

  it('each node is locked until the level before its tier is cleared, and open from then on', () => {
    for (const [id, at] of [['dyn_same', 31], ['dyn_spin', 91], ['dyn_pick', 121]] as [NodeId, number][]) {
      const before = wallet({ stars: cleared(at - 2) }) // standing on the last level of the tier below
      expect(frontier(before)).toBe(at - 1)
      expect(tierOpen(before, id), `${id} at ${at - 1}`).toBe(false)
      expect(canBuy(before, id), `${id} is not for sale yet`).toBe(false)
      expect(buy(before, id)).toBeNull()
      const reached = wallet({ stars: cleared(at - 1) }) // that level cleared: the ladder stands on the tier
      expect(frontier(reached)).toBe(at)
      expect(tierOpen(reached, id), `${id} at ${at}`).toBe(true)
      expect(buy(reached, id)!.spent).toBe(price(id))
    }
    // every level cleared: all three open
    expect(NODES.filter((n) => n.branch === 'Dynasty').every((n) => tierOpen(wallet(), n.id))).toBe(true)
  })

  it('the ladder is read the way the map reads it: a hole below the tier keeps it shut', () => {
    const holed = cleared(40)
    holed[29] = 0 // level 30 not cleared, though 31-40 carry stars
    expect(frontier({ stars: holed })).toBe(30)
    expect(tierOpen({ stars: holed }, 'dyn_same')).toBe(false)
  })

  it('the death match does not sell it — the tree and the map notice both leave it off', () => {
    const tree = (death: boolean) => renderToStaticMarkup(createElement(Tree, { wallet: wallet(), salary: death, death, onBuy: () => {}, onRespec: () => {}, onBack: () => {} }))
    expect(tree(false)).toContain('DYNASTY')
    expect(tree(true)).not.toContain('DYNASTY')
    const map = readFileSync('src/ui/LevelMap.tsx', 'utf8')
    expect(map).toMatch(/b === 'Dynasty' \? !death/)
  })

  it('Extra spin+ adds a fourth, then a fifth extra landing on top of Extra spin', () => {
    const w = wallet({ nodes: { fo_spin: 3 } })
    expect(extraSpins(w)).toBe(3)
    expect(extraSpins({ ...w, nodes: { fo_spin: 3, dyn_spin: 1 } })).toBe(4)
    expect(extraSpins({ ...w, nodes: { fo_spin: 3, dyn_spin: 2 } })).toBe(5)
    // owned ranks keep working whatever the map says afterwards (auto mode put back, a ladder reset)
    expect(extraSpins({ ...w, stars: cleared(0), nodes: { fo_spin: 3, dyn_spin: 2 } })).toBe(5)
    // never in the death match
    expect(extraSpins({ ...w, nodes: { fo_spin: 3, dyn_spin: 2 } }, true)).toBe(3)
  })

  it('Same roster again: once a draft at rank 1, twice at rank 2, never in the death match', () => {
    expect(sameRosterUses(wallet({ nodes: { dyn_same: 1 } }))).toBe(1)
    expect(sameRosterUses(wallet({ nodes: { dyn_same: 2 } }))).toBe(2)
    expect(sameRosterUses(wallet({ nodes: { dyn_same: 2 } }), true)).toBe(0)
    expect(scoutsPicks(wallet({ nodes: { dyn_pick: 1 } }))).toBe(1)
    expect(scoutsPicks(wallet({ nodes: { dyn_pick: 1 } }), true)).toBe(0)
  })

  it('Same roster again is offered only while the roster still has a man the five can take', () => {
    const t = WHEEL.find((x) => x.p.length >= 10 && x.y >= 2000)!
    const first = t.p.find((n) => posOf(n).length)!
    const at = posOf(first)[0]
    const taken = new Set([bare(first)])
    const open = POSITIONS.filter((x) => x !== at)
    expect(landable(t, taken, open)).toBe(true) // a stacked roster: a second man is there to take
    // every man on it taken, or no open ring any of them plays: nothing to re-land on
    expect(landable(t, new Set(t.p.map(bare)), open)).toBe(false)
    expect(landable(t, taken, [])).toBe(false)
    // and the cap: a roster nobody can afford is not offered
    expect(landable(t, taken, open, () => false)).toBe(false)
  })

  it("Scout's pick lands on a legal season of the named franchise, off the wheel's own stream", () => {
    const open = [...POSITIONS]
    const a = countedRng(77)
    const got = franchiseLanding('Boston Celtics', new Set(), open, () => a.next())!
    expect(got.team).toBe('Boston Celtics')
    expect(landable(got, new Set(), open)).toBe(true)
    // deterministic, like every other landing
    const b = countedRng(77)
    expect(franchiseLanding('Boston Celtics', new Set(), open, () => b.next())).toBe(got)
  })

  it("Scout's pick refuses a franchise with nothing left for the open rings — before drawing a number", () => {
    const r = countedRng(5)
    expect(franchiseLanding('Boston Celtics', new Set(), [], () => r.next())).toBeNull()
    expect(franchiseLanding('Boston Celtics', new Set(), [...POSITIONS], () => r.next(), () => false)).toBeNull()
    expect(r.draws()).toBe(0) // the refusal did not move the wheel
  })
})

describe('the boosts — single use, bought before the first spin, at most two to an attempt', () => {
  const rich = () => wallet({ stars: [5, ...cleared(0).slice(1)] })

  it('as listed: Timeout 1★, Film session 1★, Hot hand 2★', () => {
    expect([BOOST.timeout.price, BOOST.film.price, BOOST.hothand.price]).toEqual([1, 1, 2])
    expect(BOOST_MAX).toBe(2)
    expect(HOT_HAND).toBe(1.5)
  })

  it('a boost is paid out of the balance into `boosted`, never into `spent`', () => {
    const w = buyBoost(rich(), 'hothand', [])!
    expect(w.boosted).toBe(2)
    expect(w.spent).toBe(0)
    expect(balance(w)).toBe(3)
  })

  it('at most two to an attempt, each kind once, and never past the balance', () => {
    const w = rich()
    expect(canBoost(w, 'timeout', [])).toBe(true)
    expect(canBoost(w, 'timeout', ['timeout'])).toBe(false) // the same kind twice
    expect(canBoost(w, 'hothand', ['timeout', 'film'])).toBe(false) // a third
    expect(buyBoost(w, 'hothand', ['timeout', 'film'])).toBeNull()
    const poor = wallet({ stars: [1, ...cleared(0).slice(1)] })
    expect(canBoost(poor, 'timeout', [])).toBe(true)
    expect(canBoost(poor, 'hothand', [])).toBe(false) // two stars, one in hand
  })

  it('a respec hands back the tree and NOT the boosts', () => {
    let w = wallet({ stars: [3, 3, 3, ...cleared(0).slice(3)] })
    w = buy(buy(w, 'scout_ratings')!, 'scout_wheel')! // 1 + 2
    w = buyBoost(w, 'film', [])!
    w = buyBoost(w, 'hothand', ['film'])!
    expect(balance(w)).toBe(9 - 3 - 3)
    const back = respec(w)
    expect(back.spent).toBe(0)
    expect(back.nodes).toEqual({})
    expect(back.boosted).toBe(3)
    expect(balance(back)).toBe(9 - 3) // the boosts' three stars stay spent
  })

  it('Timeout is one more respin this draft, on top of everything else, and not in the death match', () => {
    const w = wallet({ nodes: { fo_spin: 2 } })
    expect(extraSpins(w, false, ['timeout'])).toBe(3)
    expect(extraSpins(w, false, ['film'])).toBe(2)
    expect(extraSpins(w, true, ['timeout'])).toBe(2)
  })

  it('Hot hand: the card and the sim read the SAME night, +1.5 on every game', () => {
    const opp = (OPP as Opponent[])[4].players
    const five = (OPP as Opponent[])[11].players
    for (const plan of [null, DEFAULT_TACTICS]) {
      const cold = night(five, opp, 'optimal', plan)
      const hot = night(five, opp, 'optimal', plan, 0, HOT_HAND)
      // the card: decompose's modifiers carry it, and the spread moves by exactly that
      const a = odds(cold.mine, cold.theirs, cold.sigma)
      const b = odds(hot.mine, hot.theirs, hot.sigma)
      expect(b.parts.modifiers - a.parts.modifiers).toBeCloseTo(HOT_HAND, 9)
      expect(b.spread - a.spread).toBeCloseTo(HOT_HAND, 9)
      expect(b.parts.talent).toBe(a.parts.talent)
      expect(b.parts.fit).toBe(a.parts.fit)
      expect(hot.sigma).toBe(cold.sigma) // nothing else about the night moves
      expect(b.series).toBeGreaterThan(a.series)
      // the sim: the same seed plays the same games, every margin 1.5 better
      const s0 = simSeries(cold.mine, cold.theirs, makeRng(9), cold.sigma)
      const s1 = simSeries(hot.mine, hot.theirs, makeRng(9), hot.sigma)
      const n = Math.min(s0.games.length, s1.games.length)
      for (let g = 0; g < n; g++) expect(s1.games[g].margin - s0.games[g].margin).toBeCloseTo(HOT_HAND, 9)
    }
  })

  it('App sims the night the draft card priced: the draft hands its edge over, App hands it to `night`', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/night\(five, opponent\.players, assignment, plan, paceMastery\(prog\), death \? 0 : edge\)/)
    const draft = readFileSync('src/ui/Draft.tsx', 'utf8')
    expect(draft).toMatch(/night\(five, opponent\.players, assignment, plan, paceMastery\(wallet\), edge\)/)
    expect(draft).toMatch(/onSim\(five, assignment, toWin, edge\)/)
  })
})

describe('the accounting: what was paid is what was paid', () => {
  const put = (raw: Record<string, unknown>) => store.set(saveKey('campaign'), JSON.stringify(raw))

  it('a save from before the prices changed loads with its balance unchanged, and the next rank costs the new price', () => {
    // bought at one star a rank: 3 + 2 + 3 + 1 + 2 = 11 ranks, 11 stars
    const nodes = { scout_ratings: 3, scout_wheel: 2, fo_spin: 3, fo_respin: 1, coach_optimal: 2 }
    const stars = cleared(12) // 24 earned
    put({ coach: null, stars, seed: 7, plays: 12, spent: 11, nodes, deaths: 0, ladder: 2, credit: 0 })
    const p = loadProgress('campaign')
    expect(p.spent).toBe(11)
    expect(balance(p)).toBe(24 - 11) // not a star moved
    expect(p.pricing).toBe(PRICING)
    // at the new prices those same ranks would be 3 + 4 + 3 + 2 + 2 = 14 — and that is NOT charged
    expect(NODES.filter((n) => n.id in nodes).reduce((a, n) => a + nodes[n.id as keyof typeof nodes] * price(n.id), 0)).toBe(14)
    // the next rank of Version respin is a depth-1 rank: two stars
    const next = buy(p, 'fo_respin')!
    expect(next.spent).toBe(13)
    expect(balance(next)).toBe(24 - 13)
    // and saved and read back, the ledger is kept as it stands — not recomputed at either price list
    saveProgress('campaign', next)
    const again = loadProgress('campaign')
    expect(again.spent).toBe(13)
    expect(balance(again)).toBe(11)
    // a respec refunds exactly what was paid
    expect(balance(respec(again))).toBe(24)
  })

  it('the old migration still drops a node that is gone and refunds it at the star it cost', () => {
    put({ coach: null, stars: cleared(3), seed: 7, plays: 3, spent: 6, nodes: { scout_ratings: 3, scout_reads: 2, scout_wheel: 1 }, ladder: 2 })
    const p = loadProgress('campaign')
    expect(p.nodes).toEqual({ scout_ratings: 3, scout_wheel: 1 })
    expect(p.spent).toBe(4)
  })

  it('a save on the new price list keeps `spent` exactly, and `boosted` with it', () => {
    put({ coach: null, stars: cleared(20), seed: 7, plays: 20, spent: 17, nodes: { fo_spin: 3, fo_respin: 3, fo_decade: 1 }, boosted: 4, pricing: PRICING, ladder: 2 })
    const p = loadProgress('campaign')
    expect(p.spent).toBe(17) // 3 + 6 would be 12 at one star; 3 + 6 + 3 at the new prices is 12 too — 17 is the ledger
    expect(p.boosted).toBe(4)
    expect(balance(p)).toBe(40 - 17 - 4)
    // migrate on its own says the same
    expect(migrate(p).spent).toBe(17)
  })

  it('a new ladder starts on the new price list with no boosts', () => {
    const f = freshProgress()
    expect(f.pricing).toBe(PRICING)
    expect(f.boosted).toBe(0)
    store.delete(saveKey('campaign'))
    expect(loadProgress('campaign').boosted).toBe(0)
  })

  it('the 30★ trophy and Spendthrift read the balance with the boosts taken out', () => {
    const ach = readFileSync('src/state/achievements.ts', 'utf8')
    expect(ach).toMatch(/if \(balance\(prog\) >= 30\) u\(51\)/)
    expect(ach).toMatch(/ev\.nextProg\.spent \+ \(ev\.nextProg\.boosted \?\? 0\) > 0/)
    expect(balance(wallet({ stars: [40, ...cleared(0).slice(1)], boosted: 11 }))).toBe(29)
  })
})

describe('kept with the draft in progress', () => {
  const p: Progress = { ...freshProgress(), seed: 4242, plays: 3 }
  const base = (over: Partial<DraftState> = {}): DraftSave => ({
    ...draftAttempt(p, 33),
    draws: 0,
    slots: {},
    landed: null,
    last: null,
    upcoming: null,
    after: null,
    reels: null,
    hold: null,
    used: {},
    dead: false,
    wide: 'team',
    board: null,
    boosts: [],
    ...over,
  })

  it('every new charge and the boosts round-trip: Same roster, Scout’s pick, Extra spin with a Timeout, the Film session’s second look', () => {
    const s = base({
      draws: 512,
      slots: { PG: WHEEL[3].p[0] },
      landed: null,
      last: WHEEL[3],
      upcoming: WHEEL[8],
      after: WHEEL[9],
      reels: { team: { rows: ['A', 'B'], at: 0 }, year: { rows: ['2001'], at: 0 }, nonce: 3, held: 'team' },
      used: { fo_spin: 4, dyn_same: 1, dyn_pick: 1, fo_respin: 2 },
      boosts: ['timeout', 'film'],
    })
    saveDraft('campaign', s)
    expect(loadDraft('campaign', 33, p)).toEqual(s)
    clearDraft('campaign', 33)
  })

  it('a draft kept before the boosts existed still reads back, with none', () => {
    const { after: _a, boosts: _b, ...old } = base({ upcoming: WHEEL[0] })
    store.set(`${saveKey('campaign')}.draft`, JSON.stringify({ 33: { ...old, v: 1, upcoming: `${WHEEL[0].ab}|${WHEEL[0].y}` } }))
    const back = loadDraft('campaign', 33, p)!
    expect(back.after).toBeNull()
    expect(back.boosts).toEqual([])
    expect(back.upcoming).toBe(WHEEL[0])
    clearDraft('campaign', 33)
  })

  it('a boost list that does not read back exactly is not guessed at', () => {
    for (const boosts of [['timeout', 'timeout'], ['timeout', 'film', 'hothand'], ['nitro'], 'film']) {
      store.set(`${saveKey('campaign')}.draft`, JSON.stringify({ 33: { ...base(), v: 1, boosts } }))
      expect(loadDraft('campaign', 33, p), JSON.stringify(boosts)).toBeNull()
    }
    store.delete(`${saveKey('campaign')}.draft`)
  })

  it('a boost bought survives a reload and a walk out, once — and goes with the sim, its stars staying spent', () => {
    const before = { ...p, stars: [5, ...p.stars.slice(1)] }
    // the press: the stars, then the draft holding it — both written before anything else can happen
    const paid = buyBoost(before, 'hothand', [])!
    saveProgress('campaign', paid)
    saveDraft('campaign', base({ boosts: ['hothand'] }))
    // a reload: the save and the draft are read back as they were
    const back = loadProgress('campaign')
    expect(balance(back)).toBe(3)
    expect(loadDraft('campaign', 33, back)!.boosts).toEqual(['hothand'])
    // walking out keeps the draft (and its boost) and does not count the attempt
    expect(afterLeave('campaign', back, false)).toEqual({ progress: back, keep: true })
    expect(loadDraft('campaign', 33, back)!.boosts).toEqual(['hothand'])
    // the series is simmed: the draft goes, the boost with it; the stars stay spent
    clearDraft('campaign', 33)
    expect(loadDraft('campaign', 33, back)).toBeNull()
    expect(balance(loadProgress('campaign'))).toBe(3)
    store.delete(saveKey('campaign'))
  })

  it('the shop closes at the first spin: a draft that has spun, or has a man on the board, has spun', () => {
    expect(hasSpun(base())).toBe(false)
    expect(hasSpun(base({ upcoming: WHEEL[0] }))).toBe(false) // the idle wheel drew its first landing: not a spin
    expect(hasSpun(base({ reels: buildReels(WHEEL[0], WHEEL, makeRng(1).next, 1) }))).toBe(true)
    expect(hasSpun(base({ last: WHEEL[0] }))).toBe(true)
    expect(hasSpun(base({ slots: { C: WHEEL[0].p[0] } }))).toBe(true)
  })
})

describe('the wheel deals what it always dealt (creator mode, and every seed without a Film session)', () => {
  /**
   * The draft's wheel step for step — the idle draw, the spin, the first man who fits drafted — once
   * by the rule the screen ran before this change (`if (!upcoming) upcoming = landOn(...)`) and once
   * through `fillQueue` with no Film session. Fifty seeds, five spins each: the same landings off the
   * same numbers of the same stream.
   */
  const run = (seed: number, queue: boolean) => {
    const rng = countedRng(seed)
    const slots: Partial<Record<Pos, string>> = {}
    let upcoming: TeamSeason | null = null
    const out: string[] = []
    for (let k = 0; k < 5; k++) {
      const open = POSITIONS.filter((x) => !slots[x])
      const taken = new Set(Object.values(slots).map((n) => bare(n!)))
      if (queue) {
        const q = fillQueue({ upcoming, after: null }, 1, (t) => landable(t, taken, open), (avoid) => landOn(taken, open, () => rng.next(), avoid))
        if (q) upcoming = q.upcoming
      } else if (!upcoming) upcoming = landOn(taken, open, () => rng.next(), null)
      const landed = upcoming!
      upcoming = null
      buildReels(landed, WHEEL, () => rng.next(), 1, null, null)
      const man = landed.p.find((n) => !taken.has(bare(n)) && posOf(n).some((x) => open.includes(x)))!
      slots[posOf(man).find((x) => open.includes(x))!] = man
      out.push(`${landed.ab}${landed.y}:${man}@${rng.draws()}`)
    }
    return out
  }

  it('fifty seeds, five spins: identical', () => {
    for (let s = 1; s <= 50; s++) expect(run(levelSeed({ ...freshProgress(), seed: s * 7919, plays: s }, 1 + (s % 30)), true)).toEqual(run(levelSeed({ ...freshProgress(), seed: s * 7919, plays: s }, 1 + (s % 30)), false))
  })

  it('the queue with nothing to do draws nothing; a Film session draws two different landings', () => {
    const open = [...POSITIONS]
    const fits = (t: TeamSeason) => landable(t, new Set(), open)
    let calls = 0
    const draw = (avoid: TeamSeason | null) => (calls++, landOn(new Set(), open, makeRng(calls).next, avoid))
    expect(fillQueue({ upcoming: WHEEL[0], after: null }, 1, fits, draw)).toBeNull()
    expect(calls).toBe(0)
    const two = fillQueue({ upcoming: null, after: null }, 2, fits, draw)!
    expect(calls).toBe(2)
    expect(two.upcoming).not.toBeNull()
    expect(two.after).not.toBeNull()
    expect(two.after).not.toBe(two.upcoming)
    // a pick left the first with nobody to give: dropped, and the second look moves up
    const stale = fillQueue({ upcoming: WHEEL[0], after: WHEEL[1] }, 2, (t) => t !== WHEEL[0], draw)!
    expect(stale.upcoming).toBe(WHEEL[1])
    expect(stale.after).not.toBe(WHEEL[1])
  })
})

describe('the screens', () => {
  const opponent = (OPP as Opponent[])[40] ?? (OPP as Opponent[])[3]
  const t = WHEEL.find((x) => x.p.length >= 10 && x.y >= 2000)!
  const pg = t.p.find((n) => posOf(n).includes('PG'))!
  const ladder = (over: Partial<Progress> = {}): Progress => ({ ...freshProgress(), seed: 4242, plays: 3, stars: cleared(ROUNDS), ...over })
  const draft = (wallet: Progress, resume: DraftState | null, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(Draft, {
        opponent,
        seed: levelSeed(wallet, 40),
        teamName: 'Haifa Jets',
        wallet,
        onSim: () => {},
        onBack: () => {},
        onRoster: () => {},
        resume,
        ...extra,
      }),
    )
  const idleAfterOnePick = (over: Partial<DraftState> = {}): DraftState => ({
    draws: 60,
    slots: { PG: pg },
    landed: null,
    last: t,
    upcoming: WHEEL[12],
    after: null,
    reels: buildReels(t, WHEEL, makeRng(1).next, 1),
    hold: null,
    used: {},
    dead: false,
    wide: 'team',
    board: null,
    boosts: [],
    ...over,
  })

  it('the tree prints every price and the gates: L31, L91, L121 while locked', () => {
    const html = renderToStaticMarkup(createElement(Tree, { wallet: wallet({ stars: cleared(0) }), onBuy: () => {}, onRespec: () => {}, onBack: () => {} }))
    for (const s of ['★1', '★2', '★3', '★4', '★5', 'L31', 'L91', 'L121', 'DYNASTY']) expect(html, s).toContain(s)
    expect(html).toContain('0 spent of 76') // 57 for the staff, 19 for the Dynasty
    const open = renderToStaticMarkup(createElement(Tree, { wallet: wallet(), onBuy: () => {}, onRespec: () => {}, onBack: () => {} }))
    expect(open).not.toContain('L31')
    expect(open).toContain('0/2')
  })

  it('after a pick, Same roster again and Scout’s pick are offered on the idle wheel; not in the death match', () => {
    const w = ladder({ nodes: { dyn_same: 1, dyn_pick: 1 } })
    const html = draft(w, idleAfterOnePick())
    expect(html).toContain('Same roster again')
    expect(html).toContain(`lands on ${t.team} ${t.y} again`)
    expect(html).toContain('Scout’s pick')
    const used = draft(w, idleAfterOnePick({ used: { dyn_same: 1, dyn_pick: 1 } }))
    expect(used).not.toContain('Same roster again')
    expect(used).not.toContain('Scout’s pick')
    expect(draft(w, idleAfterOnePick(), { death: true })).not.toContain('Same roster again')
  })

  it('the boosts are on sale before the first spin, and only then; never in creator mode', () => {
    const w = ladder({ stars: [3, ...cleared(0).slice(1)] })
    const shop = draft(w, null, { onBoost: () => true })
    expect(shop).toContain('Boosts for this level')
    for (const b of ['Timeout', 'Film session', 'Hot hand']) expect(shop).toContain(b)
    expect(shop).not.toMatch(/odds|spread|\bbet\b|\block\b/i)
    expect(draft(w, null, { onBoost: () => true, creator: true })).not.toContain('Boosts for this level')
    expect(draft(w, null)).not.toContain('Boosts for this level') // the death match hands no onBoost
    const spun = draft(w, idleAfterOnePick({ boosts: ['film'] }), { onBoost: () => true })
    expect(spun).not.toContain('Boosts for this level')
    expect(spun).toContain('In this level: Film session')
  })

  it('a Film session shows the landing after the next one', () => {
    const w = ladder()
    const html = draft(w, idleAfterOnePick({ boosts: ['film'], upcoming: WHEEL[12], after: WHEEL[20] }))
    expect(html).toContain(WHEEL[12].team)
    expect(html).toContain(`Film session — then ${WHEEL[20].team} ${WHEEL[20].y}`)
  })

  it('Hot hand is on the win-chance card, inside the edge', () => {
    // a full five, one man a ring
    const five: Partial<Record<Pos, string>> = {}
    const used = new Set<string>()
    for (const x of POSITIONS) {
      const p = PLAYERS.find((q) => !used.has(q.player) && posOf(q.name).includes(x))!
      used.add(p.player)
      five[x] = p.name
    }
    const full = (boosts: BoostId[]) => draft(ladder(), { ...idleAfterOnePick({ boosts }), slots: five, upcoming: null })
    const edgeOf = (html: string) => {
      const m = html.match(/(edge|era) <b>([+−])([\d.]+)<\/b>/)!
      return (m[2] === '−' ? -1 : 1) * Number(m[3])
    }
    const cold = full([])
    const hot = full(['hothand'])
    expect(hot).toContain('Hot hand: +1.5 points every game')
    expect(cold).not.toContain('Hot hand')
    expect(edgeOf(hot) - edgeOf(cold)).toBeCloseTo(HOT_HAND, 1)
  })
})
