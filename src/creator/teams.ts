import { WHEEL, type TeamSeason } from '../data/wheel'
import { bestStarters, realStarters } from '../engine/starters'
import type { Opponent, Player } from '../engine/types'

const POS = ['PG', 'SG', 'SF', 'PF', 'C']

/** A team-season by its creator-mode id, `1996-CHI` (the season's closing year, then the club). */
export function teamSeason(id: string): TeamSeason | null {
  const m = /^(\d{4})-([A-Z]{2,4})$/.exec(id)
  if (!m) return null
  return WHEEL.find((t) => t.y === Number(m[1]) && t.ab === m[2]) ?? null
}

/**
 * The five a team-season puts on the floor in a filmed run: its REAL starters, the men who started
 * the most games (P7, src/engine/starters.ts) — the "Settle It" videos argue about the five that
 * actually played. The best legal five by the cards stands in only where the cards run short.
 */
export function fiveFor(t: TeamSeason, sitOut?: ReadonlySet<string>): Player[] {
  const real = realStarters(t.y, t.ab, sitOut)
  return real.length === 5 ? real : bestStarters(t.y, t.ab, sitOut)
}

/** How a team-season is printed on screen: "'96 Chicago Bulls". */
export const seasonName = (t: TeamSeason) => `'${String(t.y).slice(2)} ${t.team}`

/** A team-season as the draft and the result screen read an opponent. */
export function asOpponent(t: TeamSeason, round: number): Opponent {
  return { round, team: t.team, ab: t.ab, season: t.y, record: t.rec ?? undefined, positions: POS, players: fiveFor(t) }
}
