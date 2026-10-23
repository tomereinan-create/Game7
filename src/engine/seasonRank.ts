import { WHEEL, type TeamSeason } from '../data/wheel'
import { teamFive } from './bestfive'
import { dialOvrRaw } from './gauges'
import { ratings100 } from './offense'
import { PLAYERS } from './pool'
import type { Player } from './types'

/**
 * WHERE A FIVE STANDS IN ITS OWN SEASON — a label beside the all-time dials (his ruling,
 * 2026-10-22: "Keep all-time and add the season rank label"). The dials stay on the one all-time
 * scale (recal_71/100); this only says, next to each of them, "#2 in 2025".
 *
 * DISPLAY ONLY. It reads the same three quantities the dials are drawn from — offRaw for OFF,
 * drtgRef for DEF (lower is better) and the unrounded dial mean for OVR — and changes none of them.
 * Within one season the league adjustment is the same for every team, so ordering by the raw value
 * IS ordering by the dial, without the ties the rounded dial would add.
 *
 *   · THE POOL: that season's team-seasons that field a five — the same five the Teams screen
 *     draws (bestfive.ts `teamFive`: the best legal five, or for the 44 clubs whose strict walk
 *     leaves a hole, recal_232's re-solve with its stand-in marked and penalised). Only a club with
 *     fewer than five men in the card pool has no dials and no rank, and is not counted.
 *   · TIES: an exactly equal value shares the better rank (1, 2, 2, 4).
 *   · A FIVE THAT IS NOT THE TEAM'S OWN (a campaign opponent built from that team-season) is ranked
 *     in that season's pool with its own club's entry taken out, so the club is never counted twice.
 */
const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))

interface Entry {
  ab: string
  off: number
  def: number
  ovr: number
}
const values = (five: Player[], season: number) => {
  const r = ratings100(five)
  return { off: r.offRaw, def: r.drtgRef, ovr: dialOvrRaw(five, season) }
}

const POOLS = new Map<number, Entry[]>()
function poolOf(season: number): Entry[] {
  const hit = POOLS.get(season)
  if (hit) return hit
  const out: Entry[] = []
  for (const t of WHEEL as TeamSeason[]) {
    if (t.y !== season) continue
    const five = teamFive(t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)).five
    if (!five.every(Boolean)) continue
    out.push({ ab: t.ab, ...values(five as Player[], season) })
  }
  POOLS.set(season, out)
  return out
}

export interface SeasonRank {
  off: number
  def: number
  ovr: number
  /** How many fives the ranks are out of. */
  of: number
  season: number
}

/** The five's rank in `season` on each dial, or null when there is no pool to rank it in. */
export function seasonRank(five: Player[], season: number, ab?: string): SeasonRank | null {
  if (five.length !== 5) return null
  const pool = poolOf(season).filter((e) => e.ab !== ab)
  if (!pool.length) return null
  const me = values(five, season)
  return {
    off: 1 + pool.filter((e) => e.off > me.off).length,
    def: 1 + pool.filter((e) => e.def < me.def).length,
    ovr: 1 + pool.filter((e) => e.ovr > me.ovr).length,
    of: pool.length + 1,
    season,
  }
}

/** "#2 in 2025" */
export const rankLabel = (rank: number, season: number) => `#${rank} in ${season}`
