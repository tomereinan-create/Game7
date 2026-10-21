import { WHEEL, type TeamSeason } from '../data/wheel'
import { startingFive } from '../engine/bestfive'
import { PLAYERS } from '../engine/pool'
import type { Opponent, Player } from '../engine/types'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const POS = ['PG', 'SG', 'SF', 'PF', 'C']

/** A team-season by its creator-mode id, `1996-CHI` (the season's closing year, then the club). */
export function teamSeason(id: string): TeamSeason | null {
  const m = /^(\d{4})-([A-Z]{2,4})$/.exec(id)
  if (!m) return null
  return WHEEL.find((t) => t.y === Number(m[1]) && t.ab === m[2]) ?? null
}

/**
 * The five a team-season puts on the floor in a filmed run. Best legal five by the cards for now
 * (the Team database's own read); the real-starters loader (P7) takes over when it lands, because
 * the "Settle It" videos argue about the five that actually started.
 */
export function fiveFor(t: TeamSeason): Player[] {
  const pool = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)
  return startingFive(pool).five.filter((p): p is Player => !!p)
}

/** How a team-season is printed on screen: "'96 Chicago Bulls". */
export const seasonName = (t: TeamSeason) => `'${String(t.y).slice(2)} ${t.team}`

/** A team-season as the draft and the result screen read an opponent. */
export function asOpponent(t: TeamSeason, round: number): Opponent {
  return { round, team: t.team, ab: t.ab, season: t.y, record: t.rec ?? undefined, positions: POS, players: fiveFor(t) }
}
