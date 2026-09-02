import { DEFAULT_TACTICS } from '../src/engine/tactics'
import { describe, expect, it } from 'vitest'
import { ROUNDS } from '../src/config'
import SALARIES from '../src/data/salaries.json'
import { PLAYERS } from '../src/engine/pool'
import { buy, checkpointLevel, livesBought, subsPerRound, type Wallet } from '../src/engine/tree'
import { balance, earned } from '../src/engine/tree'
import { applyWear, clearedCount, currentLevel, die, levelSeed, loadProgress, playable, saveProgress, totalStars, wornOut, type Progress } from '../src/state/campaign'

const prog = (stars: number[]): Progress => ({ coach: 'def', team: null, stars, seed: 12345, plays: 0, spent: 0, nodes: {}, roster: null, lives: 0, checkpoint: 0, deaths: 0, wear: {}, subsUsed: 0, tactics: DEFAULT_TACTICS, bench: null })
const zeros = () => Array.from({ length: ROUNDS }, () => 0)

describe('campaign map', () => {
  it('the next level is the first uncleared one; only cleared levels and the next are playable', () => {
    const s = zeros()
    s[0] = 3
    s[1] = 1
    const p = prog(s)
    expect(currentLevel(p)).toBe(3)
    expect(playable(p, 1)).toBe(true) // replay
    expect(playable(p, 3)).toBe(true) // up next
    expect(playable(p, 4)).toBe(false) // locked
    expect(totalStars(p)).toBe(4)
  })

  it('a finished campaign has no current level and a 90-star ceiling', () => {
    const p = prog(Array.from({ length: ROUNDS }, () => 3))
    expect(currentLevel(p)).toBeNull()
    expect(totalStars(p)).toBe(ROUNDS * 3)
  })

  it('replaying a level spins a different wheel each attempt but the same wheel for the same attempt', () => {
    const p = prog(zeros())
    expect(levelSeed(p, 5)).toBe(levelSeed({ ...p }, 5))
    expect(levelSeed(p, 5)).not.toBe(levelSeed({ ...p, plays: 1 }, 5))
    expect(levelSeed(p, 5)).not.toBe(levelSeed(p, 6))
  })
})

/**
 * HIS RULING rebuilt the ladder above level 30 ("After you finish the 30 teams, you start going by
 * champions or other elite teams…"). A save in localStorage is sacred: his own run is on level 5,
 * and it must open on level 5 with its stars where it left them.
 */
describe('a saved run survives the new ladder', () => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  /** A save written by the OLD ladder: 120 levels, no `ladder` stamp. */
  const oldSave = (stars: number[], over: Record<string, unknown> = {}) =>
    store.set(
      'game7.campaign.v2',
      JSON.stringify({ coach: 'def', team: null, stars, seed: 7, plays: 4, spent: 0, nodes: {}, deaths: 0, ...over }),
    )

  it('his run — four levels cleared, on level 5 — opens exactly where it was', () => {
    const stars = Array.from({ length: 120 }, () => 0)
    stars[0] = 3
    stars[1] = 2
    stars[2] = 3
    stars[3] = 1
    oldSave(stars, { spent: 5, nodes: { scout_ratings: 3, fo_spin: 2 } })
    const p = loadProgress('campaign')
    expect(p.stars.slice(0, 4)).toEqual([3, 2, 3, 1])
    expect(currentLevel(p)).toBe(5)
    expect(totalStars(p)).toBe(9)
    expect(p.stars).toHaveLength(ROUNDS)
    expect(p.seed).toBe(7)
    expect(p.plays).toBe(4)
    // and the tree he bought is still bought, with the right balance left
    expect(p.nodes).toEqual({ scout_ratings: 3, fo_spin: 2 })
    expect(balance(p)).toBe(4)
  })

  it('stars won past level 30 on the old ladder become credit: the levels reopen, the stars stay spendable', () => {
    const stars = Array.from({ length: 120 }, (_, i) => (i < 45 ? 3 : 0))
    oldSave(stars, { spent: 3, nodes: { scout_ratings: 3 } })
    const p = loadProgress('campaign')
    // the first thirty are untouched; 31-45 are uncleared again
    expect(p.stars.slice(0, 30)).toEqual(Array.from({ length: 30 }, () => 3))
    expect(p.stars.slice(30).every((s) => s === 0)).toBe(true)
    expect(clearedCount(p)).toBe(30)
    expect(currentLevel(p)).toBe(31)
    // 15 levels x 3 stars were earned above the line and are carried, so nothing bought is lost
    expect(p.credit).toBe(45)
    expect(totalStars(p)).toBe(135)
    expect(earned(p)).toBe(135)
    expect(balance(p)).toBe(135 - 3) // `spent` is re-derived from the ranks actually held
  })

  it('a save already on the new ladder passes through untouched, twice', () => {
    const stars = Array.from({ length: ROUNDS }, (_, i) => (i < 40 ? 2 : 0))
    saveProgress('campaign', { ...loadProgress('campaign'), stars, credit: 0, spent: 0, nodes: {} })
    const once = loadProgress('campaign')
    expect(once.credit).toBe(0)
    expect(once.stars.slice(30, 40)).toEqual(Array.from({ length: 10 }, () => 2))
    saveProgress('campaign', once)
    const twice = loadProgress('campaign')
    expect(twice.stars).toEqual(once.stars)
    expect(twice.credit).toBe(0)
  })
})

describe('salary data', () => {
  const sal = SALARIES as Record<string, { sal: number; cap: number; pct: number }>
  it('covers most of the pool and every entry is a sane share of that season’s cap', () => {
    const names = new Set(PLAYERS.map((p) => p.name))
    const keys = Object.keys(sal)
    expect(keys.length / PLAYERS.length).toBeGreaterThan(0.8)
    for (const k of keys) {
      expect(names.has(k)).toBe(true)
      const s = sal[k]
      expect(s.sal).toBeGreaterThan(0)
      expect(s.cap).toBeGreaterThan(0)
      expect(Math.abs(s.pct - (100 * s.sal) / s.cap)).toBeLessThan(0.06)
      expect(s.pct).toBeLessThan(200) // Jordan '97 at 124% is the known ceiling
    }
  })
  it('seasons from 2000 on are nearly complete', () => {
    const modern = PLAYERS.filter((p) => p.peak_season >= 2000)
    const hit = modern.filter((p) => sal[p.name]).length
    expect(hit / modern.length).toBeGreaterThan(0.98)
  })
})

describe('death match — a run, not a map', () => {
  it('a loss spends a life if there is one, and otherwise resets the whole campaign', () => {
    const full = zeros().map(() => 3)
    // with a life in hand the run survives untouched
    const alive = die({ ...prog(full), lives: 2, roster: ['a', 'b', 'c', 'd', 'e'] })
    expect(alive.lives).toBe(1)
    expect(alive.roster).not.toBeNull()
    expect(alive.stars).toEqual(full)
    expect(alive.deaths).toBe(0)
    // out of lives: HIS RULING — everything resets. No stars, no tree, no five, no plan.
    const spent: Progress = {
      ...prog(full),
      lives: 0,
      checkpoint: 20,
      spent: 9,
      nodes: { coach_tactics: 3 },
      roster: ['a', 'b', 'c', 'd', 'e'],
      wear: { a: 12 },
      tactics: { ...DEFAULT_TACTICS, style: 'postup' },
    }
    const dead = die(spent)
    expect(dead.stars.every((s) => s === 0)).toBe(true) // the checkpoint spares nothing now
    expect(dead.nodes).toEqual({})
    expect(dead.spent).toBe(0)
    expect(dead.checkpoint).toBe(0)
    expect(dead.roster).toBeNull()
    expect(dead.wear).toEqual({})
    expect(dead.tactics).toEqual(DEFAULT_TACTICS)
    expect(dead.deaths).toBe(1)
    // who he is is not progress, so it survives
    expect(dead.coach).toBe(spent.coach)
    expect(dead.team).toBe(spent.team)
  })

  it('the Survival branch prices lives, checkpoints and substitutions', () => {
    let w: Wallet = { stars: Array.from({ length: ROUNDS }, () => 2), spent: 0, nodes: {} }
    expect(livesBought(w)).toBe(0)
    expect(checkpointLevel(w)).toBe(0)
    expect(subsPerRound(w)).toBe(1) // one change a round before any node
    w = buy(buy(w, 'surv_life')!, 'surv_life')!
    expect(livesBought(w)).toBe(2)
    w = buy(w, 'surv_save')!
    expect(checkpointLevel(w)).toBe(20)
    w = buy(w, 'surv_sub')!
    expect(subsPerRound(w)).toBe(2)
    expect(buy({ stars: [1], spent: 0, nodes: {} }, 'surv_save')).toBeNull() // chained behind Extra life
  })
})

describe('death match — wear', () => {
  const dur = () => 40
  it('a series costs every man who played it one point of durability per game', () => {
    const five = ['a', 'b', 'c', 'd', 'e']
    // a 4-2 series is six games, so six points off everyone
    const after = applyWear({}, five, 6, dur)
    expect(five.every((n) => after[n] === 34)).toBe(true)
    // a sweep costs four, and wear accumulates across rounds
    const after2 = applyWear(after, five, 4, dur)
    expect(after2.a).toBe(30)
  })

  it('at 7 or less a man is finished, and two of them buy two changes', () => {
    const five = ['a', 'b', 'c', 'd', 'e']
    expect(wornOut({ a: 8, b: 20 }, five, dur)).toEqual([])
    expect(wornOut({ a: 7 }, five, dur)).toEqual(['a'])
    expect(wornOut({ a: 7, b: 3 }, five, dur)).toEqual(['a', 'b'])
    // a man who has not played yet is judged on his card, not on nothing
    expect(wornOut({}, five, () => 5)).toEqual(five)
  })

  // His ruling: a new run starts on a blank plan. The old behaviour carried tempo,
  // style and the glass across the death, so a fresh campaign arrived with a
  // playstyle already lit that he had never chosen for it.
  it('a dead run resets the plan, not just the named men', () => {
    const played: Progress = {
      ...prog(zeros()),
      lives: 0,
      roster: ['a', 'b', 'c', 'd', 'e'],
      tactics: { ...DEFAULT_TACTICS, style: 'postup', tempo: 'fast', crashOff: true, scorer: 'a' },
    }
    expect(die(played).tactics).toEqual(DEFAULT_TACTICS)
    // a life spent is not a new run — the plan he is mid-way through survives
    expect(die({ ...played, lives: 1 }).tactics.style).toBe('postup')
  })

  it('a dead run forgets the wear along with the five', () => {
    const p = { ...prog(zeros()), roster: ['a'], wear: { a: 9 }, lives: 0 }
    expect(die(p).wear).toEqual({})
    // ...but a life spent keeps the run exactly as it was, wear included
    expect(die({ ...p, lives: 1 }).wear).toEqual({ a: 9 })
  })
})
