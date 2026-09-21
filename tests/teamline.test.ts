import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { teamLine } from '../src/engine/teamline'

/**
 * HIS RULING, 2026-09-21: "add more(as many as possible) real (basic, not advanced) stats on the
 * team from basketball ref." The line is summed from Basketball Reference's own per-player totals
 * (scripts/teamstats.ts), so what these tests are really holding is that the sum IS the team's
 * line — a double-counted traded man or a missing stint shows up here as a team that scored a
 * hundred and thirty points a night.
 */
const cells = (ab: string, y: number) => {
  const l = teamLine(ab, y)
  expect(l).not.toBeNull()
  return Object.fromEntries(l!.cells.map((c) => [c.k, c.v]))
}

describe('the team line is the real one', () => {
  it('has a line for every team-season the wheel holds', () => {
    const missing = WHEEL.filter((t) => !teamLine(t.ab, t.y))
    expect(missing.map((t) => `${t.ab}${t.y}`)).toEqual([])
  })

  /** The divisor for every per-game figure. A strike season is the case that catches a hard 82. */
  it('counts the games the record counts, strike seasons included', () => {
    for (const t of WHEEL) {
      const m = /^(\d+)[–-](\d+)$/.exec(t.rec ?? '')
      if (!m) continue
      expect(teamLine(t.ab, t.y)!.g).toBe(Number(m[1]) + Number(m[2]))
    }
    // 1999 was 50 games and 2012 was 66; both are in the book
    expect(teamLine('SAS', 1999)!.g).toBe(50)
    expect(teamLine('DEN', 2012)!.g).toBe(66)
  })

  /** Four lines off Basketball Reference's own team pages, one per era of the book. */
  it('matches the league’s own numbers', () => {
    const gsw = cells('GSW', 2016)
    expect([gsw.PTS, gsw.OPP, gsw['FG%'], gsw.TRB, gsw.AST]).toEqual(['114.9', '104.1', '48.7', '46.2', '28.9'])
    const chi = cells('CHI', 1996)
    expect([chi.PTS, chi.OPP, chi['FG%'], chi.TRB, chi.AST]).toEqual(['105.2', '92.9', '47.8', '44.6', '24.8'])
    const bos = cells('BOS', 1986)
    expect([bos.PTS, bos.OPP, bos['FG%'], bos.AST]).toEqual(['114.1', '104.7', '50.8', '29.1'])
    const sas = cells('SAS', 1999)
    expect([sas.PTS, sas.OPP, sas['FG%']]).toEqual(['92.8', '84.7', '45.6'])
  })

  it('prints nineteen basic cells and not one advanced one', () => {
    const l = teamLine('GSW', 2016)!
    expect(l.cells.map((c) => c.k)).toEqual([
      'PTS', 'OPP', 'FG', 'FGA', 'FG%', '3P', '3PA', '3P%', 'FT', 'FTA', 'FT%', 'ORB', 'DRB', 'TRB', 'AST', 'STL', 'BLK', 'TOV', 'PF',
    ])
    // the advanced table's own columns are nowhere on this block
    for (const bad of ['ORTG', 'DRTG', 'PACE', 'SRS', 'TS%', 'EFG%']) expect(l.cells.some((c) => c.k === bad)).toBe(false)
  })

  /** Nothing here is modelled, so every figure has to survive its own arithmetic. */
  it('keeps every season inside the league’s own bounds', () => {
    for (const t of WHEEL) {
      const c = cells(t.ab, t.y)
      const n = (k: string) => Number(c[k])
      expect(n('PTS')).toBeGreaterThan(80)
      expect(n('PTS')).toBeLessThan(135)
      expect(n('OPP')).toBeGreaterThan(80)
      expect(n('OPP')).toBeLessThan(135)
      // a make cannot outnumber an attempt, in any of the three splits
      expect(n('FG')).toBeLessThanOrEqual(n('FGA'))
      expect(n('3P')).toBeLessThanOrEqual(n('3PA'))
      expect(n('FT')).toBeLessThanOrEqual(n('FTA'))
      // and the boards have to add up
      expect(n('ORB') + n('DRB')).toBeCloseTo(n('TRB'), 0)
      for (const k of ['FG%', 'FT%']) {
        expect(n(k)).toBeGreaterThan(30)
        expect(n(k)).toBeLessThan(90)
      }
      /* THE THREE GETS ITS OWN FLOOR, AND IT IS LOW ON PURPOSE. The line was a novelty when this
         book opens: the 1983 Lakers took 1.2 of them a night and made 10.4% — a real season, not a
         broken sum, and any bound tight enough to call it an error would be calling the early
         eighties an error. The ceiling is the 1997 Hornets at 42.8. */
      expect(n('3P%')).toBeGreaterThan(8)
      expect(n('3P%')).toBeLessThan(50)
    }
  })
})
