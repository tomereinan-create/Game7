import { A_TAL, K_MATCH, SERIES_WINS, SIGMA, TAL_W } from '../config'
import { noteFor } from './notes'
import { scoreVs, teamRating, type Assignment } from './offense'
import type { GameResult, Lineup, Player, SeriesResult } from './types'
import type { Rng } from './rng'

/**
 * A lineup's talent is top-heavy (see talentEff); the four
 * axes (display and the coach's shape), plus the team rating the engine
 * computes from the five's attribute sheets: OFF, DRtg, NET. Defense is a
 * property of the pairing, so pass the opponent's five whenever there is one;
 * without it the standalone defense rates the lineup on its own.
 */
/** Top-heavy talent: best, second, then the mean of the rest. Equal fives = the mean exactly. */
export function talentEff(players: Player[]): number {
  if (!players.length) return 0
  const t = players.map((p) => p.talent).sort((a, b) => b - a)
  if (t.length < 3) return t.reduce((a, b) => a + b, 0) / t.length
  const rest = t.slice(2)
  return TAL_W.W1 * t[0] + TAL_W.W2 * t[1] + (TAL_W.W3 * rest.reduce((a, b) => a + b, 0)) / rest.length
}

export function compile(players: Player[], vs?: Player[], assignment: Assignment = 'optimal'): Lineup {
  const n = players.length || 1
  const sum = players.reduce(
    (acc, p) => ({
      in: acc.in + p.in,
      out: acc.out + p.out,
      id: acc.id + p.id,
      pd: acc.pd + p.pd,
    }),
    { in: 0, out: 0, id: 0, pd: 0 },
  )
  const tr = !players.length ? { off: 0, drtg: 0, net: 0 } : vs && vs.length ? scoreVs(players, vs, assignment) : teamRating(players)
  return {
    talent: talentEff(players),
    in: sum.in / n,
    out: sum.out / n,
    id: sum.id / n,
    pd: sum.pd / n,
    off: tr.off,
    drtg: tr.drtg,
    net: tr.net,
    bonus: 0,
  }
}

/**
 * Coach / level modifiers. Axis shifts are the coach's shape (display); his
 * edge is `bonus`, points of spread added straight to the margin — not routed
 * through the rating, so it is neither scaled by K_MATCH nor lost.
 */
export function applyMod(l: Lineup, mod: Partial<Lineup>): Lineup {
  return {
    ...l,
    talent: l.talent + (mod.talent ?? 0),
    in: l.in + (mod.in ?? 0),
    out: l.out + (mod.out ?? 0),
    id: l.id + (mod.id ?? 0),
    pd: l.pd + (mod.pd ?? 0),
    bonus: l.bonus + (mod.bonus ?? 0),
  }
}

/** The three pieces of an expected margin, in points of spread. */
export interface Decomp {
  talent: number
  fit: number
  modifiers: number
  total: number
}
export function decompose(A: Lineup, B: Lineup): Decomp {
  const talent = A_TAL * (A.talent - B.talent)
  const fit = K_MATCH * (A.net - B.net)
  const modifiers = A.bonus - B.bonus
  return { talent, fit, modifiers, total: talent + fit + modifiers }
}

/**
 * One game, broken into the pieces that produced the margin — all in margin
 * points, so they can be compared directly. The notes read these.
 *
 * margin = A_TAL x talent gap + K_MATCH x matchup margin + modifiers + noise.
 * The fit term K_MATCH x matchup margin (NET_A - NET_B, each rated against the
 * other) splits exactly into an offense half
 * (OFF_A - OFF_B) and a defense half (DRtg_B - DRtg_A). The single gaussian
 * is split across the two rather than added on top: two independent
 * N(0, sigma/sqrt2) draws sum to variance sigma^2, so the margin distribution
 * is exactly the specified one — but each side of the ball carries its own
 * share of the night's luck, which is what lets game 5's note differ from
 * game 1's.
 */
export interface MarginTerms {
  talent: number
  offense: number
  defense: number
  fit: number
  modifiers: number
  noise: number
  margin: number
}

export function marginTerms(A: Lineup, B: Lineup, rng: Rng, sigma = SIGMA): MarginTerms {
  const half = sigma / Math.SQRT2
  const n1 = rng.gaussian(0, half)
  const n2 = rng.gaussian(0, half)

  const talent = A_TAL * (A.talent - B.talent)
  const off = K_MATCH * (A.off - B.off)
  const def = K_MATCH * (B.drtg - A.drtg)
  const modifiers = A.bonus - B.bonus
  const noise = n1 + n2

  return {
    talent,
    offense: off + n1,
    defense: def + n2,
    fit: off + def,
    modifiers,
    noise,
    margin: talent + off + def + modifiers + noise,
  }
}

/** A's margin over B. A wins iff margin > 0. The formula, verbatim. */
export function gameMargin(A: Lineup, B: Lineup, rng: Rng, sigma = SIGMA): number {
  return A_TAL * (A.talent - B.talent) + K_MATCH * (A.net - B.net) + (A.bonus - B.bonus) + rng.gaussian(0, sigma)
}

/** Stars for a won series: a sweep is 3, a shorter win 2, going the distance 1. Length-aware. */
export const starsFor = (r: SeriesResult) =>
  r.toWin <= 2 ? (r.losses === 0 ? 2 : 1) : r.losses === 0 ? 3 : r.losses < r.toWin - 1 ? 2 : 1

/** The expected margin, no noise. */
export const meanMargin = (A: Lineup, B: Lineup) => decompose(A, B).total

/** Display score. Winner 100 + margin/2, loser 100 - margin/2, +/-4 pace jitter. */
export function boxScore(margin: number, rng: Rng): { win: number; lose: number } {
  const diff = Math.max(1, Math.round(Math.abs(margin)))
  const base = 100 + Math.round(rng.range(-4, 4))
  return { win: Math.round(base + diff / 2), lose: Math.round(base - diff / 2) }
}

/** Best-of-7, first to 4. Returns every game played, in order. */
/**
 * ONE game, with exactly the math simSeries uses per iteration. A death-match series is played in
 * pieces so the five can change between games; splitting it must not change the arithmetic, so both
 * paths go through here.
 */
export function simGame(A: Lineup, B: Lineup, rng: Rng, sigma = SIGMA, gameNo = 1): GameResult {
  const t = marginTerms(A, B, rng, sigma)
  const won = t.margin > 0
  const s = boxScore(t.margin, rng)
  return { game: gameNo, margin: t.margin, won, us: won ? s.win : s.lose, them: won ? s.lose : s.win, note: noteFor(t) }
}

export function simSeries(A: Lineup, B: Lineup, rng: Rng, sigma = SIGMA, toWin = SERIES_WINS): SeriesResult {
  const games: GameResult[] = []
  let wins = 0
  let losses = 0
  while (wins < toWin && losses < toWin) {
    const g = simGame(A, B, rng, sigma, games.length + 1)
    g.won ? wins++ : losses++
    games.push(g)
  }
  return { games, wins, losses, won: wins === toWin, toWin }
}

/** Winrate of a single game, no series — the boolean form, for balance checks. */
export const wonGame = (A: Lineup, B: Lineup, rng: Rng, sigma = SIGMA) => gameMargin(A, B, rng, sigma) > 0
