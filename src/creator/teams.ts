import { WHEEL, type TeamSeason } from '../data/wheel'
import { LADDER } from '../engine/batch'
import { PLAYERS } from '../engine/pool'
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

/**
 * ONE SIDE OF A "SETTLE IT", whatever it was named as (the All-Time Cup, 2026-10-23):
 *   · a team-season `1996-CHI` — its real starters; the second side sits the first side's men out,
 *     Custom's rule and scripts/batch-sim.ts's default;
 *   · a ladder level `L113` — the five exactly as the campaign plays it (L91..L120 are the All-Time
 *     franchise fives), never changed for the other side, as batch-sim plays a level;
 *   · a hand-built five by card name — as written, as batch-sim plays one.
 * So a seed batch-sim prints for a matchup replays here to the same series.
 */
export interface CreatorSide {
  label: string
  ab: string
  /** The line under the name: a season's record, or a tier's tag ("all-time"). */
  sub: string
  five: Player[]
  opponent: (round: number) => Opponent
}

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))

export function creatorSide(spec: { id: string | null; five: string[] | null; name: string | null; ab: string | null }, sitOut?: ReadonlySet<string>): CreatorSide | null {
  if (spec.five) {
    const men = spec.five.map((n) => BY_NAME.get(n))
    if (!men.every(Boolean)) return null
    const five = men as Player[]
    const label = spec.name ?? 'Custom five'
    const ab = spec.ab ?? label.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
    return { label, ab, sub: '', five, opponent: (round) => ({ round, team: label, ab, positions: [], players: five }) }
  }
  const lv = spec.id ? /^L(\d+)$/.exec(spec.id) : null
  if (lv) {
    const o = LADDER[Number(lv[1]) - 1]
    if (!o) return null
    return { label: o.team, ab: o.ab ?? o.team.slice(0, 3).toUpperCase(), sub: o.tag ?? o.record ?? '', five: o.players, opponent: (round) => ({ ...o, round }) }
  }
  const t = spec.id ? teamSeason(spec.id) : null
  if (!t) return null
  const five = fiveFor(t, sitOut)
  return { label: seasonName(t), ab: t.ab, sub: t.rec ? `${t.rec} that season` : '', five, opponent: (round) => ({ ...asOpponent(t, round), players: five }) }
}
