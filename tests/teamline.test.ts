import { describe, expect, it } from 'vitest'
import TEAMSTATS from '../src/data/teamstats.json'
import { WHEEL } from '../src/data/wheel'
import { teamLine } from '../src/engine/teamline'

/** The margin of victory as `Team Summaries.csv` gave it — the second figure of the raw row. */
const movOf = (ab: string, y: number) => (TEAMSTATS as Record<string, number[]>)[`${ab}${y}`][1]

/**
 * HIS RULING, 2026-09-21: "add more(as many as possible) real (basic, not advanced) stats on the
 * team from basketball ref." The line is summed from Basketball Reference's own per-player totals
 * (scripts/teamstats.ts), so what these tests are really holding is that the sum IS the team's
 * line — a double-counted traded man or a missing stint shows up here as a team that scored a
 * hundred and thirty points a night.
 */
/** One of the four lines, as a map of column to figure. */
const row = (ab: string, y: number, which: 'team' | 'opp', kind: 'line' | 'rank' = 'line') => {
  const l = teamLine(ab, y)
  expect(l).not.toBeNull()
  const r = l!.rows.find((x) => x.side === which && x.kind === kind)
  expect(r, `${ab}${y} has no ${which} ${kind}`).toBeTruthy()
  return Object.fromEntries(r!.cells.map((v, i) => [l!.cols[i], v])) as Record<string, string>
}
const cells = (ab: string, y: number) => row(ab, y, 'team')

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
  it('matches the league’s own numbers, on both sides of the ball', () => {
    const gsw = cells('GSW', 2016)
    expect([gsw.PTS, gsw['FG%'], gsw.TRB, gsw.AST]).toEqual(['114.9', '48.7', '46.2', '28.9'])
    // and what they allowed, which is the half that came off the wire
    expect(row('GSW', 2016, 'opp').PTS).toBe('104.1')
    const chi = cells('CHI', 1996)
    expect([chi.PTS, chi['FG%'], chi.TRB, chi.AST]).toEqual(['105.2', '47.8', '44.6', '24.8'])
    expect(row('CHI', 1996, 'opp').PTS).toBe('92.9')
    const bos = cells('BOS', 1986)
    expect([bos.PTS, bos['FG%'], bos.AST]).toEqual(['114.1', '50.8', '29.1'])
    const sas = cells('SAS', 1999)
    expect([sas.PTS, sas['FG%']]).toEqual(['92.8', '45.6'])
  })

  /**
   * HIS RULING, 2026-09-21: "have the stats be 4 lines - basic stats. League ranking. Opp basic
   * stats. League ranking." In that order, under one set of column heads.
   */
  it('is four lines in his order, eighteen basic columns wide', () => {
    const l = teamLine('GSW', 2016)!
    expect(l.rows.map((r) => `${r.side}:${r.kind}`)).toEqual(['team:line', 'team:rank', 'opp:line', 'opp:rank'])
    expect(l.cols).toEqual([
      'PTS', 'FG', 'FGA', 'FG%', '3P', '3PA', '3P%', 'FT', 'FTA', 'FT%', 'ORB', 'DRB', 'TRB', 'AST', 'STL', 'BLK', 'TOV', 'PF',
    ])
    for (const r of l.rows) expect(r.cells.length).toBe(l.cols.length)
    // the advanced table's own columns are nowhere on this block
    for (const bad of ['ORTG', 'DRTG', 'PACE', 'SRS', 'TS%', 'EFG%']) expect(l.cols.includes(bad)).toBe(false)
  })

  /**
   * THE RANK IS 1 = BEST, which is the thing about it worth testing: the '16 Warriors led the
   * league in scoring and the '16 Spurs led it in points allowed, so both read 1 — on opposite
   * lines. A rank that meant "league high" would put the best defence in the league 30th, and that
   * is the mistake this test exists to catch.
   */
  it('ranks 1 as the best in the league, on both sides', () => {
    expect(row('GSW', 2016, 'team', 'rank').PTS).toBe('1')
    expect(row('SAS', 2016, 'opp', 'rank').PTS).toBe('1')
    // fewest fouls is first, not last
    expect(row('SAS', 2016, 'team', 'rank').PF).toBe('1')
    const l = teamLine('GSW', 2016)!
    expect(l.of).toBe(30)
    for (const r of l.rows.filter((x) => x.kind === 'rank')) {
      for (const v of r.cells) {
        expect(Number(v)).toBeGreaterThanOrEqual(1)
        expect(Number(v)).toBeLessThanOrEqual(l.of)
      }
    }
    // a 22-club season is ranked out of 22
    expect(teamLine('BOS', 1980)!.of).toBe(22)
  })

  it('has an opponent line for every season in the book', () => {
    const missing = WHEEL.filter((t) => !teamLine(t.ab, t.y)!.rows.some((r) => r.side === 'opp'))
    expect(missing.map((t) => `${t.ab}${t.y}`)).toEqual([])
  })

  /** Nothing here is modelled, so every figure has to survive its own arithmetic. */
  it('keeps every season inside the league’s own bounds', () => {
    for (const t of WHEEL) {
      const c = cells(t.ab, t.y)
      const o = row(t.ab, t.y, 'opp')
      const n = (k: string) => Number(c[k])
      expect(n('PTS')).toBeGreaterThan(80)
      expect(n('PTS')).toBeLessThan(135)
      expect(Number(o.PTS)).toBeGreaterThan(80)
      expect(Number(o.PTS)).toBeLessThan(135)
      /* WHAT IT ALLOWED AND WHAT ITS MARGIN SAYS IT ALLOWED ARE THE SAME NUMBER, and they come
         from two different places — the fetched opponent table and the summary's own margin of
         victory. This one line is what proves the fetch lined up with the sum. */
      expect(Number(o.PTS)).toBeCloseTo(n('PTS') - movOf(t.ab, t.y), 0)
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
