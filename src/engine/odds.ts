import { SERIES_WINS, SIGMA } from '../config'
import { decompose, type Decomp } from './resolver'
import type { Lineup } from './types'

function erf(x: number) {
  const s = Math.sign(x)
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return s * y
}
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))

/** P(win a game) from a point spread under the sim's gaussian noise. */
export const gameOdds = (spread: number, sigma = SIGMA) => Phi(spread / sigma)

/** P(win a best-of-seven) from a per-game probability: first to 4. */
export function seriesOdds(p: number, n = SERIES_WINS): number {
  let total = 0
  for (let k = 0; k < n; k++) total += choose(n - 1 + k, k) * p ** n * (1 - p) ** k
  return total
}
function choose(n: number, k: number) {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

export interface Odds {
  spread: number
  game: number
  series: number
  /** talent / fit / modifiers, in points of spread. */
  parts: Decomp
}

/** What the sim expects before it runs: the spread and the two probabilities. */
export function odds(mine: Lineup, theirs: Lineup, sigma = SIGMA, toWin = SERIES_WINS): Odds {
  const parts = decompose(mine, theirs)
  const spread = parts.total
  const game = gameOdds(spread, sigma)
  return { spread, game, series: seriesOdds(game, toWin), parts }
}
