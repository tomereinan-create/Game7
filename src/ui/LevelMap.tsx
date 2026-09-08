import { useEffect, useMemo, useRef, useState } from 'react'
import { useLayout } from './useLayout'
import { ROUNDS } from '../config'
import type { Opponent } from '../engine/types'
import { fieldGauges, seasonGauges } from '../engine/gauges'
import { balance, canBuy, NODE, NODES } from '../engine/tree'
import { Dial } from './MatchupPanel'
import { currentLevel, playable, totalStars, type Progress } from '../state/campaign'
import { Ask } from './Ask'
import { Trophy } from './Trophy'
import { cardInk, teamColor } from './teamColors'
import { useUserMode } from '../state/viewmode'

/**
 * THE SNAKE (his ruling: "instead of only going up, make it go like a snake to fill the screen").
 * The ladder used to be one climbing column: a sine wave 375 units wide, stretched to whatever
 * column it was handed, one level every 170px. On a full-screen desk that spent the whole window
 * on a ribbon of tickets and 25,000px of scrolling for 150 levels.
 *
 * It is a boustrophedon now — a row of levels left to right, a U-turn at the wall, the next row
 * right to left, climbing. The width decides how many stand in a row, so the trail fills the
 * screen it is given instead of ignoring it, and 150 levels come down to a dozen rows.
 *
 * AND EVERY ROW CLIMBS AS IT RUNS (his ruling: "I want it to be a snake going slightly up, not rows
 * on rows"). A row used to be level, which made the map a stack of shelves with a lift at each end;
 * each row now rises as it runs, in the direction it is walked, so the trail gains
 * height the whole way and the U-turn is a turn in a climb rather than the only place any climbing
 * happened. It is a switchback up a hill, ~4 degrees off level — slightly up, as he asked.
 *
 * Everything below is REAL SCREEN PIXELS, not a stretched 375-wide space. A snake cannot survive
 * `preserveAspectRatio="none"`: the U-turns would be squashed ellipses on a desk and circles on a
 * phone. The trail is measured and drawn 1:1, and the fallback before the first measure is a
 * phone's 375.
 */
const W = 375
/**
 * Horizontal distance between two levels standing in the same row. Wider than it needs to be for
 * the tickets, on purpose: fewer levels per row means more rows, and a turn at the end of each one
 * — the turns are what make it a snake rather than a table (his ruling, "even more snake, less
 * rowy").
 */
const LANE = 208
/**
 * Vertical clearance at the wall where two rows meet — the one place a row and the row above it
 * stand at the same x, and so the one distance that has to clear a ticket. The tallest ticket on
 * the map is the banner: a rod, a pennant, the notch cut out of its foot and three stars under it,
 * ~161px on a desk now that the hall is drawn at the same size as the other three blocks.
 */
const TURN = 212
/**
 * How steeply a row climbs as it runs, as a SLOPE rather than a fixed rise. Stated as an angle
 * because that is what his ruling is about: "a snake going slightly up" is something the eye reads
 * off the picture, and a fixed hundred-pixel rise is a gentle 5 degrees across a desk's ten-ticket
 * row and a 26-degree staircase across a phone's two. 0.12 is ~6.8 degrees at every width — his
 * second ruling on it, "even more snake", steepened it from the 4.9 it first shipped at.
 */
const TILT = 0.12
/**
 * THE WANDER. Every ticket is nudged off its lane by up to this much, by a rule that depends only
 * on the level number — so a ticket does not move between renders, and a level is always in the
 * same place. It is here because the arc alone still left the tickets in tidy VERTICAL columns,
 * one under the other, and a grid is what "rowy" looks like even when the rows themselves curve.
 * 2.39996 radians per level is the golden angle: the offsets never fall into a short repeating
 * pattern, so no column ever comes back.
 */
export const WOBBLE = 13
const wanderOf = (i: number) => WOBBLE * Math.sin(i * 2.3999632)
/** Room at each end of a row — the U-turn needs somewhere to turn. */
const SIDEMAX = 84
/** Room above the top row and below the bottom one — the foot also carries era I's banner. */
const PAD = 132
/**
 * EXTRA room above the top row, on top of PAD — his ruling: "Add a trophy at the end of each
 * campaign in scout mode." The end of the ladder is the top of the trail, and the map left only
 * PAD there, which is half a ticket's clearance and no more. The prize stands in this band.
 */
const CROWN = 104
/**
 * How far the TOP block's floor is carried up past the head of the trail — far enough to run the
 * whole way behind the sticky header and off the top of the page. His ruling ("the header should
 * continue the design not cut it") is only true if there is floor under the header to continue:
 * the header is a translucent pane, and at the very top of the map the strip behind it was the
 * page's own ground rather than the trail's, so the two met in a line exactly where the header
 * ended. The top band starts above the window now, and nothing can be scrolled above zero.
 */
const HEAD_BLEED = 340
/**
 * How far a row bows away from its own slope, as a fraction of that row's climb. A row used to be
 * a ruled line with a 12px wobble on it, which read as a row; at 0.3 it is an ARC — it leaves the
 * wall, swings out well above its own straight line and comes back down to the next turn, and the
 * rows below and above it arc the other way. That is the journey (his ruling: "should have a
 * journey esque feeling") — a path that wanders, not a table of contents.
 *
 * 0.3 is as far as it can go and still CLIMB the whole way, which was the previous ruling and
 * still holds: coming down off the top of the arc costs height, and it has to cost less than the
 * step along the row gains. That ceiling is rise / pi ~= 0.318 of the rise, at any row length.
 * (Clearance is the looser limit: two rows come closest in the MIDDLE, where one bows up and the
 * other bows down, and that gap is step - 2 * bow, which only bites at bow = rise / 2.)
 */
const BOW = 0.3

const sideOf = (colW: number) => Math.min(SIDEMAX, Math.max(20, colW * 0.09))
/**
 * THE BLOCK IS THIRTY LEVELS, AND A ROW MAY NOT STRADDLE ONE (his ruling: "Make the stages cut in
 * 30, 60, 90, 120 — 31 and 30 can't be the same line as the design is different"). A row used to
 * be as many tickets as the width would take, and the floor changed at whichever ROW the new block
 * began in — so with nine to a row, levels 28, 29 and 30 stood on the same shelf as 31 to 36 and
 * took the new block's floor with them. An arena night printed on hardwood.
 *
 * The fix is upstream of the seam: a row only ever holds a DIVISOR OF THIRTY, so level 31 always
 * begins a row and every block is a whole number of rows. (150 is divisible by all of them too, so
 * the top of the ladder is never a part-row either.) The widest one that still leaves a lane wide
 * enough for a ticket wins — ten to a row on a desk, six on a laptop, two on a phone.
 */
const BLOCK_DIVISORS = [15, 10, 6, 5, 3, 2] as const
/** Narrowest lane a ticket is legible in: the widest ticket on the map is ~152px on a desk. */
const MIN_PITCH = 162
export const perRow = (colW: number) => {
  const w = colW || W
  const usable = Math.max(0, w - sideOf(w) * 2)
  const natural = Math.max(2, Math.floor(usable / LANE) + 1)
  // widest divisor of thirty that both fits the width and is not more than the lanes would allow
  const fits = BLOCK_DIVISORS.find((c) => usable / (c - 1) >= MIN_PITCH && c <= natural + 1)
  return fits ?? 2
}
export const rowsOf = (colW: number) => Math.ceil(ROUNDS / perRow(colW))

/** The pitch a row actually uses, and where its first column stands, so rows sit centred. */
function lanes(colW: number) {
  const w = colW || W
  const cols = perRow(w)
  const usable = Math.max(0, w - sideOf(w) * 2)
  // Never spread much wider than a lane. Without the cap a phone, which fits exactly two to a row,
  // would push one ticket to each wall with 150px of empty floor between them; a desk is already
  // under the cap (eight to a row is ~196px of pitch), so this only bites where it has to.
  const pitch = cols > 1 ? Math.min(LANE * 1.15, usable / (cols - 1)) : 0
  return { cols, pitch, x0: (w - pitch * (cols - 1)) / 2 }
}

/**
 * The vertical half of the geometry, and both parts of it fall out of the tilt: how far a row
 * climbs end to end, and therefore how far apart two rows have to start. A wide row climbs further
 * than a narrow one at the same angle, and the rows move apart to keep the turn between them clear.
 */
function climbOf(colW: number) {
  const { cols, pitch } = lanes(colW)
  const rise = TILT * pitch * (cols - 1)
  return { rise, bow: BOW * rise, step: TURN + rise }
}

/**
 * The trail's full height at this width — what the scroll actually costs. The last row's climb is
 * part of it: the top ticket sits a full rise above its own row's start.
 */
export const heightOf = (colW: number) => {
  const { rise, step } = climbOf(colW)
  return PAD * 2 + CROWN + step * (rowsOf(colW) - 1) + rise
}

/** Which row a level index (0-based) stands in, counting up from the bottom. */
export const rowOf = (colW: number) => (i: number) => Math.floor(i / perRow(colW))
/**
 * The y a row STARTS at. Row 0 — level 1 — is at the bottom; the ladder climbs from there. It is
 * measured off the FOOT, so CROWN lands entirely above the top row and the bottom of the map is
 * exactly as tight as it was.
 */
export const yRowOf = (colW: number) => (r: number) => heightOf(colW) - PAD - climbOf(colW).step * r

/**
 * The visual column a level stands in: rows alternate direction, so the last ticket of one row and
 * the first of the next share a column and the turn between them is a clean vertical.
 */
const colAt = (cols: number, i: number) => {
  const r = Math.floor(i / cols)
  const j = i % cols
  return r % 2 === 0 ? j : cols - 1 - j
}

export const xOf =
  (colW: number) =>
  (i: number): number => {
    const { cols, pitch, x0 } = lanes(colW)
    return x0 + pitch * colAt(cols, i) + wanderOf(i)
  }

/**
 * The y of one ticket: where its row starts, MINUS how far along the row it stands (the climb),
 * minus the row's own bow. The climb is measured in walking order, so it does not matter which
 * wall the row runs from — every level is higher than the one before it.
 *
 * The bow is zero at both walls, which is where the U-turns happen, so a turn is a clean vertical
 * and never a kink; it flips sign every row, so the rows read as one long wave rather than a stack
 * of identical scallops.
 */
export const yOf =
  (colW: number) =>
  (i: number): number => {
    const { cols } = lanes(colW)
    const r = Math.floor(i / cols)
    const j = i % cols // how far along its own row this level is, in walking order
    const c = colAt(cols, i)
    const { rise, bow } = climbOf(colW)
    const climb = cols > 1 ? (rise * j) / (cols - 1) : 0
    const arc = cols > 1 ? Math.sin((Math.PI * c) / (cols - 1)) : 0
    return yRowOf(colW)(r) - climb - (r % 2 === 0 ? 1 : -1) * bow * arc
  }

/**
 * The seam between the row a level stands in and the row below it — where a skin block changes
 * floor and where the era rule is drawn. Halfway between the two rows AT THE WALL THEY TURN ON,
 * which is where they come closest: a horizontal line drawn any lower would cross a ticket.
 */
export const seamOf = (colW: number) => (level: number) => yRowOf(colW)(rowOf(colW)(level - 1)) + TURN / 2

/** Smooth trail through every node — a Catmull-Rom spline as cubic Béziers. */
function trail(xAt: (i: number) => number, yAt: (i: number) => number): string {
  const pts = Array.from({ length: ROUNDS }, (_, i) => [xAt(i), yAt(i)])
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return d
}

/** Roman numerals for the era kicker — the ladder is four tiers and will not outgrow this. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/**
 * THE FOUR SKINS, by the level each one starts at — ONE ORDER, BOTH MODES (his ruling, 2026-09-08:
 * "Make user mode same as scout. Meaning copy scout").
 *
 *   1-30     1b ARENA NIGHTS      unchanged
 *   31-90    2b BANNER HALL       his ruling names 61-90; the second brought 31-60 into it
 *   91-120   1c HARDWOOD PRIME    "Switch 91-120 with 31-60"
 *   121-150  2a TWILIGHT DYNASTY  dusk sky, confetti, foil tickets
 *
 * Every block has a board of its own: nothing is carried on from the block below and no board is
 * drawn twice. The hall runs 31-90 as one long room rather than repeating across a seam, and the
 * hardwood stands alone at 91-120 instead of being passed over.
 *
 * THERE USED TO BE TWO LISTS. His ruling of 2026-09-06 re-dealt the boards "for scout mode only",
 * so user mode kept the older order (dusk at 61-90, hardwood carried on to the top). This ruling
 * collapses that: the ladder is dealt the same way whichever mode you read it in, and the two
 * modes differ in how a TICKET and a TRAIL are drawn, not in which room a level stands in.
 *
 * WRITTEN AS LEVELS, not read off the tiers, and that is a deliberate reversal of how the first
 * seam worked. It used to derive from `eras[1].first` so that a tier resized in scripts/campaigns.ts
 * could not leave the skin line behind. That only worked while a skin change WAS a tier change, and
 * it no longer is: the design draws the ladder as five blocks of thirty, but the tiers are 30 / 60 /
 * 30 / 30 — The Champions alone runs 31-90 — so the 91 seam falls in the MIDDLE of a tier and there
 * is nothing to derive it from. The blocks are the design's unit, so they are stated as the design
 * states them, and every seam that still coincides with a tier (31, 121) is checked against the
 * tiers by tests/map.test.ts rather than by being computed from them.
 */
const SKINS = [
  { skin: 'arena', first: 1 },
  { skin: 'hall', first: 31 },
  { skin: 'wood', first: 91 },
  { skin: 'dusk', first: 121 },
] as const
export type Skin = (typeof SKINS)[number]['skin']
/** The blocks, as a list. One list now — see SKINS above. */
const blocks = () => SKINS
export type Block = { readonly skin: Skin; readonly first: number }
/** Which skin a level wears: the last block that has started by then. */
export const skinAt = (level: number): Skin => {
  const list = blocks()
  let out: Skin = list[0].skin
  for (const b of list) if (level >= b.first) out = b.skin
  return out
}
/**
 * The lit trail's colour per skin, bottom of the block first. Two entries paint a gradient WITHIN
 * the block (the arena's ember warms as it drops to the foot; the dynasty's mint cools up into
 * purple, which is the 2a board's own trail); one entry paints the block flat.
 */
/**
 * WHERE THE PAPER FALLS. The design board draws five flecks over a 962px artboard; the real block
 * is thirty levels of trail and runs several thousand pixels, so five would be a handful of paper
 * at the ceiling and nothing the whole way down. The count comes off the block's own height
 * instead — one every FALL_PITCH — and each fleck is placed by a rule that depends only on its
 * index, so the scatter is the SAME scatter every time this block is drawn. Confetti that
 * reshuffles on a resize reads as a glitch rather than as a celebration.
 *
 * The x uses the golden angle for the same reason the tickets' wander does: it never falls into a
 * short repeating pattern, so no column of paper ever lines up under another.
 */
const FALL_PITCH = 300
const FALL_SPAN = 1000
const confettiFor = (height: number) =>
  Array.from({ length: Math.max(5, Math.round(height / FALL_PITCH)) }, (_, i) => {
    const dur = 12 + (i % 6)
    return {
      // 6-92% keeps a fleck off both edges at every width
      x: 6 + 86 * ((i * 0.6180339887 + 0.17) % 1),
      // seeded a fall's worth above its own slot, so the block is papered from its ceiling down
      y: Math.round((i + 0.5) * (height / Math.max(5, Math.round(height / FALL_PITCH)))) - FALL_SPAN,
      dur,
      // a whole number of seconds back into its own cycle: every fleck is mid-fall on first paint
      delay: -((i * 3.7) % dur),
    }
  })

const TRAIL_INK: Record<Skin, readonly string[]> = {
  arena: ['#ffb36b', '#ff6a2e'],
  wood: ['rgba(246,238,221,0.82)'],
  hall: ['rgba(244,232,207,0.75)'],
  dusk: ['#3ee6b0', '#9d7bff'],
}
/*
 * THE TRAIL IS THE BLOCK'S OWN INK IN BOTH MODES (his ruling, 2026-09-08: "in user mode, make all
 * buttons and theme fit the current stage same as scout mode"). User mode climbed one flat gold
 * the whole way up, because it used to stand on the bundle's single room rather than on a board.
 * It stands on the boards now, so the line that runs up them changes colour with them.
 */
/**
 * Every block as a band of trail, in the trail's own px: `bottom` is the seam below it and `top`
 * the seam above, each halfway between the last ticket of one block and the first of the next. The
 * bottom block runs to the very foot and the top block to the very head, so no sliver of floor is
 * left unpainted at either end. A ladder shorter than a block's first level drops that block
 * entirely — a five-level test campaign is all arena, not a map skinned in floors it never reaches.
 */
function bands(rounds: number, colW: number) {
  const H = heightOf(colW)
  // A seam is drawn at a ROW boundary, never mid-row: a block that begins in the middle of a row
  // takes the whole of that row's floor with it, or the ground would change colour under four
  // tickets standing side by side on the same shelf.
  const seam = seamOf(colW)
  const live = (blocks() as readonly Block[]).filter((b) => b.first <= rounds)
  return live.map((b, i) => {
    const nextFirst = live[i + 1]?.first ?? rounds + 1
    const bottom = b.first <= 1 ? H : seam(b.first)
    const top = nextFirst > rounds ? 0 : seam(nextFirst)
    return { skin: b.skin, first: b.first, top, height: Math.max(0, bottom - top), ink: TRAIL_INK[b.skin] }
  })
}

/**
 * Each paper ticket lies at its own angle on the hardwood. Deterministic from the level, so a
 * ticket does not jump to a new angle every time the map re-renders — ±1.8°, never 0, because a
 * ticket that happens to hang straight reads as tonight's game.
 */
const tiltOf = (level: number) => `${((((level * 37) % 7) - 3) * 0.6 || 0.6).toFixed(1)}deg`

/**
 * The campaign map as a ticket trail (design 2d, his ruling over 2c): the
 * winding trail stays, the discs become game tickets with the record on the
 * stub. Cleared tickets are solid gold with their stars; the next one pulses
 * and shows the opponent's OFF/DEF dials; everything beyond is dim.
 *
 * HIS RULING on the Campaign Map canvas: "I want the first 30 games to be 1b, and then we move to
 * 1c." The first 30 games are exactly the first tier, so the seam is derived from the tiers
 * (`eras[1].first`), never typed — config.ts derives ROUNDS from the ladder for the same reason,
 * and a tier resized in scripts/campaigns.ts must not leave the skin line behind. Level 1 sits at
 * the bottom and the map climbs, so the two skins are a vertical band split rather than a mode
 * switch: 1b ARENA NIGHTS below the seam, 1c HARDWOOD PRIME above it, both on screen together
 * where they meet. The sticky header wears the skin of the level you are on.
 */
export function LevelMap({
  title,
  progress,
  opponents,
  eras,
  teamName,
  onPlay,
  onTeam,
  onStaff,
  onMyTeam,
  teamNote = null,
  salary = false,
  death = false,
  auto = false,
  onToggleAuto,
  onAutoTo,
  onReset,
}: {
  title: string
  progress: Progress
  opponents: Opponent[]
  eras: { name: string; years: [number, number]; first: number }[]
  teamName: string
  onPlay: (level: number) => void
  onTeam: () => void
  onStaff: () => void
  /** Death match only: the team screen — the five, their durability, and the round's spin. */
  onMyTeam?: () => void
  /** Death match only: a nudge pinned beside the next opponent — a change waiting, or a man worn out. */
  teamNote?: string | null
  /** Which branches this mode actually sells — the staff notice must not point at a hidden one. */
  salary?: boolean
  death?: boolean
  /**
   * AUTO-COMPLETE (his ruling: "I want an auto complete mode to see the latter stages"). A mode,
   * not a button: while it is on, every ticket on the trail is tappable and tapping one clears
   * the whole ladder up to it at one star. That is the shortest honest route to a block a hundred
   * levels up — tap level 91 and the top floor is there to look at.
   *
   * It BORROWS the ladder (his ruling: "When moving the auto mode to off, clear back all the
   * completed stages and return to normal"): switching it off puts back exactly the stars you had
   * when you switched it on. App holds the real ones while it runs.
   */
  auto?: boolean
  onToggleAuto?: () => void
  /** Clear everything up to and including this level, at one star. Auto mode only. */
  onAutoTo?: (level: number) => void
  onReset: () => void
}) {
  const cur = currentLevel(progress)
  const total = totalStars(progress)
  const cleared = progress.stars.filter((s) => s > 0).length
  const bal = balance(progress)
  /**
   * HIS RULING: the staff notice shows only when there is genuinely something to spend on —
   * "(if there is something available)". Not `bal > 0`: a star he cannot place anywhere buys
   * nothing, so this asks the tree the real question. `canBuy` already folds in the price, the
   * node not being maxed out, and its `requires` gate; the branch test on top of it keeps the
   * notice off branches this mode does not sell, which are the ones the staff screen hides.
   */
  const spendable =
    bal > 0 &&
    NODES.some((n) => {
      const b = NODE[n.id].branch
      return (b === 'Salary' ? salary : b === 'Survival' ? death : true) && canBuy(progress, n.id)
    })
  // recal_64: the NEXT ticket's dials percentile within the opponent's own season — computed for
  // that one node only (a whole map of season pools would be 47 pools for dials nobody sees).
  const nowGauge = useMemo(() => {
    const o = cur ? opponents[cur - 1] : null
    if (!o) return null
    return o.season ? seasonGauges(o.players, o.season) : fieldGauges(o.players)
  }, [cur, opponents])
  /** How far ahead the map reveals: what you have cleared, and the one you are on. */
  const revealed = (state: string) => state !== 'locked'
  const starGlyphs = (n: number) => [1, 2, 3].map((k) => <i key={k} className={k <= n ? 'lit' : ''}>★</i>)

  /**
   * The ticket stub: team abbreviation (with year off the home era) and the record — or, for a
   * five that never played a season, what it is instead ("all-time", "the 1990s"). Without the
   * tag every All-Time and Customs ticket read as a bare three letters.
   */
  const stub = (o: Opponent) => {
    const ab = o.season && o.era !== eras[0]?.name ? `'${String(o.season).slice(2)} ${o.ab ?? ''}` : (o.ab ?? '')
    return { ab, line: o.record ?? o.tag ?? '' }
  }
  /** THE BLOCKS: which skin each level wears, and the band of trail each one paints. */
  const skinOf = skinAt
  // BANDS depend on the width now — how many levels stand in a row decides where a seam falls.
  /** The skin of the level you are ON — what the sticky header, the notices and the foot wear. */
  const skin = skinOf(cur ?? ROUNDS)
  /** User mode plays blind: the design's mode table takes the dials off tonight's ticket. */
  const user = useUserMode()
  const nowRef = useRef<HTMLButtonElement>(null)
  // Destructive actions ask IN the game (browser popups never render on his phone).
  const [askReset, setAskReset] = useState(false)

  /**
   * THE DESK MAP (his ruling: "Widen it, needs to be full screen"). The map used to be the one
   * campaign screen still boxed into the phone column while the draft and My team already spread
   * out, so on a desk it drew a 560px ribbon of tickets down the middle of a black window. It
   * takes the SAME opt-in they take rather than inventing a third width.
   */
  /**
   * A LAYOUT effect, and declared above the measure below, because the two are ordered: these
   * classes are what take #root from the 562px column out to the desk, so measuring the trail
   * before they land reads the OLD width and winds the whole map to a column it is no longer in.
   *
   * TWO classes, not one (his ruling: "Now its a little bit too big"). `wide` is the shared opt-in
   * the draft and My team also take, and its 1480px is THEIR width — a table of players and a
   * tactics board both want every pixel. A trail of tickets does not: at 1480 it sprawled. `map`
   * pulls this screen alone back to 1150 without touching the two screens that were never too big.
   */
  /**
   * ...AND THE BLOCK'S OWN FLOOR ON THE PAGE (his ruling: "Make the header the same design as the
   * stage, it should continue the design not cut it"). The header is a translucent scrim now
   * rather than a panel, so what shows through it has to BE the floor — and the strip it sits on,
   * above the trail, is the page's own ground, which the trail's bands never reached. The map
   * takes the same `sk-` body class the draft and the staff room take, so the room starts at the
   * top of the window and the header is a pane of it rather than a lid on it.
   */
  useLayout(() => {
    document.body.classList.add('wide', 'map', `sk-${skin}`)
    return () => document.body.classList.remove('wide', 'map', `sk-${skin}`)
  }, [skin])

  /**
   * The width the trail is actually handed, so the wind can be cut to it. It is read STRAIGHT off
   * the box in a layout effect and then again on every window resize — deliberately not through a
   * ResizeObserver, which only delivers callbacks as part of the rendering lifecycle: a tab that is
   * not painting (a background tab, an off-screen preview) never fires one, and the map would draw
   * its whole trail at the 375 fallback while measuring 1438 to anyone who asked. The column only
   * changes width when the window does, so a resize listener covers everything a container
   * observer would, and the first value is synchronous. 375 is the fallback before layout and on
   * the server: the phone geometry this map has always drawn, so a first paint is never wrong,
   * only narrow.
   */
  const trailRef = useRef<HTMLDivElement>(null)
  const [colW, setColW] = useState(W)
  useLayout(() => {
    const measure = () => setColW(trailRef.current?.getBoundingClientRect().width || W)
    measure()
    window.addEventListener('resize', measure)
    /**
     * AND a container observer on top of the window listener — belt and braces, after the bug he
     * reported ("Pressing on the stage then on map leads me here instead of the normal map"): the
     * trail's box can change width without the window doing anything, because the width is set by
     * a class on the body, and if that happens after the measure the whole trail is laid out for a
     * column it is no longer in. The root cause of that one is fixed where it belongs (the draft's
     * body class is a layout effect now, so its cleanup cannot land after the map's), but a trail
     * measured against the wrong box is a bad enough failure to be worth a second net.
     *
     * The window listener STAYS, and is not redundant: a ResizeObserver only delivers as part of
     * the rendering lifecycle, so a tab that is not painting — a background tab, an off-screen
     * preview — never fires one, and this screen would draw its whole trail at the 375 fallback.
     */
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (ro && trailRef.current) ro.observe(trailRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [])
  const xAt = useMemo(() => xOf(colW), [colW])
  const yAt = useMemo(() => yOf(colW), [colW])
  const seam = useMemo(() => seamOf(colW), [colW])
  const H = useMemo(() => heightOf(colW), [colW])
  // `bands` reads the block list for the mode, so a flip of the switch has to re-band the trail
  const BANDS = useMemo(() => bands(ROUNDS, colW), [colW, user])
  const TRAIL = useMemo(() => trail(xAt, yAt), [xAt, yAt])

  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' })
  }, [])
  /**
   * Take the eye to a block without taking the campaign there. The trail is laid out in the page's
   * own scroll (not a pane of its own), so the y a level sits at is the trail's top plus that
   * level's own y — half a window up, so the block opens centred rather than at its foot.
   */
  const jumpTo = (level: number) => {
    const top = (trailRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY
    window.scrollTo({ top: Math.max(0, top + yAt(level - 1) - window.innerHeight / 2), behavior: 'smooth' })
  }

  // The trail is lit up to the current level, unlit beyond it.
  const litIdx = cur ? cur - 1 : ROUNDS - 1
  const litLen = litIdx / (ROUNDS - 1)

  return (
    <>
      {/**
       * The title, the rule and the header pin as ONE block. The home button is fixed to the
       * window's top-right corner, and the topbar's 44px gutter is the only room on this screen
       * reserved for it; pinning the header on its own slid the right column — the cleared count,
       * the staff notice — straight under the button.
       */}
      <div className={`map-top ${skin}`}>
        <div className="topbar">
          <span>{title}</span>
        </div>
        <div className="rule2" />

        <div className="map-head">
          <div>
            <div className="map-kicker">{cur ? `Level ${cur} is up · ${opponents[cur - 1]?.era ?? ''}` : 'All cleared'}</div>
            {/**
             * HIS REPORT: "where is my skill tree to spend stars?" — the notice below is the only
             * door the map had, and his ruling keeps it shut when nothing is affordable, so a
             * balance spent to zero took the whole tree off the screen while the counter still
             * read ★ 10. The counter is the door now: you tap your stars to go and spend them.
             * The notice is untouched and still obeys the ruling.
             */}
            <button className="map-total" onClick={onStaff} aria-label={`Staff tree — ${bal} of ${total} stars unspent`}>
              <span className="star">★</span> {total}
              <i> / {ROUNDS * 3}</i>
              <i className="a">→</i>
            </button>
          </div>
          <div className="map-side">
            <div className="map-kicker">
              {cleared} of {ROUNDS} cleared
            </div>
            {spendable ? (
              <button className="map-link staff" onClick={onStaff}>
                {/* The star, the separator and the arrow are spaced by margin, not by mono spaces:
                    at this size a space costs a full 7.3px character, which is what pushed the line
                    onto two at 375px. His wording is untouched. */}
                <i className="g">★</i>
                {bal} to spend<i className="d">·</i>Staff<i className="a">→</i>
              </button>
            ) : null}
            {/* His ruling: the NAME is the half that yields. RENAME is the actionable half and never
                truncates, so the name takes the flexible width and the ellipsis. The separator is
                spaced by margin here too, which buys back ~15px before truncation can start. */}
            <button className="map-link team" onClick={onTeam}>
              <span className="nm">{teamName}</span>
              <i className="d">·</i>
              <span className="rn">rename</span>
            </button>
            {onMyTeam ? (
              <button className="map-link" onClick={onMyTeam}>
                My team →
              </button>
            ) : null}
            {/* HIS RULING: "Move Reset this campaign next to the home page." It sat in the foot,
                three thousand pixels below the fold — the one control on the map you had to go
                looking for. It is the last line of the header's right column now, which is the
                corner the home button is pinned to. It still asks before it does anything. */}
            <button className="map-link danger" onClick={() => setAskReset(true)}>
              Reset this campaign
            </button>
          </div>
        </div>

        {/* THE CONTROL ROW (the design bundle, and his ruling: "Add this to all campaign modes in
            scout mode"). Four era chips and the auto door, each a 44px target. They scroll the map
            without moving where the campaign is — jumping to era III is a way of LOOKING at the
            ladder, and it must never be mistaken for having got there.

            It was user mode's alone, which left scout mode reaching the auto door through a link in
            the foot three thousand pixels below the fold and the blocks at 31, 91 and 121 with no
            door at all. Both modes take the row now; only its SKIN differs, `scout` being the class
            that puts it back on the app's own tokens. The staff-and-rename pair below stays user
            mode's, because scout's header already carries both in its right column. One map serves
            all three campaigns, so "all campaign modes" is what this is the moment it renders. */}
        <div className={`um-mapbar ${user ? '' : 'scout'}`}>
          <div className="um-eras">
            {eras.map((e, i) => (
              <button
                key={e.name}
                className={`um-era ${cur && cur >= e.first && (!eras[i + 1] || cur < eras[i + 1].first) ? 'on' : ''}`}
                onClick={() => jumpTo(e.first)}
              >
                <b>{ROMAN[i] ?? i + 1}</b>
                <i>
                  {e.first}–{(eras[i + 1]?.first ?? ROUNDS + 1) - 1}
                </i>
              </button>
            ))}
            {onToggleAuto ? (
              <button className={`um-era auto ${auto ? 'on' : ''}`} onClick={onToggleAuto} aria-pressed={auto}>
                Auto · {auto ? 'ON' : 'OFF'}
              </button>
            ) : null}
          </div>
          {user ? (
            <div className="um-maprow">
              <button className="um-staff" onClick={onStaff}>
                ★ {bal} to spend · Staff →
              </button>
              <button className="um-rename" onClick={onTeam}>
                Rename
              </button>
            </div>
          ) : null}
        </div>

        {/* THE TROPHY (his ruling: "Add a trophy in all modes after 150 wins"). One hundred and
            fifty series won is the whole ladder, and until now the map answered that with a kicker
            reading "All cleared" — the same weight it gives level 4. It is the last thing in the
            header, under the era row, so it stands across the top of the map in every mode the map
            serves: the campaign, the salary cap and the death match all read this one component,
            and both skins get it because the trophy is the RESULT, not a way of looking.

            IT IS USER MODE'S ALONE NOW. His later ruling put a trophy at the END of the ladder in
            scout mode — see `map-crown` on the trail below — and a scout who has cleared 150 does
            not need to be told so twice on the same screen. The header bar stays for user mode,
            whose map has no monument on it. */}
        {user && cleared === ROUNDS ? (
          <div className="map-trophy">
            <Trophy />
            <span className="tr-txt">
              <b>Champion of the ladder</b>
              <i>
                All {ROUNDS} cleared · ★ {total} of {ROUNDS * 3}
              </i>
            </span>
          </div>
        ) : null}
      </div>

      <div ref={trailRef} className={`trail ${auto ? 'auto' : ''}`} style={{ height: H }}>
        {/* THE FLOOR, one element per block. It used to be two pseudo-elements on .trail, which is
            exactly two grounds and no more; four skins do not fit in two, so each block paints its
            own band and every one of them fades into the block below at its own top edge. */}
        {BANDS.map((b) => (
          <div
            key={b.skin}
            className={`ground ${b.skin}`}
            /* the topmost block runs up behind the header — see HEAD_BLEED */
            style={b.top === 0 ? { top: -HEAD_BLEED, height: b.height + HEAD_BLEED } : { top: b.top, height: b.height }}
          >
            {/* THE CONFETTI (his ruling on the design doc: "Dont forget the dusk sky, confetti,
                foil tickets"). The sky and the foil this block already had; this is the third
                thing, and it cannot be pseudo-elements — a ::before and an ::after are two flecks
                and the board wants a scatter. BOTH MODES now (his ruling, 2026-09-08: user mode
                copies scout here) — the dusk block is the same room whoever is reading it. */}
            {b.skin === 'dusk'
              ? confettiFor(b.height).map((c, k) => (
                  <span
                    key={k}
                    className={`fleck f${k % 4}`}
                    style={{ left: `${c.x}%`, top: c.y, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
                    aria-hidden
                  />
                ))
              : null}
          </div>
        ))}
        {/* Drawn 1:1 in the measured width — a snake's U-turns cannot be stretched. */}
        <svg className="trail-svg" viewBox={`0 0 ${colW} ${H}`} preserveAspectRatio="none" aria-hidden>
          {/* The lit trail is ONE stroke in every skin's colour. userSpaceOnUse pins the stops to
              the viewBox, so the painted line changes colour at exactly the y the floor does — a
              seam is never a couple of pixels off from the ground behind it. The stops are emitted
              top-of-the-map first, because the gradient runs y=0 down while the LADDER runs up. */}
          <defs>
            <linearGradient id="trailSplit" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
              {[...BANDS].reverse().flatMap((b) => {
                // a hair inside each seam either way, so two blocks meet in a line and not a blend
                const a = Math.min(1, Math.max(0, b.top / H + (b.top > 0 ? 0.0008 : 0)))
                const z = Math.min(1, Math.max(0, (b.top + b.height) / H - 0.0008))
                const ink = b.ink
                return [
                  <stop key={`${b.skin}-a`} offset={a} stopColor={ink[ink.length - 1]} />,
                  <stop key={`${b.skin}-z`} offset={z} stopColor={ink[0]} />,
                ]
              })}
            </linearGradient>
          </defs>
          <path className="trail-dim split" d={TRAIL} pathLength={1} />
          <path className="trail-glow" d={TRAIL} pathLength={1} style={{ strokeDasharray: `${litLen} 1` }} />
          <path className="trail-lit split" d={TRAIL} pathLength={1} style={{ strokeDasharray: `${litLen} 1` }} />
        </svg>

        {/**
         * THE PRIZE AT THE END OF THE LADDER (his ruling: "Add a trophy at the end of each
         * campaign in scout mode"). The map already says a finished ladder in its header, but the
         * header is where you START reading — the trophy belongs where the climb ENDS, standing
         * above level 150 at the head of the trail, so the thing being climbed towards is drawn
         * at the top of the thing you climb.
         *
         * It is up the whole way, not only once it is won: dim while the ladder is unfinished and
         * lit when every level has fallen. A prize you cannot see is not something to climb for.
         * Scout mode only, as he asked — user mode's map is the design bundle's and this does not
         * reach into it.
         */}
        {!user ? (
          <div
            className={`map-crown ${skinOf(ROUNDS)} ${cleared === ROUNDS ? 'won' : ''}`}
            /* over the last ticket, and kept off both walls the same way the node notes are */
            style={{ top: 26, left: Math.min(Math.max(xAt(ROUNDS - 1), 180), Math.max(180, colW - 180)) }}
          >
            <Trophy size={36} />
            <b>{cleared === ROUNDS ? 'Champion of the ladder' : 'The end of the ladder'}</b>
            <i>
              {cleared === ROUNDS
                ? `All ${ROUNDS} cleared · ★ ${total} of ${ROUNDS * 3}`
                : `${cleared} of ${ROUNDS} cleared`}
            </i>
          </div>
        ) : null}

        {eras.map((e, ei) => (
          <div
            className={`era-band ${skinOf(e.first)}`}
            key={e.name}
            /**
             * THE SNAKE took the sides away — a row runs wall to wall now, so an era banner pinned
             * to a margin would stand on a ticket. It is a full-width rule across the gap between
             * two rows instead, drawn at the SAME seam the floor changes at, so the line that says
             * the era changed and the floor that changes are one and the same. The bottom era has
             * no gap under it — its rule sits in the foot the map leaves below the first row.
             */
            style={{ top: Math.min(seam(e.first), H - 34) }}
          >
            {/* 1b hangs the era number above the name as a lit kicker; 1c prints it on the flag
                beside the year. Same three parts either way — the skin decides the order. */}
            <em>Era {ROMAN[ei] ?? ei + 1}</em>
            <b>{e.name}</b>
            <i>
              {e.years[0] === e.years[1] ? e.years[0] : `${e.years[0]}–${e.years[1]}`}
            </i>
          </div>
        ))}
        {/**
         * HIS RULING: "Same as I have a change possible in my team, add a star notification that
         * says that I have stars to spend(only if there is samething available to buy)". So the
         * my-team nudge gets a twin: same shape, same corner, beside the NEXT ticket, and it asks
         * the same question the header notice asks — `spendable`, not a balance. The change note
         * is the death match's; this one belongs to every mode. When both are up they stack, on
         * the far side of the trail from the ticket, centred on it.
         */}
        {cur && (spendable || (teamNote && onMyTeam)) ? (
          <div
            className={`node-notes ${xAt(cur - 1) > colW / 2 ? 'left' : 'right'}`}
            /* pinned above tonight's ticket, and kept off both walls */
            style={{ left: Math.min(Math.max(xAt(cur - 1), 180), Math.max(180, colW - 180)), top: yAt(cur - 1) - 126 }}
          >
            {spendable ? (
              <button className={`node-note ${skin}`} onClick={onStaff}>
                {/* spaced by margin, not by mono spaces — the same reason the header notice is */}
                <i className="g">★</i>
                {bal} {bal === 1 ? 'star' : 'stars'} to spend<i className="d">·</i>Staff<i className="a">→</i>
              </button>
            ) : null}
            {teamNote && onMyTeam ? (
              <button className={`node-note ${skin}`} onClick={onMyTeam}>
                {teamNote} →
              </button>
            ) : null}
          </div>
        ) : null}
        {opponents.map((o) => {
          const level = o.round
          const i = level - 1
          const stars = progress.stars[i]
          const state = stars > 0 ? 'done' : level === cur ? 'now' : 'locked'
          // Auto mode opens the whole trail: a locked level is exactly what you would be tapping.
          const can = auto ? true : playable(progress, level)
          const nodeSkin = skinOf(level)
          const c = teamColor(o.ab)
          // User mode paints the whole ticket in the club's gradient, so it needs the two colours
          // the paper skins never had to ask for: which way the scrim runs, and what the stripe is.
          const cin = cardInk(c)
          const s = stub(o)
          return (
            <button
              key={level}
              ref={state === 'now' ? nowRef : undefined}
              /* USER MODE WEARS ONE TICKET, NOT FOUR (the design bundle's option B). The four block
                 skins — arena card, paper, banner, dusk — are scout mode's, and each one is a whole
                 sheet of rules hung off `.node.arena` and friends. Naming the node `club` instead of
                 its block takes every one of them off in a single stroke, so the club card below has
                 only the bare `.node` rules to answer, and the FLOOR each block stands on (which the
                 design keeps) is untouched — that is painted by the band, not by the ticket. */
              className={`node ${user ? 'club' : nodeSkin} ${state} ${o.champion ? 'champ' : ''} ${cin.darkInk ? 'lit-ink' : ''}`}
              style={
                {
                  left: xAt(i),
                  top: yAt(i),
                  // Both skins are cut from the same four club colours; only the shape differs.
                  '--tc': c.primary,
                  '--td': c.deep,
                  '--ta': c.accent,
                  '--ti': c.ink,
                  '--te': cin.edge,
                  '--tilt': tiltOf(level),
                } as React.CSSProperties
              }
              disabled={!can}
              onClick={() => (auto ? onAutoTo?.(level) : can && onPlay(level))}
              aria-label={`Level ${level}${state !== 'locked' ? `, ${o.team}` : ''}${stars ? `, ${stars} stars` : ''}`}
            >
              <span className="ticket">
                {state === 'now' ? <span className="ticket-next">NEXT</span> : null}
                <span className="ticket-n">{level}</span>
                {/* The abbreviation and the record are two elements, not one string: 1b reads them
                    as one line under the number ("WAS 17–65"), 1c lifts the abbreviation out into
                    the club band printed across the head of the paper ticket. */}
                <span className="ticket-stub">
                  {revealed(state) ? (
                    <>
                      <b className="ab">{s.ab}</b>
                      {s.line ? <i className="ln">{s.line}</i> : null}
                    </>
                  ) : (
                    '?'
                  )}
                </span>
                {o.champion && revealed(state) ? <span className="ticket-champ">CHAMP</span> : null}
                {/* The club card prints its stars ON the ticket, inside the scrim, where the four
                    paper skins hang them under it. Same three glyphs either way. */}
                {user && state === 'done' ? <span className="node-stars">{starGlyphs(stars)}</span> : null}
              </span>
              {!user && state === 'done' ? <span className="node-stars">{starGlyphs(stars)}</span> : null}
              {state === 'now' && nowGauge && !user ? (
                <span className="node-dials">
                  <Dial label="OFF" value={nowGauge.off} tone="them" />
                  <Dial label="DEF" value={nowGauge.def} tone="them" />
                  <span className="gauge-basis">{nowGauge.basis}</span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {askReset ? (
        <Ask
          label="The whole campaign"
          text="Every level and every star starts over. Reset it?"
          yes="Reset it"
          onYes={onReset}
          onClose={() => setAskReset(false)}
        />
      ) : null}
      {/* HIS RULING: "anything below era 1 the league 2026 needs to be deleted, its just empty
          space." What stood under the bottom era's rule was a foot bar carrying a hint and a
          second auto-complete switch — and the switch has had a door of its own in the era row
          at the top of the map since that row was given to both modes, so the bar was saying
          nothing the map does not already say, two hundred pixels below the last ticket. The
          page's own room for a dock goes with it: this screen has no dock. The blue crawl that
          took the last band under it is gone too (his ruling, 2026-09-08: "Delete everything below
          the league 2026 in both modes"), so era I's rule is now the last thing on the page. */}
    </>
  )
}
