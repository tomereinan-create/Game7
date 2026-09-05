import { bestBoard, creation, KNOBS, naiveAssignment, pairingTable, teamOffense, usageSurplus } from './offense'
import type { BoxCtx } from './boxstats'

import type { Attrs, Lineup, Player } from './types'

/**
 * DEATH MATCH TACTICS, picked on the My team screen. Every choice is priced the way the engine
 * prices everything: points of spread, added to the margin as `bonus` (the same term the coach
 * personas and the pace margin use — lineup axes are display, bonus is what the sim feels).
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
  /**
   * THE POST-UP TARGET (recal_124, his ruling: "In post up playstyle, there need to be a post up
   * target."). The mirror of the pair, for one man: calling post-up is two calls, the style and the
   * man it is fed to. Name-keyed like the rest of the plan, so a swap on the floor cannot leave it
   * pointing at a stranger.
   *
   * ABSENT is legal and means what an absent pair means — an old save, an AI opponent, or a plan
   * that has never been to the panel is fed to the hub the engine picks off the cards (see postMan),
   * so nothing that exists today prices differently. Only `postup` as a style ever reads it.
   */
  post?: string | null
  /**
   * THE HELIO CREATOR (recal_125, his ruling: "In helio, allow me to pick a creator. Helio will
   * overtake main playmaker and scorrer, as helio becomes both"). The third name-keyed call, and
   * the only one that reaches OUT of its own style: calling helio on a man makes him the main
   * scorer AND the main playmaker, so `scorer` and `playmaker` stop being heard while it is called
   * (see roleMen). Absent/null is the engine's own featured man, so an old save, an AI opponent and
   * a plan that has never been to the panel are untouched. Only `helio` as a style reads it.
   */
  helio?: string | null
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

/**
 * THE MEN A STYLE IS CALLED ON (recal_124). Two of the seven styles are a call on the SHAPE plus a
 * call on WHO: the pick-and-roll's pair, and now the post-up's target. `styleFit` and `featured`
 * take this rather than a bare pair, so that adding the next one is a field and not a parameter.
 * A whole `Tactics` satisfies it structurally, so every caller simply passes the plan.
 */
export interface StyleCall {
  pnr?: PnrPair | null
  post?: string | null
  helio?: string | null
}

/**
 * THE SET (recal_58, six of them since recal_127). TRANSITION IS GONE, by his ruling: "Remove
 * transition entirely from the db." It was the one style that was not a half-court SHAPE — its fit
 * read disruption, durability and the opponent's ball security, which is a description of how a
 * team gets the ball rather than what it does with it, and the floor had to draw two men on the
 * half-court line to show it. On the wheel it won 8 of 1,255 fives and never by more than five
 * points over the free default. A save that still says `transition` loads as `balanced`; see
 * reconcileTactics, which has always dropped a style that no longer exists.
 */
export type Style = 'balanced' | 'fiveout' | 'pnr' | 'motion' | 'postup' | 'helio' | 'triangle' | 'pickpop'
export const STYLES: { key: Style; label: string }[] = [
  { key: 'balanced', label: 'balanced' },
  { key: 'fiveout', label: 'five-out' },
  { key: 'pnr', label: 'pick-and-roll' },
  { key: 'motion', label: 'motion' },
  { key: 'postup', label: 'post-up' },
  { key: 'helio', label: 'helio' },
  { key: 'triangle', label: 'triangle' },
  { key: 'pickpop', label: 'pick-and-pop' },
]

export const DEFAULT_TACTICS: Tactics = {
  scorer: null,
  playmaker: null,
  tempo: 'normal',
  style: 'balanced',
  scheme: 'matchup',
  pnr: null,
  post: null,
  helio: null,
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
 * recal_117's elite-passer ramp (679 o_ovrs and 560 OVRs, every one of them through compute_ovr; 0
 * d_ovrs, no attribute) moved the ovr>=55 pool again, and TWO taxes broke — the first round since r95
 * in which more than one did. HUNT went shallow on its BLIND edge (-0.10 against the -0.30 floor) and
 * was re-ratified 3.80 -> 4.10; its window is eleven thousandths wide (4.04 reads blind -0.300 exactly,
 * 4.15 oracle +0.50) and 4.10 is its midpoint, with 0.049 of blind headroom and 0.021 of oracle. This is
 * hunt's ninth move and it is always the same shape: the tax is large (a 4-point subtraction) and the
 * pool it is measured on is the ovr>=55 sample, so any round that lifts a class of guards into or up
 * that sample moves it. CRASH OFF GLASS broke on the ORACLE edge (+0.45 against +0.50) and was
 * re-ratified .40 -> .10. Its feasible interval is about -0.32 to .21, whose own midpoint is NEGATIVE —
 * a call that pays to make, which is not a tax at all — so the value is the midpoint of the POSITIVE
 * half instead: .10 clears the oracle floor by 0.029 and the blind ceiling by 0.285. Recorded because
 * it is the first time this file has had to choose inside a half-interval rather than a whole one.
 * The seven others held their bands untouched, crash def glass included. All nine pass.
 * recal_118's off-ball ramp (499 more o_ovrs and 374 more OVRs, all UP, on top of r117's) moved the
 * ovr>=55 pool a second time in two rounds, and HUNT alone broke again — this time on the ORACLE edge
 * (+0.37), the opposite side from r117's. Re-ratified 4.10 -> 3.71, the midpoint of a window running
 * about 3.655 (blind -0.300) to 3.761 (oracle +0.500). r117's 4.10 was measured on a pool WITHOUT this
 * round's cards and is SUPERSEDED by this figure rather than stacked with it; the integrator re-sweeps
 * once from main's constant, as the law requires. crash off glass held its re-ratified .10 (oracle
 * +0.64, blind -0.48) and the other seven held their bands. All nine pass.
 * pipeline-121 integration (recal_117 passer ramps, recal_118 off-ball ramp, recal_119 possession-loss
 * channel, recal_121 turnover-prone-load charge, landed together on top of recal_116): the merged pool
 * moved 1,200-odd o_ovrs and every five's offRaw. hunt, crashOff and crashDef were re-read from MAIN's
 * constants (3.80 / .40 / .70) rather than the branches' interim figures (4.10, 3.71, .10) and all three
 * HELD their bands on the merged pool — those interim re-ratifications are superseded, not stacked. The
 * one break was MAIN PLAYMAKER, for the first time since r76: blind -0.16 against the -0.30 floor. Swept
 * .70 (-0.21) / .85 (-0.27) / 1.00 (-0.33) / 1.10 (-0.37, oracle +2.25); re-ratified .57 -> 1.10, the
 * first passing value with room on the blind side, the oracle having 1.75 of headroom. Eight others held.
 * recal_124 added the post-up TARGET and recal_125 the helio CREATOR, and neither moved a tax.
 * 124 could not: the harness builds every playstyle deviation from DEFAULT_TACTICS, whose `post` is
 * null, so it prices the engine's own hub exactly as before. 125 DID change what the playstyle row
 * measures, and deliberately — helio now overtakes the main scorer and the main playmaker (his
 * ruling: "Helio will overtake main playmaker and scorrer, as helio becomes both"), so calling it
 * carries two more taxed terms, and a row built on stylePts alone would have been calibrating a
 * price nobody pays. The row now prices the WHOLE plan a style implies (harness.ts, evFor), which
 * is the same number it always was for the other six. The band absorbed it without a constant
 * moving: playstyle random -1.17 -> -0.99 against the -0.30 ceiling and oracle +0.55 -> +1.68
 * against the +0.50 floor — the oracle rose because a helio five whose creator is its best
 * scorer-creator now earns both role benefits, which is the ruling's whole point. The scorer and
 * playmaker rows did not move at all: they call scorerPts and playmakerPts directly, on a balanced
 * plan, and the override only exists while helio is the style. All nine in band, nothing tuned.
 * recal_128 added the TRIANGLE and recal_129 the PICK-AND-POP; the playstyle row is eight choices
 * wide now. Blind -0.90 (128) then -1.12 (129) against the -0.30 ceiling, oracle +1.73 against the
 * +0.50 floor. No tax moved for either. Adding a style makes the blind pick a little worse and
 * can only help the oracle, so the row drifts toward its floor edge and away from its ceiling —
 * the failure to watch for is the OTHER direction, a style so good it lifts the blind read.
 * recal_127 removed the TRANSITION style (his ruling: "Remove transition entirely from the db."),
 * so the playstyle row now picks its blind deviation from six choices instead of seven. Its blind
 * read went from -0.99 to -1.09 against the -0.30 ceiling and the oracle held at +1.68 against the
 * +0.50 floor: transition was a middling call, so dropping it makes the average random pick a
 * little worse and leaves the best pick alone. No tax moved, and none was close to an edge.
 * recal_126's zone deadeye DIET ramp moved 1,935 o_ovrs and 1,311 OVRs (0 d_ovrs) and reshuffled the
 * ovr>=55 pool, and BOTH CRASH taxes broke together on the ORACLE edge — crash off glass +0.488 and
 * crash def glass +0.478 against the +0.50 floor. They are the two taxes whose BENEFIT reads a
 * rebounding attribute (orb, drb) that this round did not touch at all, so what moved was the pool the
 * benefit is averaged over: the fives the oracle picks changed when 1,935 offensive scores did.
 * crashOff swept .40 (+0.488) / .35 (+0.499) / .34 (+0.502) / .30 (+0.512) / .20 (+0.538) / .10 (+0.565)
 * / .00 (+0.592) / -.10 (+0.620) / -.20 (+0.648, blind -0.416) — feasible about -.39 to .34, whose
 * midpoint is NEGATIVE again, so r117's rule stands and the value is the midpoint of the POSITIVE half:
 * .40 -> .17, oracle +0.546 with 0.046 of headroom and blind -0.641 with 0.341. crashDef swept .70
 * (+0.478) / .63 (+0.501) / .60 (+0.511) / .51 (+0.543) / .50 (+0.546) / .40 (+0.582, blind -0.314) /
 * .38 (blind -0.299, the floor exactly) — a WHOLE feasible interval of about .381 to .633, so it takes
 * its true midpoint: .70 -> .51, oracle +0.543 and blind -0.395, 0.043 and 0.095 of room. The seven
 * others held their bands untouched. All nine pass.
 * recal_141's no-vote DBPM relief re-cut (slope 0.60 -> 0.52) moved 5,184 perdefs, 4,832 d_ovrs and
 * 3,423 OVRs — ALL of them down — and so reshuffled the ovr>=55 pool harder than any recent round;
 * TWO taxes broke, and they are the two the file already names as the pool-sensitive pair. HUNT went
 * shallow on its ORACLE edge (+0.481 against the +0.50 floor, blind a healthy -0.601): swept 3.80
 * (+0.481) / 3.755 (+0.499) / 3.75 (+0.500) / 3.70 (+0.521) / 3.60 / 3.50 (blind -0.365) / 3.42
 * (blind -0.301) / 3.415 (blind -0.297) — a whole feasible interval of about 3.420 to 3.750, so it
 * takes its true midpoint: 3.80 -> 3.59, oracle +0.565 and blind -0.436, 0.065 and 0.136 of room.
 * That is hunt's tenth move and its cause is the usual one, except mirrored: this is a DEFENSIVE
 * round, and hunt is the tax whose benefit reads a defensive attribute, so a round that lowers a
 * whole class of perimeter defenders moves the mismatch it is priced on. CRASH DEF GLASS broke on
 * the BLIND edge (-0.271 against the -0.30 ceiling): swept .51 / .55 (-0.299, the ceiling by one
 * thousandth) / .552 (-0.301) / .60 / .70 / .80 / .90 (+0.501) / .903 (+0.500) / .906 (+0.499) —
 * feasible about .552 to .904, true midpoint .73. Re-ratified .51 -> .73, oracle +0.549 and blind
 * -0.427, 0.049 and 0.127 of room. crash off glass held its r126 value of .17 (oracle +0.64, blind
 * -0.42) and the six others held their bands untouched. All nine pass.
 * recal_135's out-of-band vote meter (perdef 193 down, 150 d_ovrs and 107 OVRs down, 0 attributes
 * up; pipeline 133) moved the ovr>=55 sample again, and crash def glass alone broke - on the BLIND
 * edge, by two hundred-thousandths: random -0.29998 against the -0.30 floor, the shallowest break
 * this tax has ever recorded and the closest any row has come to holding. Swept .52 (blind -0.31,
 * oracle +0.53) / .53 (-0.32, +0.53) / .55 (-0.33, +0.52) / .57 (-0.35, +0.51) / .60 (-0.37, +0.50)
 * / .61 (-0.38, +0.4996, FAIL) / .63 (-0.40, +0.49, FAIL) / .66 (-0.42, +0.48, FAIL): the feasible
 * interval is about .515 to .605, bounded below by the blind edge and above by the oracle one, and
 * it takes its true midpoint the way r126 did - .51 -> .56, blind -0.34 with 0.04 of room and
 * oracle +0.52 with 0.02. EIGHTH round in which this one tax is the one that moves; the cause is
 * the one the r116 entry already names - its benefit reads drb, a DEFENSIVE attribute, off a pool
 * this round reshuffled by moving 150 defensive scores. crash off glass held at .17 untouched
 * although its oracle sits on +0.54, and hunt held at 3.80 for the third round running. The law was
 * applied as written: the band broke, the tax moved to meet it, and NOTHING in the OVR chain was
 * touched to hold a band up. All nine pass.
 * recal_137's zone-dominance shape ramp moved 70 o_ovrs and 58 OVRs (0 d_ovrs), which is a small
 * round — but SEVEN of those OVRs cross the harness's own `ovr >= 55` pool line (Alec Burks '24,
 * Eric Piatkowski '01, Walt Williams '01, Buddy Hield '25, Toney Douglas '16, Wayne Ellington '17,
 * Craig Hodges '87), so the fives the
 * benefit is averaged over changed and CRASH DEF GLASS alone broke on the ORACLE edge: +0.418
 * against the +0.50 floor. Same shape as r126's break and for the same reason: this tax's benefit
 * reads `drb`, an attribute the round did not touch at all. crashDef swept .51 (+0.418) / .40
 * (+0.446) / .30 (+0.474) / .25 (+0.488) / .21 (+0.500, the floor exactly) / .20 (+0.503) /
 * .18 (+0.509) / .16 (+0.516) / .155 (blind -0.3035) / .151 (blind -0.3004, the ceiling exactly) —
 * a WHOLE feasible interval of about .1505 to .2095, so it takes its true midpoint by r126's rule:
 * .51 -> .18, oracle +0.509 and blind -0.323, 0.009 and 0.023 of room. It is a NARROW interval and
 * that is worth recording: the two edges are 0.059 apart where r126's were 0.25, so the next round
 * that moves this pool at all will almost certainly have to re-read this tax again. crashOff held
 * at .17 and the seven others held their bands untouched. All nine pass.
 * recal_138's hub-as-a-role round moved 267 o_ovrs and 208 OVRs (0 d_ovrs) and pushed a whole
 * class of playmakers across the ovr>=55 pool line, and — exactly as the note above predicted —
 * CRASH DEF GLASS broke again, this time on the OTHER edge: blind -0.186 against the -0.30 ceiling,
 * because the fives are stronger and a blind glass call costs less against them. Swept .18
 * (blind -0.186) / .30 (-0.272) / .338 (-0.2996, a thousandth under) / .339 (-0.3003, the ceiling
 * exactly) / .40 (oracle +0.583) / .48 (+0.554, blind -0.403) / .60 (+0.510) / .629 (+0.5003, the
 * floor exactly) / .630 (+0.5000, under) — a feasible interval of about .3385 to .6295, and it is
 * WIDE again (0.29, where r137's was 0.059), so it takes its true midpoint by r126's rule:
 * .18 -> .48, oracle +0.554 and blind -0.403, 0.054 and 0.103 of room either way. crashOff held at
 * .17 (oracle +0.664) and the seven others held their bands untouched. All nine pass.
 * recal_139's efficient-interior re-cut moved 152 o_ovrs and 134 OVRs (0 d_ovrs) and reshuffled the
 * ovr>=55 pool again, and TWO taxes broke on the BLIND edge together: hunt -0.2993 and crash def
 * glass -0.2788, both against the -0.30 ceiling, and both for the same reason as the round before
 * — the fives got stronger, so a blind call costs less against them. hunt swept 3.80 (-0.2993) /
 * 3.808 (-0.3054) / 3.85 (-0.3380) / 3.95 (oracle +0.515) / 3.98 (+0.5005) / 3.99 (+0.4957, under)
 * — feasible about 3.801 to 3.981, midpoint 3.89. crashDef swept .48 (-0.2788) / .502 (-0.2943) /
 * .53 (-0.3141) / .67 (+0.549, -0.414) / .80 (+0.509) / .829 (+0.5001) / .831 (+0.4995, under) —
 * feasible about .510 to .830, midpoint .67. Both take their true midpoints by r126's rule:
 * hunt 3.80 -> 3.89, crashDef .48 -> .67. crashOff held at .17 and the six others held their bands
 * untouched. All nine pass.
 * pipeline-139 integration (recal_136 clause-1 ramp, 137 zone-dominance gate ramp, 138 hub-as-a-role at the
 * fallback size, 139 interior-term ramps, landed together on pipeline 142): the merged pool broke HUNT on
 * the BLIND edge (-0.06 at 3.59) and crash def glass on the ORACLE edge (+0.50 at .73). Re-swept once from
 * main's constants: 3.89/.67 (blind -0.31, +0.51 — both on the rail), 4.00/.62 (-0.39/+0.53, -0.45/+0.53),
 * 4.10 (oracle +0.49, fails). Re-ratified hunt 3.59 -> 4.00 and crashDef .73 -> .62, the pair with room on
 * both edges. The branch figures (137 .18, 138 .48, 139 3.89/.67) are superseded, not stacked. Seven others held.
 */
export const TAX = {
  scorer: 0.55,
  playmaker: 1.10,
  tempo: 0.6,
  style: 0.35,
  scheme: 0.80,
  hunt: 4.00,
  crashOff: 0.17,
  crashDef: 0.62,
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
    // A SAVE THAT NAMES A STYLE THAT NO LONGER EXISTS LOADS AS BALANCED, and has since the
    // inside/outside era. recal_127 leans on exactly this for his ruling "Remove transition
    // entirely from the db.": a run in progress whose plan says `transition` opens on balanced —
    // the free default, no call and no price — rather than crashing or resetting the run.
    style: STYLES.some((x) => x.key === t.style) ? t.style : 'balanced',
    // ...and a pre-recal_75 save can carry a scheme that never existed, or one since cut
    scheme: SCHEMES.some((x) => x.key === t.scheme) ? t.scheme : 'matchup',
    // the pnr pair is two DIFFERENT men, both still on the five; anything else is dropped and the
    // engine picks the pair itself again, exactly as it does for a plan that never named one
    pnr: legalPair(t.pnr, names) ? t.pnr : null,
    // ...and the post-up target is ONE man who is still on the five (recal_124), dropped the same
    // way and to the same effect: the engine picks the hub itself again
    post: legalMan(t.post, names) ? t.post : null,
    // ...and so is the helio creator (recal_125), on the same rule
    helio: legalMan(t.helio, names) ? t.helio : null,
  }
}

/** A pair is legal when it names two different men who are both on the five. */
export function legalPair(pair: PnrPair | null | undefined, names: string[]): boolean {
  return !!pair && pair.handler !== pair.screener && names.includes(pair.handler) && names.includes(pair.screener)
}

/**
 * A ONE-MAN CALL is legal when it names a man who is on the five. The post-up target (recal_124)
 * and the helio creator (recal_125) are the same shape, so they share the test — legalPair is the
 * two-man version of exactly this.
 */
export function legalMan(name: string | null | undefined, names: string[]): boolean {
  return !!name && names.includes(name)
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
    // ...and so does the post-up target: it is part of calling the style, not a call of its own
    post: rank >= 2 ? t.post : null,
    helio: rank >= 2 ? t.helio : null,
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
 * min(rim, volume) — the same two facts the o_score bonus keys on.
 *
 * `theirs` is UNREAD since recal_127 removed transition, which was the only style whose fit asked
 * anything about the opponent. The parameter stays: it is the third positional slot every caller
 * already passes and the defensive mirror (schemeFit) still reads its own, so a style that wants
 * the matchup back has somewhere to put it. It is not a leftover, it is a socket.
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

/**
 * THE POP (recal_129, his ruling: "Add pick n pop"). Pick-and-roll where the screener steps OUT, so
 * the term is his JUMPER — the better of his mid-range and his three, capped by his efficiency the
 * way every screener term is — and the roll is not in it at all.
 *
 * Read against screenFit, which is min(max(rim, mid), efficiency), this says exactly one thing: the
 * pop is worth more than the roll ONLY when the screener's THREE is his best shot. A mid-range
 * popper scores identically in both, because recal_120 already put the mid into the pick-and-roll's
 * screener term when it took the mid-range out of the post-up hub — Malone '97 reads 89 either way,
 * Nowitzki '02 reads 93 either way. That is why the Jazz '97 do not move off the pick-and-roll (his
 * ruling: "Jazz 97' pnr Stockton and Malone is more fitting"): the two calls tie on the same man,
 * and a tie goes to the style that was already there. The fives pick-and-pop actually wins are the
 * stretch fours and fives whose three beats both — Bonner, Bertans, Lewis, Murphy, Gallinari.
 */
export const popFit = (x: Attrs) => Math.min(Math.max(x.mid, x['3pt']), x.efficiency)

/**
 * THE PICK-AND-POP PAIR. It IS the pick-and-roll pair — the same `pnr` field on the plan, so a man
 * who names his two and then switches the call between roll and pop keeps them, and no new field
 * exists to reconcile, gate or migrate. Only the AUTO screener differs: with nobody named, the roll
 * picks the best finisher off the screen and the pop picks the best shooter.
 */
export function popPair(five: Player[], pick?: PnrPair | null): { handler: Player | null; screener: Player | null; chosen: boolean } {
  if (legalPair(pick, five.map((p) => p.name))) return pnrPair(five, pick)
  const handler = pnrPair(five, null).handler
  const screener = five.filter((p) => p.attrs.height >= 80).slice().sort((x, y) => popFit(y.attrs) - popFit(x.attrs))[0] ?? null
  return { handler, screener, chosen: false }
}

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
 * WHO THE BALL GOES TO ON THE BLOCK (recal_124, his ruling: "In post up playstyle, there need to be
 * a post up target."). The post-up's mirror of pnrPair, and it works the same way: the plan's own
 * man when it names one who is on the five, otherwise the engine's own pick. Every reader of the
 * target — the fit, the price, the court, the caption — comes through here, so the number and the
 * drawing can never name different men.
 *
 * `postFit` carries NO height term. Height decides who the ENGINE will nominate, not what a man the
 * CALLER names is worth: a six-foot-six back-to-the-basket scorer is a real post-up and is priced
 * as one if you call him, and a guard who cannot finish inside prices at nothing, which is the
 * deviation tax paying for itself. The engine still only ever nominates a man POST_HEIGHT or taller,
 * so no five's unplanned reading moves by a thousandth.
 */
export const POST_HEIGHT = 81
export const postFit = (x: Attrs) => Math.min(x.rim, x.volume) * interior(x)

export function postMan(five: Player[], pick?: string | null): { hub: Player | null; chosen: boolean } {
  if (legalMan(pick, five.map((p) => p.name))) return { hub: five.find((p) => p.name === pick) ?? null, chosen: true }
  const bigs = five.filter((p) => p.attrs.height >= POST_HEIGHT)
  return { hub: bigs.slice().sort((x, y) => postFit(y.attrs) - postFit(x.attrs))[0] ?? null, chosen: false }
}

/**
 * WHO THE OFFENSE RUNS THROUGH (recal_125, his ruling: "In helio, allow me to pick a creator. Helio
 * will overtake main playmaker and scorrer, as helio becomes both"). The third of the same shape:
 * the plan's man when it names one who is on the five, the engine's own otherwise — and the
 * engine's own is scorerCreator's argmax, the same man recal_115 made the featured one, so a plan
 * that names nobody features and prices exactly as it did.
 */
export function heliMan(five: Player[], pick?: string | null): { creator: Player | null; chosen: boolean } {
  if (legalMan(pick, five.map((p) => p.name))) return { creator: five.find((p) => p.name === pick) ?? null, chosen: true }
  if (!five.length) return { creator: null, chosen: false }
  return { creator: five.reduce((m, p) => (scorerCreator(p.attrs) > scorerCreator(m.attrs) ? p : m), five[0]), chosen: false }
}

/**
 * HELIO OVERTAKES THE TWO ROLES (recal_125, his ruling: "Helio will overtake main playmaker and
 * scorrer, as helio becomes both"). While helio is CALLED, the creator holds both jobs and the
 * plan's own `scorer` and `playmaker` are not heard — one man being the whole offense is what the
 * style means, and letting the panel point the three calls at three different men would be three
 * offenses at once. The saved names survive untouched underneath and come back the moment the
 * style changes, exactly the way a pnr pair survives a style he is not currently calling.
 *
 * It is not free. Helio now pays BOTH role taxes and earns both role benefits, so calling it on the
 * wrong man loses on the scorer term and the playmaker term at once — which is the deviation tax
 * law doing the work his ruling asks of it, with no new constant.
 */
export function roleMen(t: Tactics, five: Player[]): { scorer: string | null; playmaker: string | null; helio: string | null } {
  if (t.style === 'helio') {
    const c = heliMan(five, t.helio).creator
    if (c) return { scorer: c.name, playmaker: c.name, helio: c.name }
  }
  return { scorer: t.scorer, playmaker: t.playmaker, helio: null }
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

/**
 * THE TRIANGLE (recal_128, his ruling: "Add Triangle") — the first style added since recal_58's set,
 * and it is not a play, it is a READ. Three facts, and no creator term at all:
 *
 *   POST OPTION   a man who can be fed on the block: the best max(rim, mid) on the floor. TRI_POST
 *                 70 is the gate — under it there is no entry pass and bestStyle will not read the
 *                 five as a triangle however the rest lands. It is a low bar on purpose (the wheel's
 *                 p10 is 72): the post option is what makes the set POSSIBLE, not what makes it good.
 *   READERS       men who can BOTH pass and shoot the mid-range: playvol >= TRI_PV 50 and
 *                 mid >= TRI_MID 60. This is the discriminator and it carries the fit. Over the
 *                 1,255 wheel fives the median is ONE and the 90th percentile is two, so the third
 *                 reader is the rare thing and is paid like it: TRI_READ 8 for each of the first
 *                 two, TRI_READ3 16 for the third and fourth. A convex term, because the triangle
 *                 needs three men who can play out of it and two is a different offense.
 *   SEPARATION    recal_115's scorerCreator, INVERTED. The gap between the best man and the mean of
 *                 the other four, charged at TRI_SEP 0.8 for every point over TRI_SEP_FREE 22 (the
 *                 wheel's median gap, so an ordinary five pays nothing). A five that leans on one
 *                 creator is running that man's offense, not a read-and-react one.
 *
 * Plus the team's ball security at 0.15 — the set dies on a bad pass — and a 14 base so the whole
 * thing sits on the same 0-100 axis the other six do. An ordinary five reads about 50 and loses to
 * the free default; it wins 72 of the 1,255 wheel fives (5.7%).
 *
 * MEASURED, and reported rather than tuned away: of the fives his ruling named, the ones the CARDS
 * agree with are Jordan's second three-peat Bulls ('96 73, '97 75) and the Kobe-Gasol Lakers ('09
 * 70). The first three-peat Bulls and the Shaq-Kobe Lakers do not have the readers — Pippen's mid
 * was 46-55 then, Grant 28-30, Cartwright 23; Harper '00 reads mid 8, Horry 40, Shaw 28 — so they
 * read helio and post-up, which is what a superstar plus role players is. Loosening the reader
 * thresholds far enough to catch them was measured first and takes the triangle to 205 of 1,255,
 * which is not a signature system, it is a default.
 */
export const TRI_POST = 70
export const TRI_PV = 50
export const TRI_MID = 60
export const TRI_READ = 8
export const TRI_READ3 = 16
export const TRI_SEP = 0.8
export const TRI_SEP_FREE = 22
/** The best man on the floor to feed on the block — the triangle's post option, and its featured man. */
export const postOption = (five: Player[]): Player | null =>
  five.length ? five.reduce((m, p) => (Math.max(p.attrs.rim, p.attrs.mid) > Math.max(m.attrs.rim, m.attrs.mid) ? p : m), five[0]) : null
/** Men who can both pass and shoot the mid-range — the ones the triangle actually reads through. */
export const triangleReaders = (five: Player[]): Player[] => five.filter((p) => p.attrs.playvol >= TRI_PV && p.attrs.mid >= TRI_MID)

export function styleFit(style: Style, five: Player[], _theirs?: Player[], call?: StyleCall | null): number {
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
      const { handler: h, screener: d } = pnrPair(five, call?.pnr)
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
      // HIS man when the plan names one, the engine's hub when it does not (recal_124) — one
      // function, postMan, so the fit and the floor are fed to the same player. A called target who
      // is a worse post man than the engine's pick scores less here and the style is worth less,
      // which is the deviation tax law applied to the second half of the call.
      const { hub } = postMan(five, call?.post)
      const post = hub ? Math.max(0, postFit(hub.attrs)) : 0
      return post * 0.7 + mean(five.filter((p) => p.name !== hub?.name), (p) => p.attrs['3pt']) * 0.3
    }
    case 'pickpop': {
      // the pick-and-roll's three terms and its three weights, with the ROLL swapped for the POP
      // (recal_129). Identical weights on purpose: the two calls are then separated by the screener
      // and by nothing else, so pick-and-pop wins exactly when the pop is worth more than the roll.
      const { handler: ph, screener: pd } = popPair(five, call?.pnr)
      const prest = five.filter((p) => p.name !== ph?.name && p.name !== pd?.name)
      return 0.4 * (ph ? handlerFit(ph.attrs) : 0) + 0.35 * (pd ? popFit(pd.attrs) : 0) + 0.25 * mean(prest, (p) => p.attrs['3pt'])
    }
    case 'triangle': {
      const post = postOption(five)
      const readers = Math.min(triangleReaders(five).length, 4)
      const e = a.map(scorerCreator).sort((x, y) => y - x)
      const sep = e[0] - (e.length > 1 ? e.slice(1).reduce((t, v) => t + v, 0) / (e.length - 1) : 0)
      return (
        14 +
        0.25 * (post ? Math.max(post.attrs.rim, post.attrs.mid) : 0) +
        TRI_READ * Math.min(readers, 2) +
        TRI_READ3 * Math.max(0, readers - 2) +
        0.15 * avg((x) => x.ballsec) -
        TRI_SEP * Math.max(0, sep - TRI_SEP_FREE)
      )
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
  const hasPost = five.some((p) => Math.max(p.attrs.rim, p.attrs.mid) >= TRI_POST)
  for (const s of STYLES) {
    if (s.key === 'balanced') continue
    if (s.key === 'fiveout' && shy >= 2) continue
    if (s.key === 'helio' && duo) continue
    // ...and THE TRIANGLE NEEDS AN ENTRY PASS (recal_128): a five with nobody who can be fed on the
    // block has no triangle to run, whatever the rest of the fit lands on. Called is still called.
    if (s.key === 'triangle' && !hasPost) continue
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
export function featured(style: Style, five: Player[], call?: StyleCall | null): Player[] {
  if (five.length < 2) return []
  switch (style) {
    case 'helio':
      return [heliMan(five, call?.helio).creator].filter((p): p is Player => !!p)
    case 'postup':
      return [postMan(five, call?.post).hub].filter((p): p is Player => !!p)
    case 'triangle':
      return [postOption(five)].filter((p): p is Player => !!p)
    case 'pickpop': {
      const { handler, screener } = popPair(five, call?.pnr)
      return [handler, screener].filter((p): p is Player => !!p)
    }
    case 'pnr': {
      const { handler, screener } = pnrPair(five, call?.pnr)
      return [handler, screener].filter((p): p is Player => !!p)
    }
    default:
      return []
  }
}

/** The style's worth: 0.06 x (fit - 60) minus the deviation tax, plus the tempo synergies. */
export function stylePts(t: Tactics, five: Player[], theirs?: Player[]): number {
  if (t.style === 'balanced') return 0
  let pts = clamp(0.11 * (styleFit(t.style, five, theirs, t) - 55) - TAX.style, -2.5, 2.5)
  if (t.style === 'postup' && t.tempo === 'slow') pts += 0.5 // the post grinds best at a crawl
  // recal_127 removed transition and its two tempo synergies with it; post-up's is the only one left
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
  // HELIO IS BOTH ROLES (recal_125). roleMen hands back the creator for both jobs while helio is
  // called, and the plan's own two names otherwise; the labels say which it is, so a reader of the
  // itemised points is never left wondering why a scorer he did not pick is being priced.
  const roles = roleMen(t, five)
  const tag = roles.helio ? ' (helio)' : ''
  if (roles.scorer && five.some((p) => p.name === roles.scorer)) parts.push({ label: `main scorer${tag}`, pts: scorerPts(roles.scorer, five, theirs) })
  if (roles.playmaker && five.some((p) => p.name === roles.playmaker))
    parts.push({ label: `main playmaker${tag}`, pts: playmakerPts(roles.playmaker, five, theirs) })
  if (t.style !== 'balanced')
    parts.push({
      label: `${STYLES.find((x) => x.key === t.style)?.label ?? t.style} (fit ${Math.round(styleFit(t.style, five, theirs, t))})`,
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
  const roles = roleMen(plan, five)
  const si = roles.scorer ? five.findIndex((q) => q.name === roles.scorer) : -1
  let usg: number[] | undefined
  let brick: number | undefined
  if (si >= 0) {
    const uc = base[si]
    const scale = (100 - uc - 8) / (100 - uc)
    usg = base.map((u, i) => (i === si ? u + 8 : u * scale))
    const c = creation(five[si].attrs)
    brick = ((KNOBS.SLOPE_UP_MAX - (KNOBS.SLOPE_UP_MAX - KNOBS.SLOPE_UP_MIN) * c) * 8) / 100
  }
  const pi = roles.playmaker ? five.findIndex((q) => q.name === roles.playmaker) : -1
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
