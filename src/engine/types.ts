/**
 * The 17-attribute sheet, every number derived from real Basketball-Reference
 * statistics by data/build_ratings.py. Display and drafting information ONLY —
 * `attrs` never enters the sim (see Lineup below, which cannot carry it).
 * `rim_mid_measured` false means rim/mid were inferred (1980-96 shot-location
 * data is incomplete); the UI marks those with an asterisk.
 */
export interface Attrs {
  /** Three-point shooting (renamed from `out`). */
  '3pt': number
  rim: number
  mid: number
  rim_mid_measured: boolean
  ft: number
  fouldraw: number
  orb: number
  drb: number
  playvol: number
  ballsec: number
  volume: number
  efficiency: number
  durability: number
  rimprot: number
  perimdisrupt: number
  perdef: number
  discipline: number
  /** Raw inputs for the team offense engine (natural USG%, TS). Not displayed. */
  /** Listed height in inches — a fact, not a rating: never smoothed, never percentiled. */
  height: number
  usg_raw: number
  ts_raw: number
  /** Era-relative TS: ts_raw − league TS that season + .570. What the offense engine prices. */
  ts_rel?: number
}

export const ATTR_KEYS = [
  'rim', 'mid', '3pt', 'ft', 'fouldraw', 'volume', 'efficiency', 'playvol', 'ballsec',
  'orb', 'drb', 'rimprot', 'perimdisrupt', 'perdef', 'discipline', 'durability',
] as const
export type AttrKey = (typeof ATTR_KEYS)[number]

/**
 * One player: the peak season of a real career, 1980-2026. `name` is unique
 * (a handful of same-name players carry their peak year to disambiguate).
 * The sim reads the attribute sheet through the offense/defense engine; the four
 * axes are display and the coach's shape.
 */
export interface Player {
  /** Unique identity: "LeBron James '13" — the season is part of the name. */
  name: string
  /** The bare player name shared by all of that player's seasons. */
  player: string
  peak_season: number
  /** The pipeline's overall scale, 55–99. The resolver's first-order term (top-heavy over the five). Not shown. */
  talent: number
  /**
   * OVR, the headline number. Since recal_37 it is built from the two dials and nothing else —
   * (0.6 x OFF + 0.4 x DEF + max(OFF, DEF)) / 2, then the tax, breadth and cap chain. No context.
   */
  ovr: number
  /** Offensive / defensive skill composites from the attribute sheet (compute_ovr.py). OVR is built from these. */
  o_ovr: number
  d_ovr: number
  /**
   * Class-relative marginal value against a reference five, 40–99 (compute_ovr.py). recal_37 took it
   * OUT of OVR — what a man is worth beside four others is a property of the five — and it ships here
   * so the draft and team screens can still read it.
   */
  marg: number
  /** Position class from compute_ovr.py's is_big — the labeler reads it, never recomputes it. */
  big: boolean
  in: number
  out: number
  id: number
  pd: number
  attrs: Attrs
}

/**
 * The real regular-season line for a player's peak season, from the same
 * Basketball-Reference dataset the ratings pipeline reads. Display only.
 */
export interface StatLine {
  team: string
  /** Lifetime Basketball-Reference positions, any season. */
  pos?: string[]
  gp: number
  mpg?: number
  ppg?: number
  rpg?: number
  apg?: number
  spg?: number
  bpg?: number
  topg?: number
  fgp?: number
  tpp?: number
  ftp?: number
  ts?: number
  per?: number
  ws?: number
  bpm?: number
  vorp?: number
  usg?: number
}

/**
 * A compiled five: plain averages of the five players on the five fields the
 * sim reads. Deliberately has no room for attrs — the doctrine in the type.
 */
export interface Lineup {
  /** Top-heavy talent of the five (talentEff): W1×best + W2×second + W3×mean of the rest. */
  talent: number
  in: number
  out: number
  id: number
  pd: number
  /** Team offense rating from the offense engine (see engine/offense.ts). */
  off: number
  /** Points allowed per 100 proxy: 118 - 0.14 x defensive index. */
  drtg: number
  /** off - drtg, each rated against the opponent when compiled with one. The fit term is K_MATCH x the gap. */
  net: number
  /** Coach / level modifiers, in points of spread, added straight to the margin. */
  bonus: number
}

export interface Opponent {
  round: number
  team: string
  /** Position of each player in `players`, PG to C (same order). */
  positions?: string[]
  /** The team-season's year and whether it won the title. */
  season?: number
  champion?: boolean
  /** Era block the level belongs to, and the points of spread its opponents carry. */
  era?: string
  handicap?: number
  /** Regular-season record the level is built from, e.g. "17–65". */
  record?: string
  /** Team abbreviation, for the level map tiles. */
  ab?: string
  players: Player[]
}

export type CoachId = 'def' | 'off' | 'gambler'

export interface Coach {
  id: CoachId
  name: string
  blurb: string
  mod: Partial<Lineup>
  sigma?: number
}

export interface GameResult {
  game: number
  margin: number
  won: boolean
  us: number
  them: number
  note: string
}

export interface SeriesResult {
  games: GameResult[]
  wins: number
  losses: number
  won: boolean
  /** Games needed: 4 for a best-of-seven, 3 for five, 2 for three. */
  toWin: number
}
