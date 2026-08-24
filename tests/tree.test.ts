import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import STATS from '../src/data/stats.json'
import { ROUNDS } from '../src/config'
import { defenseVs, naiveAssignment } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import { starsFor } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { balance, buy, capBonus, earned, maxed, migrate, NODES, parIncome, price, rank, respec, respinSeason, treeCost, unlocked, type Wallet } from '../src/engine/tree'
import type { Opponent, StatLine } from '../src/engine/types'

const by = new Map(PLAYERS.map((p) => [p.name, p]))
const five = (...n: string[]) => n.map((x) => by.get(x)!)
const opp = OPP as Opponent[]

describe('staff tree — stars as a campaign currency', () => {
  it('every rank costs one star; the whole ranked tree is a checklist a long campaign works through', () => {
    console.log(`  par income ${parIncome()}★ over ${ROUNDS} levels; ${NODES.length} nodes, ${treeCost()}★ of ranks`)
    for (const n of NODES) expect(price(n.id)).toBe(1)
    // no skill is a one-time skill: every node holds at least two ranks, each documented
    for (const n of NODES) {
      expect(n.ranks, `${n.id} must be rankable`).toBeGreaterThanOrEqual(2)
      expect(n.rankBlurbs, `${n.id} must describe every rank`).toHaveLength(n.ranks)
    }
    expect(treeCost()).toBe(NODES.reduce((a, n) => a + n.ranks, 0))
    expect(treeCost()).toBeGreaterThan(NODES.length) // ranks, not a flat checklist
    expect(parIncome()).toBeGreaterThan(treeCost()) // deliberate: the tree is not a scarcity puzzle
  })

  it('ranks stack to the node maximum, and each branch is a chain: the next node needs the one before', () => {
    let w: Wallet = { stars: Array.from({ length: ROUNDS }, () => 2), spent: 0, nodes: {} }
    expect(earned(w)).toBe(ROUNDS * 2)
    expect(unlocked(w, 'coach_manual')).toBe(false)
    expect(buy(w, 'coach_manual')).toBeNull() // gated behind Matchup coaching
    w = buy(w, 'coach_optimal')!
    expect(balance(w)).toBe(ROUNDS * 2 - 1)
    expect(rank(w, 'coach_optimal')).toBe(1)
    expect(unlocked(w, 'coach_manual')).toBe(true) // one rank opens the next node
    // buying again buys the NEXT rank, until the node is full
    w = buy(w, 'coach_optimal')!
    expect(rank(w, 'coach_optimal')).toBe(2)
    expect(maxed(w, 'coach_optimal')).toBe(true)
    expect(buy(w, 'coach_optimal')).toBeNull() // never past the maximum
    // a per-draft allowance IS the rank: three ranks of Extra spin is three respins a draft
    w = buy(buy(buy(w, 'fo_spin')!, 'fo_spin')!, 'fo_spin')!
    expect(rank(w, 'fo_spin')).toBe(3)
    expect(buy(w, 'fo_spin')).toBeNull()
    expect(buy({ ...w, spent: 100000 }, 'scout_ratings')).toBeNull() // no stars, no rank
    expect(NODES).toHaveLength(14) // 10 staff + the Salary payroll node + the 3 Survival nodes (death match)
    // respec: everything refunded, nothing owned, earned untouched
    const back = respec(w)
    expect(balance(back)).toBe(ROUNDS * 2)
    expect(back.nodes).toEqual({})
    expect(earned(back)).toBe(ROUNDS * 2)
  })

  it('a wallet saved before the tree was ranked is migrated, not charged for nodes that no longer exist', () => {
    // the old shape: separate fo_spin2 / cap3 nodes, each one star
    const legacy = { stars: [6], spent: 4, nodes: { fo_spin: 1, fo_spin2: 1, cap1: 1, cap3: 1 } } as unknown as Wallet
    const w = migrate(legacy)
    expect(w.nodes).toEqual({ fo_spin: 1 }) // the ids that survive
    expect(w.spent).toBe(1) // and only those are charged for
    expect(balance(w)).toBe(5)
    // a rank count above the node's maximum is clipped rather than trusted
    const over = migrate({ stars: [20], spent: 9, nodes: { cap: 9 } } as unknown as Wallet)
    expect(rank(over, 'cap')).toBe(4)
    expect(over.spent).toBe(4)
  })

  it('version respin never changes the player, only the season, and keeps him eligible for his slot', () => {
    const lines = STATS as Record<string, StatLine | null>
    const rng = makeRng(3)
    const lebron = by.get("LeBron James '13")!
    for (let i = 0; i < 20; i++) {
      const q = respinSeason(lebron, rng, 'SF', lines)!
      expect(q.player).toBe(lebron.player)
      expect(q.name).not.toBe(lebron.name)
      expect(q.peak_season).not.toBe(lebron.peak_season)
    }
    // a one-season player has nothing to respin to
    const single = PLAYERS.find((p) => PLAYERS.filter((q) => q.player === p.player).length === 1)!
    expect(respinSeason(single, rng)).toBeNull()
  })
})

describe('the Salary branch', () => {
  it('each payroll rank buys five points of room, and nothing else touches the cap', () => {
    let w: Wallet = { stars: Array.from({ length: ROUNDS }, () => 2), spent: 0, nodes: {} }
    expect(capBonus(w)).toBe(0)
    for (let i = 0; i < 4; i++) w = buy(w, 'cap')!
    expect(rank(w, 'cap')).toBe(4)
    expect(capBonus(w)).toBe(20)
    expect(buy(w, 'cap')).toBeNull()
    expect(capBonus(buy({ stars: [10], spent: 0, nodes: {} }, 'coach_optimal')!)).toBe(0)
  })
})

describe('series length and stars', () => {
  it('a shorter series cannot inflate star income: bo3 sweep 2★, bo5 sweep 3★ / 3–2 1★, bo7 as always', () => {
    const r = (wins: number, losses: number, toWin: number) => ({ games: [], wins, losses, won: true, toWin })
    expect(starsFor(r(2, 0, 2))).toBe(2)
    expect(starsFor(r(2, 1, 2))).toBe(1)
    expect(starsFor(r(3, 0, 3))).toBe(3)
    expect(starsFor(r(3, 1, 3))).toBe(2)
    expect(starsFor(r(3, 2, 3))).toBe(1)
    expect(starsFor(r(4, 0, 4))).toBe(3)
    expect(starsFor(r(4, 2, 4))).toBe(2)
    expect(starsFor(r(4, 3, 4))).toBe(1)
  })
})

describe('defensive assignment — naive vs optimal', () => {
  const wall = five("Chris Paul '08", "Tony Allen '12", "Kawhi Leonard '17", "Draymond Green '16", "Rudy Gobert '19")

  it('naive is never better than optimal, on any level', () => {
    for (const o of opp) {
      const gap = defenseVs(wall, o.players, 'naive').drtg - defenseVs(wall, o.players, 'optimal').drtg
      expect(gap).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('differs by ≥ 3 DRtg against a five-out opponent and ≤ 1 against a paint opponent', () => {
    // Five-out: LAC (every starter out ≥ 59); the man the naive coach parks the anchor on is a shooter.
    const lac = opp.find((o) => o.ab === 'LAC')!.players
    const map = naiveAssignment(wall, lac)
    const anchorOn = map[4] // Gobert is slot 5 (C)
    const fiveOut = lac.map((p, j) => (j === anchorOn ? { ...p, attrs: { ...p.attrs, '3pt': Math.max(p.attrs['3pt'], 88) } } : p))
    expect(Math.min(...fiveOut.map((p) => p.attrs['3pt']))).toBeGreaterThanOrEqual(45)
    const a = defenseVs(wall, fiveOut, 'optimal').drtg
    const b = defenseVs(wall, fiveOut, 'naive').drtg
    // Paint: WAS (worst shooter out 31) — the anchor's man is the non-shooter either way.
    const was = opp[0].players
    const c = defenseVs(wall, was, 'optimal').drtg
    const d = defenseVs(wall, was, 'naive').drtg
    console.log(`  five-out  optimal ${a.toFixed(2)} naive ${b.toFixed(2)} gap ${(b - a).toFixed(2)} | paint  optimal ${c.toFixed(2)} naive ${d.toFixed(2)} gap ${(d - c).toFixed(2)}`)
    expect(b - a).toBeGreaterThanOrEqual(3)
    expect(Math.abs(d - c)).toBeLessThanOrEqual(1)
  })

  it('a broken manual map is scored as the naive board, never as optimal', () => {
    const lac = opp.find((o) => o.ab === 'LAC')!.players
    expect(defenseVs(wall, lac, [0, 0, 1, 2, 3]).drtg).toBeCloseTo(defenseVs(wall, lac, 'naive').drtg, 9)
    expect(defenseVs(wall, lac, [0, 1]).drtg).toBeCloseTo(defenseVs(wall, lac, 'naive').drtg, 9)
  })

  it('a manual map scores with the same math: the optimal hide reproduced by hand equals optimal', () => {
    const lac = opp.find((o) => o.ab === 'LAC')!.players
    const opt = defenseVs(wall, lac, 'optimal')
    // put Gobert on their worst shooter, everyone else anywhere
    const rest = [0, 1, 2, 3, 4].filter((j) => j !== opt.worstShooter)
    const manual = [rest[0], rest[1], rest[2], rest[3], opt.worstShooter]
    const man = defenseVs(wall, lac, manual)
    expect(man.anchor).toBeCloseTo(opt.anchor, 9)
    expect(man.drtg).toBeCloseTo(opt.drtg, 6)
  })
})
