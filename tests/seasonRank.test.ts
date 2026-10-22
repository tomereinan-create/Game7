import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { PLAYERS } from '../src/engine/pool'
import { seasonRank } from '../src/engine/seasonRank'
import type { Player } from '../src/engine/types'

// his ruling, 2026-10-22: "Keep all-time and add the season rank label"
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const fiveOf = (t: (typeof WHEEL)[number]) => {
  const f = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five
  return f.every(Boolean) ? (f as Player[]) : null
}
const season = (y: number) => WHEEL.filter((t) => t.y === y).map((t) => ({ t, five: fiveOf(t) })).filter((x): x is { t: (typeof WHEEL)[number]; five: Player[] } => !!x.five)

describe('the season rank beside the all-time dials', () => {
  it("names the all-time OFF summit first in its own season: Warriors '17", () => {
    const gsw = season(2017).find((x) => x.t.team.includes('Warriors'))!
    expect(seasonRank(gsw.five, 2017, gsw.t.ab)!.off).toBe(1)
  })
  it('ranks every fieldable team of a season once, 1 to n, in dial order', () => {
    const all = season(2025)
    const ranks = all.map((x) => ({ r: seasonRank(x.five, 2025, x.t.ab)!, g: seasonGauges(x.five, 2025) }))
    expect(ranks.every((x) => x.r.of === all.length)).toBe(true)
    expect(ranks.map((x) => x.r.off).sort((a, b) => a - b)).toEqual(all.map((_, i) => i + 1))
    // a better dial never ranks below a worse one
    for (const a of ranks) for (const b of ranks) if (a.g.off > b.g.off) expect(a.r.off).toBeLessThan(b.r.off)
    for (const a of ranks) for (const b of ranks) if (a.g.def > b.g.def) expect(a.r.def).toBeLessThan(b.r.def)
  })
  it('a team that cannot field five is not in the pool', () => {
    const short = WHEEL.filter((t) => t.y === 2025).length - season(2025).length
    const any = season(2025)[0]
    expect(seasonRank(any.five, 2025, any.t.ab)!.of).toBe(WHEEL.filter((t) => t.y === 2025).length - short)
  })
})
