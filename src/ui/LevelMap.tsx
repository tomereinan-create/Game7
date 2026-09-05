import { useEffect, useMemo, useRef, useState } from 'react'
import { useLayout } from './useLayout'
import { ROUNDS } from '../config'
import type { Opponent } from '../engine/types'
import { fieldGauges, seasonGauges } from '../engine/gauges'
import { balance, canBuy, NODE, NODES } from '../engine/tree'
import { Dial } from './MatchupPanel'
import { currentLevel, playable, totalStars, type Progress } from '../state/campaign'
import { Ask } from './Ask'
import { teamColor } from './teamColors'

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
 * stand at the same x, and so the one distance that has to clear a ticket. A ticket with its stars
 * under it is ~142px tall.
 */
const TURN = 190
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
/** How many levels stand in one row at this width. Two is the floor — a phone still snakes. */
export const perRow = (colW: number) => {
  const usable = Math.max(0, (colW || W) - sideOf(colW || W) * 2)
  return Math.max(2, Math.floor(usable / LANE) + 1)
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
  return PAD * 2 + step * (rowsOf(colW) - 1) + rise
}

/** Which row a level index (0-based) stands in, counting up from the bottom. */
export const rowOf = (colW: number) => (i: number) => Math.floor(i / perRow(colW))
/** The y a row STARTS at. Row 0 — level 1 — is at the bottom; the ladder climbs from there. */
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
 * THE FOUR SKINS, by the level each one starts at — from the Campaign Map design board and his
 * ruling on it: "Use 2b for 61-90, and 2a for 91-120", and for the tier above that, carry the
 * 91-120 skin on. 1b ARENA NIGHTS 1-30, 1c HARDWOOD PRIME 31-60, 2b BANNER HALL 61-90, and 2a
 * TWILIGHT DYNASTY 91 to the top of the ladder.
 *
 * WRITTEN AS LEVELS, not read off the tiers, and that is a deliberate reversal of how the first
 * seam worked. It used to derive from `eras[1].first` so that a tier resized in scripts/campaigns.ts
 * could not leave the skin line behind. That only worked while a skin change WAS a tier change, and
 * it no longer is: the design draws the ladder as five blocks of thirty, but the tiers are 30 / 60 /
 * 30 / 30 — The Champions alone runs 31-90 — so the 61 seam falls in the MIDDLE of a tier and there
 * is nothing to derive it from. The blocks are the design's unit, so they are stated as the design
 * states them, and every seam that still coincides with a tier (31, 91) is checked against the tiers
 * by tests/map.test.ts rather than by being computed from them.
 *
 * 2a covers 91-150 rather than 91-120 (his ruling, on the top tier having no board of its own:
 * "Carry the 91-120 skin on") — The Customs never falls back to a skin the ladder already passed.
 */
const SKINS = [
  { skin: 'arena', first: 1 },
  { skin: 'wood', first: 31 },
  { skin: 'hall', first: 61 },
  { skin: 'dusk', first: 91 },
] as const
export type Skin = (typeof SKINS)[number]['skin']
/** Which skin a level wears: the last block that has started by then. */
export const skinAt = (level: number): Skin => {
  let out: Skin = SKINS[0].skin
  for (const b of SKINS) if (level >= b.first) out = b.skin
  return out
}
/**
 * The lit trail's colour per skin, bottom of the block first. Two entries paint a gradient WITHIN
 * the block (the arena's ember warms as it drops to the foot; the dynasty's mint cools up into
 * purple, which is the 2a board's own trail); one entry paints the block flat.
 */
const TRAIL_INK: Record<Skin, readonly string[]> = {
  arena: ['#ffb36b', '#ff6a2e'],
  wood: ['rgba(246,238,221,0.82)'],
  hall: ['rgba(244,232,207,0.75)'],
  dusk: ['#3ee6b0', '#9d7bff'],
}
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
  const live = SKINS.filter((b) => b.first <= rounds)
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
   * levels up — tap level 91 and the dusk floor is there to look at.
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
  useLayout(() => {
    document.body.classList.add('wide', 'map')
    return () => document.body.classList.remove('wide', 'map')
  }, [])

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
  const BANDS = useMemo(() => bands(ROUNDS, colW), [colW])
  const TRAIL = useMemo(() => trail(xAt, yAt), [xAt, yAt])

  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' })
  }, [])

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
      </div>

      <div ref={trailRef} className={`trail ${auto ? 'auto' : ''}`} style={{ height: H }}>
        {/* THE FLOOR, one element per block. It used to be two pseudo-elements on .trail, which is
            exactly two grounds and no more; four skins do not fit in two, so each block paints its
            own band and every one of them fades into the block below at its own top edge. */}
        {BANDS.map((b) => (
          <div key={b.skin} className={`ground ${b.skin}`} style={{ top: b.top, height: b.height }} />
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
          const s = stub(o)
          return (
            <button
              key={level}
              ref={state === 'now' ? nowRef : undefined}
              className={`node ${nodeSkin} ${state} ${o.champion ? 'champ' : ''}`}
              style={
                {
                  left: xAt(i),
                  top: yAt(i),
                  // Both skins are cut from the same four club colours; only the shape differs.
                  '--tc': c.primary,
                  '--td': c.deep,
                  '--ta': c.accent,
                  '--ti': c.ink,
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
              </span>
              {state === 'done' ? (
                <span className="node-stars">
                  {[1, 2, 3].map((k) => (
                    <i key={k} className={k <= stars ? 'lit' : ''}>
                      ★
                    </i>
                  ))}
                </span>
              ) : null}
              {state === 'now' && nowGauge ? (
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
      <div className={`map-foot ${skin}`}>
        <span className="cap">
          {auto ? 'Auto-complete is on — tap any level to clear the ladder up to it' : 'Tap a cleared level to replay it for a better rating'}
        </span>
        {onToggleAuto ? (
          <button className={`map-link auto ${auto ? 'on' : ''}`} onClick={onToggleAuto} aria-pressed={auto}>
            Auto-complete · {auto ? 'ON' : 'OFF'}
          </button>
        ) : null}
      </div>
    </>
  )
}
