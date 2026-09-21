import TEAMSTATS from '../data/teamstats.json'

/**
 * THE TEAM'S REAL BOX-SCORE LINE — his ruling, 2026-09-21: "add more(as many as possible) real
 * (basic, not advanced) stats on the team from basketball ref."
 *
 * `src/data/teamstats.json` holds one row per team-season of TOTALS, summed from Basketball
 * Reference's own per-player totals (see scripts/teamstats.ts for why that sum IS the team's line),
 * plus the two figures no player row holds: the games played and the margin of victory. Every
 * division happens here, once, so a per-game figure and a shooting split are computed from the same
 * integers the league keeps.
 *
 * WHAT IS IN IT AND WHAT IS NOT. This is the BASIC table — the one on a club's own page above the
 * fold — and nothing here is modelled: points, the three shooting splits with their makes and
 * attempts, the boards split off from the rebounds, assists, steals, blocks, turnovers and fouls.
 * The advanced table (ratings, pace, the four factors) is deliberately absent: his ruling names
 * basic, and this app already has its own OFF/DEF verdict standing three inches above this block —
 * two ways of rating the same five, side by side, is the one thing the card must not say.
 *
 * OPPONENT POINTS is the only cell that is not a straight division, and it is arithmetic rather
 * than a model: a team's margin of victory is what it scored minus what it allowed, so what it
 * allowed is what it scored minus the margin.
 */
const RAW = TEAMSTATS as Record<string, number[]>

/** The order the totals are written in by scripts/teamstats.ts, after `g` and `mov`. */
const KEYS = ['fg', 'fga', 'x3p', 'x3pa', 'ft', 'fta', 'orb', 'drb', 'trb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const
type Key = (typeof KEYS)[number]

export interface TeamStatCell {
  /** The column's name, as Basketball Reference prints it. */
  k: string
  /** Already formatted: one decimal for a per-game figure, one for a percentage. */
  v: string
  /** True for the four cells that are a share rather than a count — the card tints nothing else. */
  pct?: boolean
}

export interface TeamLine {
  /** Games played that season — 82, or 50 in 1999 and 66 in 2012. */
  g: number
  cells: TeamStatCell[]
}

const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1)
/** xx.x, the same face the player card's FG% wears — not BBRef's leading-dot .487. */
const share = (made: number, att: number) => (att > 0 ? (Math.round((1000 * made) / att) / 10).toFixed(1) : '—')

/**
 * One team-season's line, or null for a season the dump has no row for. The key is the same
 * `${ab}${y}` the team database names a season by.
 */
export function teamLine(ab: string, y: number): TeamLine | null {
  const row = RAW[`${ab}${y}`]
  if (!row || row.length !== KEYS.length + 2) return null
  const [g, mov] = row
  if (!g) return null
  const at = (k: Key) => row[2 + KEYS.indexOf(k)]
  const per = (k: Key) => one(at(k) / g)
  return {
    g,
    cells: [
      { k: 'PTS', v: per('pts') },
      { k: 'OPP', v: one(at('pts') / g - mov) },
      { k: 'FG', v: per('fg') },
      { k: 'FGA', v: per('fga') },
      { k: 'FG%', v: share(at('fg'), at('fga')), pct: true },
      { k: '3P', v: per('x3p') },
      { k: '3PA', v: per('x3pa') },
      { k: '3P%', v: share(at('x3p'), at('x3pa')), pct: true },
      { k: 'FT', v: per('ft') },
      { k: 'FTA', v: per('fta') },
      { k: 'FT%', v: share(at('ft'), at('fta')), pct: true },
      { k: 'ORB', v: per('orb') },
      { k: 'DRB', v: per('drb') },
      { k: 'TRB', v: per('trb') },
      { k: 'AST', v: per('ast') },
      { k: 'STL', v: per('stl') },
      { k: 'BLK', v: per('blk') },
      { k: 'TOV', v: per('tov') },
      { k: 'PF', v: per('pf') },
    ],
  }
}
