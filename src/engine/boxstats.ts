import { teamOffense } from './offense'
import type { GameResult, Player, StatLine } from './types'
import type { Rng } from './rng'

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

export function shapeOf(five: Player[], lines: Record<string, StatLine | null>): Shape {
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
  return {
    fouldraw,
    ftp,
    outShare,
    tpp,
    drb,
    orb,
    tovBase,
    playvol: sum(five.map((p) => p.attrs.playvol)) / n,
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
export function solveShooting(pts: number, poss: number, s: Shape, rng: Rng): Shot {
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
  let shot = build(fta, tpp)
  for (let i = 0; i < 12 && (shot.pct < 0.41 || shot.pct > 0.53); i++) {
    // too many makes for the attempts -> more free throws, fewer threes; too few -> the reverse
    if (shot.pct > 0.53) {
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
): { us: TeamBox; them: TeamBox } {
  const su = shapeOf(us, lines)
  const st = shapeOf(them, lines)
  const poss = Math.round((possOf(ptsUs) + possOf(ptsThem)) / 2 + rng.gaussian(0, 1.5))
  const a = solveShooting(ptsUs, poss, su, rng)
  const b = solveShooting(ptsThem, poss, st, rng)
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
export function apportion(total: number, weights: number[]): number[] {
  const W = sum(weights)
  if (total <= 0 || W <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / W)
  const out = raw.map(Math.floor)
  let left = total - sum(out)
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++
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
export function splitBox(five: Player[], box: TeamBox): PlayerBox[] {
  const usg = teamOffense(five).lines.map((l) => l.usg)
  const w = (f: (p: Player, i: number) => number) => five.map((p, i) => Math.max(0.01, f(p, i)))
  const tpm = apportion(box.tpm, w((p, i) => usg[i] * p.attrs['3pt']))
  const tpa = tpm.map((m, i) => m + apportion(box.tpa - box.tpm, w((p, i) => usg[i] * p.attrs['3pt']))[i])
  const ftm = apportion(box.ftm, w((p, i) => usg[i] * p.attrs.fouldraw))
  const fta = ftm.map((m, i) => m + apportion(box.fta - box.ftm, w((p, i) => usg[i] * p.attrs.fouldraw))[i])
  const twoM = apportion(box.fgm - box.tpm, w((p, i) => usg[i] * (p.attrs.rim + p.attrs.mid)))
  const twoMiss = apportion(box.fga - box.fgm - (box.tpa - box.tpm), w((p, i) => usg[i] * (p.attrs.rim + p.attrs.mid)))
  const reb = apportion(box.reb, w((p) => p.attrs.orb + p.attrs.drb))
  const ast = apportion(box.ast, w((p) => p.attrs.playvol))
  const stl = apportion(box.stl, w((p) => p.attrs.perimdisrupt))
  const blk = apportion(box.blk, w((p) => p.attrs.rimprot))
  const tov = apportion(box.tov, w((p, i) => usg[i] * (100 - p.attrs.ballsec)))
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
): SeriesBox {
  const us: TeamBox[] = []
  const them: TeamBox[] = []
  const usP: PlayerBox[][] = []
  const themP: PlayerBox[][] = []
  games.forEach((_, i) => {
    const g = gameBoxes(five, theirFive, lines, scores[i].us, scores[i].them, rng)
    us.push(g.us)
    them.push(g.them)
    usP.push(splitBox(five, g.us))
    themP.push(splitBox(theirFive, g.them))
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
