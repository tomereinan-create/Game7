import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { teamFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { PLAYERS } from '../src/engine/pool'
import { seasonRank } from '../src/engine/seasonRank'
import type { Player } from '../src/engine/types'

// his ruling, 2026-10-22: "Keep all-time and add the season rank label"
// recal_232: the pool is the Teams screen's own five, bestfive.ts `teamFive` — the 44 clubs whose
// strict walk leaves a hole field a re-solved five (stand-in marked, DEF penalised) and are ranked.
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const fiveOf = (t: (typeof WHEEL)[number]) => {
  const f = teamFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five
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
  it('a team with fewer than five men is not in the pool; a re-solved one is (recal_232)', () => {
    // 2024: Charlotte '24 has four men on the pool; Bulls '24, Warriors '24 and Grizzlies '24 re-solve
    const all = WHEEL.filter((t) => t.y === 2024)
    const fielded = season(2024)
    expect(all.length - fielded.length).toBe(1)
    expect(fielded.some((x) => x.t.ab === 'CHO')).toBe(false)
    const any = fielded[0]
    expect(seasonRank(any.five, 2024, any.t.ab)!.of).toBe(all.length - 1)
    for (const ab of ['CHI', 'GSW', 'MEM']) expect(fielded.find((x) => x.t.ab === ab)!.five.some((p) => p.oop)).toBe(true)
  })
  it("recal_232: Wizards '25 has a season rank, read on the penalised five", () => {
    const was = season(2025).find((x) => x.t.ab === 'WAS')!
    expect(was.five[3].oop).toBe('PF')
    const r = seasonRank(was.five, 2025, was.t.ab)!
    expect(r.of).toBe(season(2025).length)
    // the penalty is in the DEF rank's own quantity: the unmarked five would rank no worse
    const clean = seasonRank(was.five.map((p) => BY.get(p.name)!), 2025, was.t.ab)!
    expect(clean.def).toBeLessThanOrEqual(r.def)
    expect(clean.off).toBe(r.off)
  })
})
