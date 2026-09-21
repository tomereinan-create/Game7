import TEAMSTATS from '../data/teamstats.json'

/**
 * THE TEAM'S REAL BOX SCORE, FOUR LINES DEEP — his rulings, 2026-09-21: "add more(as many as
 * possible) real (basic, not advanced) stats on the team from basketball ref", and then "have the
 * stats be 4 lines - basic stats. League ranking. Opp basic stats. League ranking."
 *
 * That is Basketball Reference's own TEAM AND OPPONENT block, which is four rows under one set of
 * column heads: what this team did a night, where that stood in the league, what it allowed a
 * night, and where THAT stood.
 *
 * WHERE THE NUMBERS COME FROM. `src/data/teamstats.json` holds one row of TOTALS per team-season —
 * the team's own, summed from Basketball Reference's per-player totals, and the opponents', which
 * are BBRef's own opponent table (they cannot be summed out of player rows, because a player's
 * totals are his own and never his opponents'; see scripts/teamstats.ts and fetch-opponents.ts).
 * Every division happens here, once, so a per-game figure and a shooting split are computed from
 * the same integers the league keeps.
 *
 * WHAT IS IN IT AND WHAT IS NOT. This is the BASIC table. Nothing here is modelled and nothing is
 * a rate the league had to invent: points, the three shooting splits with their makes and
 * attempts, the boards split off from the rebounds, assists, steals, blocks, turnovers and fouls.
 * The advanced table (ratings, pace, the four factors) is deliberately absent — his ruling names
 * basic, and this app already has its own OFF/DEF verdict standing three inches above this block.
 *
 * THE RANK IS 1 = BEST, NOT 1 = HIGHEST, and that is the whole of the two rank rows. A league rank
 * is only worth printing if it can be read without thinking, so the direction is per column and per
 * side: a team wants more of everything it does except turnovers and fouls, and the opponent's row
 * is the exact opposite of the team's, column for column — fewer points allowed is better, and so
 * are fewer opponent rebounds, steals and blocks, while MORE opponent turnovers and MORE opponent
 * fouls are the defence's own work. Ties share the better rank and the next one is skipped, which
 * is how a league table does it. The field is the league that season — 22 clubs in 1980, 30 now.
 */
const RAW = TEAMSTATS as Record<string, number[]>

/** The order the totals are written in by scripts/teamstats.ts: team's fifteen, then the opponents'. */
const KEYS = ['fg', 'fga', 'x3p', 'x3pa', 'ft', 'fta', 'orb', 'drb', 'trb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const
type Key = (typeof KEYS)[number]
const N = KEYS.length

/**
 * THE COLUMNS, in Basketball Reference's own order, with how each one is built and which way is
 * better. `up` is read for the team's row; the opponent's row flips it, except where the column is
 * the defence's own doing — see the note on the rank above.
 */
type Col = {
  k: string
  /** a counting stat (per game) or a share of attempts */
  of: Key | [Key, Key]
  /**
   * True when a higher figure is a better one for the team whose card this is.
   * THE OPPONENT'S ROW IS ALWAYS THE OPPOSITE OF THIS, every column of it, and it is worth saying
   * why the two that look like exceptions are not: a team wants FEW turnovers and FEW fouls (`up`
   * false), and it wants its OPPONENT to have MANY of both — which is the flip, not a special case.
   * Opponent steals and opponent blocks work the same way from the other end: they are good for the
   * other side, so fewer of them is better here.
   */
  up: boolean
}
const COLS: Col[] = [
  { k: 'PTS', of: 'pts', up: true },
  { k: 'FG', of: 'fg', up: true },
  { k: 'FGA', of: 'fga', up: true },
  { k: 'FG%', of: ['fg', 'fga'], up: true },
  { k: '3P', of: 'x3p', up: true },
  { k: '3PA', of: 'x3pa', up: true },
  { k: '3P%', of: ['x3p', 'x3pa'], up: true },
  { k: 'FT', of: 'ft', up: true },
  { k: 'FTA', of: 'fta', up: true },
  { k: 'FT%', of: ['ft', 'fta'], up: true },
  { k: 'ORB', of: 'orb', up: true },
  { k: 'DRB', of: 'drb', up: true },
  { k: 'TRB', of: 'trb', up: true },
  { k: 'AST', of: 'ast', up: true },
  { k: 'STL', of: 'stl', up: true },
  { k: 'BLK', of: 'blk', up: true },
  { k: 'TOV', of: 'tov', up: false },
  { k: 'PF', of: 'pf', up: false },
]

export interface TeamLineRow {
  /** 'TEAM' / 'LG RANK' / 'OPP' / 'LG RANK' — the four lines his ruling asks for, in that order. */
  label: string
  kind: 'line' | 'rank'
  /** Whose numbers these are; the card tints the two opponent rows apart from the two team ones. */
  side: 'team' | 'opp'
  /** Already formatted, one per column of `cols`. */
  cells: string[]
}

export interface TeamLine {
  /** Games played that season — 82, or 50 in 1999 and 66 in 2012. */
  g: number
  /** How many clubs the ranks are out of that season (22 in 1980, 30 today). */
  of: number
  cols: string[]
  rows: TeamLineRow[]
}

const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1)
/** xx.x, the same face the player card's FG% wears — not BBRef's leading-dot .487. */
const share = (made: number, att: number) => (att > 0 ? Math.round((1000 * made) / att) / 10 : null)

/** The raw value of one column for one side, or null when the season never recorded it. */
function value(row: number[], col: Col, side: 'team' | 'opp'): number | null {
  const base = side === 'team' ? 2 : 2 + N
  const at = (k: Key) => row[base + KEYS.indexOf(k)]
  if (Array.isArray(col.of)) return share(at(col.of[0]), at(col.of[1]))
  const v = at(col.of)
  return Number.isFinite(v) ? v / row[0] : null
}

/**
 * Every club of one season, once, so the ranks are computed against the league the team actually
 * played in — 22 clubs in 1980, 30 today — and not against the book. Memoized: a season is walked
 * the first time one of its teams is opened and never again.
 */
const SEASONS = new Map<number, { key: string; vals: (number | null)[][] }[]>()
function league(y: number) {
  const hit = SEASONS.get(y)
  if (hit) return hit
  const out: { key: string; vals: (number | null)[][] }[] = []
  for (const key of Object.keys(RAW)) {
    if (Number(key.slice(-4)) !== y) continue
    const row = RAW[key]
    out.push({ key, vals: (['team', 'opp'] as const).map((side) => COLS.map((c) => value(row, c, side))) })
  }
  SEASONS.set(y, out)
  return out
}

/** Standard competition ranking, 1 = best: ties share a place and the next one is skipped. */
function rankOf(mine: number | null, all: (number | null)[], better: 'up' | 'down'): string {
  if (mine === null) return '—'
  let ahead = 0
  for (const v of all) {
    if (v === null) continue
    if (better === 'up' ? v > mine : v < mine) ahead++
  }
  return String(ahead + 1)
}

/**
 * One team-season's four lines, or null for a season the dump has no row for. The key is the same
 * `${ab}${y}` the team database names a season by.
 */
export function teamLine(ab: string, y: number): TeamLine | null {
  const row = RAW[`${ab}${y}`]
  if (!row || row.length < 2 + N) return null
  const g = row[0]
  if (!g) return null
  const hasOpp = row.length >= 2 + 2 * N
  const all = league(y)
  const mine = all.find((t) => t.key === `${ab}${y}`)

  const rows: TeamLineRow[] = []
  const sides: ('team' | 'opp')[] = hasOpp ? ['team', 'opp'] : ['team']
  for (const side of sides) {
    const vals = COLS.map((c) => value(row, c, side))
    rows.push({
      label: side === 'team' ? 'TEAM' : 'OPP',
      kind: 'line',
      side,
      cells: vals.map((v, i) => (v === null ? '—' : Array.isArray(COLS[i].of) ? v.toFixed(1) : one(v))),
    })
    rows.push({
      label: 'LG RANK',
      kind: 'rank',
      side,
      cells: COLS.map((c, i) => {
        if (!mine) return '—'
        // what a team does is read one way and what it allows the other, every column of it
        const up = side === 'team' ? c.up : !c.up
        return rankOf(
          vals[i],
          all.map((t) => t.vals[side === 'team' ? 0 : 1][i]),
          up ? 'up' : 'down',
        )
      }),
    })
  }
  return { g, of: all.length, cols: COLS.map((c) => c.k), rows }
}
