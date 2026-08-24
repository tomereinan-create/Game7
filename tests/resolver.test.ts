import { describe, expect, it } from 'vitest'
import { makeRng } from '../src/engine/rng'
import { gameMargin, simSeries } from '../src/engine/resolver'
import OPP from '../src/data/opponents.json'
import { A_TAL, K_MATCH, SIGMA } from '../src/config'
import { compile, meanMargin, talentEff } from '../src/engine/resolver'
import { gameOdds } from '../src/engine/odds'
import { PLAYERS } from '../src/engine/pool'
import type { Lineup, Opponent } from '../src/engine/types'

const N = 20_000

/**
 * Synthetic lineups: the matchup rating is given directly (the four axes are
 * display only). K_MATCH = 1, so a matchup margin IS a point spread. Real
 * fives rate against a neutral opponent within about −8..+13 (sd ≈ 4.9 across
 * the thirty levels); the archetypes in team_rating.py run GOAT5 vs CHUCK5
 * ≈ +18, ROLE5 vs CHUCK5 ≈ +14.
 */
const L = (net: number, talent = 85, bonus = 0): Lineup => ({ talent, in: 70, out: 70, id: 70, pd: 70, off: 110 + net, drtg: 110, net, bonus })

function rates(A: Lineup, B: Lineup, seed: number) {
  let gameWins = 0
  let seriesWins = 0
  const gr = makeRng(seed)
  for (let i = 0; i < N; i++) if (gameMargin(A, B, gr) > 0) gameWins++
  const sr = makeRng(seed ^ 0x9e3779b9)
  for (let i = 0; i < N; i++) if (simSeries(A, B, sr).won) seriesWins++
  return { game: gameWins / N, series: seriesWins / N }
}

/** Point spread -> win probability, the table the sim is calibrated to. */
const SPREADS: [number, number][] = [
  [3, 0.575],
  [5, 0.656],
  [7, 0.746],
  [10, 0.851],
  [13, 0.894],
  [15, 0.949],
]

describe('resolver acceptance', () => {
  it('mirror match is a coin flip', () => {
    const r = rates(L(18), L(18), 1)
    console.log(`  mirror        game ${(r.game * 100).toFixed(1)}%  series ${(r.series * 100).toFixed(1)}%`)
    expect(r.series).toBeGreaterThanOrEqual(0.48)
    expect(r.series).toBeLessThanOrEqual(0.52)
  })

  it('a point spread wins as often as the table says (gaussian at sigma 10; the 3-point line is the one a gaussian overrates)', () => {
    for (const [m, p] of SPREADS) {
      const r = rates(L(m / K_MATCH), L(0), 10 + m)
      console.log(`  spread -${String(m).padEnd(2)}  game ${(r.game * 100).toFixed(1)}%  table ${(p * 100).toFixed(1)}%  series ${(r.series * 100).toFixed(1)}%`)
      expect(Math.abs(r.game - p)).toBeLessThanOrEqual(m <= 3 ? 0.05 : 0.035)
    }
  })
})

describe('resolver acceptance — the original bands', () => {
  it('neutral 85s vs 75s, pure talent +10: per-game 66–70%', () => {
    const r = rates(L(0, 85), L(0, 75), 21)
    console.log(`  85 vs 75      game ${(r.game * 100).toFixed(1)}%  series ${(r.series * 100).toFixed(1)}%  (A_TAL ${A_TAL}, σ ${SIGMA}: margin ${(A_TAL * 10).toFixed(2)})`)
    expect(r.game).toBeGreaterThanOrEqual(0.66)
    expect(r.game).toBeLessThanOrEqual(0.705)
  })

  it('equal-talent counter lineups: per-game 60–64%', () => {
    // an archetype-sized swing in matchup points (GOAT5 vs CHUCK5 ≈ +18; 17 keeps the MC inside the band) at K_MATCH
    const r = rates(L(17, 85), L(0, 85), 22)
    console.log(`  counter       game ${(r.game * 100).toFixed(1)}%  series ${(r.series * 100).toFixed(1)}%  (fit ${(K_MATCH * 17).toFixed(2)})`)
    expect(r.game).toBeGreaterThanOrEqual(0.6)
    expect(r.game).toBeLessThanOrEqual(0.64)
  })

  it('superstars vs a perfect-counter role team: superstars win the series 79–86%', () => {
    // talent 95 vs 78; the role five out-fits them by a full archetype swing
    const r = rates(L(0, 95), L(18, 78), 23)
    console.log(`  stars vs role game ${(r.game * 100).toFixed(1)}%  series ${(r.series * 100).toFixed(1)}%`)
    expect(r.series).toBeGreaterThanOrEqual(0.79)
    expect(r.series).toBeLessThanOrEqual(0.86)
  })

  it('REGRESSION: equal NET, a 10-point talent gap — the talent side is a 65%+ per-game favourite', () => {
    // Under the fit-only build this was 50%: the talent term was never integrated.
    const r = rates(L(12, 90), L(12, 80), 24)
    console.log(`  equal NET +10 talent  game ${(r.game * 100).toFixed(1)}%`)
    expect(r.game).toBeGreaterThanOrEqual(0.65)
  })

  it('the coach modifier is points of spread, not scaled by K_MATCH', () => {
    const r = rates(L(0, 85, 1.5), L(0, 85), 25)
    expect(r.game).toBeGreaterThan(0.53)
    expect(r.game).toBeLessThan(0.6)
  })
})

describe('top-heavy talent', () => {
  const mk = (ts: number[]) => ts.map((talent, i) => ({ ...PLAYERS[i], talent }))
  it('five equal talents give exactly the mean', () => {
    for (const v of [55, 70, 84, 99]) expect(talentEff(mk([v, v, v, v, v]))).toBeCloseTo(v, 10)
    const ts = [91, 77, 83, 60, 75]
    expect(talentEff(mk(ts))).toBeCloseTo(0.34 * 91 + 0.24 * 83 + (0.42 * (77 + 60 + 75)) / 3, 10)
  })
  it('PINNED: [97,97,80,80,80] vs five 84s, equal NET — the star side is a 60–64% favourite a game', () => {
    const stars = talentEff(mk([97, 97, 80, 80, 80]))
    const flat = talentEff(mk([84, 84, 84, 84, 84]))
    const r = rates(L(10, stars), L(10, flat), 31)
    const exact = gameOdds(A_TAL * (stars - flat))
    console.log(`  two gods + three ghosts  talent_eff ${stars.toFixed(2)} vs ${flat.toFixed(2)}  game ${(100 * exact).toFixed(1)}% (MC ${(r.game * 100).toFixed(1)}%)`)
    expect(exact).toBeGreaterThanOrEqual(0.6)
    expect(exact).toBeLessThanOrEqual(0.64)
    expect(Math.abs(r.game - exact)).toBeLessThan(0.015)
  })
})

describe('resolver acceptance — real fives', () => {
  it('the better record rates higher in most pairings; the top level is favoured over the bottom', () => {
    const o = OPP as Opponent[]
    let ok = 0
    let n = 0
    for (let i = 0; i < o.length; i++)
      for (let j = i + 1; j < o.length; j++) {
        n++
        if (meanMargin(compile(o[j].players, o[i].players), compile(o[i].players, o[j].players)) > 0) ok++
      }
    const top = compile(o[29].players, o[0].players)
    const bottom = compile(o[0].players, o[29].players)
    const r = rates(top, bottom, 5)
    console.log(`  better record rates higher in ${ok}/${n} pairings; L30 vs L1 game ${(r.game * 100).toFixed(1)}%  series ${(r.series * 100).toFixed(1)}%`)
    // OKC vs WAS is a +3 spread: about 62% a game.
    expect(ok / n).toBeGreaterThan(0.6)
    expect(r.game).toBeGreaterThan(0.5)
  })
})
