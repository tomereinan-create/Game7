import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { bestStyle, canSpace, featured, pnrPair, popPair, SCHEMES, STYLES, type Scheme, type StyleCall, type Style, type Tactics } from '../engine/tactics'
import type { Player } from '../engine/types'

/**
 * THE COURT LINEUP (his ruling: a five stands on a floor, not in a list). An
 * inline half court in the house voice — wash floor, hairline markings, the
 * rim at the baseline — with the five at their spots. A signed sixth man
 * stands off-court on the out-of-bounds strip above the half-court line.
 *
 * A gated plan moves the formation (his ruling: call five-out and the team
 * SHOWS five-out): the style arranges the spots, the named scorer/playmaker
 * wear microtags, and a quiet mono caption names the non-default calls.
 *
 * A five with NO plan — every scouted opponent, the team db, the draft floor
 * — no longer stands balanced by default (his ruling: "Assign each team on
 * the court by using their best tactic"). It stands in the shape of the style
 * it is BEST at, the engine's bestStyle, and the caption says the shape was
 * inferred rather than called AND names the man or the pair it runs through
 * ("helio · best fit 65 · Gilgeous-Alexander", "pick-and-roll · best fit 76 ·
 * Westbrook + Durant" — recal_115, his ruling: "Why is the system helio for
 * rus when KD is a better scorrer?").
 *
 * HIS five drawn beside a plan he set somewhere else — the campaign prep
 * screen's "Your five", which reads the My team plan but does not edit it —
 * takes `tactic` (his ruling: "If I put 5 out on my tactics it should be shown
 * here as well"): the floor stands in the style he called and the caption
 * says whose call it is ("five-out · your tactic"). Balanced is no call, so
 * a balanced plan leaves the best-fit read in place. Pure layout beyond
 * that: every spot's tag, tone and tap come from the caller.
 */

export interface CourtSpot {
  p: Player | null
  /** The mono line under the name: "PG · 84", "PG · 3 left", "SF · open". */
  tag: string
  danger?: boolean
  on?: boolean
  dim?: boolean
  onTap?: () => void
  /**
   * The slot this spot stands for. It labels the ghost ring while the spot is empty, and it
   * publishes `data-slot`, which is all the draft's existing drag needs to treat the floor as
   * a drop target (it hit-tests with elementFromPoint().closest('[data-slot]')).
   */
  slot?: string
  /** Live drag feedback: true = this drop is legal, false = it is not, null/undefined = not the target. */
  dropOk?: boolean | null
}

type XY = readonly [number, number]
/** Which half of the plan the court is drawing. */
export type Side = 'off' | 'def'

/**
 * THE COURT'S OWN GEOMETRY, IN FEET (his ruling: "The ft line is cutting the ft line, fix it for
 * irl proportions"). The floor used to be drawn by eye — an arc whose circle sat below the
 * baseline and a free-throw circle nine units wide — so the free-throw circle cut across the top
 * of the key instead of sitting centred on the free-throw line.
 *
 * Now there is ONE scale, `FT` viewBox units per foot, and every line and every spot is stated in
 * NBA feet through it: the court 50 wide and the halfcourt 47 deep (which is what fixes `FT`), the
 * key 16 x 19 with the free-throw line as its far edge, the free-throw circle radius 6 CENTRED on
 * that line, the restricted arc 4 from the basket, the basket centre 5.25 off the baseline, the
 * three straight at 22 in the corners and 23.75 around, the centre circle radius 6 at the
 * half-court line. `at(x, y)` is a point in feet — x from the middle of the floor, y from the
 * baseline — and `peri(deg, m)` stands a man m FEET behind the arc at that angle off the middle,
 * measured from the basket like the line itself. The viewBox is square, so a circle is round and a
 * foot is a foot in both directions at every render size.
 */
const FT = 78 / 47
const BASE = 98
const HALF = BASE - 47 * FT
const SIDE = 25 * FT
const at = (x: number, y: number): XY => [50 + x * FT, BASE - y * FT]
const RIM_Y = 5.25
const KEY_W = 16
const KEY_D = 19
const FT_LINE = BASE - KEY_D * FT
const ARC = 23.75
const CORNER_X = 22
/** Where the corner line meets the arc — the break, √(23.75² − 22²) up from the basket. */
const BREAK_Y = RIM_Y + Math.sqrt(ARC * ARC - CORNER_X * CORNER_X)
const peri = (deg: number, m = 4): XY => {
  const a = (deg * Math.PI) / 180
  return at((ARC + m) * Math.sin(a), RIM_Y + (ARC + m) * Math.cos(a))
}
/** The corner three: a foot behind the corner line, eight feet up from the baseline. */
const CORNER_L: XY = at(-23, 8)
const CORNER_R: XY = at(23, 8)
/** Interior landmarks, in feet: the block on the lane line, the dunker spots in the short corners. */
const BLOCK_L: XY = at(-8, 7)
const PAINT_C: XY = at(4, 10)
/**
 * THE HIGH PICK-AND-ROLL (his ruling: "If its pnr, put the screener next to the handler, and the
 * rest outside the 3pt line"; then "move handler a little bit more to the opposite wing of sg, and
 * screener close by towards middle" — the weak-side wing sits at negative angles, so the handler
 * moved off to the positive/right side and the screener sits between him and the middle of the
 * floor, on the other side of the middle from the handler; then "move malone a bit closer to
 * stockton" — the pair pulled in from a 15-foot spread to 9, still short of the tighter spread that
 * let their rings touch). The ball two feet behind the arc; the screen a foot inside the line at
 * the crown of the free-throw circle. The two stand PAIR_FT apart — the number is exported so
 * tests/court.test.ts can hold the screen to the ball. The other three stand behind the line, every
 * one of them at least a ring further from the pair than the pair is from each other: the
 * weak-side wing and both corners, which is all the arc holds beside the pair without two rings
 * colliding. The wing stands six feet behind the line rather than four so that his tag clears the
 * corner man's ring on a phone.
 */
const BALL: XY = at(12, 31)
const SCREEN: XY = at(3, 25)
export const PAIR_FT = Math.hypot(9, 6)
/**
 * THE POP SPOT (recal_129, his ruling: "Add pick n pop"). The same screen, released: the screener
 * steps BACK rather than rolling, so he stands behind the arc on the far side of the ball, a stride
 * further from the middle than the screen was. Nobody is inside the line in this set.
 */
const POP: XY = at(-2, 33)
const ELBOW_L: XY = at(-8, KEY_D)
const ELBOW_R: XY = at(8, KEY_D)
const DUNK_L: XY = at(-10, 5)
const DUNK_R: XY = at(10, 5)
/* the two break lanes RUN_L/RUN_R went with the transition set (recal_127, his ruling:
   "Remove transition entirely from the db.") — no shape stands a man on the half-court line now */

/**
 * Balanced — FOUR OUT, ONE IN (his ruling: "Balanced should be 4 out 1 in not 3 out 1 in").
 * One man above the arc, two on the wings behind it, one in the corner, one alone inside.
 * The default set used to stand the PF on the block beside the C, which put two men inside; the
 * fourth man moves out to the corner, so exactly one man is inside the arc and the other four ring
 * it. Written in slot order (PG..C) and used as-is only while the five is INCOMPLETE — the draft's
 * ghost floor, which has no shooting to sort by. A full five is stood by `stand` instead, which
 * keeps the same five spots and gives the inside one to the man who cannot shoot.
 */
const AT: XY[] = [peri(0, 6), peri(-38), peri(38), CORNER_L, PAINT_C]
/**
 * The resting man's spot (his ruling: "Move the bench player to the bottom") — an out-of-bounds
 * strip below the baseline now, the same CROP units deep as the strip above the half-court line
 * used to be, and the same distance in from its outer edge (9 of 16) so the move is a mirror, not
 * a redesign.
 */
const BENCH_AT: XY = [14, BASE + 7]
/**
 * Is a spot BEHIND the three-point line — the REAL one? Below the break the line is straight, 22
 * feet from the basket either side; above it the line is the 23.75-foot arc around the basket.
 * Exported because "four out, one in" is a claim about the drawn floor, and tests/court.test.ts
 * holds the balanced set to it.
 */
export const outsideLine = ([x, y]: XY): boolean => {
  const fx = (x - 50) / FT
  const fy = (BASE - y) / FT
  return fy <= BREAK_Y ? Math.abs(fx) >= CORNER_X : Math.hypot(fx, fy - RIM_Y) >= ARC
}
/** ...and is it one of the two CORNERS, the spots only a shooter may stand in? */
export const inCorner = (xy: XY): boolean => outsideLine(xy) && (BASE - xy[1]) / FT <= BREAK_Y
/**
 * The drawn floor's own numbers, so tests/court.test.ts can hold the lines to real feet and every
 * spot to the floor they are drawn on.
 */
export const FLOOR = {
  ft: FT,
  left: 50 - SIDE,
  right: 50 + SIDE,
  half: HALF,
  base: BASE,
  ftLine: FT_LINE,
  rimY: BASE - RIM_Y * FT,
} as const
/** Units of empty floor above the half-court line, always cropped off — nobody stands there any more. */
const CROP = 16
/** Units of out-of-bounds floor below the baseline, kept only when a bench man stands there. */
const BENCH_BAND = 16

/**
 * DEFENSIVE SHAPES, one entry per scheme id (his ruling: the court should show the
 * defense the way it already shows the offense). Same arc geometry as the offensive
 * sets — peri(deg, m) with a NEGATIVE m stands a defender that many units INSIDE the
 * line — so everything stays proportional at any render size.
 *
 * Index-aligned to the five in slot order (PG, SG, SF, PF, C): defense is assigned by
 * role, not by rating, so the man who drops is the C and the man over the screen is the
 * PG. ADDING A SCHEME IS ONE ENTRY HERE — the chip label and its fit come from the
 * engine's SCHEMES, so nothing else needs touching.
 */
const DEF_AT: Record<Scheme, XY[]> = {
  // honest man spacing: the wings pick their men up at the line, the bigs sit on the blocks
  matchup: [peri(0, 0), peri(-34, 0.5), peri(34, 0.5), at(-10, 6), at(5, 7)],
  // the guard stays over the screen, the big is already home at the rim, the rest wall the middle
  drop: [peri(-3, 2), peri(-37, 0), peri(36, -0.5), at(-9, 8), at(3, 6)],
  // level and symmetric: five men on one line, every one of them able to take any man
  switch: [peri(-54, -1.5), peri(-27, -3.5), peri(0, -4), peri(27, -3.5), peri(54, -1.5)],
  // two hard onto the ball up top, the other three rotating behind them
  blitz: [peri(-11, 1.5), peri(11, 1.5), peri(-42, -2), peri(42, -2), at(0, 8.5)],
  // a true 2-3: two at the elbows extended, three across the lane and the corners
  zone: [peri(-19, -2.5), peri(19, -2.5), peri(-56, -4), at(0, 6), peri(56, -4)],
  // turn him down the sideline: the on-ball man sits on his inside shoulder, the big shows at
  // the level of the screen, and the last three load the weak side
  ice: [peri(-26, -1.5), peri(-55, -6), peri(31, 0.5), at(-4, 5), at(5, 13)],
}


/** The man an index-picking formation leans on; `not` keeps the screen off the PG himself. */
const best = (five: Player[], score: (p: Player) => number, not = -1) => {
  let k = -1
  for (let i = 0; i < five.length; i++) if (i !== not && (k < 0 || score(five[i]) > score(five[k]))) k = i
  return k
}
/** The index of the man a featured set is built around, through the engine's own `featured`. The
 *  plan rides with it, so a called post target stands on the block and not the engine's hub. */
const who = (men: Player[], style: Style, call?: StyleCall | null): number => {
  const p = featured(style, men, call)[0]
  return p ? men.findIndex((q) => q.name === p.name) : 0
}

/**
 * WHO STANDS WHERE, once the shape is chosen (his ruling: "Why is Ayton out and James in? Makes no
 * sense"). Every spot a formation is not holding for a featured man carries a SPACING RANK: 0 is
 * inside — the dunker spot, the weak-side block, the elbow, the paint — 1 is above the break, 2 is
 * the corner, the shooter's spot. The men who are not featured are then stood by their shooting,
 * closest to the rim first: the worst shooter takes the lowest rank, the best takes the corner. A
 * big who cannot shoot is never sent out to space the floor he cannot space.
 */
type Rank = 0 | 1 | 2
type Rest = readonly [XY, Rank]

/**
 * Stand the unfeatured men. `swap` is the shape's reserve of extra INSIDE spots: when more men
 * cannot shoot than the set has inside spots, the set gives up its most spacer-y spot (the corner
 * first) for one of them, which is how post-up seats a second big on the dunker spot rather than
 * in the weak-side corner. A set with no reserve (five-out, which is five men behind the line by
 * definition) simply keeps its non-shooters off the corners.
 */
function stand(men: Player[], picked: Record<number, XY>, rest: Rest[], swap: XY[] = [], sortKey: (p: Player) => number = (p) => p.attrs['3pt']): XY[] {
  const idx = men.map((_, i) => i).filter((i) => !(i in picked))
  const spots: Rest[] = [...rest]
  let need = idx.filter((i) => !canSpace(men[i])).length - spots.filter(([, r]) => r === 0).length
  for (const s of swap) {
    if (need <= 0) break
    let w = 0
    for (let k = 1; k < spots.length; k++) if (spots[k][1] >= spots[w][1]) w = k
    if (spots[w][1] === 0) break
    spots[w] = [s, 0]
    need--
  }
  const order = [...idx].sort((a, b) => sortKey(men[a]) - sortKey(men[b]))
  const by = [...spots].sort((a, b) => a[1] - b[1])
  const out: XY[] = []
  for (let i = 0; i < men.length; i++) if (i in picked) out[i] = picked[i]
  order.forEach((i, k) => (out[i] = by[k][0]))
  return out
}

/**
 * Formations by style, index-aligned to the five's slot order (PG..C). Readable
 * spacings, not X-and-O diagrams; the special men use the same proxies the fit
 * formulas key on (post = min(rim, volume), helio engine = min(volume, playvol)).
 * The pick-and-roll no longer guesses: it stands the pair the PLAN names, through
 * the engine's own pnrPair, so the floor and the price name the same two men.
 *
 * With no plan the style is INFERRED from the five itself (his ruling: "Assign each
 * team on the court by using their best tactic") — the engine's bestStyle — so a
 * scouted opponent stands the way it actually plays instead of standing balanced
 * because nobody told the floor anything. A five that is still being filled has no
 * best tactic yet, so it keeps the balanced set.
 */
export function inferredStyle(five: (Player | null)[]): { style: Style; fit: number } | null {
  const men = five.filter((p): p is Player => !!p)
  return men.length < 5 ? null : bestStyle(men)
}

export function spotsFor(plan: Pick<Tactics, 'style' | 'pnr' | 'post' | 'helio'> | null | undefined, five: (Player | null)[]): XY[] {
  const men = five.filter((p): p is Player => !!p)
  const style = plan ? plan.style : inferredStyle(five)?.style
  if (!style || men.length < 5) return [...AT]
  switch (style) {
    case 'balanced':
      // slot order, not a shooting sort (his ruling: "In balanced, pg top sg and sf wings PF
      // corner C paint") — PG at the top, SG and SF on the wings, PF in the corner, C in the paint
      return [peri(0, 6), peri(-38), peri(38), CORNER_L, PAINT_C]
    case 'fiveout':
      // slot order, not a shooting sort (his ruling: "In 5 out, pg on top. SG/SF wings, PF/C
      // corners. And a little bit more to the wings. Make it spaced out") — PG at the top, SG
      // and SF on the wings (40 degrees off middle, up from 32, for the wider spacing he called
      // for), PF and C in the corners. The only set with no inside spot at all — a called
      // five-out SHOWS five out, whoever is out there.
      return [peri(0), peri(-40), peri(40), CORNER_L, CORNER_R]
    case 'motion':
      // staggered perimeter with one elbow man cutting; the elbow is the non-shooter's spot
      return stand(men, {}, [
        [ELBOW_R, 0],
        [peri(-14), 1],
        [peri(14), 1],
        [peri(-45), 1],
        [peri(45), 1],
      ])
    case 'pnr': {
      // the ball at the top, the screen set right beside him at the top of the key, and the other
      // three OUTSIDE the line — the weak-side wing and both corners (his ruling: "If its pnr, put
      // the screener next to the handler, and the rest outside the 3pt line"). No inside spot in
      // reserve any more: the screener is the one man inside the arc, so the shortest of the three
      // (his ruling: "smallest not handler guy on the wing, the other 2 corners") takes the wing
      // and the corners go to the other two. Both men come from the plan (his ruling: the pair is
      // a call).
      const pair = pnrPair(men, plan?.pnr)
      const h = pair.handler ? men.findIndex((p) => p.name === pair.handler!.name) : 0
      let s = pair.screener ? men.findIndex((p) => p.name === pair.screener!.name) : -1
      // a five with no big at all, or a pair the floor cannot honour: the tallest man who is not
      // the handler sets the screen, so the shape is always five men on five different spots
      if (s < 0 || s === h) s = best(men, (p) => p.attrs.height, h)
      return stand(
        men,
        { [h]: BALL, [s]: SCREEN },
        [[peri(-45, 6), 1], [CORNER_L, 2], [CORNER_R, 2]],
        [],
        (p) => p.attrs.height,
      )
    }
    case 'pickpop': {
      // THE POP (recal_129, his ruling: "Add pick n pop"). The pick-and-roll shape with the screen
      // released: the ball where it always is, and the screener stepping BACK behind the arc on the
      // other side of him instead of rolling to the top of the key. Nobody is inside the line at
      // all — the whole point of the call is that the roll man does not roll — and the other three
      // keep b4c50a4's spacing, the shortest on the weak-side wing and the corners to the rest.
      const pair = popPair(men, plan?.pnr)
      const h = pair.handler ? men.findIndex((p) => p.name === pair.handler!.name) : 0
      let s = pair.screener ? men.findIndex((p) => p.name === pair.screener!.name) : -1
      if (s < 0 || s === h) s = best(men, (p) => p.attrs.height, h)
      // the three off-ball men are ordered by SHOOTING here, not by height as the roll orders them
      // (his ruling: "smallest not handler guy on the wing"). The roll can afford that because its
      // screener is almost always the five's non-shooting big; the pop's screener is a shooter by
      // definition, so a second man who cannot shoot would otherwise be sent to a CORNER, which is
      // the one thing his other ruling forbids ("Why is Ayton out and James in?"). The worst
      // shooter of the three takes the weak-side wing and the corners go to the better two.
      return stand(men, { [h]: BALL, [s]: POP }, [[peri(-45, 6), 1], [CORNER_L, 2], [CORNER_R, 2]])
    }
    case 'triangle': {
      // THE TWO-GUARD-FRONT SETUP (recal_128, his ruling: "Add Triangle"; then his ruling: "Change
      // the triangle to be like the 2nd picture" — the standard teaching diagram: the point at the
      // top, a guard spread to each wing, and the two bigs together inside at the two elbows, ready
      // to relocate into the strong-side triangle once the ball enters. Slot order, not a shooting
      // sort or a featured post man: PG top, SG and SF the wings, PF and C the two elbows.
      return [peri(0, 6), peri(-38), peri(38), ELBOW_L, ELBOW_R]
    }
    case 'postup': {
      // the post man on the block, and a second big who cannot shoot takes the dunker spot, the
      // set's other inside spot. The hub is HIS when the plan names one (recal_124, his ruling:
      // "In post up playstyle, there need to be a post up target."), the engine's own when it does
      // not: a big who works INSIDE, so a stretch five is not stood on the block because he is the
      // tallest man in the picture. The point guard plays the two-man game beside him, on his side
      // of the floor, and the other three space the OTHER side — corner, wing, and the middle
      // (his ruling: "the main post player is inside, the pg is on the wing with him, and the
      // other 3 are on the other side of the court, corner, wing, and middle"). A post man who IS
      // the point guard (the plan can name anyone) falls back to the ordinary spacing sort for all
      // four of the others, same as before this ruling.
      const s = who(men, 'postup', plan)
      const picked: Record<number, XY> = { [s]: BLOCK_L }
      if (s !== 0) picked[0] = peri(-38)
      const rest: Rest[] = s === 0 ? [[peri(0), 1], [peri(-38), 1], [peri(38), 1], [CORNER_R, 2]] : [[peri(0), 1], [peri(38), 1], [CORNER_R, 2]]
      return stand(men, picked, rest, [DUNK_R])
    }
    case 'helio': {
      // the engine alone above the arc; the four low — the corners for the shooters, the two
      // dunker spots for the men who cannot space. The engine is the five's best SCORER-CREATOR
      // (recal_115, his ruling: "Why is the system helio for rus when KD is a better scorrer?"),
      // or HIS creator when the plan names one (recal_125, his ruling: "In helio, allow me to pick
      // a creator"), read through the same function the fit and the caption read.
      const s = who(men, 'helio', plan)
      return stand(men, { [s]: peri(0, 6) }, [[DUNK_L, 0], [DUNK_R, 0], [CORNER_L, 2], [CORNER_R, 2]])
    }
  }
}

/** The caption: every non-default call, mono caps, quiet. */
function callLine(plan: Tactics, side: Side, men: Player[]): string {
  const bits: string[] = []
  if (side === 'off') {
    if (plan.style !== 'balanced') {
      const label = STYLES.find((s) => s.key === plan.style)?.label ?? plan.style
      // the style names the men it is called on — the pair, or the post target (recal_124)
      const named = men.length >= 2 ? featured(plan.style, men, plan).map((p) => surname(p.name)) : []
      bits.push(`${label}${named.length ? ` · ${named.join(' + ')}` : ''}`)
    }
    if (plan.tempo !== 'normal') bits.push(`${plan.tempo} night`)
    if (plan.hunt) bits.push('hunt on')
    if (plan.crashOff) bits.push('crash O')
  } else {
    bits.push(SCHEMES.find((x) => x.key === plan.scheme)?.label ?? plan.scheme)
    if (plan.crashDef) bits.push('crash D')
  }
  return bits.join(' · ')
}

/**
 * The caption for a five nobody called a plan for: the style it was READ as, in the caption's own
 * idiom, with the fit that won so the reader can see it was inferred and not called. A five that
 * nothing fits better than the free default says exactly that, rather than pretending 60 is a fit.
 */
function fitLine(inf: { style: Style; fit: number }, men: Player[]): string {
  const label = STYLES.find((s) => s.key === inf.style)?.label ?? inf.style
  if (inf.style === 'balanced') return `${label} · no better fit`
  // WHO IT RUNS THROUGH (recal_115, his ruling: "Why is the system helio for rus when KD is a better
  // scorrer?"). The read used to name a shape and no man, so the only way to see whose offense the
  // engine thought it was, was to find him standing at the top of the arc. The caption names him —
  // and for the pick-and-roll it names BOTH men, which is what a five with two stars reads as.
  const men2 = featured(inf.style, men).map((p) => surname(p.name))
  return `${label} · best fit ${Math.round(inf.fit)}${men2.length ? ` · ${men2.join(' + ')}` : ''}`
}

/**
 * The caption for the style HE CALLED on a court that does not edit the plan (his ruling: "If I
 * put 5 out on my tactics it should be shown here as well"): the label the tactics panel uses,
 * and whose call it is — so "five-out · your tactic" cannot be mistaken for a best-fit read.
 */
function setLine(set: Pick<Tactics, 'style' | 'pnr' | 'post' | 'helio'>, men: Player[]): string {
  const label = STYLES.find((s) => s.key === set.style)?.label ?? set.style
  // ...and it names the men the call runs through, the same way the best-fit read does: a post-up
  // he called on a man is "post-up · O'Neal · your tactic" (recal_124).
  const named = featured(set.style, men, set).map((p) => surname(p.name))
  return `${label}${named.length ? ` · ${named.join(' + ')}` : ''} · your tactic`
}

/** Card name -> the words of his real name: season tag off, and generational suffixes
 *  dropped so a Bagley III reads "Bagley/MB", not "III/MI". */
const words = (n: string) =>
  n
    .replace(/ '\d\d( \([a-z]\))?$/, '')
    .split(' ')
    .filter((w) => w && !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(w))

/** Exported so tests/court.test.ts can build the caption's own strings rather than restate them. */
export const surname = (n: string) => words(n).pop()

/** The ring holds initials now — the faces are gone by his ruling, the spot survives them. */
const initials = (n: string) =>
  words(n)
    .map((w) => w[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')

function Spot({
  s,
  at,
  size,
  sc,
  pm,
  drag,
}: {
  s: CourtSpot
  at: XY
  size: number
  sc?: boolean
  pm?: boolean
  /** Present when this spot can be picked up: the tap is then synthesised on release. */
  drag?: {
    lifted: boolean
    onDown: (e: ReactPointerEvent) => void
    onMove: (e: ReactPointerEvent) => void
    onUp: (e: ReactPointerEvent) => void
    onCancel: () => void
  }
}) {
  return (
    <button
      className={`ct-spot ${s.danger ? 'danger' : ''} ${s.on ? 'on' : ''} ${s.dim ? 'dim' : ''} ${s.p ? '' : 'ct-open'} ${
        s.dropOk === true ? 'drop-ok' : s.dropOk === false ? 'drop-no' : ''
      } ${drag?.lifted ? 'lifted' : ''} ${drag ? 'grab' : ''}`}
      style={{ left: `${at[0]}%`, top: `${at[1]}%` }}
      data-slot={s.slot}
      onPointerDown={drag?.onDown}
      onPointerMove={drag?.onMove}
      onPointerUp={drag?.onUp}
      onPointerCancel={drag?.onCancel}
      /* a draggable spot synthesises its own tap on release, so the click would double-fire */
      onClick={drag ? undefined : s.onTap}
      disabled={!s.onTap && !drag}
    >
      <span className="ct-bust" style={{ width: size, height: size }}>
        {s.p ? <em className="ct-init">{initials(s.p.name)}</em> : s.slot ? <em className="ct-init ghost">{s.slot}</em> : null}
        {sc ? <u className="ct-mark sc">SC</u> : null}
        {pm ? <u className={`ct-mark pm ${sc ? 'lo' : ''}`}>PM</u> : null}
      </span>
      <b>{s.p ? surname(s.p.name) : 'open'}</b>
      {s.tag ? <i>{s.tag}</i> : null}
    </button>
  )
}

export function CourtFive({
  spots,
  bench,
  plan,
  tactic,
  side: sideProp,
  onSide,
  swap,
}: {
  spots: CourtSpot[]
  bench?: CourtSpot | null
  plan?: Tactics | null
  /**
   * THE TACTIC HE SET, for a court that draws his five beside a plan it does not edit — the
   * campaign prep screen (his ruling: "If I put 5 out on my tactics it should be shown here as
   * well"). The floor stands in the called style — five-out shows five out, the pick-and-roll
   * stands his named pair — and the caption says whose call it is. No offense/defense toggle and
   * no microtags: the plan is turned in My team, not here. Balanced is the free default, no call,
   * so a balanced plan keeps the best-fit read and its caption exactly as before. `plan` wins
   * when both are given.
   */
  tactic?: Pick<Tactics, 'style' | 'pnr'> | null
  /** Lift the side out of the court when the whole screen follows it (My team's tactics panel). */
  side?: Side
  onSide?: (s: Side) => void
  /**
   * HIS RULING: "Allow me to switch positions of players by dragging on their halfcourt
   * position." Press a man's ring, drag him onto another spot, and the two change places. The
   * screen supplies the rule and the commit — this only runs the gesture — so the law stays in
   * engine/slots and one implementation serves every court that opts in. The scouted opponent
   * passes nothing and stays read-only.
   */
  swap?: { can: (from: string, to: string) => boolean; commit: (from: string, to: string) => void }
}) {
  // One court, two states, named on the floor: you can go and LOOK at your defense without
  // touching a chip and changing the plan to see it. No plan (the scouted opponent, whose
  // call we do not know) means no toggle and the balanced shape, as before.
  /**
   * The same pointer semantics the draft's row drag already uses, including its 8px threshold:
   * under 8px of travel the press is a TAP and is dispatched as one, so tapping a man still does
   * what it always did. Pointer events throughout — no HTML5 drag, no long-press — so a finger
   * works exactly like a mouse.
   */
  const dragRef = useRef<{ from: string; x0: number; y0: number; moved: boolean } | null>(null)
  const [drag, setDrag] = useState<{ from: string; over: string | null } | null>(null)
  const slotAt = (x: number, y: number): string | null =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]')?.dataset.slot ?? null
  const dragFor = (s: CourtSpot) => {
    if (!swap || !s.slot || !s.p) return undefined
    const from = s.slot
    return {
      lifted: drag?.from === from,
      onDown: (e: ReactPointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        dragRef.current = { from, x0: e.clientX, y0: e.clientY, moved: false }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      },
      onMove: (e: ReactPointerEvent) => {
        const d = dragRef.current
        if (!d) return
        if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return
        d.moved = true
        setDrag({ from: d.from, over: slotAt(e.clientX, e.clientY) })
      },
      onUp: (e: ReactPointerEvent) => {
        const d = dragRef.current
        dragRef.current = null
        if (!d) return
        if (d.moved) {
          const to = slotAt(e.clientX, e.clientY)
          // released on nothing, on himself, or on a spot the rule refuses: he goes back, no change
          if (to && to !== d.from && swap.can(d.from, to)) swap.commit(d.from, to)
        } else {
          s.onTap?.() // under the threshold: a press is a tap, and taps still open what they opened
        }
        setDrag(null)
      },
      onCancel: () => {
        dragRef.current = null
        setDrag(null)
      },
    }
  }
  const [own, setOwn] = useState<Side>('off')
  const side = sideProp ?? own
  const setSide = (s: Side) => (onSide ? onSide(s) : setOwn(s))
  const shown: Side = plan ? side : 'off'
  const men = spots.map((s) => s.p)
  // THE STYLE HE SET, when this court is not the one that sets it (his ruling: "If I put 5 out on
  // my tactics it should be shown here as well"). Balanced is no call, and a five still being
  // filled has no shape to call, so both keep reading the five as before.
  const set = !plan && tactic && tactic.style !== 'balanced' && men.filter(Boolean).length >= AT.length ? tactic : null
  const at = plan && shown === 'def' ? DEF_AT[plan.scheme] : spotsFor(plan ?? set, men)
  // no plan and no call: the shape was read off the five, and the caption says so (his ruling:
  // "Assign each team on the court by using their best tactic")
  const inferred = plan || set ? null : inferredStyle(men)
  const call = plan ? callLine(plan, shown, men.filter((p): p is Player => !!p)) : set ? setLine(set, men.filter((p): p is Player => !!p)) : inferred ? fitLine(inferred, men.filter((p): p is Player => !!p)) : ''
  /**
   * The empty band above the half-court line pays ~65px of dead space for nothing, so it stays
   * cropped whether or not a bench man is drawn (his ruling moved the resting man to the baseline
   * end: "Move the bench player to the bottom"). A court WITH a bench instead grows a strip below
   * the baseline to stand him on. The box and the viewBox grow together and the spots are remapped
   * into what is there, so every position stays exactly where it was relative to the floor. EVERY
   * spot: the remap used to be applied to the bench man alone, which stood the five up to 11% of
   * the box below its own floor — the top of the arc sat inside the arc — and that only showed
   * once the floor was drawn to real proportions and the line was where it says it is.
   */
  const top = CROP
  const bottom = bench ? BASE + BENCH_BAND : 100
  const y = (v: number) => ((v - top) / (bottom - top)) * 100
  return (
    <div className="court" style={{ aspectRatio: `100 / ${bottom - top}` }}>
      <svg className="ct-floor" viewBox={`0 ${top} 100 ${bottom - top}`} aria-hidden="true">
        {/* THE FLOOR, in feet through FT (his ruling: "fix it for irl proportions"): the boundary,
            the centre circle at the half-court line, the key with the free-throw circle centred ON
            the free-throw line — its far half solid and its near half dashed, as on a real floor —
            the restricted arc, the three, the backboard and the rim. */}
        <rect x={50 - SIDE} y={HALF} width={2 * SIDE} height={BASE - HALF} fill="var(--wash)" stroke="var(--line)" strokeWidth="0.8" />
        <path d={`M${50 - 6 * FT} ${HALF} A ${6 * FT} ${6 * FT} 0 0 0 ${50 + 6 * FT} ${HALF}`} fill="none" stroke="var(--line-2)" strokeWidth="0.7" />
        <rect
          x={50 - (KEY_W / 2) * FT}
          y={FT_LINE}
          width={KEY_W * FT}
          height={BASE - FT_LINE}
          fill="var(--surface)"
          stroke="var(--line-2)"
          strokeWidth="0.7"
        />
        <path d={`M${50 - 6 * FT} ${FT_LINE} A ${6 * FT} ${6 * FT} 0 0 1 ${50 + 6 * FT} ${FT_LINE}`} fill="none" stroke="var(--line-2)" strokeWidth="0.7" />
        <path
          d={`M${50 - 6 * FT} ${FT_LINE} A ${6 * FT} ${6 * FT} 0 0 0 ${50 + 6 * FT} ${FT_LINE}`}
          fill="none"
          stroke="var(--line-2)"
          strokeWidth="0.7"
          strokeDasharray="1.6 1.6"
        />
        <path
          d={`M${50 - CORNER_X * FT} ${BASE} L${50 - CORNER_X * FT} ${BASE - BREAK_Y * FT} A ${ARC * FT} ${ARC * FT} 0 0 1 ${
            50 + CORNER_X * FT
          } ${BASE - BREAK_Y * FT} L${50 + CORNER_X * FT} ${BASE}`}
          fill="none"
          stroke="var(--line-2)"
          strokeWidth="0.7"
        />
        <path
          d={`M${50 - 4 * FT} ${BASE - RIM_Y * FT} A ${4 * FT} ${4 * FT} 0 0 1 ${50 + 4 * FT} ${BASE - RIM_Y * FT}`}
          fill="none"
          stroke="var(--line-3)"
          strokeWidth="0.6"
        />
        <path d={`M${50 - 3 * FT} ${BASE - 4 * FT} h${6 * FT}`} stroke="var(--line-3)" strokeWidth="1" />
        <circle cx="50" cy={BASE - RIM_Y * FT} r={0.75 * FT} fill="none" stroke="var(--line-3)" strokeWidth="0.8" />
        {bench ? <path d={`M5 ${BASE + 0.5} h17`} stroke="var(--line-2)" strokeWidth="0.7" /> : null}
      </svg>
      {plan ? (
        <span className="ct-side">
          {(['off', 'def'] as const).map((k) => (
            <button key={k} className={`sortb ${shown === k ? 'on' : ''}`} onClick={() => setSide(k)}>
              {k === 'off' ? 'offense' : 'defense'}
            </button>
          ))}
        </span>
      ) : null}
      {call ? <span className="ct-call">{call}</span> : null}
      {spots.slice(0, AT.length).map((s, i) => (
        <Spot
          key={s.p ? s.p.name : `open-${i}`}
          s={
            swap && drag && s.slot
              ? { ...s, dropOk: drag.over === s.slot && drag.from !== s.slot ? swap.can(drag.from, s.slot) : null }
              : s
          }
          at={[at[i][0], y(at[i][1])]}
          size={58}
          drag={dragFor(s)}
          {...(shown === 'off'
            ? { sc: !!plan?.scorer && s.p?.name === plan.scorer, pm: !!plan?.playmaker && s.p?.name === plan.playmaker }
            : {})}
        />
      ))}
      {bench ? <Spot s={bench} at={[BENCH_AT[0], y(BENCH_AT[1])]} size={46} /> : null}
    </div>
  )
}
