import { DEFAULT_TACTICS } from '../src/engine/tactics'
import { describe, expect, it } from 'vitest'
import { ROUNDS } from '../src/config'
import SALARIES from '../src/data/salaries.json'
import { PLAYERS } from '../src/engine/pool'
import { buy, checkpointLevel, livesBought, subsPerRound, type Wallet } from '../src/engine/tree'
import { applyWear, currentLevel, die, levelSeed, playable, totalStars, wornOut, type Progress } from '../src/state/campaign'

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
  it('a loss spends a life if there is one, and otherwise ends the run at the checkpoint', () => {
    const full = zeros().map(() => 3)
    // with a life in hand the run survives untouched
    const alive = die({ ...prog(full), lives: 2, roster: ['a', 'b', 'c', 'd', 'e'] })
    expect(alive.lives).toBe(1)
    expect(alive.roster).not.toBeNull()
    expect(alive.stars).toEqual(full)
    expect(alive.deaths).toBe(0)
    // out of lives: the five is gone and everything past the checkpoint is wiped
    const dead = die({ ...prog(full), lives: 0, checkpoint: 20, roster: ['a', 'b', 'c', 'd', 'e'] })
    expect(dead.roster).toBeNull()
    expect(dead.deaths).toBe(1)
    expect(dead.stars.slice(0, 20).every((s) => s === 3)).toBe(true)
    expect(dead.stars.slice(20).every((s) => s === 0)).toBe(true)
    // no checkpoint means back to the beginning, but the stars already earned stay spent-able
    const scratch = die({ ...prog(full), lives: 0, checkpoint: 0, roster: ['a'] })
    expect(scratch.stars.every((s) => s === 0)).toBe(true)
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

  it('a dead run forgets the wear along with the five', () => {
    const p = { ...prog(zeros()), roster: ['a'], wear: { a: 9 }, lives: 0 }
    expect(die(p).wear).toEqual({})
    // ...but a life spent keeps the run exactly as it was, wear included
    expect(die({ ...p, lives: 1 }).wear).toEqual({ a: 9 })
  })
})
