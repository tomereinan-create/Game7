import CAMPAIGNS from '../data/campaigns.json'
import { SERIES_WINS, SIGMA } from '../config'
import { odds } from './odds'
import type { Assignment } from './offense'
import { PLAYERS } from './pool'
import { boxScore, compile, simSeries } from './resolver'
import { makeRng } from './rng'
import { loadFive, missingStarters, startsBasis, teamSeason, type FiveKind } from './starters'
import { tapeSeed } from './ticker'
import type { Lineup, Opponent, Player } from './types'

/**
 * THE BATCH SIM — one matchup run N times on the app's own engine, seeded and reproducible, for the
 * Settle-It videos (which series to feature) and the All-Time Cup (sixty group series in one file).
 * scripts/batch-sim.ts is the command line; scripts/calibrate.ts and tests/calibration.test.ts run
 * the card against it.
 *
 * NOTHING HERE IS A SECOND SIMULATOR. A series is `simSeries(mine, theirs, makeRng(seed), sigma,
 * toWin)` with `mine = compile(A, B, assignment)` and `theirs = compile(B, A)` — exactly the call the
 * custom matchup makes (Custom.tsx `sim`, optimal on both sides) and the plain campaign makes
 * (App.tsx `sim`, no plan, the five's assignment). So a seed printed here, handed to makeRng in the
 * app with the same two fives, plays the same seven nights to the same scores.
 *
 * THE SEEDS: series i (0-based) of a run with base seed S is seeded `(S + i) >>> 0` — seriesSeed.
 * Plain on purpose: the seed a video features is just base + its index, and any one of them can be
 * replayed alone without re-running the batch.
 */
export const seriesSeed = (base: number, i: number) => (base + i) >>> 0

/** The ladder, numbered 1..N in tier order with each tier's name — App.tsx's LEVELS, without React. */
export const LADDER: Opponent[] = (() => {
  const tiers = CAMPAIGNS as unknown as { name: string; levels: Opponent[] }[]
  let n = 0
  return tiers.flatMap((t) => t.levels.map((o) => ({ ...o, round: ++n, era: t.name })))
})()

/** One side of a matchup: what it was asked as, what it is called, and the five that plays. */
export interface Side {
  spec: string
  label: string
  /** Three-letter code for score lines. */
  ab: string
  five: Player[]
  /** For a team-season: which five, on what basis, and any real starter the pool has no card for. */
  kind?: FiveKind
  basis?: 'gs' | 'mp'
  missing?: string[]
  /** Men who were left out because the other side already had them (the custom matchup's rule). */
  satOut?: string[]
}
/** A side as written: "1996-CHI" (a team-season, YYYY = the season's closing year), "L12" (a ladder level), or a hand-built five by card name. */
export type SideSpec = string | { name: string; five: string[]; ab?: string }

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))

/**
 * Turn a spec into a five. `sitOut` is the other side's men by bare name: a team-season loads the
 * way Custom.tsx loads it, so a man already on the other side sits out and the next man steps in —
 * which is what lets the matchup be rebuilt in the app at all. A ladder level is the level as the
 * campaign plays it, from campaigns.json, untouched.
 */
export function resolveSide(spec: SideSpec, kind: FiveKind = 'real', sitOut: ReadonlySet<string> = new Set()): Side {
  if (typeof spec !== 'string') {
    const five = spec.five.map((n) => {
      const p = BY_NAME.get(n)
      if (!p) throw new Error(`no card named "${n}"`)
      return p
    })
    return { spec: spec.name, label: spec.name, ab: spec.ab ?? spec.name.slice(0, 3).toUpperCase(), five }
  }
  const lv = /^L(\d+)$/i.exec(spec.trim())
  if (lv) {
    const o = LADDER[Number(lv[1]) - 1]
    if (!o) throw new Error(`no level ${lv[1]} (the ladder runs L1-L${LADDER.length})`)
    return { spec, label: `L${o.round} ${o.season ? `'${String(o.season).slice(2)} ` : ''}${o.team}`, ab: o.ab ?? o.team.slice(0, 3).toUpperCase(), five: o.players }
  }
  const ts = /^(\d{4})-([A-Za-z]{2,3})$/.exec(spec.trim())
  if (ts) {
    const y = Number(ts[1])
    const ab = ts[2].toUpperCase()
    const t = teamSeason(y, ab)
    if (!t) throw new Error(`no team-season ${y}-${ab} on the wheel`)
    const five = loadFive(y, ab, kind, sitOut)
    const would = loadFive(y, ab, kind)
    const satOut = would.filter((p) => sitOut.has(p.player)).map((p) => p.name)
    return {
      spec,
      label: `'${String(y).slice(2)} ${t.team}`,
      ab,
      five,
      kind,
      basis: startsBasis(y, ab),
      missing: kind === 'real' ? missingStarters(y, ab) : [],
      ...(satOut.length ? { satOut } : {}),
    }
  }
  throw new Error(`cannot read side "${spec}" — write 1996-CHI, L12, or {name, five}`)
}

/**
 * Both sides, A first: B loads with A's men sitting out, as Custom.tsx loads a second team.
 * `allowDupes` lets the same man play for both (the '91 Bulls against the '96 Bulls with Jordan on
 * each) — the engine sims it, but the custom matchup cannot build it, so it cannot be replayed there.
 */
export function resolveMatchup(a: SideSpec, b: SideSpec, kind: FiveKind = 'real', allowDupes = false): [Side, Side] {
  const A = resolveSide(a, kind)
  const B = resolveSide(b, kind, allowDupes ? new Set() : new Set(A.five.map((p) => p.player)))
  return [A, B]
}

export interface BatchOpts {
  n: number
  /** Base seed: series i is seeded seriesSeed(seed, i). */
  seed: number
  sigma?: number
  toWin?: number
  /** A's defensive board; B (the AI, or the second custom five) always plays optimal. Default optimal, as the custom matchup. */
  assignment?: Assignment
  /** How many of the closest deciders to keep. */
  closest?: number
}
export interface Decider {
  seed: number
  /** The resolver's game-7 margin, A's side. */
  margin: number
  aWon: boolean
  /** The final the Series screen shows for game 7 — the tape's (ticker.ts tapeSeed), A first. */
  a: number
  b: number
}
export interface BatchResult {
  n: number
  seed: number
  sigma: number
  toWin: number
  aWins: number
  /** A's series win rate, 0-1. */
  aPct: number
  /** The card: the pre-series spread and chances odds() prints for A. */
  card: { spread: number; game: number; series: number }
  /** A's share of all games played. */
  gamePct: number
  /** Series lengths, each split by winner: toWin games (a sweep) up to 2 x toWin - 1. */
  lengths: { games: number; a: number; b: number }[]
  /** Mean resolver margin per game, A's side. */
  avgMargin: number
  games: number
  closest: Decider[]
}

/** Run N seeded series between two compiled lineups — the shared loop, for callers that bring their own night (a plan). */
export function batchLineups(mine: Lineup, theirs: Lineup, o: BatchOpts): BatchResult {
  const sigma = o.sigma ?? SIGMA
  const toWin = o.toWin ?? SERIES_WINS
  const card = odds(mine, theirs, sigma, toWin)
  const full = 2 * toWin - 1
  const lengths = Array.from({ length: toWin }, (_, k) => ({ games: toWin + k, a: 0, b: 0 }))
  let aWins = 0
  let games = 0
  let gamesWon = 0
  let marginSum = 0
  const deciders: { seed: number; margin: number; us: number; them: number }[] = []
  for (let i = 0; i < o.n; i++) {
    const seed = seriesSeed(o.seed, i)
    const r = simSeries(mine, theirs, makeRng(seed), sigma, toWin)
    if (r.won) aWins++
    const row = lengths[r.games.length - toWin]
    if (r.won) row.a++
    else row.b++
    for (const g of r.games) {
      games++
      marginSum += g.margin
      if (g.won) gamesWon++
    }
    if (r.games.length === full) {
      const g = r.games[full - 1]
      deciders.push({ seed, margin: g.margin, us: g.us, them: g.them })
    }
  }
  deciders.sort((x, y) => Math.abs(x.margin) - Math.abs(y.margin) || x.seed - y.seed)
  const closest = deciders.slice(0, o.closest ?? 10).map(({ seed, margin, us, them }) => {
    const aWon = margin > 0
    // A seventh game is shown off its tape, whose final is the first draw off tapeSeed (ticker.ts
    // buildTicker) — this is that draw. Any other decider shows the resolver's own box score.
    if (full !== 7) return { seed, margin, aWon, a: us, b: them }
    const s = boxScore(margin, makeRng(tapeSeed(seed, 6)))
    return { seed, margin, aWon, a: aWon ? s.win : s.lose, b: aWon ? s.lose : s.win }
  })
  return {
    n: o.n,
    seed: o.seed,
    sigma,
    toWin,
    aWins,
    aPct: aWins / o.n,
    card: { spread: card.spread, game: card.game, series: card.series },
    gamePct: games ? gamesWon / games : 0,
    lengths,
    avgMargin: games ? marginSum / games : 0,
    games,
    closest,
  }
}

/** The custom matchup's night (or the plain campaign's): compile both fives against each other, then run the batch. */
export function batchSim(A: Player[], B: Player[], o: BatchOpts): BatchResult {
  return batchLineups(compile(A, B, o.assignment ?? 'optimal'), compile(B, A), o)
}
