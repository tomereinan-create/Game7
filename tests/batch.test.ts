import { describe, expect, it } from 'vitest'
import { SIGMA } from '../src/config'
import { batchSim, LADDER, resolveMatchup, resolveSide, seriesSeed } from '../src/engine/batch'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { buildTicker, tapeSeed } from '../src/engine/ticker'
import { LINES } from '../src/ui/Stat'

describe('batch sim (P7b)', () => {
  const [A, B] = resolveMatchup('1996-CHI', '2017-GSW')

  it('reads team-seasons as their real five and ladder levels as the campaign plays them', () => {
    expect(A.five.map((p) => p.player).sort()).toEqual(['Dennis Rodman', 'Luc Longley', 'Michael Jordan', 'Ron Harper', 'Scottie Pippen'])
    expect(resolveSide('1996-CHI', 'best').five.map((p) => p.player)).not.toContain('Ron Harper')
    expect(resolveSide('L1').five).toBe(LADDER[0].players)
    expect(() => resolveSide('1996-XYZ')).toThrow()
    // side B loads the way the custom matchup loads a second team: A's men sit out
    const [, b97] = resolveMatchup('1996-CHI', '1997-CHI')
    expect(b97.five.map((p) => p.player)).not.toContain('Michael Jordan')
    expect(b97.satOut?.length).toBeGreaterThan(0)
  })

  it('is seeded base + i and reproducible', () => {
    expect(seriesSeed(7, 0)).toBe(7)
    expect(seriesSeed(7, 41)).toBe(48)
    expect(seriesSeed(0xffffffff, 1)).toBe(0)
    const r1 = batchSim(A.five, B.five, { n: 2000, seed: 11 })
    const r2 = batchSim(A.five, B.five, { n: 2000, seed: 11 })
    expect(r2).toEqual(r1)
    expect(r1.lengths.reduce((a, l) => a + l.a + l.b, 0)).toBe(2000)
    expect(r1.lengths.reduce((a, l) => a + l.a, 0)).toBe(r1.aWins)
  })

  it('a printed seed replays in the app: same seven games, and the Game 7 final the Series tape shows', () => {
    const r = batchSim(A.five, B.five, { n: 3000, seed: 1, closest: 3 })
    expect(r.closest).toHaveLength(3)
    for (const d of r.closest) {
      // Custom.tsx: simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA)
      const s = simSeries(compile(A.five, B.five), compile(B.five, A.five), makeRng(d.seed), SIGMA)
      expect(s.games).toHaveLength(7)
      expect(s.games[6].margin).toBe(d.margin)
      expect(s.won).toBe(d.aWon)
      // Series.tsx: game 7 plays its tape off tapeSeed(seed, 6), and the strip takes the tape's final
      const tape = buildTicker(d.margin, A.five, B.five, makeRng(tapeSeed(d.seed, 6)), LINES)
      expect({ a: tape.us, b: tape.them }).toEqual({ a: d.a, b: d.b })
    }
  })
})
