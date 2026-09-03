import { bestBoard, creation, KNOBS, naiveAssignment, pairingTable, teamOffense, usageSurplus } from './offense'
import type { BoxCtx } from './boxstats'

import type { Attrs, Lineup, Player } from './types'

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
  /**
   * THE PICK-AND-ROLL PAIR (his ruling: "When selenting pnr you have to select the 2 handler and
   * screener"). Calling the pnr is now TWO calls: the style, and the two men who run it. Name-keyed
   * like the rest of the plan, so a swap on the floor cannot leave it pointing at a stranger.
   *
   * ABSENT is legal and means the same thing it always did: an old save, an AI opponent, or a plan
   * that has never been to the panel picks its pair the way the engine used to pick it, off the
   * cards (see pnrPair). Only `pnr` as a style ever reads it.
   */
  pnr?: PnrPair | null
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

/** The two men the pick-and-roll runs through, by card name. Two different men, both on the five. */
export interface PnrPair {
  handler: string
  screener: string
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
  pnr: null,
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
 * THE PIPELINE-113 INTEGRATION (recal_109's elite-passer term and recal_112's efficient-interior-scorer
 * term, merged with recal_110's team-offence round) moved 376 o_ovrs and 310 OVRs on the MERGED pool, 0
 * d_ovrs and no attribute, and the ovr>=55 sample with them; crash def glass alone broke, its BLIND read
 * gone shallow at -0.23 against the -0.30 floor, and was re-ratified .54 -> .74. recal_112 had found the
 * same failure on its own branch and answered it with the same .74; that figure was measured on a pool
 * without recal_110 and is SUPERSEDED by this one rather than stacked with it — the integrator re-swept
 * from main's .54, as the law requires. Chosen off the harness sweep at the point of greatest margin to
 * the nearer edge (blind -0.37 against the -0.30 floor, oracle +0.58 against the +0.50 one; .70 has 0.04
 * of blind headroom, .78 has 0.07 of oracle headroom, .74 has 0.07 on both) inside a feasible interval
 * of .66 to .98. Every other tax held its band untouched, hunt included. All nine pass.
 * recal_114's vote discount (perdef 343 down, 230 d_ovrs down; pipeline 114) moved the ovr>=55 pool
 * again and crash def glass broke on the ORACLE edge at .74 (+0.40). Swept .40/.44/.47/.50/.58/.66:
 * the window is one value wide — .44 reads blind -0.32 / oracle +0.50, .40 fails blind (-0.28), .47
 * fails oracle (+0.49). Re-ratified .74 -> .44, on the edge, the way r86 sat. Eight others untouched.
 * recal_115 rewrote three of the seven STYLE fit formulas (five-out, post-up, helio) and is the
 * first round since r58 to move what the playstyle row is actually measuring rather than the pool
 * it measures on. The band was re-read and HELD: playstyle random -1.09 -> -1.15 (floor -1.50) and
 * oracle +0.71 -> +0.68 (floor +0.50), both inside, and the other eight rows did not move at all.
 * NO TAX WAS TOUCHED. Recorded because it is the narrowest playstyle has read since it was
 * ratified — the oracle has 0.18 of headroom — and a further widening of any style's fit range
 * should expect to re-ratify TAX.style rather than read a break as a fault in the new formula.
 * recal_116's ballsec reweight (the raw turnover leg's ceiling 0.45 -> 0.54) moved 7,911 ballsecs,
 * 1,498 o_ovrs and 832 OVRs — none by more than a point of OVR — and the ovr>=55 sample with them;
 * crash def glass alone broke, on the BLIND edge again, gone shallow at -0.18 against the -0.30
 * floor. Swept .50/.55/.60/.62/.66/.68/.70/.74/.80/.84: the feasible interval is .62 to about .84
 * (.60 reads blind -0.29 and fails; .84 reads oracle +0.50 EXACTLY and is the last passing value),
 * and it is wide for once, which is the opposite of r114's one-value window. Re-ratified .44 -> .70,
 * the point of greatest margin to the NEARER edge (blind -0.37 against -0.30, oracle +0.55 against
 * +0.50 — .05 of room on the tight side, where .66 has .04 and .74 has .03). SEVENTH round running
 * in which this one tax is the one that moves, and the fourth time it has reversed direction; the
 * cause is the same every time — it is the tax whose benefit reads a DEFENSIVE attribute off a pool
 * that an OFFENSIVE round reshuffles. Eight others untouched.
 */
export const TAX = {
  scorer: 0.55,
  playmaker: 0.57,
  tempo: 0.6,
  style: 0.35,
  scheme: 0.80,
  hunt: 3.80,
  crashOff: 0.40,
  crashDef: 0.70,
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
    // the pnr pair is two DIFFERENT men, both still on the five; anything else is dropped and the
    // engine picks the pair itself again, exactly as it does for a plan that never named one
    pnr: legalPair(t.pnr, names) ? t.pnr : null,
  }
}

/** A pair is legal when it names two different men who are both on the five. */
export function legalPair(pair: PnrPair | null | undefined, names: string[]): boolean {
  return !!pair && pair.handler !== pair.screener && names.includes(pair.handler) && names.includes(pair.screener)
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
    // the pair rides with the style it belongs to: below rank 2 the call is not heard at all
    pnr: rank >= 2 ? t.pnr : null,
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
/**
 * WHO RUNS THE PICK-AND-ROLL. The plan's own two men when it names a legal pair (his ruling: "When
 * selenting pnr you have to select the 2 handler and screener"); otherwise the AUTO-PICK: the best
 * small HANDLER and the best big SCREENER, by the two terms the fit itself is built on (handlerFit
 * and screenFit below). Every reader of the pair — the fit, the court, the caption — comes through
 * here, so the number and the drawing can never name different men.
 */
/**
 * THE TWO MEN OF THE TWO-MAN GAME (recal_120, his ruling: "Jazz 97' pnr Stockton and Malone is more
 * fitting"). Both terms were MINIMA, and a minimum asks a man to be two things at once:
 *
 *   handler  min(playvol, volume)  — Stockton '97 (playvol 96, volume 23) read 23 and Nash '05
 *          (97, 42) read 42, so the measure said a pass-first point guard cannot run a
 *          pick-and-roll. That is the opposite of true: the pick-and-roll is the play a passer
 *          runs, and the two most famous of them were run by these two men. It is now PLAYVOL-LED,
 *          with scoring load as a THREAT that adds to him rather than a cap that holds him down,
 *          plus an explicit elite-passer ramp — his own words, "playvol in the ~90s" — worth up to
 *          ELITE_LIFT and shaped the way recal_109 gave o_score its elite-passer term. Clamped to
 *          99 so the handler stays on the 0-100 axis every other fit term lives on.
 *          Stockton '97 87.1 (was 23), Nash '05 92.3 (was 42), Harden '18 99 (was 97),
 *          Murray '23 63.1 (was 74) — a scorer who passes some loses a little, which is the point.
 *          The ramp is deliberately NARROW, 80 to 95: measured at 78-to-90 it also lifts Muggsy
 *          Bogues (92) far enough to take Mourning's Hornets '95 off the post, and a rule for
 *          elite passers must not reach that far down. The cost is recorded — Stockton '99, whose
 *          playvol fell to 86, is the one Stockton/Malone year that does not read pick-and-roll.
 *   screener min(rim, efficiency)  — the ROLL only. A screener who POPS is the other half of the
 *          action and was worth nothing for it: Malone '97 (rim 77, mid 94) read 77. It is now his
 *          best finish off the screen, roll or pop: min(max(rim, mid), efficiency) — Malone 89.
 *
 * The mid-range MOVED here, it was not invented: recal_115 had put max(rim, mid) into the POST-UP
 * hub to stop a mid-post game reading as no post game at all. That was the wrong home for it. A big
 * who scores from the elbow is being screened free by a guard, not fed on the block, so the post hub
 * goes back to min(rim, volume) and the mid-range belongs to the pop. Both halves of this round
 * point the same way and neither reaches the ruling alone: Jazz '97 is pnr 76 / post-up 69, where
 * recal_115 left it at pnr 46 / post-up 81.
 *
 * The three WEIGHTS of the pnr fit (0.40 handler / 0.35 screener / 0.25 spacing) are recal_58's and
 * were deliberately not touched — the ruling names the two terms, not their shares, and moving the
 * shares toward the pair was measured to cost the well-spaced pick-and-roll fives (Nuggets '25,
 * Thunder '25) their read.
 */
export const ELITE_PV = 80
export const ELITE_LIFT = 24
const elitePass = (x: Attrs) => clamp((x.playvol - ELITE_PV) / 15, 0, 1)
export const handlerFit = (x: Attrs) => clamp(0.6 * x.playvol + 0.24 * x.volume + ELITE_LIFT * elitePass(x), 0, 99)
export const screenFit = (x: Attrs) => Math.min(Math.max(x.rim, x.mid), x.efficiency)

export function pnrPair(five: Player[], pick?: PnrPair | null): { handler: Player | null; screener: Player | null; chosen: boolean } {
  if (legalPair(pick, five.map((p) => p.name))) {
    const handler = five.find((p) => p.name === pick!.handler) ?? null
    const screener = five.find((p) => p.name === pick!.screener) ?? null
    return { handler, screener, chosen: true }
  }
  const hScore = (p: Player) => handlerFit(p.attrs)
  const dScore = (p: Player) => screenFit(p.attrs)
  const handler = five.filter((p) => p.attrs.playvol >= 70 && p.attrs.height <= 78).sort((x, y) => hScore(y) - hScore(x))[0] ?? null
  // ties on screenFit are real — two bigs can be capped by the same efficiency — and they are broken
  // by the ROLL: of two men who finish the same off the screen, the one who can get to the rim sets it
  const screener = five.filter((p) => p.attrs.height >= 80).sort((x, y) => dScore(y) - dScore(x) || y.attrs.rim - x.attrs.rim)[0] ?? null
  return { handler, screener, chosen: false }
}

/**
 * THE SHOOTING LINE (his ruling: "Why is Ayton out and James in? Makes no sense"). A man stands in
 * a spacing spot only if he can shoot from there. The line is the pool's own class rule —
 * BIG_RULE reads a big as `rim >= 60 AND 3pt < 40` — so 40 is where this game already stops calling
 * a man a shooter, and the floor uses the same number the classifier does. One number, exported,
 * because the drawing and the style inference must agree about who can space.
 *
 * SHOOT_3PT_HI (recal_115) is the OTHER line, and it is a different question: 40 is "may stand
 * behind the arc at all", 60 is "the defence must close out on him". A set that owns an inside spot
 * only needs the first; five-out, which owns none, is judged on the second (his ruling: "How come
 * Boston post up and not 5 out?" — five-out wants four or five men a defence has to guard out
 * there). The same 60 is where a big stops being an interior hub in the post-up read.
 */
export const SHOOT_3PT = 40
export const SHOOT_3PT_HI = 60
export const canSpace = (p: Player) => p.attrs['3pt'] >= SHOOT_3PT
/** Is he a big the defence can leave at the rim — the man five-out has nowhere to stand? */
const shyBig = (x: Attrs) => x.height >= 81 && x['3pt'] < SHOOT_3PT
/** How much of a big's game is INTERIOR: 1 at 3pt <= 20, falling to 0 once he shoots like a shooter. */
const interior = (x: Attrs) => clamp((SHOOT_3PT_HI - x['3pt']) / 40, 0, 1)

/**
 * THE SCORER-CREATOR (recal_115, his ruling: "Why is the system helio for rus when KD is a better
 * scorrer?"). Helio used to key on min(volume, playvol) — pure play VOLUME, which asks only how much
 * of the offence a man touches and nothing about whether the touches are worth having. Westbrook '16
 * (volume 95, playvol 98, efficiency 56) beat Durant '16 (volume 92, playvol 70, efficiency 98) on
 * that measure, which is exactly the complaint.
 *
 * The composite is SCORING LOAD x EFFICIENCY x CREATION, in the engine's own currencies: `volume`
 * is the load, `efficiency` is what the load is worth, and `creation` is the offense engine's own
 * creation term (offense.ts — playvol and ball security, 0..1) scaled onto the 0-100 axis the
 * attributes live on. It is the same three facts o_score weighs, read off the sheet rather than off
 * the card, so the tactic picker stays a pure function of `attrs` like every other fit in this file.
 * Durant '16 reads 88.3 to Westbrook's 81.5.
 */
export const scorerCreator = (x: Attrs) => 0.45 * x.volume + 0.3 * x.efficiency + 25 * creation(x)

/**
 * TWO SUPERSTARS (his ruling: "why Helio when they have 2 superstars?"). Helio is one man being the
 * whole offence; two men who are both that man is a different team, and the read must say so.
 * General, no names: the five's top two by scorerCreator, both over STAR_LINE and within DUO_GAP of
 * each other. 78 is roughly the 99.5th percentile of the composite over the card pool — a genuine
 * number one — and 8 points is the width inside which neither is the other's helper.
 *
 * Two men that close at that height are rare: over the 1,255 team-seasons on the wheel the test
 * fires on 31 of them (2.5%, scripts/tactics115.ts) — Thunder '16 (Durant 88.3 / Westbrook 81.5),
 * Warriors '17 (Curry 89.7 / Durant 86.7), Lakers '01 (O'Neal 87.7 / Bryant 82.8) — and never on a
 * five with one star and a good second man (Cavaliers '16 read James 89.0 / Irving 77.2, which
 * misses the star line by 0.8 and the gap by 3.8).
 */
export const STAR_LINE = 78
export const DUO_GAP = 8
export function twoStars(five: Player[]): boolean {
  const e = five.map((p) => scorerCreator(p.attrs)).sort((x, y) => y - x)
  return e.length >= 2 && e[1] >= STAR_LINE && e[0] - e[1] <= DUO_GAP
}

export function styleFit(style: Style, five: Player[], theirs?: Player[], pnr?: PnrPair | null): number {
  if (!five.length || style === 'balanced') return 60 // priced to zero
  const a = five.map((p) => p.attrs)
  const avg = (f: (x: Player['attrs']) => number) => a.reduce((t, x) => t + f(x), 0) / a.length
  switch (style) {
    case 'fiveout': {
      // FIVE-OUT IS A COUNT, NOT AN AVERAGE (recal_115, his ruling: "How come Boston post up and not
      // 5 out?"). It used to be 0.6 x the WORST shooter + 0.4 x the mean, which is a formula about
      // the weakest link: one 52 in a five of 80s held the fit under the free default, and five-out
      // won on ONE of the 1,255 team-seasons on the wheel. What the set actually needs is four or
      // five men the defence must close out on (SHOOT_3PT_HI) and NO big it can leave at the rim,
      // since five-out is the one set with no inside spot to stand him in. So: the shooter count
      // carries it, the mean and the floor shade it, and every non-shooting big is a 25-point hole
      // in the middle of the floor. Boston '25 reads 73 (four shooters, no shy big); Houston '18,
      // four shooters and Capela, reads 36.
      const shooters = a.filter((x) => x['3pt'] >= SHOOT_3PT_HI).length
      return 0.3 * avg((x) => x['3pt']) + 0.2 * Math.min(...a.map((x) => x['3pt'])) + 10 * shooters - 25 * a.filter(shyBig).length
    }
    case 'pnr': {
      // his two men when he named them, the engine's own pair when he did not — the same three
      // terms and the same three weights, but since recal_120 the two-man terms are handlerFit and
      // screenFit (see pnrPair): the handler led by his PLAY VOLUME instead of capped by his
      // scoring, the screener credited for the pop as well as the roll. Jazz '97 (Stockton 87.1,
      // Malone 89, three men shooting 41) reads 76.2 against a post-up of 68.6; it read 46.4
      // against 80.5 before the round.
      const { handler: h, screener: d } = pnrPair(five, pnr)
      const handler = h ? handlerFit(h.attrs) : 0
      const dive = d ? screenFit(d.attrs) : 0
      const rest = five.filter((p) => p.name !== h?.name && p.name !== d?.name)
      return 0.4 * handler + 0.35 * dive + 0.25 * mean(rest, (p) => p.attrs['3pt'])
    }
    case 'motion': {
      const stoppers = a.filter((x) => x.volume >= 90 && x.playvol < 50).length
      return 0.5 * avg((x) => x.ballsec) + 0.3 * avg((x) => x.playvol) + 0.2 * a.filter((x) => x['3pt'] >= 60).length * 20 - 12 * stoppers
    }
    case 'postup': {
      // A POST HUB WORKS INSIDE (recal_115), AND HE WORKS AT THE RIM (recal_120). The term was
      // min(rim, volume) on any man 6'9" or taller, which made a post team of every five with a tall
      // high-volume scorer however he got his points: Durant '17 (3pt 74) read post-up 81, Porzingis
      // '25 (3pt 86) read 69 and beat Boston's five-out. recal_115 scaled it by how INTERIOR his own
      // game is, so a big who lives behind the arc is not a hub at any volume, and that stands.
      //
      // recal_115 ALSO read the hub as his best interior shot, min(max(rim, mid), volume), to keep a
      // mid-post game from reading as no post game at all. recal_120 takes the mid-range back out
      // (his ruling: "Jazz 97' pnr Stockton and Malone is more fitting"): a big who scores from the
      // elbow is being screened free by a guard, not fed on the block, so the mid-range belongs to
      // the pick-and-POP — it is in screenFit now — and the block keeps the rim. Malone '97 (rim 77,
      // mid 94) falls from 94 to 77 here and rises from 77 to 89 there, which is the whole round in
      // one card. O'Neal '00 (rim 99) and Olajuwon '94 (rim 95) do not move at all.
      const bigs = five.filter((p) => p.attrs.height >= 81)
      const hub = (x: Attrs) => Math.min(x.rim, x.volume) * interior(x)
      const post = Math.max(0, ...bigs.map((p) => hub(p.attrs)))
      const pName = bigs.sort((x, y) => hub(y.attrs) - hub(x.attrs))[0]?.name
      return post * 0.7 + mean(five.filter((p) => p.name !== pName), (p) => p.attrs['3pt']) * 0.3
    }
    case 'helio': {
      // HELIO IS ONE MAN ALONE (recal_115, his ruling: "why Helio when they have 2 superstars?").
      // Two changes. The engine is the five's best SCORER-CREATOR, not its highest play-volume man
      // (scorerCreator above), so Durant '16 is Oklahoma City's featured man and not Westbrook. And
      // the fit now reads the SEPARATION: a helio offence is a man who towers over the four beside
      // him, so the term is his composite plus what he has on the second-best man on the floor. A
      // five with two stars scores low here by construction and bestStyle will not read it as helio
      // at all. The ball-security floor survives at a lighter weight — one man carrying an offence
      // still needs four who do not turn it over. Thunder '22 (Gilgeous-Alexander alone) reads 65.
      const e = a.map(scorerCreator).sort((x, y) => y - x)
      return 0.7 * e[0] + 0.3 * (e[0] - (e[1] ?? 0)) + 0.12 * Math.min(...a.map((x) => x.ballsec))
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

/**
 * THE STYLE A FIVE ALREADY IS (his ruling: "Assign each team on the court by using their best
 * tactic"). The argmax of styleFit over the real styles, kept only when it BEATS balanced's
 * priced-to-zero 60 — a five that fits nothing better than the free default is balanced, and says
 * so. The pnr entry reads the engine's own auto-pair, the same two men an unplanned five would run
 * it with, because no pair is named.
 *
 * A READ, not a call. Nothing in the sim consults it today: the AI picks a tempo (aiTempo) and a
 * scheme (aiScheme) and runs balanced offense, so there is no chosen style for the floor to
 * contradict. It lives here beside its two siblings so that the day the AI does call a style, the
 * floor and the sim are one function and cannot name different shapes.
 */
export function bestStyle(five: Player[], theirs?: Player[]): { style: Style; fit: number } {
  let best: Style = 'balanced'
  let bestFit = 60
  // FIVE-OUT DEMANDS SHOOTERS (his ruling). Every other set owns an inside spot to stand a
  // non-shooter on; five-out owns none, so a five carrying two men who cannot shoot is never READ
  // as five-out however the fit lands. Called five-out is untouched — a call is a call.
  const shy = five.filter((p) => !canSpace(p)).length
  // ...and HELIO DEMANDS ONE STAR (recal_115, his ruling: "why Helio when they have 2 superstars?").
  // The same shape of rule, on the other end: a five whose top two scorer-creators are both over
  // STAR_LINE and within DUO_GAP of each other is never READ as helio, whatever the fit lands on.
  // What it reads instead is whatever else fits the pair — usually the pick-and-roll between them,
  // and the caption names both men (see featured). A call is still a call.
  const duo = twoStars(five)
  for (const s of STYLES) {
    if (s.key === 'balanced') continue
    if (s.key === 'fiveout' && shy >= 2) continue
    if (s.key === 'helio' && duo) continue
    const fit = styleFit(s.key, five, theirs)
    if (fit > bestFit) {
      bestFit = fit
      best = s.key
    }
  }
  return { style: best, fit: bestFit }
}

/**
 * WHO THE SHAPE IS FOR (recal_115, his ruling: "Why is the system helio for rus when KD is a better
 * scorrer?"). The men a style stands its featured spots on — the helio engine, the post hub, the two
 * men of the pick-and-roll — in the order the caption should name them. Empty for the sets that
 * feature nobody. ONE function, so the drawing (CourtFive.spotsFor), the fit above and the caption
 * can never name different men; the scores are the fit formulas' own.
 */
export function featured(style: Style, five: Player[], pnr?: PnrPair | null): Player[] {
  if (five.length < 2) return []
  const top = (score: (x: Attrs) => number) => five.reduce((m, p) => (score(p.attrs) > score(m.attrs) ? p : m), five[0])
  switch (style) {
    case 'helio':
      return [top(scorerCreator)]
    case 'postup':
      return [top((x) => (x.height >= 81 ? Math.min(x.rim, x.volume) * interior(x) : -1))]
    case 'pnr': {
      const { handler, screener } = pnrPair(five, pnr)
      return [handler, screener].filter((p): p is Player => !!p)
    }
    default:
      return []
  }
}

/** The style's worth: 0.06 x (fit - 60) minus the deviation tax, plus the tempo synergies. */
export function stylePts(t: Tactics, five: Player[], theirs?: Player[]): number {
  if (t.style === 'balanced') return 0
  let pts = clamp(0.11 * (styleFit(t.style, five, theirs, t.pnr) - 55) - TAX.style, -2.5, 2.5)
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
    parts.push({
      label: `${STYLES.find((x) => x.key === t.style)?.label ?? t.style} (fit ${Math.round(styleFit(t.style, five, theirs, t.pnr))})`,
      pts: stylePts(t, five, theirs),
    })
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
