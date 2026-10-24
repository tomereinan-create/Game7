import { SERIES_WINS, SIGMA } from '../config'
import type { Assignment } from './offense'
import { applyMod, compile, decompose, meanMargin, type Decomp } from './resolver'
import { aiTempo, pace, tacticsMod, type Tactics } from './tactics'
import type { Lineup, Player } from './types'

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

/**
 * What the sim expects before it runs: the spread and the two probabilities.
 *
 * EXACT, NOT APPROXIMATE (P8, measured by scripts/calibrate.ts). A game's margin is the spread
 * plus two independent N(0, sigma/sqrt2) draws — one normal of sd sigma — and a game is won when
 * it is above zero, so a game is Phi(spread / sigma) to the erf's 1e-7; the games of a series are
 * independent, so first-to-four is the negative binomial above. 10,000 series a five against level 1
 * land inside the sampling error everywhere from 50% to 99.5%. A card that disagrees with the sim
 * has been handed a different NIGHT than the sim plays — see `night`.
 */
export function odds(mine: Lineup, theirs: Lineup, sigma = SIGMA, toWin = SERIES_WINS): Odds {
  const parts = decompose(mine, theirs)
  const spread = parts.total
  const game = gameOdds(spread, sigma)
  return { spread, game, series: seriesOdds(game, toWin), parts }
}

/** One night as the sim plays it: both fives compiled against each other, the plan and pace on top. */
export interface Night {
  /** Our five before the plan: compile(five, opp, assignment). */
  base: Lineup
  /** Our five as it plays: the base plus the plan's price and the pace term, in points of spread. */
  mine: Lineup
  theirs: Lineup
  pc: ReturnType<typeof pace> | null
  /** The noise the night runs on: SIGMA, paced by the tempo when a plan is called. */
  sigma: number
}

/**
 * THE NIGHT — the one place the card and the sim both get it from (App.tsx `sim`, Draft.tsx's
 * card). Without a plan it is the two fives compiled against each other at SIGMA. With one, the
 * plan is priced (tacticsMod) and both sides call a tempo (recal_57): the AI answers off the usage
 * surpluses, and when they are a wash it goes slow as the UNDERDOG — underdog meaning its own
 * expected margin against our five, before our plan, is below zero.
 *
 * P8 (calibration): the draft card used to build its own night and passed `false` for that flag,
 * so on a wash night against a weaker opponent — the default plan, every Playbook campaign and
 * death match — the card priced a normal-tempo night (sigma 10) while the sim played the AI's slow
 * answer (sigma 10.8). The card ran 1-2 points over the result through the 60-95% range, and up
 * to 2.4 on a single five. One function now, so the two cannot drift again.
 *
 * `edge` is a HOT HAND boost (engine/tree.ts BOOSTS, his ruling of 2026-10-23): points added to our
 * margin in every game of the series, on top of everything else, through the same `bonus` the plan
 * rides — so the card's `modifiers` carries it and the sim plays it, from this one call. It goes on
 * AFTER the AI has read the night (its tempo answer is still read off the base fives), so nothing
 * else about the night moves.
 */
export function night(five: Player[], opp: Player[], assignment: Assignment, plan: Tactics | null, mastery = 0, edge = 0): Night {
  const base = compile(five, opp, assignment)
  const theirs = compile(opp, five)
  if (!plan) return { base, mine: edge ? applyMod(base, { bonus: edge }) : base, theirs, pc: null, sigma: SIGMA }
  const pc = pace(plan.tempo, aiTempo(opp, five, meanMargin(theirs, base) < 0), five, opp, mastery)
  const tm = tacticsMod(plan, five, opp)
  const mine = applyMod(base, { ...tm, bonus: (tm.bonus ?? 0) + pc.margin + edge })
  return { base, mine, theirs, pc, sigma: SIGMA * pc.sigmaMult }
}
