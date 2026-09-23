import RAW from '../data/players_stats.json'
import STATS from '../data/stats.json'
import { eligible, type Pos } from './positions'
import type { Player } from './types'

/**
 * The pool: data/build_ratings.py output, loaded verbatim. `name` is the game's
 * identity, so the handful of real same-name players (two Eddie Johnsons, …)
 * get their peak year appended — the only edit made to the data, and it never
 * touches a rating.
 */
/**
 * The pool: data/build_ratings.py output, loaded verbatim. One entry per
 * player-SEASON ("LeBron James '13"); the pipeline guarantees unique names.
 */
export const PLAYERS: Player[] = RAW as Player[]

/**
 * Short readable archetype, derived purely from the ratings.
 *
 * Ordered most specific first. Every rule that names a strength requires that
 * strength to be good in absolute terms, never merely better than the same
 * player's other numbers — otherwise a 62-inside, 18-outside centre reads as a
 * "post scorer" because he is even worse from range, and a guard with 60
 * perimeter D reads as a stopper because his rim protection is worse still.
 */
/**
 * Tag thresholds are relaxed by RELAX points before matching: every "at least"
 * floor drops by RELAX and every "under" ceiling rises by it. The audit's
 * relaxation pass sweeps this in steps of 3 until the BALANCED fallback holds
 * under 12% of the pool, with the rule ORDER untouched and the canonical
 * player checks still passing. Set by `npm run tags -- --sweep`.
 */
export const RELAX = 0

/**
 * THE TREE, as data. Each rule is a tag and a test; the list is walked in order and the first match
 * wins — exactly the if-chain this replaces. The order used to BE the source code, which meant only
 * an edit could change it; now it is a list, so it can be ranked in the app and reset to this default.
 * The default order shipped here is the ratified law.
 */
/**
 * THE NUMERIC LAW (recal_22 #5). Every condition in the tree is a number against a threshold. Two
 * pieces of vocabulary that used to be words are defined here, in numbers, and nowhere else:
 *
 *   BIG — a SHAPE, read from the sheet, not the card's `big` flag:
 *         (rimprot >= 55 AND 3pt < 45) OR (rim >= 60 AND 3pt < 40) OR rimprot >= 80
 *   HEIGHT CLASSES — guard <= 76, wing 77-80, big >= 81 inches.
 *
 * The flag stays where it belongs (compute_ovr, for d_score weights and the OVR cap, where a lifetime
 * guard is excluded by position). The tree judges the sheet in front of it.
 */
export const GUARD_HT = 76
export const WING_HT = 77
export const BIG_HT = 81
export const isBigShape = (a: Player['attrs']) =>
  (a.rimprot >= 55 && a['3pt'] < 45) || (a.rim >= 60 && a['3pt'] < 40) || a.rimprot >= 80

export interface Rule {
  tag: string
  test: (c: Ctx) => boolean
}
/** Everything a rule may read: the sheet, the derived zones, and the relaxation-aware comparators. */
export interface Ctx {
  p: Player
  a: Player['attrs']
  paint: number
  mid: number
  three: number
  zone: number
  /** The numeric BIG SHAPE above — never the card's flag. */
  big: boolean
  h: number
  /** at least: the floor drops by `relax`. */
  ge: (v: number, t: number) => boolean
  /** under: the ceiling rises by `relax`. */
  lt: (v: number, t: number) => boolean
  /** height comparators — never relaxed, because height is inches, not a 0-99 rating. */
  geH: (v: number, t: number) => boolean
  ltH: (v: number, t: number) => boolean
  solid: number
  /**
   * THE GLUE WINDOW. The same four dimensions `solid` counts, plus ball security, scored against a
   * BAND rather than a floor: how many of the five sit between 55 and 75. `glueMax` is the best of
   * those five. Together they name the shape no floor-based rule can — above average at several
   * things, elite at none.
   */
  glue: number
  glueMax: number
  /**
   * The positions Basketball-Reference ever listed for this man — the SAME list the draft slots him
   * with, so the labeler and the floor cannot disagree about what he is. Not a rating: the numeric law
   * governs everything else, and this is the one fact that is a fact.
   */
  pos: Pos[]
  /**
   * THE SIGNATURE — the one family this card is top-quartile at, read against the LEAGUE rather than
   * against a 0-99 threshold (see the signature block at the bottom of RULES). `null` when nothing on
   * the sheet reaches the floor. `sigPct` is that family's league percentile, 0-1.
   */
  sig: SigFamily | null
  sigPct: number
  /** The league percentiles the signature rules read by name: perimeter D, the three, rim protection. */
  pctPerdef: number
  pct3: number
  pctRimprot: number
  /** SIG_FLOOR, carried on the context so a rule prints `pct(perdef) >= 0.75` in any build. */
  sigFloor: number
}

/**
 * LEAGUE PERCENTILE. pct(k, v) is the share of the pool whose bar k is at or under v — bisect_right on
 * that bar's sorted column, so O(log n) per lookup. The columns are built once, at module load, from
 * PLAYERS: `ctxFor` is called for every card on every render and must never sort anything.
 */
export type SigBar = 'perdef' | 'rimprot' | 'playvol' | 'volume' | '3pt' | 'mid' | 'rim' | 'orb' | 'drb' | 'perimdisrupt' | 'fouldraw'
const SIG_BARS: SigBar[] = ['perdef', 'rimprot', 'playvol', 'volume', '3pt', 'mid', 'rim', 'orb', 'drb', 'perimdisrupt', 'fouldraw']
const SORTED = Object.fromEntries(
  SIG_BARS.map((k) => [k, Float64Array.from(PLAYERS.map((p) => p.attrs[k])).sort()]),
) as Record<SigBar, Float64Array>
export function pct(k: SigBar, v: number): number {
  const col = SORTED[k]
  let lo = 0
  let hi = col.length
  while (lo < hi) {
    const m = (lo + hi) >>> 1
    if (col[m] <= v) lo = m + 1
    else hi = m
  }
  return col.length ? lo / col.length : 0
}

/**
 * THE ONE DIAL. A family is a signature when the card sits in the league's top quartile at it.
 * Measured on the pool: 0.80 leaves 12.6% of cards Balanced, 0.75 leaves 6.8%, 0.70 leaves 3.1%.
 */
export const SIG_FLOOR = 0.75
/** What a man can be KNOWN for — tried first, in this order on a tie. */
const IDENTITY = ['perdef', 'rimprot', 'playvol', 'volume', '3pt', 'mid', 'rim'] as const
/** What he can be known for when none of those reaches the floor. `reb` is the better of the two glasses. */
const SUPPORTING = ['reb', 'perimdisrupt', 'fouldraw'] as const
export type SigFamily = (typeof IDENTITY)[number] | (typeof SUPPORTING)[number]
export interface Signature {
  sig: SigFamily | null
  sigPct: number
  pctPerdef: number
  pct3: number
  pctRimprot: number
}
/** A sheet's signature never changes, so it is read once per sheet and remembered. */
const SIG_MEMO = new WeakMap<Player['attrs'], Signature>()
export function signature(a: Player['attrs']): Signature {
  const hit = SIG_MEMO.get(a)
  if (hit) return hit
  const f: Record<SigFamily, number> = {
    perdef: pct('perdef', a.perdef),
    rimprot: pct('rimprot', a.rimprot),
    playvol: pct('playvol', a.playvol),
    volume: pct('volume', a.volume),
    '3pt': pct('3pt', a['3pt']),
    mid: pct('mid', a.mid),
    rim: pct('rim', a.rim),
    reb: Math.max(pct('orb', a.orb), pct('drb', a.drb)),
    perimdisrupt: pct('perimdisrupt', a.perimdisrupt),
    fouldraw: pct('fouldraw', a.fouldraw),
  }
  // the highest score, FIRST LISTED on a tie — strictly-greater, walked in the listed order
  const best = (ks: readonly SigFamily[]) => ks.reduce((b, k) => (f[k] > f[b] ? k : b), ks[0])
  let k = best(IDENTITY)
  if (f[k] < SIG_FLOOR) k = best(SUPPORTING)
  const out: Signature = {
    sig: f[k] >= SIG_FLOOR ? k : null,
    sigPct: f[k],
    pctPerdef: f.perdef,
    pct3: f['3pt'],
    pctRimprot: f.rimprot,
  }
  SIG_MEMO.set(a, out)
  return out
}

export const RULES: Rule[] = [
  // Tree v2. Evaluated top-down, FIRST MATCH WINS. Names describe style,
  // never tier — quality is OVR's job. Thresholds are tunable; the order is law.
  { tag: 'Defensive playmaker', test: (c) => c.ge(c.a.playvol, 80) && c.ge(c.a.perdef, 80) && c.lt(c.zone, 55) },
  { tag: 'Point god', test: (c) => c.ge(c.a.playvol, 97) && c.lt(c.a.volume, 83) && c.ltH(c.h, 79) },
  { tag: 'Offensive engine', test: (c) => c.ge(c.a.playvol, 85) && c.ge(c.a.volume, 90) },
  // TRIPLE-DOUBLE THREAT — his ruling: the load floor drops to 60. Filling three columns is about
  // doing all three, not about carrying a star's usage while you do it.
  // HIS RULING (2026-09-23): "Change triple double threat to playvol >= 80 && drb >= 80 && volume >= 50".
  // 9 -> 17 cards: Giannis '20/'22/'23/'24 (from Two-way anchor / star), Jokić '18, Sabonis '23/'24, Grant Hill '96.
  { tag: 'Triple-double threat', test: (c) => c.ge(c.a.playvol, 80) && c.ge(c.a.drb, 80) && c.ge(c.a.volume, 50) },
  { tag: 'Point forward', test: (c) => c.geH(c.h, 79) && c.ltH(c.h, 83) && c.ge(c.a.playvol, 70) && c.lt(c.a.volume, 92) },
  // FLOOR GENERAL — his ruling: the table-setter has to take care of the ball. A lead creator
  // who coughs it up is a floor raiser or a scorer, not the man organising the offence. (">60"
  // is written as >= 61; ballsec is an integer percentile.)
  // HIS RULING (2026-09-21): "Loosen the floor general gate to 50". The ball-security floor was 61 — his own earlier
  // ruling that a floor general must hold the ball — and it turned away 64 passers at playmaking 88-97 (Kevin Johnson
  // '89, Andre Miller '01, Isiah Thomas '87, Deron Williams '12). Once the signature block's LIMIT stopped calling them
  // Pass-first playmakers they had no name at all. 50 is the league's median ball security: he still has to hold it
  // as well as the average man.
  { tag: 'Floor general', test: (c) => c.ge(c.a.playvol, 88) && c.lt(c.a.volume, 88) && c.ge(c.a.ballsec, 50) },
  { tag: 'Floor raiser', test: (c) => c.ge(c.a.playvol, 90) && c.lt(c.a.efficiency, 45) && c.ge(c.a.volume, 85) },
  { tag: 'Two-way anchor', test: (c) => c.geH(c.h, BIG_HT) && c.ge(c.a.rimprot, 90) && c.ge(c.p.o_ovr, 78) },
  { tag: 'Unicorn', test: (c) => c.ge(c.three, 50) && c.ge(c.a.rimprot, 85) && c.geH(c.h, 86) && c.p.ovr >= 70 },
  { tag: 'Two-way star', test: (c) => c.ge(c.p.o_ovr, 85) && c.ge(c.p.d_ovr, 85) },
  // TWO-WAY GUARD — the smallest man on the two-way list, and the most specific claim of the four: a
  // height class, an elite perimeter number, a real second-handler's passing rate, and an offence that
  // is good without being a star's. Above All-around star deliberately: its 80/80 would otherwise take
  // the top of the o_ovr 70-84 band before this rule was ever asked.
  { tag: 'Two-way guard', test: (c) => c.ltH(c.h, 79) && c.ge(c.a.perdef, 85) && c.ge(c.p.o_ovr, 70) && c.lt(c.p.o_ovr, 85) && c.ge(c.a.playvol, 55) },
  // the tier below the two-way star: good at BOTH ends without being elite at either. The defensive
  // floor sits under the offensive one — the claim is a scorer who holds up, not a symmetric card —
  // and an OVR floor keeps the tag on men who are actually stars. Placed here so the two-way claims
  // read in order — 85/85 star, the guard, the all-around star, 78/85 wing.
  { tag: 'All-around star', test: (c) => c.ge(c.p.o_ovr, 80) && c.ge(c.p.d_ovr, 75) && c.ge(c.a.playvol, 50) && c.ge(c.p.ovr, 82) },
  { tag: 'Two-way wing', test: (c) => c.ltH(c.h, BIG_HT) && c.ge(c.p.o_ovr, 78) && c.ge(c.p.d_ovr, 85) },
  // THE ONE-END TIERS. Every claim about a man being good at both ends has been made by now, so these
  // two catch the men who are only good at one — and they sit above the diet tags because "elite
  // defender" says more about a 90-defence card than "enforcer" does.
  { tag: 'Offensive superstar', test: (c) => c.ge(c.p.o_ovr, 85) && c.lt(c.p.d_ovr, 70) },
  { tag: 'Elite defender', test: (c) => c.ge(c.p.d_ovr, 90) && c.lt(c.p.o_ovr, 70) },
  // TWO-WAY BIG — the Sikma hole: a big whose defence carries him, with an offence that is real
  // and secondary rather than absent. Closed at BOTH ends on purpose: above 95 defence he is an
  // anchor or an elite defender and keeps that name, and above 77 offence he is a two-way star.
  { tag: 'Two-way big', test: (c) => c.big && c.ge(c.p.d_ovr, 85) && c.lt(c.p.d_ovr, 96) && c.ge(c.p.o_ovr, 60) && c.lt(c.p.o_ovr, 78) },
  // THREE REAL LEVELS — his ruling: the arc floor rises to 65, level with the other
  // two. A man is not a three-level scorer on a 59 from range; that is two levels
  // and a jumper you can go under.
  { tag: 'Three-level scorer', test: (c) => c.ge(c.a.volume, 80) && c.ge(c.a.efficiency, 75) && c.ge(c.paint, 65) && c.ge(c.mid, 65) && c.ge(c.three, 65) },
  { tag: 'Midrange maestro', test: (c) => c.ge(c.mid, 85) && c.lt(c.three, 40) && c.ge(c.a.volume, 90) },
  { tag: 'Slasher', test: (c) => c.ltH(c.h, BIG_HT) && c.ge(c.paint, 80) && c.ge(c.a.fouldraw, 85) && c.lt(c.three, 45) },
  { tag: 'Paint beast', test: (c) => c.ge(c.paint, 90) && c.ge(c.a.volume, 90) && c.lt(c.three, 25) && c.geH(c.h, 81) },
  // A freight train is a MAN, not just a diet: he has to be small enough for going through people to
  // be the remarkable thing about it, and big enough that it is going THROUGH them rather than around.
  // Small forward on his lifetime card, or 6'4" to 6'8" — the positions list is the same fact the draft
  // slots him with, and height is inches, so neither relaxes.
  { tag: 'Freight train', test: (c) => c.ge(c.paint, 85) && c.ge(c.a.volume, 75) && c.lt(c.three, 40) && c.lt(c.mid, 60) && (c.pos.includes('SF') || (c.geH(c.h, 76) && c.ltH(c.h, 81))) },
  { tag: 'Tank', test: (c) => c.geH(c.h, BIG_HT) && c.ge(c.paint, 80) && c.ge(c.a.fouldraw, 80) && c.lt(c.a.ft, 60) },
  { tag: 'Free throw merchant', test: (c) => c.ge(c.a.fouldraw, 90) && c.ge(c.a.ft, 80) },
  { tag: 'Spark plug', test: (c) => c.ltH(c.h, 75) && c.ge(c.a.volume, 80) && c.p.o_ovr < 85 },
  { tag: 'Flamethrower', test: (c) => c.ge(c.three, 90) && c.ge(c.a.volume, 70) },
  { tag: 'Sniper', test: (c) => c.ge(c.three, 90) && c.lt(c.a.volume, 40) },
  { tag: 'Deadeye', test: (c) => c.ge(c.a.ft, 80) && c.ge(c.three, 80) && c.lt(c.a.volume, 50) && c.lt(c.p.o_ovr, 80) && c.lt(c.p.d_ovr, 70) },
  { tag: 'Catch-and-shoot wing', test: (c) => c.ge(c.three, 80) && c.lt(c.a.playvol, 40) && c.lt(c.a.volume, 55) && c.geH(c.h, 77) && c.ltH(c.h, 83) && (c.pos.includes('SG') || c.pos.includes('SF')) },
  // HEIGHT IS THE BIG HERE, not the shape. The numeric BIG SHAPE requires 3pt < 45 (or < 40), which
  // this rule then contradicts with 3pt >= 70 — so the only man who could ever satisfy both was one
  // with rimprot >= 80, the shape's third clause. That left the tag naming rim protectors who shoot
  // and turning away every actual stretch four: Mirotić is 6'10" at 86 from three and read BALANCED.
  // 6'10" and up is the gate, and it is inches, so it never relaxes.
  { tag: 'Stretch big', test: (c) => c.ge(c.three, 70) && c.geH(c.h, 82) },
  // the complete seven-footer: he scores at the rim, has a jumper, and cleans the defensive glass.
  // Placed with the big diets and ABOVE the rebounding and energy claims, so a big who does all three
  // is named for that rather than for the one of them a later rule notices first.
  { tag: 'All-around big', test: (c) => c.ge(c.paint, 70) && c.ge(c.mid, 60) && c.ge(c.a.drb, 70) && c.geH(c.h, 83) },
  { tag: 'Glass cleaner', test: (c) => c.ge(c.a.orb, 90) && c.ge(c.a.drb, 90) },
  { tag: 'Energy big', test: (c) => c.geH(c.h, BIG_HT) && c.ge(c.a.orb, 85) && c.lt(c.a.volume, 40) },
  { tag: 'Enforcer', test: (c) => c.geH(c.h, BIG_HT) && c.ge(c.a.rimprot, 70) && c.lt(c.a.discipline, 35) },
  { tag: 'Anchor', test: (c) => c.ge(c.a.rimprot, 90) },
  // ELITE ROLE PLAYER is a TIER name, not a style — the one exception to the law above, added on
  // Tomer's explicit repeated order. It sits above Stopper because a shooter who defends is not a
  // stopper who happens to shoot, and Stopper now says so itself with a 3pt ceiling.
  { tag: 'Elite role player', test: (c) => c.lt(c.a.volume, 60) && c.ge(c.a.playvol, 45) && c.lt(c.a.playvol, 60) && c.ge(c.three, 50) && c.p.o_ovr > 60 && c.p.d_ovr > 75 },
  // 3&D catches the rest of the shape: the shooting and the defending, without the passing or the
  // offensive standard that make an ELITE role player.
  { tag: '3&D', test: (c) => c.ge(c.three, 75) && c.ge(c.a.perdef, 70) && c.lt(c.a.volume, 60) },
  // guards several spots without being a one-end specialist — neither number is allowed to be elite
  { tag: 'Versatile defender', test: (c) => c.ge(Math.min(c.a.perdef, c.a.rimprot), 68) && c.p.d_ovr >= 78 && c.p.o_ovr < 80 },
  { tag: 'Stopper', test: (c) => c.ge(c.a.perdef, 90) && c.lt(c.a.volume, 60) && c.lt(c.p.o_ovr, 70) && c.lt(c.three, 60) },
  { tag: 'Pest', test: (c) => c.ltH(c.h, 76) && c.ge(c.a.perimdisrupt, 90) },
  // the guard who does some of both and neither at a lead handler's rate. Height is a physical fact and
  // never relaxes, so geH/ltH; the two windows are ordinary floors and ceilings.
  { tag: 'Combo guard', test: (c) => c.geH(c.h, 72) && c.ltH(c.h, 77) && c.ge(c.a.playvol, 50) && c.lt(c.a.playvol, 75) && c.ge(c.a.volume, 60) && c.lt(c.a.volume, 85) },
  { tag: 'Throwback', test: (c) => c.ge(c.mid, 75) && c.lt(c.three, 20) },
  { tag: 'Post scorer', test: (c) => c.ge(c.paint, 70) && c.ge(c.mid, 65) && c.lt(c.three, 40) && c.lt(c.a.playvol, 60) && (c.pos.includes('PF') || c.pos.includes('C')) },
  // r29's two tags, defined on this side because the round never arrived. Both sit LATE, under every
  // specific diet: a Paint beast, a Flamethrower or a Free throw merchant is a better answer than "he scores",
  // so the generic pair only catches the men no diet described. Machine first — it is the stronger claim.
  { tag: 'Scoring machine', test: (c) => c.ge(c.a.volume, 90) && c.ge(c.zone, 88) && c.ge(c.a.efficiency, 50) && c.ge(c.a.volume - c.a.playvol, 20) },
  // the machine's inefficient twin: he takes everything and does not convert. Placed directly under it,
  // so a man with an elite zone AND a scoring gap is still named for the diet first. ">90" is ge(91).
  { tag: 'Volume shooter', test: (c) => c.lt(c.a.efficiency, 60) && c.ge(c.a.volume, 91) && c.lt(c.a.playvol, 60) },
  { tag: 'Scorer', test: (c) => c.ge(c.a.volume, 75) && c.ge(c.zone, 75) && c.lt(c.a.playvol, 45) && c.ltH(c.h, 81) },
  // GLUE GUY — the shape BALANCED was hiding. Every rule above names a strength; this one names the
  // absence of one, which is why it can only be written as a BAND. Four of the five glue dimensions
  // between 55 and 75, nothing at 80, and enough playmaking volume (40) that he is on the floor
  // touching the ball rather than merely unremarkable. Directly above All-around, which is the same
  // claim with floors instead of a window and would otherwise take him first.
  // CO-STAR — the second star: an offence in the star band with no defensive claim to match it.
  // A tier name, and it sits at the very bottom with the other generic claims for the same reason
  // they do. Its band holds 252 cards and nearly every one of them already has a diet that says
  // more — a Point forward, a Throwback, a Flamethrower. Down here it only names the men no rule
  // above described, which is exactly the hole it was written for.
  { tag: 'Co-star', test: (c) => c.ge(c.p.o_ovr, 78) && c.lt(c.p.o_ovr, 90) && c.ge(c.p.d_ovr, 60) && c.lt(c.p.d_ovr, 85) },
  { tag: 'Glue guy', test: (c) => c.glue >= 4 && c.lt(c.glueMax, 80) && c.ge(c.a.playvol, 40) && c.lt(c.a.volume, 65) },
  { tag: 'All-around', test: (c) => c.lt(Math.max(c.zone, c.a.playvol, c.a.perdef, c.a.rimprot, c.a.orb, c.a.drb), 88) && c.solid >= 4 },
  // THE SIGNATURE BLOCK — his complaint: "Too many players have balanced archetype". Six cards in ten
  // fell out of the bottom of the tree, because every rule above asks for a number that is good in
  // ABSOLUTE terms and most of a rotation has no such number. These fifteen ask a different question:
  // what is this man best at, measured against the LEAGUE? A family is his signature when he sits in
  // the pool's top quartile at it (SIG_FLOOR — the one dial). Still style, never tier: there is no OVR
  // gate anywhere in the block, and a 58 and an 88 who both live on the pass are both table setters.
  //
  //   TWO-WAY SHOOTER is asked first: under 6'10", top quartile at perimeter D AND from three.
  //   Otherwise the signature is the best of the IDENTITY families — perdef, rimprot, playvol, volume,
  //   3pt, mid, rim, first listed on a tie. If the best of those is under the floor, it is the best of
  //   the SUPPORTING families instead — reb (the better glass), perimdisrupt, fouldraw. If that is
  //   under the floor too he has no signature, and he is Balanced exactly as he was.
  //
  // They sit at the very BOTTOM, under every rule that was already here, so no card that had a name can
  // lose it — only the men who fell through can be caught. Each rule states its whole condition, the
  // negations included, so ranking the fifteen among themselves moves nobody except across the Two-way
  // shooter line. MEASURED at the 0.75 floor, on 10,000 cards: the fallback goes 6,095 -> 675, from 61%
  // of the pool to 6.8%, and the largest of them (Pass-first playmaker, 786) is under 8%.
  //
  // `relax` is IGNORED by the whole block. The floor is a percentile, not a 0-99 rating, and RELAX
  // points of a quartile mean nothing; and the rating splits inside a family (volume 65, volume 60,
  // rim against mid) are not floors at all — they decide WHICH of two names a man gets, so easing one
  // side would only make the two rules overlap. They are written as plain comparisons for that reason.
  // 6'9" is written as 81 here rather than BIG_HT: ruleText prints a rule from its SOURCE, and a
  // production build renames the constant, so the screen would read `h < Ne`.
  // THE LIMIT (his ruling: "push these new archetypes, but with a limit. Meaning, I dont want floor general to be
  // classified as pass first playmaker"). A role player's name stops where its star counterpart starts: playmaking
  // under Floor general's 88, perimeter defence under Stopper's 90, rim protection under Anchor's 90, disruption under
  // Pest's 90. A man at or past that bar whom the star rule still declined (Floor general wants ball security 61, his
  // own ruling) is NOT dressed in the lesser name — he falls through to the fallback, where he can be seen and ruled on.
  { tag: 'Two-way shooter', test: (c) => c.ltH(c.h, 82) && c.pctPerdef >= c.sigFloor && c.pct3 >= c.sigFloor },
  // a defender's signature on a big's body is rim protection if he has that too; otherwise he is what
  // Pippen was — a man who guards the perimeter at 6'9".
  { tag: 'Defensive specialist', test: (c) => c.sig === 'perdef' && (c.ltH(c.h, 81) || c.pctRimprot < c.sigFloor) && c.a.perdef < 90 },
  { tag: 'Shot blocker', test: (c) => (c.sig === 'rimprot' || (c.sig === 'perdef' && c.geH(c.h, 81) && c.pctRimprot >= c.sigFloor)) && c.a.rimprot < 90 && c.a.perdef < 90 },
  // the passers split on whether he is also looking for his own
  { tag: 'Pass-first playmaker', test: (c) => c.sig === 'playvol' && c.a.volume < 65 && c.a.playvol < 88 },
  { tag: 'Ball-dominant guard', test: (c) => c.sig === 'playvol' && c.a.volume >= 65 && c.a.playvol < 88 },
  // HIS RULING ON THE NAMES: "focus on lower level players, not go to scorer". The men this block reaches are role
  // players — its fifteen groups have median OVRs of 49 to 63 — so the names are a role player's names. The
  // scoring-load signature is split by whether the shots go in: more than half of that group converts under 40.
  { tag: 'Microwave scorer', test: (c) => c.sig === 'volume' && c.a.efficiency >= 40 },
  { tag: 'Gunner', test: (c) => c.sig === 'volume' && c.a.efficiency < 40 },
  { tag: 'Midrange specialist', test: (c) => c.sig === 'mid' && (c.ltH(c.h, 81) || c.paint >= c.mid || c.a.volume >= 60) },
  { tag: 'Paint scorer', test: (c) => c.sig === 'rim' && c.geH(c.h, 81) },
  { tag: 'Rim attacker', test: (c) => c.sig === 'rim' && c.ltH(c.h, 81) },
  { tag: 'Spot-up shooter', test: (c) => c.sig === '3pt' && c.ltH(c.h, 81) && c.a.volume < 60 },
  { tag: 'Perimeter scorer', test: (c) => c.sig === '3pt' && c.ltH(c.h, 81) && c.a.volume >= 60 },
  // SHOOTING BIG — a deleted name stays deleted, so this is not the pick-and-pop big. 6'9" and up whose
  // signature is the three, or the midrange when the jumper beats his rim number and the load is light.
  { tag: 'Shooting big', test: (c) => c.geH(c.h, 81) && (c.sig === '3pt' || (c.sig === 'mid' && c.paint < c.mid && c.a.volume < 60)) },
  // the supporting families — only ever reached when no identity family made the floor
  { tag: 'Rebounder', test: (c) => c.sig === 'reb' },
  { tag: 'Ball thief', test: (c) => c.sig === 'perimdisrupt' },
  { tag: 'Foul magnet', test: (c) => c.sig === 'fouldraw' },
  // PAST THE LIMIT (his ruling: "Find a name for both options then"). The two groups the limit left unnamed are not
  // role players, so they do not get a role player's name. HIGH-WIRE PLAYMAKER is the floor-general-grade passer
  // (playmaking 88+) whom Floor general still declines — he does not hold the ball even as well as the median man
  // (Mark Jackson '99-'01, Sleepy Floyd '87). LOCKDOWN DEFENDER is perimeter defence at Stopper's 90 on a man Stopper
  // cannot take because he also scores, shoots or carries a load (Scottie Pippen '97, Jrue Holiday '17/'18).
  { tag: 'High-wire playmaker', test: (c) => c.sig === 'playvol' && c.a.playvol >= 88 },
  { tag: 'Lockdown defender', test: (c) => (c.sig === 'perdef' || c.sig === 'rimprot') && c.a.perdef >= 90 },
]

/** The fifteen signature tags, in the order the tree asks them. */
export const SIGNATURE_TAGS: string[] = RULES.slice(-18).map((r) => r.tag) // eighteen: sixteen role names plus the two past-the-limit names

/** The shipped order — the ratified law, and what "reset" returns to. */
export const DEFAULT_ORDER: string[] = RULES.map((r) => r.tag)

/**
 * A rule as the arithmetic it actually is: `ge(x, 80)` reads `x >= 80`. Derived from the rule
 * function itself, so it can never drift from what the labeler runs.
 *
 * Two things this has to survive. A comparator may WRAP a call — ge(Math.min(perdef, rimprot), 68) —
 * so the arguments split on the top-level comma, not the first one; and a production build RENAMES
 * the parameter, so its real name is read from the source rather than assumed.
 */
const OPS: Record<string, string> = { ge: '>=', lt: '<', geH: '>=', ltH: '<' }
export function ruleText(tag: string): string {
  const rule = BY_TAG.get(tag)
  if (!rule) return tag === 'Balanced' ? 'no rule above matched — the fallback' : ''
  return ruleTextOf(rule.test.toString())
}
/** The same reading, from a rule's SOURCE — split out so a minified build's spelling can be tested. */
export function ruleTextOf(src: string): string {
  const param = /^\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/.exec(src)?.[1] ?? 'c'
  const q = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let s = src
    .replace(/^\(?\s*[A-Za-z_$][\w$]*\s*\)?\s*=>\s*/, '')
    .replace(new RegExp(`${q}\\.a\\['3pt'\\]`, 'g'), '3pt')
    .replace(new RegExp(`${q}\\.a\\.`, 'g'), '')
    .replace(new RegExp(`${q}\\.p\\.`, 'g'), '')
    .replace(new RegExp(`${q}\\.`, 'g'), '')
    .replace(/Math\./g, '')
    // the signature block's vocabulary, as the arithmetic it stands for: pct(bar) is the league
    // percentile of that bar, and the floor is printed as its number
    .replace(/\bpctPerdef\b/g, 'pct(perdef)')
    .replace(/\bpctRimprot\b/g, 'pct(rimprot)')
    .replace(/\bpct3\b/g, 'pct(3pt)')
    .replace(/\bsigFloor\b/g, String(SIG_FLOOR))
    .replace(/(===|!==)\s*"([^"]*)"/g, "$1 '$2'")
  for (;;) {
    const m = /\b(geH|ltH|ge|lt)\(/.exec(s)
    if (!m) return tidy(s)
    const open = m.index + m[0].length - 1
    let depth = 0
    let comma = -1
    let close = -1
    for (let i = open; i < s.length; i++) {
      if (s[i] === '(') depth++
      else if (s[i] === ')') {
        depth--
        if (depth === 0) {
          close = i
          break
        }
      } else if (s[i] === ',' && depth === 1 && comma < 0) comma = i
    }
    if (close < 0 || comma < 0) return tidy(s)
    s = `${s.slice(0, m.index)}${s.slice(open + 1, comma).trim()} ${OPS[m[1]]} ${s.slice(comma + 1, close).trim()}${s.slice(close + 1)}`
  }
}
/**
 * A production build strips the spaces around operators, so the printed rule puts them back. The
 * two-character ones go first, or `>=` would be split by the bare `>` pass.
 */
const tidy = (s: string) =>
  s
    .replace(/\s*(&&|\|\||>=|<=|===|!==)\s*/g, ' $1 ')
    .replace(/\s*([<>])\s*(?![=\s])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
/** The numeric definition every `big` in the tree stands for. */
export const BIG_RULE = '(rimprot >= 55 AND 3pt < 45) OR (rim >= 60 AND 3pt < 40) OR rimprot >= 80'
const BY_TAG = new Map(RULES.map((r) => [r.tag, r]))
/** Every tag the tree can return, the fallback included. */
export const ALL_TAGS: string[] = [...DEFAULT_ORDER, 'Balanced', 'Unclassified']

const ORDER_KEY = 'game7.tagorder.v1'
/** The order the tree is being READ at right now — a draft while the ranking screen is open. */
let order: string[] = DEFAULT_ORDER
/** The order that is WRITTEN DOWN. A draft is only law once it is saved. */
let saved: string[] = DEFAULT_ORDER
/** A stored ranking has to be a list of unique tag names. Whether they are the CURRENT tags is not its
 *  problem — see reconcile. */
const sane = (o: unknown): o is string[] =>
  Array.isArray(o) && o.every((t) => typeof t === 'string') && new Set(o).size === o.length
/**
 * A SAVED RANKING SURVIVES THE TREE CHANGING (his ruling: "I want those to save").
 *
 * The old check honoured a stored order only if it named exactly the tags of the build reading it, so
 * every round that added, deleted or renamed a rule silently threw his ranking away. This keeps what
 * he decided and repairs the rest: tags he ranked that still exist hold their relative order, tags
 * that no longer exist drop out, and a tag he has never seen is inserted where the shipped law puts
 * it — immediately before the first tag that follows it in DEFAULT_ORDER.
 */
const reconcile = (stored: string[]): string[] => {
  const out = stored.filter((t) => BY_TAG.has(t))
  for (const t of DEFAULT_ORDER) {
    if (out.includes(t)) continue
    let at = out.length
    for (let i = DEFAULT_ORDER.indexOf(t) + 1; i < DEFAULT_ORDER.length; i++) {
      const j = out.indexOf(DEFAULT_ORDER[i])
      if (j !== -1) {
        at = j
        break
      }
    }
    out.splice(at, 0, t)
  }
  return out
}
try {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(ORDER_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (sane(parsed)) {
        order = reconcile(parsed)
        saved = order
        // heal the stored copy, so a ranking does not decay a little more with every round
        if (order.length !== parsed.length || order.some((t, i) => t !== parsed[i])) {
          localStorage.setItem(ORDER_KEY, JSON.stringify(order))
        }
      }
    }
  }
} catch {
  /* a corrupt ranking is not worth a crash; the law stands */
}
export const tagOrder = (): string[] => order
/** The last SAVED ranking — what the app comes back to on its own. */
export const savedTagOrder = (): string[] => saved
export const isDefaultOrder = () => order.every((t, i) => t === DEFAULT_ORDER[i])
/** True when the order being read is the one on disk: nothing to save. */
export const isSavedOrder = () => order.every((t, i) => t === saved[i])
/**
 * Rank the tree. Pass null to go back to the shipped law.
 *
 * `persist` is the save. Without it the new order is applied to the live tree — so the lists re-tag
 * and you can SEE what the move did — but nothing is written down, and Discard or a reload restores
 * the saved ranking.
 */
export function setTagOrder(next: string[] | null, persist = true) {
  order = next && sane(next) ? reconcile(next) : DEFAULT_ORDER
  if (!persist) return
  saved = [...order]
  try {
    if (typeof localStorage !== 'undefined') {
      if (next && sane(next)) localStorage.setItem(ORDER_KEY, JSON.stringify(order))
      else localStorage.removeItem(ORDER_KEY)
    }
  } catch {
    /* ranking is a preference, not state worth failing over */
  }
}

/**
 * NOBODY IS SOFTENED INTO A FIT (his ruling, superseding the recal_15 rescue).
 *
 * The rescue used to re-read the tree for any 80+ card it could not name, with every floor dropped
 * by 10, and gave him whatever then matched. That is not a label, it is a lowered bar: Kobe '05 wore
 * TWO-WAY STAR because 85/85 became 75/75. Worse, it hid the one thing a tree-builder needs to see —
 * which good players the tree has no rule for.
 *
 * So the tree speaks at its own thresholds and nowhere else. A card it cannot name is:
 *   UNCLASSIFIED  above the cap — a good player with no rule. He is REPORTED, not dressed.
 *   BALANCED      at or below it — nothing distinctive to say, which for a role player is the truth.
 *
 * `npm run unfit` prints every Unclassified card with his sheet. That list is the work queue for the
 * tree: each name on it is either a missing rule or a threshold set too high.
 */
export const BALANCED_CAP = 79
/** Kept at 0 so any caller that still passes a relaxation gets the tree's own thresholds. */
export const FALLBACK_RELAX = 0
export const UNCLASSIFIED = 'Unclassified'

export function archetype(p: Player, relax: number = RELAX): string {
  const first = strictTag(p, relax)
  if (first !== 'Balanced') return first
  return p.ovr > BALANCED_CAP ? UNCLASSIFIED : 'Balanced'
}

/**
 * The tree itself: every rule in RULES, top-down, first match wins. Exported so callers (and the
 * pinned tests) can ask what the tree says at its OWN thresholds, before the OVR-79
 * rescue relaxes them.
 */
/**
 * THE EVALUATION CONTEXT, built in ONE place. The audit and the unfit report used to construct this by
 * hand, so a change to the tree's vocabulary broke them — and, worse, let the audit drift away from the
 * labeler it exists to check. Everything reads a card through this function now.
 */
export function ctxFor(p: Player, relax: number = RELAX): Ctx {
  const a = p.attrs
  const paint = a.rim
  const mid = a.mid
  const three = a['3pt']
  const zone = Math.max(three, paint, mid)
  const big = isBigShape(a)   // numeric law: the shape, from this sheet's own numbers
  const h = a.height
  /** at least: the floor drops by `relax`. Being generous about DEGREE. */
  const ge = (v: number, t: number) => v >= t - relax
  /**
   * under: a CEILING, and it never relaxes. A floor says "he must be at least this good at it", so
   * easing it credits a near miss. A ceiling says "this tag is not for that kind of player" — easing
   * it admits exactly who the rule exists to exclude. Relaxing `volume < 88` to `< 98` put Lillard,
   * Booker and Brunson in FLOOR GENERAL: 27-point scorers on 32 usage wearing a tag whose whole point
   * is that he sets the table rather than eating. Same lesson as the height gates, now general.
   */
  const lt = (v: number, t: number) => v < t
  // HEIGHT IS NEVER RELAXED. Every other gate reads a 0-99 rating, where 10 points is a nudge;
  // height is INCHES, where 10 is most of a foot. Relaxing it made a 7-foot centre pass "under 6'3\""
  // and come back tagged Spark plug. A physical fact stays a physical fact at any relaxation.
  const geH = (v: number, t: number) => v >= t
  const ltH = (v: number, t: number) => v < t
  /** The glue dimensions: what `solid` reads, plus ball security. */
  const glueDims = [zone, a.playvol, Math.max(a.perdef, a.rimprot), Math.max(a.orb, a.drb), a.ballsec]
  return {
    p, a, paint, mid, three, zone, big, h, ge, lt, geH, ltH,
    pos: eligible((STATS as Record<string, { pos?: string[] } | null>)[p.name]?.pos),
    solid: [zone, a.playvol, Math.max(a.perdef, a.rimprot), Math.max(a.orb, a.drb)].filter((v) => ge(v, 60)).length,
    // the band: floor relaxes with RELAX, ceiling never does — same law as ge/lt above.
    glue: glueDims.filter((v) => ge(v, 55) && lt(v, 76)).length,
    glueMax: Math.max(...glueDims),
    // the signature reads the league, not a threshold — `relax` has nothing to say to it
    ...signature(a),
    sigFloor: SIG_FLOOR,
  }
}

export function strictTag(p: Player, relax: number = RELAX): string {
  const c = ctxFor(p, relax)
  for (const tag of order) {
    const rule = BY_TAG.get(tag)
    if (rule && rule.test(c)) return tag
  }
  return 'Balanced'
}
