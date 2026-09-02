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
   * How the five defends (recal_75, his ruling: "add real defensive schemes with fit numbers").
   * Matchup is the default and free; the other five each carry a FIT 0-99 off the cards and a
   * price on the same law the playstyles use. See SCHEMES / schemeFit below.
   */
  scheme: Scheme
  /** Attack their worst defender. Needs a creator to run it, and a victim to point him at. */
  hunt: boolean
  /** Send men to the offensive glass. Pays with rebounders, leaks transition without them. */
  crashOff: boolean
  /** Gang the defensive glass. Pays with rebounders, costs a little rim-running offense. */
  crashDef: boolean
}

/**
 * DEFENSIVE SCHEMES v2 (recal_75, his ruling: "add real defensive schemes with fit numbers").
 * Defense was one thin control against the offense's seven playstyles; it is now the other half of
 * the plan, on the SAME convention: every scheme scores a FIT 0-99 from the five's own cards and
 * pays 0.11 x (fit - 55) minus the deviation tax, clamped +-2.5. Matchup is the free default.
 *
 * THE SET, and what each is actually reading (scripts/schemes75.ts is the design probe):
 *   drop    a tower plays behind the action   -> best RIMPROT + team DISCIPLINE; their shooting hurts
 *   switch  everyone guards everyone          -> WORST perdef + team perdef + uniform HEIGHT;
 *                                                kills their pnr, dies to a post mismatch
 *   blitz   trap the ball-handler             -> PERIMDISRUPT + DURABILITY + DISCIPLINE (fouls);
 *                                                feasts on a loose ball-dominant star
 *   zone    size and the glass                -> HEIGHT + DRB + best RIMPROT; dies to shooting
 *                                                and to their offensive board
 *   ice     no middle, force baseline         -> team PERDEF + DISCIPLINE + weak-side RIMPROT;
 *                                                beats a pnr team, concedes the long two
 * CASUALTIES, measured not assumed: PRESS reads as blitz (r 0.79 — hands and legs with the foul
 * cost removed) and PACK-THE-PAINT reads as zone (r 0.86). Two names for one call is a worse panel
 * than five honest ones, so they were cut; the probe keeps the evidence.
 */
export type Scheme = 'matchup' | 'drop' | 'switch' | 'blitz' | 'zone' | 'ice'
export const SCHEMES: { key: Scheme; label: string }[] = [
  { key: 'matchup', label: 'matchup' },
  { key: 'drop', label: 'drop coverage' },
  { key: 'switch', label: 'switch everything' },
  { key: 'blitz', label: 'blitz the handler' },
  { key: 'zone', label: 'zone' },
  { key: 'ice', label: 'ice / no middle' },
]

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
 * recal_67's DEF display deflation shrank the pool again (7447 -> 6798 at ovr>=55) and three bands
 * broke; hunt/crashOff/crashDef re-ratified through the harness: 3.50->3.65, .68->.42, .60->.44.
 * recal_72's is_big flips moved 51 OVRs and the pool again; hunt/crashDef re-ratified: 3.65->3.80, .44->.50.
 * recal_78's deadeye load ramp moved 532 o_ovrs and the pool again; crashOff/crashDef re-ratified: .42->.30, .50->.40.
 * recal_76's teamd removal moved 3,463 d_ovrs and the pool again; playmaker re-ratified: .50->.57.
 * recal_79's ballsec reweight moved the ovr>=55 pool again; hunt re-ratified: 3.80->3.90.
 * recal_82's graded rimprot entry moved the pool again; hunt re-ratified: 3.70->3.74.
 * recal_80's perimeter reweight + DEF display re-solve moved every d_ovr and the ovr>=55 pool with
 * them; crashOff/crashDef re-ratified through the harness: .30->.55, .62->.95.
 * recal_85 killed the empty-volume tax, the breadth term and the top band, moving 1,860 OVRs and
 * the ovr>=55 pool with them; hunt/crashDef re-ratified: 3.74->3.60, .72->.46. Every other tax
 * held its band untouched. The law was applied as written: the bands broke, the taxes moved to
 * meet them, and NOTHING in the OVR chain was touched to hold a band up.
 * recal_86's absolute tracked perdef moved 1,823 perdefs and 1,017 OVRs, and with them the ovr>=55
 * pool again; hunt re-ratified 3.60 -> 3.72 (its BLIND penalty had gone too shallow at -0.25, the
 * opposite failure from r85's — the tax went UP this time, not down). All nine in band. RECORDED:
 * crash def glass now sits EXACTLY on the band edge at random -0.30. It passes, and it was not
 * touched — moving a constant that is inside its band would be tuning for taste, not for the law.
 * recal_89's o_score weight shift moved 4,600 o_ovrs and 2,537 OVRs, and the ovr>=55 pool with
 * them; hunt re-ratified 3.72 -> 3.60 — its ORACLE fell to +0.46 this time, so the tax came back
 * DOWN. Third consecutive round in which hunt is the one band that moves, and the second time it
 * has reversed direction; it is the most pool-sensitive tax we have, which is worth remembering
 * before anyone reads its wandering as instability in the tactic itself. All nine in band.
 * crash def glass reads -0.31, off the edge it sat exactly on at r86, and was again not touched.
 * recal_91's stretch-big floor moved 198 o_ovrs and 195 OVRs, and carried 37 cards up across the
 * harness's ovr>=55 line (7,526 -> 7,563), the pool again; crash def glass re-ratified .46 -> .68.
 * THE THIRD TIME OF ASKING for this one tax, and the round it finally broke on is a small one:
 * r86 recorded it sitting EXACTLY on the band edge at -0.30, r89 recorded it at -0.31 and left it,
 * and thirty-seven new fives in the sample were enough to take its blind read to -0.18. The law was
 * applied as written — the band broke, the tax moved to meet it, and NOTHING in the OVR chain was
 * touched to hold a band up. .68 is chosen off the harness sweep for margin at BOTH edges (blind
 * -0.35 against the -0.30 floor, oracle +0.54 against the +0.50 one); the oracle is what caps it,
 * and it falls through +0.50 by about .78. Every other tax held its band untouched. All nine pass.
 * recal_92's perdef round (the r16 DFG floor retired, the tracked diff regressed to its measured
 * reliability) moved 2,614 perdefs, ~2,450 d_ovrs and ~1,900 OVRs, and the ovr>=55 pool with them
 * again; BOTH glass taxes broke together at a blind -0.29, a point off the floor, and were
 * re-ratified crashOff .42 -> .50 and crashDef .68 -> .75. Chosen off the harness sweep as the
 * SMALLEST move that clears both edges (blind -0.68 against the -0.30 floor, oracle +1.14 against
 * the +0.50 one); crashDef's own ceiling is close behind — at .95 its oracle falls to +0.49 — so
 * the room above .75 is about .20, not more. hunt held at 3.60 for the first time in four rounds
 * and was not touched. NOTE for the next round: this figure was ratified on the MERGED r91+r92
 * pool, so it supersedes r91's .46 -> .68 rather than stacking with it. All nine in band.
 * recal_93's defence-branch ramp + elite-defence cap, ratified on the MERGED r92+r95+r93 pool,
 * moved 220 d_ovrs and 683 OVRs and the ovr>=55 sample with them; THREE taxes broke at once, the
 * most in any single round, and on BOTH edges: scheme .90 -> .60 (oracle +0.498, four
 * thousandths under the floor), crashDef .75 -> .40 (oracle +0.455 — the tax r92 had just RAISED
 * to .75 now comes back down past its old .68, because r92 raised it to answer a blind edge and
 * this pool moves the oracle one), and hunt 3.60 -> 3.70 (blind -0.255 against the -0.30 floor:
 * hunt's tax went UP, the other two DOWN, in the same round). Each is chosen off the harness sweep
 * at the point of GREATEST margin to whichever edge is nearer. RECORDED, because it is the
 * narrowest window this file has yet held: hunt is feasible only on 3.66-3.78, twelve thousandths
 * wide, and 3.70 has 0.037 of headroom. It is the fifth round in six that hunt has moved and the
 * comment above already calls it the most pool-sensitive tax we have; the next round should expect
 * to re-ratify it again rather than read the movement as instability in the tactic. scheme is
 * comfortable by comparison (feasible .40-.85, best at .60 with 0.206) and crashOff held at .50
 * untouched. The law was applied as written: the bands broke, the taxes moved to meet them, and
 * NOTHING in the OVR chain was touched to hold a band up. All nine in band.
 * SUPERSEDED WITHIN recal_93 ITSELF, recorded so the round file and this comment agree: before the
 * rebase onto r92+r95 this round had re-ratified scheme .90 -> .62 against r91's attributes. That
 * measurement is void — the merged pool is a different sample and was re-swept from origin/main's
 * constants, not from .62.
 * recal_97's perdef band (the PD clamp removed, pctile -> pctile_top, band top 0.44 -> 0.45) lifted
 * 1,050 perdefs, 729 d_ovrs and 454 OVRs — every one of them UP, since the round only removes
 * ceilings — and the ovr>=55 pool with them; crash def glass alone broke, its BLIND read gone
 * shallow at -0.19, and was re-ratified .40 -> .60. Chosen off the harness sweep for margin at
 * both edges (blind -0.35 against the -0.30 floor, oracle +0.54 against +0.50); its oracle caps
 * it, falling through +0.50 at about .72. Every other tax held its band untouched, hunt included
 * for the second round running. All nine pass.
 */
export const TAX = {
  scorer: 0.55,
  playmaker: 0.57,
  tempo: 0.6,
  style: 0.35,
  scheme: 0.60,
  hunt: 3.70,
  crashOff: 0.50,
  crashDef: 0.60,
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
    // ...and a pre-recal_75 save can carry a scheme that never existed, or one since cut
    scheme: SCHEMES.some((x) => x.key === t.scheme) ? t.scheme : 'matchup',
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

/**
 * SCHEME FIT (recal_75) — the defensive mirror of styleFit, and read the same way: 0-99, where a
 * typical five in a typical matchup sits ~57 and the price crosses zero just above it.
 *
 * Each scheme is SHAPE + OPPONENT DELTA. Shape is what the five brings and is all that is known on
 * the My team screen; the delta is signed, centred on zero, and is the scheme reading THIS opponent
 * — the whole point of calling one (drop against shooters is not drop against a post team). With no
 * opponent the delta is simply absent, so the number still means "how well we are built for it".
 *
 * The raw shapes live on different scales (a tower's rimprot runs high, a weakest-link perdef runs
 * low), so each is centred and scaled onto the common axis by SHAPE_CAL. Those constants are
 * MEASURED, not chosen: scripts/schemes75.ts prints the mean and p10-p90 half-span of every shape
 * over 4,000 random fives, and the scale is 13 / half-span so all five spread alike. Without this
 * the panel would recommend drop or zone in 98% of matchups purely because their raw numbers are
 * bigger — the probe measured exactly that before the centring was added. Re-run it after any card
 * change that moves the defensive attributes.
 */
const SHAPE_CAL: Record<Exclude<Scheme, 'matchup'>, { mean: number; scale: number; opp: number }> = {
  drop: { mean: 73.09, scale: 1.207, opp: 4.64 },
  switch: { mean: 48.17, scale: 1.557, opp: -4.72 },
  blitz: { mean: 49.27, scale: 1.372, opp: -1.72 },
  zone: { mean: 64.39, scale: 1.04, opp: 5.13 },
  ice: { mean: 63.65, scale: 1.873, opp: -2.84 },
}
const heightIdx = (five: Player[]) => clamp((mean(five, (p) => p.attrs.height) - 71) * 7, 0, 100)

function schemeShape(scheme: Exclude<Scheme, 'matchup'>, five: Player[]): number {
  const a = five.map((p) => p.attrs)
  switch (scheme) {
    case 'drop':
      return 0.62 * Math.max(...a.map((x) => x.rimprot)) + 0.38 * mean(five, (p) => p.attrs.discipline)
    case 'switch': {
      const hs = a.map((x) => x.height)
      return (
        0.55 * Math.min(...a.map((x) => x.perdef)) +
        0.25 * mean(five, (p) => p.attrs.perdef) +
        0.2 * clamp(100 - 6 * (Math.max(...hs) - Math.min(...hs)), 0, 100)
      )
    }
    case 'blitz':
      return 0.5 * mean(five, (p) => p.attrs.perimdisrupt) + 0.25 * mean(five, (p) => p.attrs.durability) + 0.25 * mean(five, (p) => p.attrs.discipline)
    case 'zone':
      return 0.35 * heightIdx(five) + 0.3 * mean(five, (p) => p.attrs.drb) + 0.35 * Math.max(...a.map((x) => x.rimprot))
    case 'ice':
      return 0.55 * mean(five, (p) => p.attrs.perdef) + 0.25 * mean(five, (p) => p.attrs.discipline) + 0.2 * Math.max(...a.map((x) => x.rimprot))
  }
}

/** The signed opponent read. Zero when no opponent is known — never a guess dressed as a number. */
function schemeOpp(scheme: Exclude<Scheme, 'matchup'>, theirs: Player[]): number {
  const b = theirs.map((p) => p.attrs)
  switch (scheme) {
    case 'drop': // they cannot shoot -> the tower sits home; they can -> the arc is open
      return 0.3 * (55 - mean(theirs, (p) => p.attrs['3pt']))
    case 'switch': // switching kills a creator-heavy team, and dies to one big post mismatch
      return 0.22 * (mean(theirs, (p) => p.attrs.playvol) - 55) - 0.16 * (Math.max(...b.map((x) => x.rim)) - 60)
    case 'blitz': {
      // the trap is aimed at their highest-usage man: loose handle and heavy load = the ball is ours
      const star = theirs.reduce((m, p) => (p.attrs.usg_raw > m.attrs.usg_raw ? p : m), theirs[0])
      return 0.28 * (55 - star.attrs.ballsec) + 0.42 * (star.attrs.usg_raw - 22)
    }
    case 'zone': // shooting kills a zone; so does crashing it
      return -0.3 * (mean(theirs, (p) => p.attrs['3pt']) - 55) - 0.18 * (mean(theirs, (p) => p.attrs.orb) - 50)
    case 'ice': // send it baseline against a pnr team; the long two is the price
      return 0.24 * (mean(theirs, (p) => p.attrs.playvol) - 55) - 0.2 * (mean(theirs, (p) => p.attrs.mid) - 50)
  }
}

export function schemeFit(scheme: Scheme, five: Player[], theirs?: Player[]): number {
  if (!five.length || scheme === 'matchup') return 57 // the free default: priced to zero
  const c = SHAPE_CAL[scheme]
  const shaped = 57 + (schemeShape(scheme, five) - c.mean) * c.scale
  const opp = theirs?.length ? schemeOpp(scheme, theirs) - c.opp : 0
  return clamp(shaped + opp, 0, 99)
}

/** The scheme's worth, on the playstyles' own law: 0.11 x (fit - 55) minus the deviation tax. */
export function schemePts(t: Tactics, five: Player[], theirs?: Player[]): number {
  if (t.scheme === 'matchup' || !five.length) return 0
  return clamp(0.11 * (schemeFit(t.scheme, five, theirs) - 55) - TAX.scheme, -2.5, 2.5)
}

/**
 * The AI's defensive call, the mirror of aiTempo: a real coach plays the scheme his personnel and
 * the matchup argue for, and leaves matchup alone when nothing clears the tax. Deterministic.
 */
export function aiScheme(five: Player[], theirs: Player[]): Scheme {
  let best: Scheme = 'matchup'
  let bestPts = 0
  for (const s of SCHEMES) {
    if (s.key === 'matchup') continue
    const pts = schemePts({ ...DEFAULT_TACTICS, scheme: s.key }, five, theirs)
    if (pts > bestPts) {
      bestPts = pts
      best = s.key
    }
  }
  return best
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
  if (t.scheme !== 'matchup')
    parts.push({
      label: `${SCHEMES.find((x) => x.key === t.scheme)?.label ?? t.scheme} (fit ${Math.round(schemeFit(t.scheme, five, theirs))})`,
      pts: schemePts(t, five, theirs),
    })
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
