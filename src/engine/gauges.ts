import CAMPAIGNS from '../data/campaigns.json'
import { WHEEL } from '../data/wheel'
import { startingFive } from './bestfive'
import { ratings100 } from './offense'
import { PLAYERS } from './pool'
import type { Player } from './types'

/**
 * TEAM GAUGES, percentiled WITHIN SEASON (recal_64, design-side "62"): a 64-18
 * champion reading OFF 51 against all of history says nothing — the gauge now
 * ranks a five against the same season's teams (their best legal fives), or,
 * for a drafted five with no season, against the campaign's own opponent pool.
 * The basis is visible on the dial ("vs 2026" / "vs the field").
 */

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))

interface Pool {
  offs: number[]
  drtgs: number[]
}

const seasonCache = new Map<number, Pool>()
function seasonPool(season: number): Pool {
  let pool = seasonCache.get(season)
  if (pool) return pool
  const offs: number[] = []
  const drtgs: number[] = []
  for (const t of WHEEL.filter((x) => x.y === season)) {
    const five = startingFive(t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
    if (five.length !== 5) continue // a roster the pool cannot field does not set the bar
    const r = ratings100(five)
    offs.push(r.offRaw)
    drtgs.push(r.drtgRef)
  }
  pool = { offs, drtgs }
  seasonCache.set(season, pool)
  return pool
}

let fieldPool: Pool | null = null
function campaignPool(): Pool {
  if (fieldPool) return fieldPool
  const offs: number[] = []
  const drtgs: number[] = []
  for (const tier of CAMPAIGNS as { levels: { players: Player[] }[] }[]) {
    for (const o of tier.levels) {
      const r = ratings100(o.players)
      offs.push(r.offRaw)
      drtgs.push(r.drtgRef)
    }
  }
  fieldPool = { offs, drtgs }
  return fieldPool
}

/** Percentile -> 1..99: the best five in the pool reads 99, the worst 1. */
const pct = (arr: number[], v: number, lowerBetter = false) => {
  if (arr.length < 2) return 50
  const worse = arr.filter((x) => (lowerBetter ? x > v : x < v)).length
  const ties = arr.filter((x) => x === v).length
  // a member team ties itself once; split remaining ties down the middle
  const rank = worse + Math.max(0, ties - 1) / 2
  return Math.round(1 + (98 * rank) / (arr.length - 1))
}

export interface Gauge {
  off: number
  def: number
  offRaw: number
  drtgRef: number
  /** What the percentile is against, for the dial's label. */
  basis: string
  n: number
}

/** A five with a season: percentiled against that season's teams. */
export function seasonGauges(five: Player[], season: number): Gauge {
  const r = ratings100(five)
  const pool = seasonPool(season)
  if (pool.offs.length < 2) return { ...fieldGauges(five), basis: 'vs the field' }
  return { off: pct(pool.offs, r.offRaw), def: pct(pool.drtgs, r.drtgRef, true), offRaw: r.offRaw, drtgRef: r.drtgRef, basis: `vs ${season}`, n: pool.offs.length }
}

/** A drafted five with no season of its own: percentiled against the campaign's opponents. */
export function fieldGauges(five: Player[]): Gauge {
  const r = ratings100(five)
  const pool = campaignPool()
  return { off: pct(pool.offs, r.offRaw), def: pct(pool.drtgs, r.drtgRef, true), offRaw: r.offRaw, drtgRef: r.drtgRef, basis: 'vs the field', n: pool.offs.length }
}
