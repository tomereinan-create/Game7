import { describe, expect, it } from 'vitest'
import SALARIES from '../src/data/salaries.json'
import STATS from '../src/data/stats.json'
import TEAMSEASONS from '../src/data/teamseasons.json'
import { CAP_LIMIT, CAP_RESERVE, DRAFT_SIZE } from '../src/config'
import { PLAYERS } from '../src/engine/pool'
import { eligible, POSITIONS, type Pos } from '../src/engine/positions'
import type { StatLine } from '../src/engine/types'

const SAL = SALARIES as Record<string, { pct: number }>
const LINES = STATS as Record<string, StatLine | null>
const WHEEL = TEAMSEASONS as { y: number; p: string[] }[]
const pool = new Set(PLAYERS.map((p) => p.name))
const pctOf = (n: string): number | null => SAL[n]?.pct ?? null
const posOf = (n: string) => eligible(LINES[n]?.pos)

/** The draft's own rule, mirrored: a pick must be priced and fit this slot's budget. */
const budgetFor = (used: number, picked: number) => CAP_LIMIT - used - CAP_RESERVE * Math.max(0, DRAFT_SIZE - picked - 1)

describe('salary cap wheel', () => {
  it('a team-season with no salary on record can never be a legal landing', () => {
    const unpriced = WHEEL.filter((t) => t.p.filter((n) => pool.has(n)).every((n) => pctOf(n) === null))
    expect(unpriced.length).toBeGreaterThan(0) // the pre-1985 seasons exist…
    for (const t of unpriced) {
      const legal = t.p.some((n) => pool.has(n) && pctOf(n) !== null)
      expect(legal).toBe(false) // …and none of them holds a priced player, so the filter rejects the whole team
    }
  })

  it('the 5%-per-slot reserve leaves room for a full five: a greedy draft never runs out', () => {
    // Worst case: always take the most expensive player the budget allows, five slots to fill.
    let used = 0
    const openSlots: Pos[] = [...POSITIONS]
    for (let picked = 0; picked < DRAFT_SIZE; picked++) {
      const budget = budgetFor(used, picked)
      expect(budget).toBeGreaterThanOrEqual(CAP_RESERVE) // every slot can always afford a minimum contract
      const slot = openSlots.shift()!
      const best = PLAYERS.filter((p) => {
        const pct = pctOf(p.name)
        return pct !== null && pct <= budget && posOf(p.name).includes(slot)
      }).sort((a, b) => (pctOf(b.name) ?? 0) - (pctOf(a.name) ?? 0))[0]
      expect(best).toBeTruthy()
      used += pctOf(best.name)!
    }
    expect(used).toBeLessThanOrEqual(CAP_LIMIT)
  })
})
