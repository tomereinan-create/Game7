import STARTS from '../data/starters.json'
import STATS from '../data/stats.json'
import { WHEEL, type TeamSeason } from '../data/wheel'
import { startingFive } from './bestfive'
import { PLAYERS } from './pool'
import { eligible, POSITIONS } from './positions'
import type { Player, StatLine } from './types'

/**
 * A TEAM-SEASON'S REAL FIVE — the men who actually started the most games for it — as opposed to
 * the best legal five by OVR (bestfive.ts), which is a statement about the cards, not the team.
 * "The 1995-96 Bulls" means Harper, Jordan, Pippen, Rodman, Longley; the best five by rating may
 * start Kukoč over Longley, and a Settle-It video that does that has settled nothing.
 *
 * The ranking is built offline by scripts/starters.ts from Basketball-Reference games started
 * (minutes before 1981-82, when starts were not kept) and ships as src/data/starters.json: per
 * team-season, the card list `p` as a rank, one base-36 index per card. See that script for why it
 * is stored that way. Pure functions, no UI — the custom matchup and the batch scripts load the
 * same five from here.
 */
interface Starts {
  hash: string
  mp: string[]
  gaps: Record<string, string[]>
  order: Record<string, string>
}
const S = STARTS as Starts
const MP = new Set(S.mp)
const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const LINES = STATS as Record<string, StatLine | null>

export const startersKey = (y: number, ab: string) => `${y} ${ab}`

/** FNV-1a over every team-season's key and roster, in file order: what starters.json was built against. */
export function rosterHash(ts: readonly { y: number; ab: string; p: readonly string[] }[]): string {
  let h = 0x811c9dc5
  for (const t of ts) {
    const s = `${startersKey(t.y, t.ab)}:${t.p.join('|')}\n`
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
export const STARTERS_HASH = S.hash

export const teamSeason = (y: number, ab: string): TeamSeason | undefined => WHEEL.find((t) => t.y === y && t.ab === ab)

/** The team-season's cards, most games started first (most minutes first where starts were not kept). */
export function byStarts(t: TeamSeason): string[] {
  const o = S.order[startersKey(t.y, t.ab)]
  return o ? [...o].map((c) => t.p[parseInt(c, 36)]) : [...t.p]
}
/** 'gs' when the rank is games started, 'mp' when the season predates starts and minutes stand in. */
export const startsBasis = (y: number, ab: string): 'gs' | 'mp' => (MP.has(startersKey(y, ab)) ? 'mp' : 'gs')
/** Real top-five starters with no card on that team-season — the men the loaded five is missing. */
export const missingStarters = (y: number, ab: string): string[] => S.gaps[startersKey(y, ab)] ?? []

/**
 * Floor order for a five that was not chosen by position: of every legal PG-to-C board of these
 * men, the one whose PG has the most assists (the recal_74 ruling bestfive.ts slots by). A five that
 * fits no legal board — three guards started for plenty of teams — goes guards first by the mean of
 * his listed positions, starts breaking ties. Order feeds no number on the optimal path.
 */
function floorOrder(men: Player[]): Player[] {
  const pos = men.map((p) => eligible(LINES[p.name]?.pos))
  const apg = (p: Player) => LINES[p.name]?.apg ?? 0
  const slots: (Player | null)[] = POSITIONS.map(() => null)
  const found = { board: null as (Player | null)[] | null, key: -Infinity }
  const place = (i: number) => {
    if (i === men.length) {
      const key = slots[0] ? apg(slots[0]) : -1
      if (key > found.key) {
        found.key = key
        found.board = [...slots]
      }
      return
    }
    for (let s = 0; s < POSITIONS.length; s++) {
      if (slots[s] || !pos[i].includes(POSITIONS[s])) continue
      slots[s] = men[i]
      place(i + 1)
      slots[s] = null
    }
  }
  place(0)
  if (found.board) return found.board.filter((p): p is Player => !!p)
  const mean = (i: number) => pos[i].reduce((a, x) => a + POSITIONS.indexOf(x), 0) / pos[i].length
  return men.map((p, i) => ({ p, i, m: mean(i) })).sort((a, b) => a.m - b.m || a.i - b.i).map((x) => x.p)
}

/**
 * The real starting five of a team-season, PG to C. `sitOut` is bare player names that may not
 * play (the custom matchup's rule: a man already on the other side sits this one out) — the next
 * man by starts steps in. Fewer than five comes back when the team-season has fewer cards.
 */
export function realStarters(year: number, ab: string, sitOut: ReadonlySet<string> = new Set()): Player[] {
  const t = teamSeason(year, ab)
  if (!t) return []
  const men = byStarts(t)
    .map((n) => BY_NAME.get(n))
    .filter((p): p is Player => !!p && !sitOut.has(p.player))
    .slice(0, 5)
  return floorOrder(men)
}

/** The best legal five by OVR — the loader's other choice, and what it always was (bestfive.ts). */
export function bestStarters(year: number, ab: string, sitOut: ReadonlySet<string> = new Set()): Player[] {
  const t = teamSeason(year, ab)
  if (!t) return []
  const pool = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p && !sitOut.has(p.player))
  return startingFive(pool).five.filter((p): p is Player => !!p)
}

export type FiveKind = 'real' | 'best'
export const loadFive = (year: number, ab: string, kind: FiveKind, sitOut?: ReadonlySet<string>) =>
  kind === 'real' ? realStarters(year, ab, sitOut) : bestStarters(year, ab, sitOut)
