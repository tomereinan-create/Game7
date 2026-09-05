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
  AMP_MAX: 0.26, // recal_140: 0.22 -> 0.26, now applied to each man's RECEIVED feed
  FEED_REF: 0.5502, // recal_140: re-derived pool mean of the usage-weighted RECEIVED feed
  /** recal_140: the share of a man's shot quality set by the best creator BESIDE him. */
  CREATE_SHARE: 0.2,
  CLOG_FREE: 0.71, // recal_110: a man who creates at this level makes his own space
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
  // recal_74 (his go: "Run 74" — the correction recal_70 recorded and recal_73 proposed): the
  // channel's ABSOLUTE SCALE halves, 0.0012 -> 0.0006. External anchor: real second-chance scoring
  // separates the league's best and worst crash teams by ~6 pts/100; this channel was spreading
  // ~12-13 index points between them (Philly '88 +12.8, Houston '26 +12.4 vs quiet-glass fives at
  // ~+1), roughly double reality. Halving the per-point price brings the measured full-wheel spread
  // to ~6 while touching no team-specific term — the orb aggregation, pivot, and the r70 miss-share
  // factor are all unchanged. Mirrored exactly in data/team_rating.py (the parity test gates it).
  ORB_PER_PT: 0.0006, // second-chance multiplier per point of orb above 50
  ORB_PIVOT: 50,
  // recal_70 (our own round — the design side titled "the ORB second-chance channel" and never sent
  // the body): second chances are EXTRA POSSESSIONS. Their VALUE is the team's own conversion — the
  // multiplicative form (off x orbMult) already prices every extra possession at the team's own
  // points-per-possession, so no separate value term belongs here. Their VOLUME scales with the
  // team's true miss share — and that was the bug: the old factor, 1 + (0.60 - wTS)/0.08 clamped
  // 0.5..1.5, put a 3x pricing swing on an 8-TS-point window centered mid-league, so ordinary teams
  // sat ON the rails (Houston '26 wTS .552 -> 1.5x, OKC '26 wTS .641 -> 0.5x) and bad shooting
  // became the second-largest variance owner of the league OFF index (12.9%, receipt 68). The
  // physical volume term is the miss-share ratio itself: (1 - wTS)/(1 - MISS_TS), = 1.0 at the same
  // 0.60 anchor, ~4x flatter (.552 -> 1.12, .641 -> 0.90). Safety rails 0.8..1.2 replace the old
  // clamp; MISS_SPAN retired with the old slope. Mirrored exactly in data/team_rating.py.
  MISS_TS: 0.6, // normalization anchor: a wTS-0.60 team prices its glass at exactly 1.0
  MISS_LO: 0.8,
  MISS_HI: 1.2,
  // recal_119 — POSSESSION LOSS. TOVhat = TOV_INT - TOV_SLOPE × wball, the OLS of every fieldable
  // five's real team TOV% on its usage-weighted ball security (1,255 fives, pooled r -0.500,
  // within-season rho -0.718). TOV_REF is the league's own mean, so the channel redistributes
  // around it exactly as FEED_REF does for creation. Mirrors data/team_rating.py (parity test).
  TOV_INT: 18.1, // % turnovers at ball security 0
  TOV_SLOPE: 0.0744, // % turnovers shed per point of usage-weighted ball security
  TOV_REF: 13.78, // the league's own mean TOV% over all 1,255 fives — the pivot
  TOV_SIZE: 0.45, // HOW MUCH of the fitted differential is priced — ANCHOR-BOUND, not fit-chosen
  TOV_LO: 9.0, // rails, just outside the observed league range (9.9 .. 18.7)
  TOV_HI: 19.0,
  // recal_64 (design-side "62"): FIT PAYS. The reconciliation channels were worth ~+-1.5 team
  // offense; widened so perfect fit gains up to +4 and friction loses up to -4. WIDEN calibrated
  // to the round's named target (OKC '26 top-3 among 2026 team OFF), CAP is the spec's bound.
  FIT_WIDEN: 2.7,
  FIT_CAP: 4,
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
  /** recal_119: the share of possessions the five keeps, priced off its ball security. */
  tovMult: number
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

  /**
    * CREATION AMPLIFICATION — recal_110, his ruling: "there is more work to do" (on the Bulls '96
    * reading 8th of 29 on offence while the real 1996 board has them 1st) and "How is this team 47
    * OFF with 2 all time great players" (Lakers '00). Three things were wrong with this one line.
    *
    *   (1) IT WAS THROTTLED BY max(0, 1 - u2/30), so a five's creation was credited only to its
    *       LOW-usage men. That is backwards: a great table-setter's passing raises the quality of
    *       every shot on the floor, and most of a team's shots are taken by its high-usage men. The
    *       Bulls '96 feed is 0.640 against Seattle '96's 0.517 — the widest gap on that board — and
    *       Jordan at 28.7 usage was allowed 4% of it.
    *   (2) IT WAS IN THE WRONG PLACE. baseN below was built from e2 and nothing else, and e3/e4
    *       reached `off` only through `fit`, which is clamped to +-4. Shot quality created by the
    *       five's passers is part of the BASELINE, not a +-4 fit bonus, so baseN now reads e3.
    *   (3) 0.06 WAS TOO SMALL, and as a bare multiplier it INFLATED rather than redistributed: at
    *       (1 + AMP*feed) the fives with the most offence and the most creation gained the most
    *       absolute points, the Warriors '17 summit ran away, and the Bulls rose from 8th to 5th of
    *       1996 while their DIAL FELL 68 -> 66. Centring on the league's own mean feed (FEED_REF,
    *       the mean over all 1,255 fieldable fives) holds the level and the spread and lets only the
    *       differential land. 0.22 was chosen on the fit, not on the two named cases: the
    *       within-season Spearman of offRaw against real ORtg over 47 seasons goes 0.726 -> 0.762.
    *
    * 1:1 with data/team_rating.py; data/parity_check.py and tests/parity.test.ts gate the pair.
    */
  /**
   * recal_140 — THE FEED IS RECEIVED, NOT AVERAGED. His ruling: "Suns 05 agree" (the '05 Suns,
   * real ORtg 114.5 and 1st of 30, reading team OFF 65). recal_110 left the amplification as ONE
   * number for the whole five: the usage-weighted MEAN creation. That aggregate is diluted by the
   * men a creator sets UP — Nash '05 creates at .827 on 20.9 usage while Stoudemire finishes at
   * .328 on 27.6, so the five's feed came out .510, BELOW the league mean, and the term charged the
   * best passing offence of 2005 a small penalty for having a finisher. A finisher's shots are the
   * creator's shots; his shot quality is not his own passing rate. So the feed is a property of the
   * SHOOTER now: recv_i = (1 - CREATE_SHARE)·c_i + CREATE_SHARE·max_{j≠i} c_j, and FEED_REF is the
   * re-derived pool mean of the usage-weighted recv, so the term still redistributes around the
   * league. The stronger reading — "let the TOP creator anchor the feed" — was measured and
   * REFUTED: on the term's own truth column the five's mean reads r +0.086 and the maximum r
   * -0.046, and sharpening toward the maximum costs fit at every size. See data/rounds/140.json.
   *
   * 1:1 with data/team_rating.py; data/parity_check.py and tests/parity.test.ts gate the pair.
   */
  const recv = c.map((ci, i) => {
    let best = 0
    for (let j = 0; j < n; j++) if (j !== i) best = Math.max(best, c[j])
    return (1 - K.CREATE_SHARE) * ci + K.CREATE_SHARE * best
  })
  const e3 = e2.map((x, i) => x * (1 + K.AMP_MAX * (recv[i] - K.FEED_REF)))

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
      // low spacing clogs the paint — but recal_110: only for a man who NEEDS the space. A paint
      // diet is not a paint dependency. Shaquille O'Neal '00 was taking the full -7% for Harper's
      // and Horry's shooting while creating his own shot at 31.5 usage, and the Lakers' raw fit was
      // -8.07 against a -4 clamp. At CLOG_FREE creation the penalty is gone entirely.
      const free = Math.max(0, 1 - c[i] / K.CLOG_FREE)
      x *= 1 - K.CLOG_MAX * free * (1 - Math.min(1, spc / K.SPACING_FULL))
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

  // the neutral baseline is the repriced line with NO interaction channels; the gap is the fit
  const baseN = u2.reduce((acc, ui, i) => acc + ui * e3[i], 0) * 2 // recal_110: repriced + created
  const baseF = u2.reduce((acc, ui, i) => acc + ui * e4[i], 0) * 2
  const fit = clamp(K.FIT_WIDEN * (baseF - baseN), -K.FIT_CAP, K.FIT_CAP)
  const base = baseN + fit
  // fouldraw × FT: manufactured points
  const ftPts = u2.reduce((acc, ui, i) => acc + ui * (A[i].fouldraw / 99) * (A[i].ft / 100), 0) * K.FT_POINTS
  let off = base + ftPts
  /**
   * POSSESSION LOSS — recal_119, his ruling: "For the scout, I agree with 3,4,5,6,7" (item 7:
   * "Boston Celtics '24 (best five) team OFF 55 -> near 72"). THE CHANNEL DID NOT EXIST. Everything
   * above prices what a five does WITH a possession — usage reconciliation, repriced TS, creation,
   * the interactions, the free throws — and nothing priced whether the five KEEPS the possession. A
   * trip that ends in a turnover scores zero however efficient the shooters are, and real offensive
   * ratings know it: across all 1,255 fieldable fives real ORtg correlates +0.548 with -TOV% while
   * offRaw correlated only +0.256. The Celtics '24 are the case that showed it — real ORtg 123.2
   * (1st of 30), real TS 1st, TOV% 10.8 (2nd), MOV +11.3 (1st) — and the engine read them 12th of
   * the 26 fieldable 2024 fives off a usage-weighted TS of .6077 that is exactly right.
   *
   * THE FORM IS PHYSICAL: ORtg = (points per scoring chance) × (chances kept), so all of `off` is
   * multiplied by the kept share, normalised at the league's own mean — the shape recal_70 gave the
   * glass. TOVhat comes from the CARDS: the five's usage-weighted ball security, the aggregate that
   * carries the signal (within-season rho +0.718 with -TOV%, against +0.666 for the plain mean and
   * +0.278 for the weakest link). TOV_SIZE ships at 0.45 because the PINS bind long before the fit
   * does — see the frontier in data/rounds/119.json, and the round's decline of the 72.
   */
  const wball = u2.reduce((acc, ui, i) => acc + ui * A[i].ballsec, 0) / K.TEAM_USG
  const tovHat = K.TOV_INT - K.TOV_SLOPE * wball
  const tov = clamp(K.TOV_REF + K.TOV_SIZE * (tovHat - K.TOV_REF), K.TOV_LO, K.TOV_HI)
  const tovMult = (1 - tov / 100) / (1 - K.TOV_REF / 100)
  off *= tovMult
  // ORB feeds on misses
  const wTS = u2.reduce((acc, ui, i) => acc + ui * e4[i], 0) / K.TEAM_USG
  const miss = clamp((1 - wTS) / (1 - K.MISS_TS), K.MISS_LO, K.MISS_HI) // recal_70: the miss-share ratio, not the 3x rail ride
  const orbMult = 1 + K.ORB_PER_PT * A.reduce((acc, a) => acc + Math.max(0, a.orb - K.ORB_PIVOT), 0) * miss
  off *= orbMult

  return {
    off,
    base,
    ftPts,
    tovMult,
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
  // ANCHOR_CAP (37.5) is GONE — recal_94 removed the `cover` refund it sized. See defenseVs.
  ONBALL_SPLIT: 0.6, // steals: 60% on-ball (matchup-driven), 40% team/passing-lane
  HUNT_SCALE: 0.1, // DRtg pts per unit of hunted-man exposure
  DRTG_COEF: 0.181, // calibrated to the 60/40 offense/defense ruling; re-derived after recal_12's
  // perdef purification widened the raw spread to 12.95 (band is 8-11). Mirrors team_rating.py.
  STEAL_PTS: 0.024, // transition: OFF per steal-generation point (score_vs)
  // recal_122 — the rim anchor's CAP becomes a KNEE. recal_94 capped anchorRaw at 99 (it ran to 131
  // and paid a second big twice off the top of a 1-99 scale) and the cap was right, but it is a DEAD
  // CEILING: 626 of the 1,255 fieldable fives sit at exactly 99, so half the board has the same rim
  // reading and a five's best rim protector earns nothing. Unchanged below the knee; above it a
  // point of raw anchor is still worth half a point.
  ANCHOR_KNEE: 99.0,
  ANCHOR_SOFT: 0.5,
  // recal_133 — THE SECOND RIM PROTECTOR'S SHARE, and the first time this constant was measured
  // against the outcome it is supposed to produce. His ruling: "I agree with Philadelphia 76ers '85
  // being lower, but not 55. They have 5 good defenders, with 2 great. This is for sure 90+."
  // anchorRaw = rimprot1 + ANCHOR_2ND * rimprot2^2/99, and 0.35 was inherited from DKNOBS in the very
  // first defence build; nothing ever tested it. bref carries the channel's own truth column,
  // opp_e_fg_percent — the anchor exists to hold the opponent's shooting down — and the within-season
  // Spearman of anchorRaw against it over the 1,255 fieldable team-seasons peaks flat across
  // 0.15-0.20 (+0.5289 / +0.5275) and falls away on both sides: 0.10 +0.5228, 0.25 +0.5240,
  // 0.35 +0.5180 (shipped), 0.45 +0.5087, 0.60 +0.4871, 0.00 +0.5086. Two bigs cannot both protect the
  // same rim on the same possession; the redundancy discount was too generous by about half. 0.20 is
  // the conservative end of the plateau and the only value on it that holds the Warriors '17 anchor
  // (recal_122, at its floor). Whole-dial fit rises with it: within-season DEF rho +0.7764 -> +0.7781.
  // DKNOBS.ANCHOR_2ND, the standalone `teamDefense` version, is untouched — recal_94's precedent for
  // DISC_FREEPTS: it is a different layer, off the gauge path and off the resolver's path.
  ANCHOR_2ND: 0.2,
  // The two recal_122 changes read the 1,255-five pool 0.195 DRtg points better, and the DEF gauge
  // block in src/engine/gauges.ts is FROZEN (recal_108: do not re-derive it). This constant holds the
  // pool's mean drtgRef exactly where recal_101 froze the gauge on it, so the round re-shapes the
  // board without lifting it. Without it every dial rises ~4 points and the summit crowds.
  // RE-DERIVED by recal_133 (1.0773 -> 0.4523) on the same rule: the pool's mean drtgRef is held at
  // 110.047736 to six places, because a smaller second-anchor credit lowers the whole board.
  DIDX_HOLD: 0.4523,
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
  /** The five's mean perdef. recal_94: the `cover` refund that used to be added here is gone. */
  effDi: number
  onball: number
  team: number
  glass: number
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
  const anchorRaw = (rp[0]?.[0] ?? 0) + K.ANCHOR_2ND * rp1 * (rp1 / 99) // recal_133: 0.35 -> 0.20
  const anchorIdx = rp[0]?.[1] ?? -1
  let worstShooter = 0
  for (let j = 1; j < B.length; j++) if (B[j]['3pt'] < B[worstShooter]['3pt']) worstShooter = j
  // with a map the anchor stands on whoever he was given, shooter or not
  const anchorOn = map ? map[anchorIdx] : worstShooter
  const minOppOut = B.length ? B[anchorOn]['3pt'] : 0
  const hide = minOppOut < K.HIDE_OUT ? 1 : Math.max(0.15, 1 - (minOppOut - K.HIDE_OUT) / 50)
  const anchor = anchorRaw * hide
  // recal_122: the cap is a KNEE, not a ceiling — see MKNOBS ANCHOR_KNEE / ANCHOR_SOFT.
  const anc = anchor <= K.ANCHOR_KNEE ? anchor : K.ANCHOR_KNEE + (anchor - K.ANCHOR_KNEE) * K.ANCHOR_SOFT
  // recal_94: PROTECTION (`cover`) IS GONE. It refunded the perdef deficit of the four non-anchor
  // defenders whenever the five had a rim anchor — so a bad perimeter five with a big read as a
  // good perimeter five. Measured on the 1,255 fieldable team-seasons, removing it alone took the
  // within-season DEF fit from rho +0.587 to +0.654. The comment it replaced claimed the term was
  // gated by paint-hunting, but the gate min(1, paintOrient*2) is 1.00 against the reference five
  // and against every real offense in the wheel, so it never gated anything.
  // recal_122: THE FIVE'S PERDEF IS WEIGHTED BY THE LOAD EACH MAN DEFENDS, not averaged flat.
  // His ruling: "2 Elite defenders, 3 decent. how 72 def?" — the flat mean is why two elite men are
  // averaged away by three ordinary ones. The weights are not fitted: they are the OPPONENT'S OWN
  // usage shares, assigned assortatively (our best defender takes their biggest load), which against
  // REF_FIVE is .24/.22/.20/.18/.16. Defence is a property of the pairing, so the profile sharpens by
  // itself against a five that runs everything through one man. 1:1 with team_rating.py's eff_di.
  const pdDesc = A.map((a) => a.perdef).sort((x, y) => y - x)
  const load = bUsg.slice().sort((x, y) => y - x)
  const totLoad = bUsg.reduce((s, u) => s + u, 0) || 1
  let effDi = 0
  for (let i = 0; i < Math.min(pdDesc.length, load.length); i++) effDi += pdDesc[i] * (load[i] / totLoad)
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
  /**
   * TEAM DEFENCE IS THE FIVE'S PERDEF AGAIN (recal_94, his ruling: "Philly 2026 def too high, I
   * dont understand the system it needs a full reset. OFF DEF feels off for too many teams" —
   * and, on the diagnosis, "Run it").
   *
   * MEASURED, not guessed. Truth is data/bref/Team Summaries.csv (o_rtg / d_rtg), fit is the
   * Spearman of the dial against real DRtg WITHIN each season, averaged over the 47 seasons of
   * the 1,255 fieldable team-seasons on the wheel. The shipped formula scored DEF rho +0.587
   * while the bare sum of the five's perdef scored +0.763 — every term stacked on top of perdef
   * was subtracting signal. Three of them are the reason:
   *
   *   1. THE ANCHOR WAS UNCAPPED. `teamDefense` (the standalone lineup path) has always written
   *      `min(99, anchor)`; this line did not, and anchorRaw = rimprot1 + 0.35*rimprot2^2/99 runs
   *      past 99 on 902 of the 1,255 fives (max 131.3, Bucks '21). Two rim protectors paid twice,
   *      off the top of a 1-99 scale. Capped here exactly as teamDefense caps it.
   *   2. `cover` — see above, removed.
   *   3. `discPts`, the discipline penalty, was the LARGEST variance channel of drtgRef (sd 0.588
   *      against a 5.84-point all-time range, i.e. up to ~73 dial points) and it pointed the WRONG
   *      WAY: mean discipline of the five correlates +0.075 (Spearman) with BAD real defence.
   *      Fouling is how good defences play. Removed from the matchup path. DKNOBS.DISC_FREEPTS,
   *      the standalone `teamDefense` version, is untouched — it is a different layer.
   *
   * WEIGHTS. With the anchor capped and cover gone, the anchor's remaining weight still overpaid:
   * 0.26 -> 0.13, the 0.13 moved onto perdef (0.42 -> 0.55) so the didx level is held. Steals
   * 0.20 -> 0.12 on the same measurement (+0.004; the term is real but small, and its transition
   * value is priced separately in scoreVs via STEAL_PTS).
   *
   * WHAT IT COST. Nothing on offense — `teamOffense` is untouched and OFF rho is +0.712 before
   * and after (all 1,255 offRaw readings bit-identical). DEF rho +0.588 -> +0.763 overall; per era
   * 80s .536->.777, 90s .599->.799, 00s .597->.791, 10s .641->.730, 20s .557->.697. Philadelphia '26
   * (real DRtg 14th of the 24 fieldable 2026 teams) goes from DEF 80 / 1st to DEF 50 / 9th. DEF_WORST/DEF_MID/DEF_TOP in
   * src/engine/gauges.ts were re-frozen from the wheel sweep in the same commit, per recal_71's law.
   *
   * STILL DEAD, recorded and NOT touched this round: `huntPen` is 0 and `hide` is 1 for all 1,255
   * gauge readings (assignment 'optimal' makes board === bestB; REF_FIVE's worst shooter is 3pt 25,
   * below HIDE_OUT 45). They are live in the resolver, where the board is not the best board.
   */
  /**
   * recal_122 (his ruling: "2 Elite defenders, 3 decent. how 72 def?"). TWO CHANGES, both measured on
   * the same 47-season within-season Spearman this block is built on, and both level-held:
   *   1. effDi is USAGE-WEIGHTED (see above): the five's perdef read through the loads its men
   *      actually defend rather than a flat mean.
   *   2. Math.min(99, anchor) becomes a KNEE (MKNOBS ANCHOR_KNEE/ANCHOR_SOFT): the cap was tying 626
   *      of the 1,255 fives at exactly 99, so the five's best rim protector was worth nothing. Beside
   *      the five's mean perdef, a season-z regression over the 1,255 pays the uncapped best rim
   *      protector +0.155 and the capped anchor only +0.076 — the ceiling was eating a live channel,
   *      and un-tying it is where this round's fit comes from.
   * FIT: within-season rho +0.7742 -> +0.7767 (80s .739, 90s .703, 00s .719, 10s .674, 20s .601).
   * WHAT WAS DECLINED, and why it is written down here: a genuinely TOP-HEAVY perdef aggregation (a
   * top-2 premium, or any tilt past the usage profile) is what his sentence literally asks for and the
   * 47 seasons refuse it. Entered as five order statistics, the five's BEST defender is the LEAST
   * predictive of them (+0.076 against +0.19..+0.23 for the other four), and a top-2 premium entered
   * beside the mean carries a NEGATIVE partial (-0.27 all-time, -0.23 pre-2014, -0.43 tracking era).
   * Every tilt past .24/.22/.20/.18/.16 costs fit monotonically.
   */
  const didx =
    0.55 * effDi + 0.13 * anc * 0.9 + 0.12 * Math.min(99, steals) * 0.9 + 0.12 * Math.max(0, 60 + glass / 4) - K.DIDX_HOLD
  const drtg = 110 - K.DRTG_COEF * (didx - 55) + huntPen
  void nA
  return { drtg, steals: Math.min(99, steals), star, worstShooter: anchorOn, minOppOut, hide, paintOrient, starPaint, anchor, huntPen, anchorIdx, weakIdx, effDi, onball, team, glass, didx, map }
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
const REF_OFF = 124.03  // re-derived after recal_74's ORB-scale halving lowered the league level
// (the constant's own definition below): the median of the 120 campaign levels
// sits at 128.3 raw offense once bench rates shrink toward the middle, so that is what reads 50.
// Mirrors data/team_rating.py (the parity test enforces the pair).
// recal_60 PARITY CALIBRATION: the defensive evidence campaign (DFG floors, DBPM relief, voted
// ceilings, the 6ft+ feed) inflated the defensive pool and the display dials drifted 23 points
// apart (OFF mean 45.6, DEF mean 69.1 over 300 random fives). One dial moves: the display DRtg
// reference, until the two means match. Orderings within each side are untouched by construction.
// recal_94 RE-DERIVED IT BY THAT SAME RULE, because the defenceVs reset moved the DRtg level:
// solved against recal_60's OWN sample and OWN gate (receipt 60's "PARITY over 300 random fives",
// means within 0.5): the OFF mean is 46.54 there and 109.83 is the DEF reference that matches it,
// which also holds receipt 67's wider gap check. data/team_rating.py's _REF_DRTG had drifted much
// further — it still carried recal_60's PRE-calibration 113.1, 4.25 points off this port — and is
// corrected to 109.83 in the same commit, so the pair is 1:1 again. Display only: nothing in the
// resolver reads these ints.
const REF_DRTG = 109.83

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
