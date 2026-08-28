import type { Attrs, Player } from './types'

/**
 * Team offense / defense — a 1:1 port of data/team_rating.py (the source of
 * truth). Every knob lives in KNOBS; change it there and here together.
 *
 * Offense, in order: usage economy (Σ usage forced to 100, creators absorb
 * surplus, high-usage players shed), repricing along each player's skill
 * curve, creation amplification for low-usage players, usage-extreme
 * penalties, paint-dependence interactions (spacing, finisher, hub), a
 * per-player stack cap, then fouldraw × FT points and the ORB second-chance
 * multiplier.
 */
export const KNOBS = {
  TEAM_USG: 100.0, // possessions must sum
  SLOPE_UP_MAX: 0.9, // % TS lost per usage pt gained, for a zero-creation player
  SLOPE_UP_MIN: 0.25, // same, for a perfect creator
  SLOPE_DOWN: 0.55, // % TS gained per usage pt shed — only for efficient players (gate)
  AMP_MAX: 0.06, // max TS multiplier bonus for low-usage players fed by elite creation
  FLOOR_USG: 10.0, // nobody can be squeezed below this share
  // interactions
  USG_LOW: 13, // below this reconciled usage, skill can't express: -1.0% TS per point
  USG_LOW_PEN: 0.01,
  USG_HIGH: 32, // above this, overload: -0.6% TS per point
  USG_HIGH_PEN: 0.006,
  PAINT_OUT: 40, // paint-dependent by diet: out < 40 AND mid < 45
  PAINT_MID: 45,
  CLOG_MAX: 0.07, // low spacing from the other four clogs the paint, up to -7% TS
  SPACING_FULL: 0.55, // teammates' spacing (0..1) at which the paint is fully open
  FINISHER_USG: 20, // natural usage below this = finisher
  FINISHER_BONUS: 0.06, // × best teammate's (creation × out)
  HUB_USG: 24, // natural usage at or above this = hub
  HUB_BONUS: 0.05, // × teammates' spacing
  STACK_MIN: 0.9, // per-player combined interaction multiplier clamp — never remove
  STACK_MAX: 1.12,
  FT_POINTS: 0.06, // fouldraw × FT manufactured points
  ORB_PER_PT: 0.0012, // second-chance multiplier per point of orb above 50
  ORB_PIVOT: 50,
  MISS_TS: 0.6, // miss_factor = 1 + (MISS_TS - wTS)/MISS_SPAN, clamped 0.5..1.5
  MISS_SPAN: 0.08,
} as const

/** 0..1: can this player create offense? */
// passqual removed: its 0.35 is dropped and the survivors renormalised over 0.65, so creation reads
// volume and ball security only. Mirrors data/team_rating.py exactly (the parity test enforces it).
export const creation = (a: Attrs) => (0.45 * a.playvol + 0.2 * a.ballsec) / (0.65 * 99)

export interface PlayerLine {
  name: string
  /** Reconciled usage share. */
  usg: number
  /** Repriced true shooting, in %. */
  ts: number
}

export interface Offense {
  off: number
  lines: PlayerLine[]
  /** Σ usage × TS × 2, before fouls and the glass (display). */
  base: number
  ftPts: number
  orbMult: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** The stack cap: a player's combined interaction multiplier never leaves [0.90, 1.12]. */
export const stackClamp = (m: number) => clamp(m, KNOBS.STACK_MIN, KNOBS.STACK_MAX)

/**
 * THE USAGE-RECONCILIATION SURPLUS (recal_57 reuses it for PACE). A five whose natural usage runs
 * past the 100 the floor allows has STARVED shot-takers — extra possessions feed them. A five that
 * runs short stretches role players — extra possessions hurt. Positive = starved, clamped +-25.
 */
export const usageSurplus = (five: Player[]) =>
  clamp(five.reduce((s, p) => s + p.attrs.usg_raw, 0) - KNOBS.TEAM_USG, -25, 25)

/** `stackCap=false` exists only so a test can prove the cap binds. The game never passes it. */
export function teamOffense(five: Player[], stackCap = true): Offense {
  const K = KNOBS
  const A = five.map((p) => p.attrs)
  const n = A.length
  const u = A.map((a) => a.usg_raw)
  const e = A.map((a) => a.ts_rel ?? a.ts_raw) // era-relative TS: efficiency vs your own league
  const c = A.map(creation)
  const delta = K.TEAM_USG - u.reduce((s, x) => s + x, 0)

  // distribute delta: extra usage goes to creators (weighted by creation × natural usage);
  // shed usage comes off everyone above the floor, proportional to excess over 12
  const w = delta >= 0 ? c.map((ci, i) => Math.max(0.05, ci) * u[i]) : u.map((ui) => Math.max(0, ui - 12))
  const W = w.reduce((s, x) => s + x, 0) || 1
  let u2 = u.map((ui, i) => Math.max(K.FLOOR_USG, ui + (delta * w[i]) / W))
  const s = u2.reduce((a, b) => a + b, 0)
  u2 = u2.map((x) => (x * K.TEAM_USG) / s)

  // reprice efficiency along each player's skill curve
  const e2 = u.map((ui, i) => {
    const d = u2[i] - ui
    if (d >= 0) {
      const slope = K.SLOPE_UP_MAX - (K.SLOPE_UP_MAX - K.SLOPE_UP_MIN) * c[i]
      return e[i] * (1 - (slope * d) / 100)
    }
    // shedding usage helps only players whose problem was LOAD, not shot selection
    const gate = clamp((e[i] - 0.545) / 0.1, 0, 1) // gate recentred for the era-relative scale
    return e[i] * (1 + (K.SLOPE_DOWN * gate * -d) / 100)
  })

  // creation amplification: catch-and-shoot players eat better next to great table-setters
  const feed = c.reduce((acc, ci, i) => acc + ci * u2[i], 0) / K.TEAM_USG
  const e3 = e2.map((x, i) => x * (1 + K.AMP_MAX * feed * Math.max(0, 1 - u2[i] / 30)))

  // interactions
  const outs = A.map((a) => a['3pt'])
  const e4 = A.map((a, i) => {
    const ei = e3[i]
    let x = ei
    if (u2[i] < K.USG_LOW) x *= 1 - K.USG_LOW_PEN * (K.USG_LOW - u2[i])
    if (u2[i] > K.USG_HIGH) x *= 1 - K.USG_HIGH_PEN * (u2[i] - K.USG_HIGH)
    if (a['3pt'] < K.PAINT_OUT && a.mid < K.PAINT_MID) {
      let spc = 0
      for (let j = 0; j < n; j++) if (j !== i) spc += Math.max(0, outs[j] - 55)
      spc /= 4 * 44
      x *= 1 - K.CLOG_MAX * (1 - Math.min(1, spc / K.SPACING_FULL))
      if (a.usg_raw < K.FINISHER_USG) {
        let best = -Infinity
        for (let j = 0; j < n; j++) if (j !== i) best = Math.max(best, (c[j] * outs[j]) / 99)
        x *= 1 + K.FINISHER_BONUS * best
      } else if (a.usg_raw >= K.HUB_USG) {
        x *= 1 + K.HUB_BONUS * Math.min(1, spc / K.SPACING_FULL)
      }
    }
    return stackCap ? ei * stackClamp(x / ei) : x // stack cap
  })

  const base = u2.reduce((acc, ui, i) => acc + ui * e4[i], 0) * 2
  // fouldraw × FT: manufactured points
  const ftPts = u2.reduce((acc, ui, i) => acc + ui * (A[i].fouldraw / 99) * (A[i].ft / 100), 0) * K.FT_POINTS
  let off = base + ftPts
  // ORB feeds on misses
  const wTS = u2.reduce((acc, ui, i) => acc + ui * e4[i], 0) / K.TEAM_USG
  const miss = clamp((K.MISS_TS - wTS) / K.MISS_SPAN + 1, 0.5, 1.5)
  const orbMult = 1 + K.ORB_PER_PT * A.reduce((acc, a) => acc + Math.max(0, a.orb - K.ORB_PIVOT), 0) * miss
  off *= orbMult

  return {
    off,
    base,
    ftPts,
    orbMult,
    lines: five.map((p, i) => ({ name: p.name, usg: Math.round(u2[i] * 10) / 10, ts: Math.round(1000 * e4[i]) / 10 })),
  }
}

/**
 * Standalone defense (team_rating.py `team_defense`, DKNOBS) — used only when
 * there is no opponent to rate against (a lineup on its own). In play, defense
 * is a property of the pairing: see `defenseVs`.
 */
export const DKNOBS = {
  W_BASE: 0.4,
  W_ANCHOR: 0.25,
  W_PRESS: 0.2,
  W_WEAK: 0.15,
  ANCHOR_2ND: 0.35, // redundancy: second rim protector partial credit
  WEAK_MITIG: 0.45, // how much an elite anchor covers the weakest link
  PRESS_DISC_GATE: 0.5, // pressure value floor without discipline (gambling tax)
  DRB_STOP: 0.045, // stop-completion: DRtg improvement per excess DRB pt
  DISC_FREEPTS: 0.03, // free points allowed per pt of indiscipline below 55
  TRANSITION: 0.02, // OFF pts per pt of perimdisrupt above 55 (steals score)
} as const

export function teamDefense(five: Player[]): { didx: number; drtg: number } {
  const K = DKNOBS
  const A = five.map((p) => p.attrs)
  const n = A.length || 1
  const di = A.map((a) => a.perdef)
  const rp = A.map((a) => a.rimprot).sort((a, b) => b - a)
  const rp1 = rp[1] ?? 0
  const anchor = (rp[0] ?? 0) + K.ANCHOR_2ND * rp1 * (rp1 / 99)
  const press = A.reduce((s, a) => s + a.perimdisrupt * (K.PRESS_DISC_GATE + (1 - K.PRESS_DISC_GATE) * (a.discipline / 99)), 0) / 5
  const weak = Math.min(...di) * (1 + K.WEAK_MITIG * Math.min(1, anchor / 110))
  const didx = (K.W_BASE * di.reduce((s, x) => s + x, 0)) / 5 + K.W_ANCHOR * Math.min(99, anchor) * 0.9 + K.W_PRESS * press + K.W_WEAK * Math.min(99, weak)
  let drtg = 118 - 0.14 * didx
  drtg -= (K.DRB_STOP * A.reduce((s, a) => s + Math.max(0, a.drb - 50), 0)) / 5
  drtg += (K.DISC_FREEPTS * A.reduce((s, a) => s + Math.max(0, 55 - a.discipline), 0) / 5) * 3
  void n
  return { didx, drtg }
}

export const transitionBonus = (five: Player[]) => DKNOBS.TRANSITION * five.reduce((s, p) => s + Math.max(0, p.attrs.perimdisrupt - 55), 0)

/** Matchup defense knobs (team_rating.py MKNOBS). */
export const MKNOBS = {
  HIDE_OUT: 45, // opponent with out below this = credible hiding spot for the anchor
  ANCHOR_CAP: 37.5, // protection capacity: ~1.5 bad defenders' worth of perdef deficit
  ONBALL_SPLIT: 0.6, // steals: 60% on-ball (matchup-driven), 40% team/passing-lane
  HUNT_SCALE: 0.1, // DRtg pts per unit of hunted-man exposure
  DRTG_COEF: 0.181, // calibrated to the 60/40 offense/defense ruling; re-derived after recal_12's
  // perdef purification widened the raw spread to 12.95 (band is 8-11). Mirrors team_rating.py.
  STEAL_PTS: 0.024, // transition: OFF per steal-generation point (score_vs)
} as const

export interface DefenseVs {
  /** Points allowed per 100 by US defending THEM (lower = better). */
  drtg: number
  /** Our steal generation against their handlers, capped 99. */
  steals: number
  // the reads (one-line derivations; the strategy layer)
  star: number
  worstShooter: number
  minOppOut: number
  hide: number
  paintOrient: number
  starPaint: number
  anchor: number
  huntPen: number
  // display-only internals
  anchorIdx: number
  weakIdx: number
  cover: number
  effDi: number
  onball: number
  team: number
  glass: number
  discPts: number
  didx: number
  /** The matchups scored, when assigned (map[i] = opponent index guarded by us[i]); null for optimal. */
  map: number[] | null
}

/**
 * Who guards whom. `optimal` is the engine's own choice (anchor hidden on the
 * least shooter, the star hunts the weakest defender, the top perimeter
 * disruptor works the star) — what every AI opponent uses. `naive` is the
 * untrained coach: the anchor takes the most paint-oriented opponent
 * whatever his shooting, everyone else position-on-position. A manual map is
 * the player's own 5-to-5 (map[i] = index in `them` guarded by us[i]). Naive
 * and manual are scored with the same math against the ACTUAL matchups.
 */
export type Assignment = 'optimal' | 'naive' | number[]

/** The untrained coach's matchups: anchor on the most paint-oriented opponent, the rest position-on-position. */
export function naiveAssignment(us: Player[], them: Player[]): number[] {
  const n = us.length
  const map = new Array<number>(n).fill(-1)
  if (!n || them.length !== n) return us.map((_, i) => i)
  let anchor = 0
  for (let i = 1; i < n; i++) if (us[i].attrs.rimprot > us[anchor].attrs.rimprot) anchor = i
  let target = 0
  const paint = (p: Player) => p.attrs.rim / (p.attrs.rim + p.attrs['3pt'] + 1e-9)
  for (let j = 1; j < n; j++) if (paint(them[j]) > paint(them[target])) target = j
  map[anchor] = target
  // the rest keep their slot: PG on PG, SG on SG ... (both fives are listed PG to C)
  const free = them.map((_, j) => j).filter((j) => j !== target)
  for (let i = 0; i < n; i++) {
    if (i === anchor) continue
    const k = free.indexOf(i)
    map[i] = k >= 0 ? free.splice(k, 1)[0] : free.shift()!
  }
  return map
}

/**
 * The best explicit 5-to-5 board, found by trying all 120 permutations and keeping
 * the lowest DRtg. `optimal` is scored abstractly and never yields a map, so this is
 * what the Matchup board's solve button fills in: a real board you can then tweak.
 */
export function solveBoard(us: Player[], them: Player[]): number[] {
  const n = Math.min(us.length, them.length)
  if (n === 0) return []
  let best: number[] = Array.from({ length: n }, (_, i) => i)
  let bestD = Infinity
  const cur: number[] = []
  const used = new Array(n).fill(false)
  const walk = () => {
    if (cur.length === n) {
      const d = defenseVs(us, them, [...cur]).drtg
      if (d < bestD) (bestD = d), (best = [...cur])
      return
    }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue
      used[j] = true
      cur.push(j)
      walk()
      cur.pop()
      used[j] = false
    }
  }
  walk()
  return best
}

/**
 * MATCHUPS WITH TEETH (recal_60): every pairing generates edge. The attacker brings his best zone
 * at his usage; the defender answers with perdef outside, rimprot inside, and his size against the
 * attacker's height. Positive edge = the attacker wins the pairing. Each edge is clamped +-6 and
 * usage-weighted into ONE team term, and the assignment — naive, optimal, or the player's own
 * board — decides who absorbs whom. Optimal is the best of all 120 boards over this same table.
 */
export function pairingEdge(defender: Player, attacker: Player, atkUsg: number): number {
  const a = defender.attrs
  const b = attacker.attrs
  const wOut = b['3pt'] / (b['3pt'] + b.rim + 1e-9)
  const zone = wOut * (b['3pt'] - a.perdef) + (1 - wOut) * (b.rim - a.rimprot)
  const size = Math.max(-4, Math.min(6, (b.height - a.height) * 0.6))
  // usage gates the whole pairing: a man who never attacks cannot cash his edge
  return Math.max(-6, Math.min(6, (zone * 0.09 + size * 0.35) * Math.min(1.5, atkUsg / 20)))
}

/** The full 5x5 table: E[i][j] = our defender i against their attacker j. */
export const pairingTable = (us: Player[], them: Player[], bUsg: number[]): number[][] =>
  us.map((d) => them.map((o, j) => pairingEdge(d, o, bUsg[j] ?? 20)))

/**
 * The usage-weighted team term for a given board (map[i] = the attacker our i guards), CENTERED
 * per attacker on the table's own column mean — the term reads how much better or worse this board
 * absorbs each man than an average assignment would, so choosing boards moves the margin without
 * moving the league's scoring level.
 */
export function pairingTerm(E: number[][], map: number[], bUsg: number[]): number {
  const totU = bUsg.reduce((s, x) => s + x, 0) || 1
  const n = E.length
  let t = 0
  for (let i = 0; i < map.length; i++) {
    const j = map[i]
    let col = 0
    for (let r = 0; r < n; r++) col += E[r][j]
    t += ((bUsg[j] ?? 20) / totU) * (E[i][j] - col / n)
  }
  return t
}

/** The best board over the table alone — 120 cheap permutations, no recursion into defenseVs. */
export function bestBoard(E: number[][], bUsg: number[]): number[] {
  const n = E.length
  let best: number[] = Array.from({ length: n }, (_, i) => i)
  let bestT = Infinity
  const cur: number[] = []
  const used = new Array(n).fill(false)
  const walk = () => {
    if (cur.length === n) {
      const t = pairingTerm(E, cur, bUsg)
      if (t < bestT) (bestT = t), (best = [...cur])
      return
    }
    for (let j = 0; j < n; j++) {
      if (!used[j]) {
        used[j] = true
        cur.push(j)
        walk()
        cur.pop()
        used[j] = false
      }
    }
  }
  walk()
  return best
}

/** DRtg pts per point of the usage-weighted pairing term — sized so the full team lever spans ~+-3.5 margin. */
export const PAIR_SCALE = 22.3

/** DRtg of US defending THEM. Defense is a property of the pairing. 1:1 with defense_vs (assignment = 'optimal'). */
export function defenseVs(us: Player[], them: Player[], assignment: Assignment = 'optimal'): DefenseVs {
  const K = MKNOBS
  const A = us.map((p) => p.attrs)
  const B = them.map((p) => p.attrs)
  const nA = A.length || 1
  const bUsg = B.map((b) => b.usg_raw)
  let star = 0
  for (let j = 1; j < B.length; j++) if (bUsg[j] > bUsg[star]) star = j
  const paintOrient =
    B.reduce((s, b, j) => s + b.rim * bUsg[j], 0) / Math.max(1, B.reduce((s, b, j) => s + (b.rim + b['3pt']) * bUsg[j], 0))
  // the actual matchups, when the coach (or the player) chose them
  const map: number[] | null =
    assignment === 'optimal' || A.length !== B.length || !A.length
      ? null
      : assignment === 'naive'
        ? naiveAssignment(us, them)
        : assignment.length === A.length && new Set(assignment).size === A.length && assignment.every((j) => j >= 0 && j < B.length)
          ? assignment
          : naiveAssignment(us, them) // a broken board is the untrained coach's board, never the engine's
  // ANCHOR: hidden on their least-shooting player; degrades vs 5-out
  const rp = A.map((a, i) => [a.rimprot, i] as const).sort((x, y) => y[0] - x[0] || x[1] - y[1])
  const rp1 = rp[1]?.[0] ?? 0
  const anchorRaw = (rp[0]?.[0] ?? 0) + 0.35 * rp1 * (rp1 / 99)
  const anchorIdx = rp[0]?.[1] ?? -1
  let worstShooter = 0
  for (let j = 1; j < B.length; j++) if (B[j]['3pt'] < B[worstShooter]['3pt']) worstShooter = j
  // with a map the anchor stands on whoever he was given, shooter or not
  const anchorOn = map ? map[anchorIdx] : worstShooter
  const minOppOut = B.length ? B[anchorOn]['3pt'] : 0
  const hide = minOppOut < K.HIDE_OUT ? 1 : Math.max(0.15, 1 - (minOppOut - K.HIDE_OUT) / 50)
  const anchor = anchorRaw * hide
  // PROTECTION: covers holes up to capacity, only against paint-hunting offense.
  // Assigned: the anchor protects from where he stands, so his man's paint share gates it.
  const deficit = A.reduce((s, a, i) => (i === anchorIdx ? s : s + Math.max(0, 60 - a.perdef)), 0)
  const guardedPaint = map && B[anchorOn] ? B[anchorOn].rim / (B[anchorOn].rim + B[anchorOn]['3pt'] + 1e-9) : paintOrient
  const cover = Math.min(deficit, K.ANCHOR_CAP * (anchor / 99)) * Math.min(1, Math.min(paintOrient, guardedPaint) * 2)
  const effDi = (A.reduce((s, a) => s + a.perdef, 0) + cover) / 5
  // EVERY PAIRING GENERATES EDGE (recal_60, replacing the lone hunted-man term): the board —
  // naive, the player's own, or the best of all 120 — decides who absorbs whom, and the whole
  // usage-weighted table lands on the DRtg. The hunt is now simply the star's row of the table.
  const bs = B[star]
  const starPaint = bs ? bs.rim / (bs.rim + bs['3pt'] + 1e-9) : 0
  const E = us.length === them.length && us.length ? pairingTable(us, them, bUsg) : null
  const bestB = E ? bestBoard(E, bUsg) : null
  const board = E ? (map ?? bestB) : null
  const weakIdx = board ? board.indexOf(star) : -1
  // the penalty is RELATIVE TO PERFECT COACHING: the best of all 120 boards pays nothing, and every
  // other board pays for exactly the edges it concedes past that — so the lever moves the margin
  // without moving the league's scoring level.
  const huntPen = E && board && bestB ? PAIR_SCALE * (pairingTerm(E, board, bUsg) - pairingTerm(E, bestB, bUsg)) : 0
  // STEALS: on-ball — the top disruptor works the star (optimal) or the man he was given (assigned)
  let topPdIdx = 0
  for (let i = 1; i < A.length; i++) if (A[i].perimdisrupt > A[topPdIdx].perimdisrupt) topPdIdx = i
  const topPd = A.length ? A[topPdIdx].perimdisrupt : 0
  // on-ball pressure follows the ball: the star, whoever is nominally on him
  const mark = bs
  const markUsg = bs ? bUsg[star] : 0
  const onball = topPd * ((99 - (mark?.ballsec ?? 0)) / 99) * (markUsg / 25)
  const team = A.reduce((s, a) => s + a.perimdisrupt, 0) / 5
  const steals = K.ONBALL_SPLIT * onball + (1 - K.ONBALL_SPLIT) * team
  // GLASS
  const d = A.map((a) => a.drb).sort((x, y) => y - x)
  const o = B.map((b) => b.orb).sort((x, y) => y - x)
  const sumFrom = (xs: number[], k: number) => xs.slice(k).reduce((s, x) => s + x, 0)
  const glass = (d[0] ?? 0) + 0.5 * (d[1] ?? 0) + 0.1 * sumFrom(d, 2) - ((o[0] ?? 0) + 0.5 * (o[1] ?? 0) + 0.25 * sumFrom(o, 2))
  const didx = 0.42 * effDi + 0.26 * anchor * 0.9 + 0.2 * Math.min(99, steals) * 0.9 + 0.12 * Math.max(0, 60 + glass / 4)
  let drtg = 110 - K.DRTG_COEF * (didx - 55) + huntPen
  const discPts = (0.03 * A.reduce((s, a) => s + Math.max(0, 55 - a.discipline), 0) / 5) * 3
  drtg += discPts
  void nA
  return { drtg, steals: Math.min(99, steals), star, worstShooter: anchorOn, minOppOut, hide, paintOrient, starPaint, anchor, huntPen, anchorIdx, weakIdx, cover, effDi, onball, team, glass, discPts, didx, map }
}

/** OFF + transition − DRtg, against this opponent. 1:1 with score_vs. */
export function scoreVs(us: Player[], them: Player[], assignment: Assignment = 'optimal'): { off: number; drtg: number; net: number; d: DefenseVs } {
  const { off } = teamOffense(us)
  const d = defenseVs(us, them, assignment)
  const o = off + MKNOBS.STEAL_PTS * d.steals
  return { off: o, drtg: d.drtg, net: o - d.drtg, d }
}

/** The matchup margin: how much better we rate against them than they against us. */
/** Our assignment is ours to choose; the AI opponent always plays optimal. */
export const matchupMargin = (us: Player[], them: Player[], assignment: Assignment = 'optimal') => scoreVs(us, them, assignment).net - scoreVs(them, us).net

/** The three reads on an opponent the draft screen shows. */
export interface Reads {
  worstShooter: { name: string; out: number }
  fiveOut: boolean
  star: { name: string; usg: number; ballsec: number }
  /** 0..1 share of usage-weighted rim vs rim+out. */
  paintOrient: number
}
export function readsOf(them: Player[]): Reads {
  const d = defenseVs(them.slice(0, 1), them) // only the opponent side of the derivation matters
  const ws = them[d.worstShooter]
  const st = them[d.star]
  return {
    worstShooter: { name: ws.name, out: ws.attrs['3pt'] },
    fiveOut: d.minOppOut >= MKNOBS.HIDE_OUT,
    star: { name: st.name, usg: st.attrs.usg_raw, ballsec: st.attrs.ballsec },
    paintOrient: d.paintOrient,
  }
}

export interface TeamRating {
  off: number
  didx: number
  drtg: number
  net: number
}

/** A lineup on its own (no opponent): offense + transition, standalone defense v2. */
export function teamRating(five: Player[]): TeamRating {
  const { off } = teamOffense(five)
  const o = off + transitionBonus(five)
  const { didx, drtg } = teamDefense(five)
  return { off: o, didx, drtg, net: o - drtg }
}

// ---------- 0-100 TEAM RATINGS (opponent-independent) + MATCHUP SWING ----------
const ref = (name: string, kw: Partial<Attrs>): Player => ({
  name,
  player: name,
  peak_season: 0,
  talent: 70,
  ovr: 50,
  marg: 50,   // the reference five is the yardstick, so its own marginal value is the middle by construction
  o_ovr: 50,
  d_ovr: 50,
  big: false,
  in: 50,
  out: 50,
  id: 50,
  pd: 50,
  attrs: {
    '3pt': 55, rim: 50, mid: 50, ft: 76, fouldraw: 50, orb: 30, drb: 45, playvol: 45, ballsec: 55, volume: 50,
    efficiency: 55, durability: 60, rimprot: 30, perimdisrupt: 50, perdef: 52, discipline: 55, rim_mid_measured: true,
    height: 78, usg_raw: 20.0, ts_raw: 0.57, ts_rel: 0.57,
    ...kw,
  },
})

/** A realistic league-average positional five: shapes exist, so anchors, hunts and steals register against it. */
export const REF_FIVE: Player[] = [
  ref('Avg PG', { usg_raw: 24.0, '3pt': 62, playvol: 78, ballsec: 62, perimdisrupt: 58, drb: 35 }),
  ref('Avg SG', { usg_raw: 22.0, '3pt': 60, mid: 55, perimdisrupt: 55 }),
  ref('Avg SF', { usg_raw: 20.0, '3pt': 55, mid: 55, perdef: 55, drb: 50 }),
  ref('Avg PF', { usg_raw: 18.0, '3pt': 45, rim: 60, rimprot: 52, drb: 60, orb: 50 }),
  ref('Avg C', { usg_raw: 16.0, '3pt': 25, rim: 68, rimprot: 68, drb: 68, orb: 62, ft: 66, fouldraw: 58 }),
]

/**
 * EMPIRICAL anchoring: 50 = the median of plausible drafted fives sampled from
 * the pool — not the synthetic reference five, which has no weak link and made
 * every real roster read as bad defense. Typical fives cluster around 50/50,
 * walls ~90+ DEF; bad-defense extremes compress upward a little (accepted).
 */
export const RATING_SCALE = { K_OFF: 3.0, K_DEF: 8.0 } as const
const REF_OFF = 128.3   // re-derived after recal_13/14: the median of the 120 campaign levels
// sits at 128.3 raw offense once bench rates shrink toward the middle, so that is what reads 50.
// Mirrors data/team_rating.py (the parity test enforces the pair).
// recal_60 PARITY CALIBRATION: the defensive evidence campaign (DFG floors, DBPM relief, voted
// ceilings, the 6ft+ feed) inflated the defensive pool and the display dials drifted 23 points
// apart (OFF mean 45.6, DEF mean 69.1 over 300 random fives). One dial moves: the display DRtg
// reference, until the two means match. Orderings within each side are untouched by construction.
const REF_DRTG = 108.85

/** Opponent-independent OFF and DEF, 1–99. 50 = a median drafted five. Display only. */
export function ratings100(five: Player[]): { off: number; def: number; offRaw: number; drtgRef: number } {
  const offRaw = teamOffense(five).off
  const drtgRef = defenseVs(five, REF_FIVE).drtg
  const off = Math.round(Math.max(1, Math.min(99, 50 + (offRaw - REF_OFF) * RATING_SCALE.K_OFF)))
  const def = Math.round(Math.max(1, Math.min(99, 50 + (REF_DRTG - drtgRef) * RATING_SCALE.K_DEF)))
  return { off, def, offRaw, drtgRef }
}

/** How many pts/game THIS pairing shifts against both teams' neutral baselines. Positive favours us. */
export function matchupSwing(us: Player[], them: Player[]): number {
  const base = scoreVs(us, REF_FIVE).net - scoreVs(them, REF_FIVE).net
  return matchupMargin(us, them) - base
}
