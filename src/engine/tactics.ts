import { bestBoard, creation, KNOBS, naiveAssignment, pairingTable, teamOffense, usageSurplus } from './offense'
import type { BoxCtx } from './boxstats'

import type { Lineup, Player } from './types'

/**
 * DEATH MATCH TACTICS, picked on the My team screen. Every choice is priced the way the engine
 * prices everything: points of spread, added to the margin as `bonus` (the same term the coach
 * personas and the era handicap use — lineup axes are display, bonus is what the sim feels).
 *
 * THE HOUSE RULES APPLY. No cliffs: every price is a LINE through the personnel, so calling
 * "inside" with an inside five pays and calling it with a shooting five costs, continuously.
 * And nothing here is free: each pick is a fit question, not a stat stick — the whole set
 * ranges about ±3 points of spread between a five coached with the grain and one against it.
 */
export interface Tactics {
  /** The offense runs through him. Pays for a real number one, costs for a man who does not shoot. */
  scorer: string | null
  /** The ball is in his hands. Pays for a lead creator, costs for a finisher miscast as one. */
  playmaker: string | null
  /** Possessions, not quality: fast raises the night's noise for BOTH teams, slow lowers it. */
  tempo: 'slow' | 'normal' | 'fast'
  /**
   * PLAYSTYLES v2 (recal_58). Each style scores a FIT 0-100 from the chosen five, and the price is
   * 0.06 x (fit - 60), clamped +-2.5 — forcing a style the roster cannot run HURTS. Balanced is the
   * free default: no call, no fit, no price.
   */
  style: Style
  /**
   * How the five defends. Matchup is the default and free. Drop pays with a tower behind it and an
   * opponent who cannot shoot; switch is only as good as the worst man caught in it.
   */
  scheme: 'matchup' | 'drop' | 'switch'
  /** Attack their worst defender. Needs a creator to run it, and a victim to point him at. */
  hunt: boolean
  /** Send men to the offensive glass. Pays with rebounders, leaks transition without them. */
  crashOff: boolean
  /** Gang the defensive glass. Pays with rebounders, costs a little rim-running offense. */
  crashDef: boolean
}

export type Style = 'balanced' | 'fiveout' | 'pnr' | 'motion' | 'postup' | 'helio' | 'transition'
export const STYLES: { key: Style; label: string }[] = [
  { key: 'balanced', label: 'balanced' },
  { key: 'fiveout', label: 'five-out' },
  { key: 'pnr', label: 'pick-and-roll' },
  { key: 'motion', label: 'motion' },
  { key: 'postup', label: 'post-up' },
  { key: 'helio', label: 'helio' },
  { key: 'transition', label: 'transition' },
]

export const DEFAULT_TACTICS: Tactics = {
  scorer: null,
  playmaker: null,
  tempo: 'normal',
  style: 'balanced',
  scheme: 'matchup',
  hunt: false,
  crashOff: false,
  crashDef: false,
}

/**
 * PACE (recal_57, Tomer's design ratified) — tempo is a VOLUME-SURPLUS mechanic, replacing the old
 * flat sigma map. Both teams pick; the night's pace is their average. A surplus five has starved
 * shot-takers, so possessions feed it; a deficit five stretches role players, so possessions hurt.
 * It is RELATIVE — fast against a higher-surplus opponent helps THEM — and the margin term is
 * capped at +-2.5 points of spread. Fast also shrinks the night's variance (the favorite's friend);
 * slow adds chaos, the underdog's weapon even at volume parity.
 */
/**
 * THE DEVIATION TAX LAW (recal_59, permanent). Balanced/default is 0, always. Every deviation
 * carries an INTRINSIC COST plus a CONDITIONAL benefit, calibrated by the enforcement harness so
 * the oracle-best call averages >= +0.5 margin and a BLIND call averages -0.3 to -1.5. Tactics
 * reward READS: a player who clicks randomly must lose margin to one who leaves defaults alone.
 * The constants below are the taxes and slopes the harness ratified — tune them ONLY through it.
 * recal_62's card change (perimdisrupt trimmed in DEF) moved 1,298 OVRs and with them the harness's
 * ovr>=55 pool, so style/scheme/hunt were re-ratified through the harness: .42->.35, .85->.90, 3.65->3.50.
 */
export const TAX = {
  scorer: 0.55,
  playmaker: 0.5,
  tempo: 0.6,
  style: 0.35,
  scheme: 0.90,
  hunt: 3.50,
  crashOff: 0.68,
  crashDef: 0.6,
}

const TEMPO_LVL: Record<Tactics['tempo'], number> = { fast: 1, normal: 0, slow: -1 }
export function pace(self: Tactics['tempo'], opp: Tactics['tempo'], five: Player[], theirs: Player[], mastery = 0) {
  // the caller owns 3/4 of the night's pace (85% at Tempo control rank 3): the answer DRAGS the
  // game, it does not erase the call. Rank 2 halves the deviation tax — a trained bench wastes
  // less on the wrong night. The harness calibrates at mastery 0; ranks are paid for in stars.
  const selfW = mastery >= 3 ? 0.85 : 0.75
  const lvl = selfW * TEMPO_LVL[self] + (1 - selfW) * TEMPO_LVL[opp]
  const ours = usageSurplus(five)
  const others = usageSurplus(theirs)
  const tax = (self !== 'normal' ? TAX.tempo : 0) * (mastery >= 2 ? 0.5 : 1)
  return {
    lvl,
    ours,
    theirs: others,
    margin: clamp(lvl * 0.22 * (ours - others), -2.5, 2.5) - tax,
    sigmaMult: lvl > 0 ? 0.94 : lvl < 0 ? 1.08 : 1.0,
  }
}
/** The AI's call: fast when pace favors it, slow when it hurts, and slow at parity as the underdog. */
export function aiTempo(theirs: Player[], five: Player[], underdog: boolean): Tactics['tempo'] {
  const d = usageSurplus(theirs) - usageSurplus(five)
  return d > 2 ? 'fast' : d < -2 ? 'slow' : underdog ? 'slow' : 'normal'
}

/** A saved plan can name men who have since left the five. The plan survives; the names reset. */
export function reconcileTactics(t: Tactics, roster: string[] | null): Tactics {
  const names = roster ?? []
  return {
    ...t,
    scorer: t.scorer && names.includes(t.scorer) ? t.scorer : null,
    playmaker: t.playmaker && names.includes(t.playmaker) ? t.playmaker : null,
    // a save from the inside/outside era carries a style that no longer exists
    style: STYLES.some((x) => x.key === t.style) ? t.style : 'balanced',
  }
}

/**
 * THE PLAYBOOK GATE (his ruling: the Coach branch allows the tactics). Rank 1 opens the men and the
 * tempo, rank 2 the shot diet and the glass, rank 3 the scheme and the hunt. A call beyond the rank
 * is priced as if it were never made — a saved plan survives a respec, it just stops being heard.
 */
export function gateTactics(t: Tactics, rank: number): Tactics {
  return {
    ...t,
    scorer: rank >= 1 ? t.scorer : null,
    playmaker: rank >= 1 ? t.playmaker : null,
    tempo: rank >= 1 ? t.tempo : 'normal',
    style: rank >= 2 ? t.style : 'balanced',
    crashOff: rank >= 2 ? t.crashOff : false,
    crashDef: rank >= 2 ? t.crashDef : false,
    scheme: rank >= 3 ? t.scheme : 'matchup',
    hunt: rank >= 3 ? t.hunt : false,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const mean = (five: Player[], f: (p: Player) => number) => (five.length ? five.reduce((t, p) => t + f(p), 0) / five.length : 50)

/**
 * THE FIT of a style on a five, 0-100, his formulas verbatim (recal_58). Two gaps the round left
 * open are filled here and documented: motion's ball-stopper subtraction is -12 per ISO-shaped star
 * (volume >= 90 with playvol < 50), and post-up's "dominance-bonus presence" is proxied by
 * min(rim, volume) — the same two facts the o_score bonus keys on. Transition's opponent term
 * (their ball security, inverted) needs the matchup, so without one that quarter reads neutral (50).
 */
export function styleFit(style: Style, five: Player[], theirs?: Player[]): number {
  if (!five.length || style === 'balanced') return 60 // priced to zero
  const a = five.map((p) => p.attrs)
  const avg = (f: (x: Player['attrs']) => number) => a.reduce((t, x) => t + f(x), 0) / a.length
  switch (style) {
    case 'fiveout':
      return Math.min(...a.map((x) => x['3pt'])) * 0.6 + avg((x) => x['3pt']) * 0.4
    case 'pnr': {
      const handlers = five.filter((p) => p.attrs.playvol >= 70 && p.attrs.height <= 78)
      const handler = Math.max(0, ...handlers.map((p) => Math.min(p.attrs.playvol, p.attrs.volume)))
      const bigs = five.filter((p) => p.attrs.height >= 80)
      const dive = Math.max(0, ...bigs.map((p) => Math.min(p.attrs.rim, p.attrs.efficiency)))
      const hName = handlers.sort((x, y) => Math.min(y.attrs.playvol, y.attrs.volume) - Math.min(x.attrs.playvol, x.attrs.volume))[0]?.name
      const dName = bigs.sort((x, y) => Math.min(y.attrs.rim, y.attrs.efficiency) - Math.min(x.attrs.rim, x.attrs.efficiency))[0]?.name
      const rest = five.filter((p) => p.name !== hName && p.name !== dName)
      return 0.4 * handler + 0.35 * dive + 0.25 * mean(rest, (p) => p.attrs['3pt'])
    }
    case 'motion': {
      const stoppers = a.filter((x) => x.volume >= 90 && x.playvol < 50).length
      return 0.5 * avg((x) => x.ballsec) + 0.3 * avg((x) => x.playvol) + 0.2 * a.filter((x) => x['3pt'] >= 60).length * 20 - 12 * stoppers
    }
    case 'postup': {
      const bigs = five.filter((p) => p.attrs.height >= 81)
      const post = Math.max(0, ...bigs.map((p) => Math.min(p.attrs.rim, p.attrs.volume)))
      const pName = bigs.sort((x, y) => Math.min(y.attrs.rim, y.attrs.volume) - Math.min(x.attrs.rim, x.attrs.volume))[0]?.name
      return post * 0.7 + mean(five.filter((p) => p.name !== pName), (p) => p.attrs['3pt']) * 0.3
    }
    case 'helio': {
      const star = Math.max(0, ...a.map((x) => Math.min(x.volume, x.playvol)))
      return star * 0.8 + Math.min(...a.map((x) => x.ballsec)) * 0.2
    }
    case 'transition': {
      const opp = theirs?.length ? 100 - mean(theirs, (p) => p.attrs.ballsec) : 50
      return 0.45 * avg((x) => x.perimdisrupt) + 0.3 * avg((x) => x.durability) + 0.25 * opp
    }
  }
}

/** The style's worth: 0.06 x (fit - 60) minus the deviation tax, plus the tempo synergies. */
export function stylePts(t: Tactics, five: Player[], theirs?: Player[]): number {
  if (t.style === 'balanced') return 0
  let pts = clamp(0.11 * (styleFit(t.style, five, theirs) - 55) - TAX.style, -2.5, 2.5)
  if (t.style === 'postup' && t.tempo === 'slow') pts += 0.5 // the post grinds best at a crawl
  if (t.style === 'transition') {
    if (t.tempo === 'fast') pts += 0.5 // the run game and the fast night are one call
    if (t.tempo === 'slow') pts /= 2 // calling slow against your own run game halves it
  }
  return pts
}

/**
 * Each tactic's worth in points of spread, itemised so the screen can show its work.
 *
 * The defensive scheme and the hunt are the two calls priced against the OPPONENT as well as the
 * five: drop concedes the arc, so their shooting is half its price; the hunt needs their worst
 * defender to be worth attacking. On the My team screen no opponent is known yet, so those terms
 * are omitted and the full price lands at the draft, where the sim uses it.
 */
/**
 * MAIN SCORER (recal_59): usage REALLOCATION through the skill-curve repricing the engine already
 * runs — never a flat buff. The chosen man's natural usage rises 8; the reconciliation forces the
 * five back to 100, shedding load off the others along their own curves; the offense is recompiled
 * and the DELTA is the benefit, at K_MATCH like every net gap. Then the law's tax, and the matchup:
 * their best stopper's perdef presses the term down. Positive ONLY when his curve has room and the
 * defense cannot hold him — your third option into an elite stopper is negative by construction.
 */
export function scorerPts(name: string, five: Player[], theirs?: Player[]): number {
  const i = five.findIndex((p) => p.name === name)
  if (i < 0 || five.length < 2) return 0
  // the engine's own reconciled solution, then the FORCED reallocation on top of it: his share +8,
  // the others scaled down to keep the hundred, every delta repriced along the engine's own curves.
  const { lines } = teamOffense(five)
  const c = five.map((p) => creation(p.attrs))
  const e = five.map((p) => p.attrs.ts_rel ?? p.attrs.ts_raw)
  const uc = lines[i].usg
  const scale = (100 - uc - 8) / (100 - uc)
  let d = 0
  for (let j = 0; j < five.length; j++) {
    const u0 = lines[j].usg
    const ts0 = lines[j].ts
    if (j === i) {
      const slope = KNOBS.SLOPE_UP_MAX - (KNOBS.SLOPE_UP_MAX - KNOBS.SLOPE_UP_MIN) * c[j]
      d += (u0 + 8) * ts0 * (1 - (slope * 8) / 100) - u0 * ts0
    } else {
      const shed = u0 * (1 - scale)
      const gate = clamp((e[j] - 0.545) / 0.1, 0, 1) // the engine's own gate: shedding helps only the efficient
      d += u0 * scale * ts0 * (1 + (KNOBS.SLOPE_DOWN * gate * shed) / 100) - u0 * ts0
    }
  }
  const stopper = theirs?.length ? (Math.max(...theirs.map((q) => q.attrs.perdef)) - 70) * 0.02 : 0
  // +57 is the pool-mean cost of forcing the reallocation at all — the intrinsic price every
  // pick pays; what remains is how much better or worse THIS man carries it than the average.
  return clamp(0.05 * (d + 57) - stopper - TAX.scorer, -2.5, 2.5)
}

/** MAIN PLAYMAKER: the same architecture on CREATION share (playvol feeds the creation weights and
 * the amplification the engine already runs); their best passing-lane pressure is the matchup tax. */
export function playmakerPts(name: string, five: Player[], theirs?: Player[]): number {
  const i = five.findIndex((p) => p.name === name)
  if (i < 0 || five.length < 2) return 0
  // the same architecture on CREATION share: the ball runs through him, so the feed the engine's
  // amplification drinks from is re-weighted toward HIS creation — the catch-and-shoot men eat
  // exactly as well as he can set the table — and he pays a handling tax scaled by what he is not.
  const { lines } = teamOffense(five)
  const c = five.map((p) => creation(p.attrs))
  const feed0 = c.reduce((acc, ci, j) => acc + ci * lines[j].usg, 0) / KNOBS.TEAM_USG
  const feed1 = c[i] // the table is HIS now
  let d = 0
  for (let j = 0; j < five.length; j++) {
    if (j === i) {
      d += lines[j].usg * lines[j].ts * (-(0.9 * 8) / 100) * (1 - c[j]) // handling load a non-creator cannot carry
    } else {
      const amp = KNOBS.AMP_MAX * Math.max(0, 1 - lines[j].usg / 30)
      d += lines[j].usg * lines[j].ts * amp * (feed1 - feed0)
    }
  }
  const lanes = theirs?.length ? (Math.max(...theirs.map((q) => q.attrs.perimdisrupt)) - 70) * 0.015 : 0
  return clamp(0.066 * (d + 43) - lanes - TAX.playmaker, -2.5, 2.5)
}

export function tacticsParts(t: Tactics, five: Player[], theirs?: Player[]): { label: string; pts: number }[] {
  const parts: { label: string; pts: number }[] = []
  if (t.scorer && five.some((p) => p.name === t.scorer)) parts.push({ label: 'main scorer', pts: scorerPts(t.scorer, five, theirs) })
  if (t.playmaker && five.some((p) => p.name === t.playmaker)) parts.push({ label: 'main playmaker', pts: playmakerPts(t.playmaker, five, theirs) })
  if (t.style !== 'balanced')
    parts.push({ label: `${STYLES.find((x) => x.key === t.style)?.label ?? t.style} (fit ${Math.round(styleFit(t.style, five, theirs))})`, pts: stylePts(t, five, theirs) })
  if (t.scheme === 'drop') {
    let pts = clamp((Math.max(...five.map((p) => p.attrs.rimprot)) - 75) * 0.055, -2.0, 2.0)
    if (theirs?.length) pts += clamp((55 - mean(theirs, (p) => p.attrs['3pt'])) * 0.045, -1.8, 1.8)
    parts.push({ label: 'drop coverage', pts: clamp(pts - TAX.scheme, -2.5, 2.5) })
  }
  if (t.scheme === 'switch')
    parts.push({ label: 'switch everything', pts: clamp((Math.min(...five.map((p) => p.attrs.perdef)) - 45) * 0.06 - TAX.scheme, -2.5, 2.5) })
  if (t.hunt) {
    let pts = clamp((Math.max(...five.map((p) => p.attrs.playvol)) - 55) * 0.15, -4.6, 4.6)
    if (theirs?.length) pts += clamp((60 - Math.min(...theirs.map((p) => p.attrs.perdef))) * 0.05, -1.8, 1.8)
    parts.push({ label: 'hunt the mismatch', pts: clamp(pts - TAX.hunt, -2.5, 2.5) })
  }
  if (t.crashOff) parts.push({ label: 'crash the offensive glass', pts: clamp((mean(five, (p) => p.attrs.orb) - 50) * 0.26 - TAX.crashOff, -2.5, 2.5) })
  if (t.crashDef) parts.push({ label: 'crash the defensive glass', pts: clamp((mean(five, (p) => p.attrs.drb) - 50) * 0.19 - TAX.crashDef, -2.5, 2.5) })
  return parts
}

/**
 * THE BOX CONSUMES THE TACTICAL STATE (recal_61): build the per-game context both boxes read.
 * Everything here is the SAME number the margin used — the r59 forced shares and brick, the
 * board's centered pairing edges, the resolved pace level, the style and the crash calls.
 */
export function boxContext(
  plan: Tactics,
  paceLvl: number,
  five: Player[],
  theirs: Player[],
  ourMap: number[] | 'optimal' | 'naive',
): { us: BoxCtx; them: BoxCtx } {
  const centered = (E: number[][], map: number[], j: number): number => {
    const n = E.length
    let col = 0
    for (let r = 0; r < n; r++) col += E[r][j]
    const i = map.indexOf(j)
    return i >= 0 ? E[i][j] - col / n : 0
  }
  // our attackers vs THEIR defense: the AI plays its best board
  const usgUs = five.map((q) => q.attrs.usg_raw)
  const Et = pairingTable(theirs, five, usgUs)
  const theirBoard = bestBoard(Et, usgUs)
  const usEdges = five.map((_, j) => centered(Et, theirBoard, j))
  // their attackers vs the board WE actually played
  const usgThem = theirs.map((q) => q.attrs.usg_raw)
  const Eu = pairingTable(five, theirs, usgThem)
  const ourBoard = Array.isArray(ourMap) && ourMap.length === five.length ? ourMap : ourMap === 'naive' ? naiveAssignment(five, theirs) : bestBoard(Eu, usgThem)
  const themEdges = theirs.map((_, j) => centered(Eu, ourBoard, j))
  // the r59 forced reallocation, verbatim
  const base = teamOffense(five).lines.map((l) => l.usg)
  const si = plan.scorer ? five.findIndex((q) => q.name === plan.scorer) : -1
  let usg: number[] | undefined
  let brick: number | undefined
  if (si >= 0) {
    const uc = base[si]
    const scale = (100 - uc - 8) / (100 - uc)
    usg = base.map((u, i) => (i === si ? u + 8 : u * scale))
    const c = creation(five[si].attrs)
    brick = ((KNOBS.SLOPE_UP_MAX - (KNOBS.SLOPE_UP_MAX - KNOBS.SLOPE_UP_MIN) * c) * 8) / 100
  }
  const pi = plan.playmaker ? five.findIndex((q) => q.name === plan.playmaker) : -1
  return {
    us: {
      paceLvl,
      style: plan.style,
      scorerIdx: si >= 0 ? si : undefined,
      playmakerIdx: pi >= 0 ? pi : undefined,
      usg,
      brick,
      edges: usEdges,
      crashOff: plan.crashOff,
      crashDef: plan.crashDef,
      leak: false,
    },
    them: {
      paceLvl,
      edges: themEdges,
      // OUR crash costs OUR transition defense: their fast-break points show on their line
      leak: plan.crashOff,
    },
  }
}

/** The whole plan as a lineup modifier — the sum of the parts, in the margin's own currency. */
export function tacticsMod(t: Tactics, five: Player[], theirs?: Player[]): Partial<Lineup> {
  return { bonus: tacticsParts(t, five, theirs).reduce((a, x) => a + x.pts, 0) }
}
