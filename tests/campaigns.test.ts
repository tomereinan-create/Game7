import { describe, expect, it } from 'vitest'
import CAMPAIGNS from '../src/data/campaigns.json'
import { ERA_LEVELS, ROUNDS } from '../src/config'
import type { Opponent } from '../src/engine/types'

interface Tier {
  id: string
  years: [number, number]
  handicap: number
  levels: Opponent[]
}
const tiers = CAMPAIGNS as unknown as Tier[]
const pct = (r: string) => {
  const [w, l] = r.split('–').map(Number)
  return w / (w + l)
}

describe('one campaign of four eras', () => {
  it('the four blocks make the whole campaign', () => {
    expect(tiers.reduce((a, t) => a + t.levels.length, 0)).toBe(ROUNDS)
  })

  it('four tiers of thirty, eras in order, handicap rising, every five complete and slotted', () => {
    expect(tiers.map((t) => t.id)).toEqual(['c2026', 'c2020s', 'c2010s', 'c2000s'])
    expect(tiers.map((t) => t.handicap)).toEqual([0, 1, 2, 3])
    for (const t of tiers) {
      expect(t.levels).toHaveLength(ERA_LEVELS)
      for (const o of t.levels) {
        expect(o.players).toHaveLength(5)
        expect(o.positions).toEqual(['PG', 'SG', 'SF', 'PF', 'C'])
        expect(o.season!).toBeGreaterThanOrEqual(t.years[0])
        expect(o.season!).toBeLessThanOrEqual(t.years[1])
        expect(new Set(o.players.map((p) => p.peak_season)).size).toBe(1)
      }
    }
  })

  it('the champions are the last levels of every era, each segment worst record first', () => {
    for (const t of tiers.slice(1)) {
      const champs = t.levels.filter((o) => o.champion)
      expect(champs.length).toBe(t.years[1] - t.years[0] + 1)
      const firstChamp = t.levels.findIndex((o) => o.champion)
      expect(t.levels.slice(firstChamp).every((o) => o.champion)).toBe(true)
      const asc = (xs: Opponent[]) => xs.every((o, i) => i === 0 || pct(o.record!) >= pct(xs[i - 1].record!))
      expect(asc(t.levels.slice(0, firstChamp))).toBe(true)
      expect(asc(champs)).toBe(true)
      // no team-season twice
      expect(new Set(t.levels.map((o) => `${o.season}|${o.ab}`)).size).toBe(ERA_LEVELS)
    }
  })
})
