/** THE WALL-VS-SIEVE SPREAD, PRICED IN POINTS (recal_87, his ruling "Ship the wall-vs-sieve spread
 *  as is"). The spread is a DRtg figure; this converts it into what the sim actually pays, so the
 *  record says what was accepted rather than only that it was accepted. */
import OPP from '../src/data/opponents.json'
import { K_MATCH, SIGMA, SERIES_WINS } from '../src/config'
import { defenseVs } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Opponent, Player } from '../src/engine/types'

const opp = OPP as Opponent[]
const NEUTRAL = opp[14].players
const distinct = (xs: Player[]) => {
  const seen = new Set<string>()
  return xs.filter((p) => !seen.has(p.player) && seen.add(p.player))
}
const WALL = distinct(PLAYERS.filter((p) => p.attrs.perdef >= 85 && p.attrs.ts_raw < 0.53).sort((a, b) => b.attrs.perdef - a.attrs.perdef)).slice(0, 5)
const SIEVE = distinct(PLAYERS.filter((p) => p.attrs.ts_raw >= 0.58 && p.attrs.usg_raw >= 22).sort((a, b) => a.attrs.perdef - b.attrs.perdef)).slice(0, 5)

const dW = defenseVs(WALL, NEUTRAL).drtg
const dS = defenseVs(SIEVE, NEUTRAL).drtg
const spread = dS - dW

// the normal CDF, for the win-probability translation
const cdf = (x: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? 1 - p : p
}
/** best-of-7 win probability from a per-game win probability */
const series = (p: number) => {
  let s = 0
  for (let l = 0; l < SERIES_WINS; l++) {
    let c = 1
    for (let i = 0; i < l; i++) c = (c * (SERIES_WINS + i)) / (i + 1)
    s += c * Math.pow(p, SERIES_WINS) * Math.pow(1 - p, l)
  }
  return s
}

console.log(`WALL : ${WALL.map((p) => `${p.name} (perdef ${p.attrs.perdef})`).join(' · ')}`)
console.log(`SIEVE: ${SIEVE.map((p) => `${p.name} (perdef ${p.attrs.perdef})`).join(' · ')}`)
console.log(`\nDRtg against the same neutral opponent:  wall ${dW.toFixed(2)}  sieve ${dS.toFixed(2)}  SPREAD ${spread.toFixed(2)}`)
console.log(`\nWHAT THE SIM PAYS FOR IT — the defense term is K_MATCH x (B.drtg - A.drtg), K_MATCH = ${K_MATCH}:`)
for (const [label, s] of [['ACCEPTED, today', spread], ['the old 60/40 law, low end', 8], ['the old 60/40 law, high end', 10]] as const) {
  const pts = K_MATCH * s
  const pg = cdf(pts / SIGMA)
  console.log(`  ${String(label).padEnd(28)} spread ${s.toFixed(2).padStart(5)}  ->  ${pts.toFixed(2)} margin points/game  ·  game ${(100 * pg).toFixed(1)}%  ·  series ${(100 * series(pg)).toFixed(1)}%`)
}
console.log(`\nREAD IT PLAINLY: fielding five of the best perimeter defenders in the pool instead of five of`)
console.log(`the worst, with the SAME offense and against the SAME opponent, is worth ${(K_MATCH * spread).toFixed(2)} points a game.`)
console.log(`Under the original 60/40 law it was worth ${(K_MATCH * 8).toFixed(1)} to ${(K_MATCH * 10).toFixed(1)}. A coin flip is 50.0%.`)
