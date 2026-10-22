import { describe, expect, it } from 'vitest'
import STATS from '../src/data/stats.json'
import { seriesBox, type PlayerBox } from '../src/engine/boxstats'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { realStarters } from '../src/engine/starters'
import type { StatLine } from '../src/engine/types'

/**
 * His box-score report (2026-10-22): every man shot his team's percentage, twos were weighted by
 * rim + mid (so a one-zone scorer was starved), and big men took threes. The box now hands each man
 * his own season diet and his own rates. Measured here over many seeded series, the way the result
 * screen rolls them.
 */
const LINES = STATS as unknown as Record<string, StatLine | null>
type Tot = { g: number; pts: number; tpa: number; tpm: number; fta: number; ftm: number }

function totals(a: [number, string], b: [number, string], n = 150) {
  const A = realStarters(a[0], a[1])
  const B = realStarters(b[0], b[1], new Set(A.map((p) => p.player)))
  const mine = compile(A, B)
  const theirs = compile(B, A)
  const acc = new Map<string, Tot>()
  const add = (ls: PlayerBox[], g: number) => {
    for (const l of ls) {
      const o = acc.get(l.name) ?? { g: 0, pts: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0 }
      o.g += g
      o.pts += l.pts * g
      o.tpa += l.tpa * g
      o.tpm += l.tpm * g
      o.fta += l.fta * g
      o.ftm += l.ftm * g
      acc.set(l.name, o)
    }
  }
  for (let i = 0; i < n; i++) {
    const r = simSeries(mine, theirs, makeRng(1 + i), 10)
    const box = seriesBox(A, B, LINES, r.games, r.games.map((g) => ({ us: g.us, them: g.them })), makeRng((1 + i) ^ 0x2545f491))
    add(box.usLines, r.games.length)
    add(box.themLines, r.games.length)
  }
  return (name: string) => {
    const o = acc.get(name)!
    return { ppg: o.pts / o.g, tpa: o.tpa / o.g, ftp: o.ftm / o.fta }
  }
}

describe('each man shoots his own line', () => {
  const lal = totals([2000, 'LAL'], [2006, 'PHO'])
  const nyk = totals([1997, 'NYK'], [1997, 'CHI'])

  it("free throws at his own rate: Shaq '00 near 52%, Nash '06 near 92%", () => {
    expect(lal("Shaquille O'Neal '00").ftp).toBeGreaterThan(0.49)
    expect(lal("Shaquille O'Neal '00").ftp).toBeLessThan(0.56)
    expect(lal("Steve Nash '06").ftp).toBeGreaterThan(0.89)
    expect(lal("Steve Nash '06").ftp).toBeLessThan(0.95)
  })

  it('a one-zone scorer is not starved: Shaq out-scores Kobe in 2000, Marion keeps pace with Nash', () => {
    expect(lal("Shaquille O'Neal '00").ppg).toBeGreaterThan(lal("Kobe Bryant '00").ppg * 1.1)
    const ratio = lal("Steve Nash '06").ppg / lal("Shawn Marion '06").ppg
    expect(ratio).toBeGreaterThan(0.85) // real per minute: 0.98
    expect(ratio).toBeLessThan(1.15)
  })

  it("big men who never shot threes do not start now: Ewing '97 and Shaq '00 almost never", () => {
    expect(nyk("Patrick Ewing '97").tpa).toBeLessThan(0.5) // 9 threes all season
    expect(lal("Shaquille O'Neal '00").tpa).toBeLessThan(0.2)
    expect(nyk("Michael Jordan '97").tpa).toBeGreaterThan(nyk("Patrick Ewing '97").tpa * 10)
  })
})
