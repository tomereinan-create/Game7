import { teamOffense } from './offense'
import type { Style } from './tactics'
import type { GameResult, Player, StatLine } from './types'
import type { Rng } from './rng'

/**
 * HOW A TEAM LINE IS SPLIT AMONG THE FIVE — the two weights the 2026-09-09 engine report caught
 * (A8 turnovers, A9 rebounds). Both were fitted the same way and neither is a taste call: the
 * exponents and floors below were grid-searched against the REAL per-game lines (src/data/stats.json
 * `topg` / `rpg`) of the 60 Champions fives, then scored on the 30 League fives that were never
 * fitted on. Held-out mean |share error| per player:
 *
 *   turnovers   usg x (100 - ballsec)                       0.0665  ->  0.0251   (worst 0.261 -> 0.118)
 *   rebounds    orb + drb                                   0.0322  ->  0.0227   (worst 0.096 -> 0.088)
 *
 * WHAT IS STILL WRONG, said plainly rather than left to be re-found: the guards' rebound share is
 * better but not right. On the report's five Iverson '06 goes 0.8 -> 2.6 a night against a real
 * 4.1, because the five men here all play the same minutes while the real ones did not. Closing
 * that gap needs a minutes model, which is a bigger round than this one.
 */
export const TOV_USG_EXP = 2.0
export const TOV_LOOSE_EXP = 0.7
export const TOV_FLOOR = 25
export const REB_EXP = 1.6
export const REB_FLOOR = 40

/**
 * THE TACTICAL STATE THE BOX CONSUMES (recal_61, the law): every tactical resolution that moves
 * the margin moves the lines through the SAME numbers. The resolver's score already carries the
 * margin (PTS == the score, the ledger law), so the box's job is to make each mapping VISIBLE:
 * pace in the possessions, the style in the shot mix, the r59 reallocation in the chosen man's
 * volume and his bricks, the pairing edges in who eats whom, and the crash in the glass.
 */
export interface BoxCtx {
  /** The resolved night's pace level, -1..+1 — possessions shift +-5 across it, both teams. */
  paceLvl?: number
  style?: Style
  /** Index of the named main scorer / playmaker in this five. */
  scorerIdx?: number
  playmakerIdx?: number
  /** The r59 FORCED reallocation shares (sum 100) — the reallocation IS the line. */
  usg?: number[]
  /** The chosen scorer's repricing tax off his own curve — a bad pick visibly bricks. */
  brick?: number
  /** Centered pairing edge per THIS team's attacker against the defense actually played on him. */
  edges?: number[]
  crashOff?: boolean
  crashDef?: boolean
  /** The OTHER team crashed the glass — our transition leaks through and shows in our shooting. */
  leak?: boolean
}

/**
 * Team box scores for a played series — pure presentation. The resolver only
 * produces a score per game; this fills in the rest of the line so the ledger
 * balances: PTS == 2×2PM + 3×3PM + FTM exactly, every game.
 *
 * Possessions DERIVE FROM THE SCORE (TARGET_ORTG), so a 112-point night is a
 * fast, efficient one and a 92-point night a slow one — not a brick-fest.
 * Shape follows identity: free throws from fouldraw, the three-point diet
 * from the lineup's usage-weighted outside vs paint+mid split, 3P% from
 * outside quality, rebounds from the other team's misses, turnovers from
 * ball security.
 */
export interface TeamBox {
  pts: number
  poss: number
  fgm: number
  fga: number
  tpm: number
  tpa: number
  ftm: number
  fta: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
}

/** Points per possession the score is read at (113 per 100). The single knob. */
export const TARGET_ORTG = 1.13

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const frac = (v: number | undefined | null, d: number) => (v === undefined || v === null ? d : v > 1 ? v / 100 : v)

/** Usage-weighted mean of an attribute. */
const wmean = (five: Player[], f: (p: Player) => number) => {
  const w = five.map((p) => p.attrs.usg_raw)
  const W = sum(w) || 1
  return sum(five.map((p, i) => f(p) * w[i])) / W
}

/** The lineup's identity — the part of the box that does not depend on the night. */
export interface Shape {
  fouldraw: number // team avg 0–99
  ftp: number // team FT%, 0–1
  outShare: number // three-point share of field-goal attempts, 0.25–0.48
  tpp: number // three-point %, 0.32–0.41
  drb: number // defensive-rebound strength, 0.68–0.78
  orb: number // offensive-rebound strength, 0.20–0.32
  tovBase: number // turnovers per 100 possessions, 10–16
  playvol: number
  perim: number
  rimprot: number
}

export function shapeOf(five: Player[], lines: Record<string, StatLine | null>, ctx?: BoxCtx): Shape {
  const n = five.length || 1
  const fouldraw = sum(five.map((p) => p.attrs.fouldraw)) / n
  const ftp = sum(five.map((p) => frac(lines[p.name]?.ftp, 0.76))) / n
  // outside vs paint+mid, usage weighted: the lineup's scoring diet
  const out = wmean(five, (p) => p.attrs['3pt'])
  const inside = wmean(five, (p) => (p.attrs.rim + p.attrs.mid) / 2)
  const diet = out / Math.max(1, out + inside)
  const outShare = lerp(0.25, 0.48, (diet - 0.3) / 0.4)
  // the 3pt rating scale hardened (^1.15) in recal_13, moving every rating down ~3 points; the
  // anchor shifts with it so the same shooting team still makes the same real percentage
  const tpp = lerp(0.32, 0.41, (out - 27) / 60)
  const drb = lerp(0.68, 0.78, (sum(five.map((p) => p.attrs.drb)) / n - 30) / 50)
  const orb = lerp(0.2, 0.32, (sum(five.map((p) => p.attrs.orb)) / n - 30) / 50)
  const ballsec = wmean(five, (p) => p.attrs.ballsec)
  const tovBase = lerp(16, 10, (ballsec - 20) / 60)
  // THE STYLE SHIFTS THE DIET (recal_61) — the same calls the margin priced, visible in the mix:
  // five-out lifts the three-point share, post-up trades it for free throws and fewer assists,
  // and motion raises the assist table and spreads the threes. (recal_127 removed transition.)
  let outShift = 0
  let fdShift = 0
  let pvShift = 0
  switch (ctx?.style) {
    case 'fiveout':
      outShift = 0.1
      break
    case 'postup':
      outShift = -0.08
      fdShift = 12
      pvShift = -5
      break
    case 'motion':
      pvShift = 12
      outShift = 0.03
      break
  }
  return {
    fouldraw: fouldraw + fdShift,
    ftp,
    outShare: clamp(outShare + outShift, 0.18, 0.55),
    tpp,
    // THE CRASH FOLLOWS THE DIAL (recal_61): the glass totals move with the call
    drb: clamp(drb + (ctx?.crashDef ? 0.05 : 0), 0.68, 0.85),
    orb: clamp(orb + (ctx?.crashOff ? 0.06 : 0), 0.2, 0.4),
    tovBase,
    playvol: sum(five.map((p) => p.attrs.playvol)) / n + pvShift,
    perim: sum(five.map((p) => p.attrs.perimdisrupt)) / n,
    rimprot: sum(five.map((p) => p.attrs.rimprot)) / n,
  }
}

/** Possessions a score implies, before sharing with the other team. */
export const possOf = (pts: number) => clamp(Math.round(pts / TARGET_ORTG), 82, 104)

export interface Shot {
  fgm: number
  fga: number
  tpm: number
  tpa: number
  ftm: number
  fta: number
}

/**
 * Solve one team's shooting line for a score on a possession count. Free
 * throws and threes come from the shape; twos are whatever is left of the
 * points. If FG% leaves 41–53%, 3P% and FTA are nudged inside their bands
 * until it does. The points are never touched.
 */
export function solveShooting(pts: number, poss: number, s: Shape, rng: Rng, leak = false): Shot {
  const fouldrawIdx = lerp(0.17, 0.31, s.fouldraw / 99)
  let fta = clamp(Math.round(poss * fouldrawIdx * (1 + rng.gaussian(0, 0.1))), 16, 30)
  let tpp = clamp(s.tpp * (1 + rng.gaussian(0, 0.12)), 0.25, 0.5)
  const orbAdd = 2 + Math.round((s.orb - 0.2) / 0.12) // second chances add a few true shooting attempts
  const build = (fta: number, tpp: number) => {
    const ftm = Math.round(fta * s.ftp)
    const tsa = poss * 0.99 + orbAdd
    const fga = Math.max(40, Math.round(tsa - 0.44 * fta))
    const tpa = Math.round(fga * s.outShare)
    let tpm = clamp(Math.round(tpa * tpp), 0, tpa)
    let rest = pts - ftm - 3 * tpm
    // the ledger must balance in whole twos: shave a three if the remainder is odd
    if (rest % 2 !== 0) {
      if (tpm > 0) {
        tpm -= 1
        rest += 3
      } else rest += 1 // a point from the line instead
    }
    const twoM = Math.max(0, rest / 2)
    const ftmAdj = pts - 3 * tpm - 2 * twoM
    const fgm = twoM + tpm
    return { fgm, fga, tpm, tpa, ftm: ftmAdj, fta: Math.max(fta, ftmAdj), pct: fga ? fgm / fga : 0 }
  }
  // the OTHER team crashing the glass leaks transition: the same points arrive on easier looks
  const lo = 0.41 + (leak ? 0.02 : 0)
  const hi = 0.53 + (leak ? 0.02 : 0)
  let shot = build(fta, tpp)
  for (let i = 0; i < 12 && (shot.pct < lo || shot.pct > hi); i++) {
    // too many makes for the attempts -> more free throws, fewer threes; too few -> the reverse
    if (shot.pct > hi) {
      fta = clamp(fta + 2, 16, 30)
      tpp = clamp(tpp + 0.01, 0.25, 0.5)
    } else {
      fta = clamp(fta - 2, 16, 30)
      tpp = clamp(tpp - 0.01, 0.25, 0.5)
    }
    shot = build(fta, tpp)
  }
  return { fgm: shot.fgm, fga: shot.fga, tpm: shot.tpm, tpa: shot.tpa, ftm: shot.ftm, fta: shot.fta }
}

/** One game's two lines. Possessions are shared, so both teams use the average. */
export function gameBoxes(
  us: Player[],
  them: Player[],
  lines: Record<string, StatLine | null>,
  ptsUs: number,
  ptsThem: number,
  rng: Rng,
  ctxUs?: BoxCtx,
  ctxThem?: BoxCtx,
): { us: TeamBox; them: TeamBox } {
  const su = shapeOf(us, lines, ctxUs)
  const st = shapeOf(them, lines, ctxThem)
  // PACE INHERITS (recal_61): the night's level shifts the shared possession count +-5.
  const poss = Math.round((possOf(ptsUs) + possOf(ptsThem)) / 2 + 5 * (ctxUs?.paceLvl ?? 0) + rng.gaussian(0, 1.5))
  const a = solveShooting(ptsUs, poss, su, rng, !!ctxUs?.leak)
  const b = solveShooting(ptsThem, poss, st, rng, !!ctxThem?.leak)
  const missA = a.fga - a.fgm
  const missB = b.fga - b.fgm
  const tovA = clamp(Math.round((su.tovBase * poss) / 100 + rng.gaussian(0, 1.2)), 6, 22)
  const tovB = clamp(Math.round((st.tovBase * poss) / 100 + rng.gaussian(0, 1.2)), 6, 22)
  const line = (s: Shape, shot: Shot, missOwn: number, missOpp: number, tov: number, oppTov: number): TeamBox => ({
    pts: 2 * (shot.fgm - shot.tpm) + 3 * shot.tpm + shot.ftm,
    poss,
    ...shot,
    reb: Math.round(missOpp * s.drb + missOwn * s.orb),
    ast: Math.round(shot.fgm * lerp(0.5, 0.68, (s.playvol - 30) / 50) * (1 + rng.gaussian(0, 0.08))),
    stl: Math.min(Math.round(oppTov * lerp(0.3, 0.55, (s.perim - 30) / 60)), Math.round(oppTov * 0.55)),
    blk: Math.round(missOpp * lerp(0.06, 0.16, (s.rimprot - 20) / 70)),
    tov,
  })
  return {
    us: line(su, a, missA, missB, tovA, tovB),
    them: line(st, b, missB, missA, tovB, tovA),
  }
}

export interface PlayerBox {
  name: string
  pts: number
  fgm: number
  fga: number
  tpm: number
  tpa: number
  ftm: number
  fta: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
}

/** Largest-remainder apportionment: integer shares that sum to `total` exactly. */
export function apportion(total: number, weights: number[], rng?: Rng): number[] {
  const W = sum(weights)
  if (total <= 0 || W <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / W)
  const out = raw.map(Math.floor)
  let left = total - sum(out)
  const frac = raw.map((v) => v - Math.floor(v))
  if (!rng) {
    // No stream: biggest fractional part first. Deterministic, and therefore STICKY — the same
    // man wins the same leftover every game. Kept only for callers with no rng of their own.
    const order = frac.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])
    for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++
    return out
  }
  /**
   * A10 (2026-09-09): with an rng the leftover is SAMPLED, not awarded. A team blocks about five
   * shots a night and there are five men to give them to, so 48% of man-pairs land on the same
   * integer — and under the deterministic rule it was the same integer every game, which is why a
   * four-game series printed exactly 1.0 blocks for all ten players and Kessler took 0.0 steals
   * across seven. Systematic sampling: one uniform draw, then walk the fractional parts. Each man
   * is taken with probability exactly equal to his own fraction, so his AVERAGE over a series is
   * his true share, the leftover count is exactly right, and PTS == the ledger still holds because
   * `total` is conserved.
   */
  const u = rng.next()
  let acc = 0
  let k = 0
  for (let i = 0; i < frac.length && left > 0; i++) {
    acc += frac[i]
    if (acc >= u + k - 1e-9) {
      out[i]++
      k++
      left--
    }
  }
  // float dust: hand any unallocated remainder to the biggest fractions, as the no-rng path does
  if (left > 0) {
    const order = frac.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])
    for (let j = 0; left > 0 && j < order.length; j++) if (out[order[j][1]] === Math.floor(raw[order[j][1]])) { out[order[j][1]]++; left-- }
    for (let j = 0; left > 0; j = (j + 1) % out.length, left--) out[j]++
  }
  return out
}

/**
 * Split a team line into player lines: scoring by reconciled usage and the
 * shot's kind (threes by outside, twos by paint+mid, free throws by fouls
 * drawn), rebounds by orb/drb, assists by playmaking, steals by perimeter
 * disruption, blocks by rim protection, turnovers by usage × insecurity.
 * Integer shares apportioned after the split, so every column sums to the
 * team total exactly and each player's points balance his own ledger.
 */
export function splitBox(five: Player[], box: TeamBox, ctx?: BoxCtx, rng?: Rng): PlayerBox[] {
  // THE r59 REALLOCATION IS THE LINE: the forced shares (main scorer +8, the rest scaled) carry
  // straight into the shot weights, so the chosen man's volume rises on the sheet exactly as the
  // margin priced it — and his BRICK factor (the repricing off his own curve) weights his
  // misses, so a bad pick is visible: volume up, percentage down. THE PAIRING EDGES decide who
  // eats whom: a positive edge scores more and misses less, a locked-down man the reverse —
  // the same centered numbers the board shows.
  const usg = ctx?.usg ?? teamOffense(five).lines.map((l) => l.usg)
  const edge = (i: number) => 1 + 0.06 * (ctx?.edges?.[i] ?? 0)
  const missEdge = (i: number) => 1 - 0.04 * (ctx?.edges?.[i] ?? 0)
  const brickOf = (i: number) => (i === ctx?.scorerIdx ? 1 + 3 * (ctx?.brick ?? 0) : 1)
  const w = (f: (p: Player, i: number) => number) => five.map((p, i) => Math.max(0.01, f(p, i)))
  // MOTION spreads the threes across all five — the weight exponent flattens
  const spread = ctx?.style === 'motion' ? 0.75 : 1
  const tpm = apportion(box.tpm, w((p, i) => Math.pow(usg[i] * p.attrs['3pt'], spread) * edge(i)), rng)
  // HOISTED, and it must stay hoisted: this used to call apportion INSIDE the map, once per player,
  // and take element i of the i-th call. With the deterministic split every call returned the same
  // array so the sum still balanced by luck; the moment the leftover became a random draw (A10) the
  // five calls disagreed and the lines stopped summing to the team box. One call, one allocation.
  const tpMiss = apportion(box.tpa - box.tpm, w((p, i) => Math.pow(usg[i] * p.attrs['3pt'], spread) * missEdge(i) * brickOf(i)), rng)
  const tpa = tpm.map((m, i) => m + tpMiss[i])
  const ftm = apportion(box.ftm, w((p, i) => usg[i] * p.attrs.fouldraw), rng)
  const ftMiss = apportion(box.fta - box.ftm, w((p, i) => usg[i] * p.attrs.fouldraw), rng)
  const fta = ftm.map((m, i) => m + ftMiss[i])
  const twoM = apportion(box.fgm - box.tpm, w((p, i) => usg[i] * (p.attrs.rim + p.attrs.mid) * edge(i)), rng)
  const twoMiss = apportion(box.fga - box.fgm - (box.tpa - box.tpm), w((p, i) => usg[i] * (p.attrs.rim + p.attrs.mid) * missEdge(i) * brickOf(i)), rng)
  /**
   * A9 (2026-09-09): `orb + drb` swallowed the guards' share. The raw attributes run 4 to 83 across
   * a five, a 20:1 ratio, where the men's real rebound lines are nearer 4:1 — everyone collects
   * uncontested boards, so the weight needs a floor under it rather than a bare sum. FITTED, not
   * chosen: exponent, split and floor were grid-searched against the real rpg of the 60 Champions
   * fives and scored on the 30 League fives that were never fitted on — mean |share error| per
   * player 0.0322 -> 0.0227, worst 0.096 -> 0.088. The 0.10/0.90 split is the data's: a night's
   * rebounds are mostly defensive ones.
   */
  const reb = apportion(box.reb, w((p) => Math.pow(REB_FLOOR + 0.1 * p.attrs.orb + 0.9 * p.attrs.drb, REB_EXP)), rng)
  // the MAIN PLAYMAKER's table rises and the others' compress — the r59 creation share on the sheet
  const ast = apportion(box.ast, w((p, i) => p.attrs.playvol * (i === ctx?.playmakerIdx ? 1.5 : (ctx?.playmakerIdx ?? -1) >= 0 ? 0.85 : 1)), rng)
  const stl = apportion(box.stl, w((p) => p.attrs.perimdisrupt), rng)
  const blk = apportion(box.blk, w((p) => p.attrs.rimprot), rng)
  /**
   * A8 (2026-09-09): `usg x (100 - ballsec)` INVERTED the turnover line. The ballsec term ran the
   * full 1-99 range at exponent 1 while usage entered flat, so it outweighed usage: Iverson '06
   * (usg 34.3, ballsec 81) scored 652 against Kessler '25 (usg 13.5, ballsec 11) at 1202 — the
   * ball-dominant guard was given HALF the centre's turnovers, where their real lines are 3.4 and
   * 1.5 a night. Turnovers are a touch-count first and a carelessness second. FITTED the same way
   * as `reb` above and on the same held-out 30 fives: mean |share error| 0.0665 -> 0.0251, worst
   * 0.261 -> 0.118. On the report's own five, Iverson goes 3.2 -> 7.3 a night (real 8.0) and
   * Kessler 6.9 -> 3.1 (real 3.5).
   */
  const tov = apportion(box.tov, w((p, i) => Math.pow(usg[i], TOV_USG_EXP) * Math.pow(TOV_FLOOR + Math.max(1, 100 - p.attrs.ballsec), TOV_LOOSE_EXP)), rng)
  return five.map((p, i) => ({
    name: p.name,
    pts: 2 * twoM[i] + 3 * tpm[i] + ftm[i],
    fgm: twoM[i] + tpm[i],
    fga: twoM[i] + tpm[i] + twoMiss[i] + (tpa[i] - tpm[i]),
    tpm: tpm[i],
    tpa: tpa[i],
    ftm: ftm[i],
    fta: fta[i],
    reb: reb[i],
    ast: ast[i],
    stl: stl[i],
    blk: blk[i],
    tov: tov[i],
  }))
}

export interface SeriesBox {
  us: TeamBox
  them: TeamBox
  /** Per-player averages over the games played. */
  usLines: PlayerBox[]
  themLines: PlayerBox[]
  games: number
}

const avg = (boxes: TeamBox[]): TeamBox => {
  const n = boxes.length || 1
  const out: TeamBox = { pts: 0, poss: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 }
  for (const b of boxes) for (const k of Object.keys(out) as (keyof TeamBox)[]) out[k] += b[k]
  for (const k of Object.keys(out) as (keyof TeamBox)[]) out[k] /= n
  return out
}

/** Per-game averages for both teams across the games played; deterministic for a seed. */
export function seriesBox(
  five: Player[],
  theirFive: Player[],
  lines: Record<string, StatLine | null>,
  games: GameResult[],
  scores: { us: number; them: number }[],
  rng: Rng,
  ctx?: { us: BoxCtx; them: BoxCtx },
): SeriesBox {
  const us: TeamBox[] = []
  const them: TeamBox[] = []
  const usP: PlayerBox[][] = []
  const themP: PlayerBox[][] = []
  games.forEach((_, i) => {
    const g = gameBoxes(five, theirFive, lines, scores[i].us, scores[i].them, rng, ctx?.us, ctx?.them)
    us.push(g.us)
    them.push(g.them)
    usP.push(splitBox(five, g.us, ctx?.us, rng))
    themP.push(splitBox(theirFive, g.them, ctx?.them, rng))
  })
  const avgP = (xs: PlayerBox[][], team: Player[]): PlayerBox[] =>
    team.map((p, i) => {
      const o: PlayerBox = { name: p.name, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 }
      for (const g of xs) for (const k of Object.keys(o) as (keyof PlayerBox)[]) if (k !== 'name') (o[k] as number) += g[i][k] as number
      for (const k of Object.keys(o) as (keyof PlayerBox)[]) if (k !== 'name') (o[k] as number) /= xs.length || 1
      return o
    })
  return { us: avg(us), them: avg(them), usLines: avgP(usP, five), themLines: avgP(themP, theirFive), games: games.length }
}
