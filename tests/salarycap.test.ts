import { describe, expect, it } from 'vitest'
import SALARIES from '../src/data/salaries.json'
import TEAMSEASONS from '../src/data/teamseasons.json'
import { CAP_LIMIT, DRAFT_SIZE } from '../src/config'
import { PLAYERS } from '../src/engine/pool'
import { eligible, POSITIONS, type Pos } from '../src/engine/positions'
import STATS from '../src/data/stats.json'
import type { StatLine } from '../src/engine/types'

const SAL = SALARIES as Record<string, { sal: number; cap: number; pct: number }>
const LINES = STATS as Record<string, StatLine | null>
const pct = (n: string) => SAL[n]?.pct ?? 0
const posOf = (n: string) => eligible(LINES[n]?.pos)

describe('salary cap campaign — the five must fit under 75% of the cap', () => {
  it('the limit is 75 and every player-season is priced under it on its own', () => {
    expect(CAP_LIMIT).toBe(75)
    const over = Object.entries(SAL).filter(([, s]) => s.pct > CAP_LIMIT)
    // A single contract can exceed 75% only in the pre-1999 pre-max era; those men simply can't be drafted there.
    console.log(`  ${over.length} of ${Object.keys(SAL).length} priced seasons are alone over ${CAP_LIMIT}%`)
    expect(over.length / Object.keys(SAL).length).toBeLessThan(0.01)
  })

  it('a legal five is reachable: the greedy cheapest five off a single roster fits nearly always — and the game is easier still, since each of the five spins lands on a different team', () => {
    const wheel = TEAMSEASONS as { y: number; p: string[] }[]
    const pool = new Set(PLAYERS.map((p) => p.name))
    let ok = 0
    let tried = 0
    for (const t of wheel.filter((t) => t.y >= 2000).slice(0, 60)) {
      const slots: Partial<Record<Pos, string>> = {}
      for (const x of POSITIONS) {
        const cands = t.p
          .filter((n) => pool.has(n) && !Object.values(slots).includes(n) && posOf(n).includes(x))
          .sort((a, b) => pct(a) - pct(b))
        if (cands[0]) slots[x] = cands[0]
      }
      const five = Object.values(slots)
      if (five.length !== DRAFT_SIZE) continue
      tried++
      if (five.reduce((a, n) => a + pct(n), 0) <= CAP_LIMIT) ok++
    }
    console.log(`  ${ok} of ${tried} sampled team-seasons can field a legal five from their own roster`)
    expect(tried).toBeGreaterThan(20)
    // recal_69 MOVED THIS PIN, and the move is the data law working as written: one team per season
    // stripped the cheap deadline arrivals off sellers' rosters, so the greedy single-roster five is
    // pricier and rarer (88% -> 83% on this sample). The game itself spins five DIFFERENT teams, so
    // the real draft stays comfortable; the pin records the honest single-roster floor.
    expect(ok / tried).toBeGreaterThan(0.8)
  })
})
