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

/** Path geometry, in a 375-wide coordinate space stretched to the column. */
const W = 375
const STEP = 170 // vertical distance between levels (ticket + stars or dials)
const PAD = 56 // room above the top node and below the bottom one
const H = PAD * 2 + STEP * (ROUNDS - 1)
const yAt = (i: number) => H - PAD - STEP * i // level 1 at the bottom, climbing

/**
 * THE WIND, in levels per full swing (his ruling: "Widen it, needs to be full screen"). The trail
 * is drawn in the 375-wide space above and stretched to whatever column it is given, so its
 * amplitude is always 34% of that width — on a desk that is now the whole screen rather than a
 * phone column. Held at the fixed 7 levels it used to wind at, that much wider swing over the same
 * 170px step would flatten the path into a near-horizontal zigzag, so the period stretches with the
 * width instead: the trail sweeps the whole screen in long arcs, and the horizontal travel per
 * level stays the ~114px it is on a phone, which is the angle this trail was drawn at. A phone is
 * the floor of the clamp and keeps the 7 it always had.
 */
export const windOf = (colW: number) => Math.max(7, (7 * colW) / W)
export const xOf =
  (colW: number) =>
  (i: number): number =>
    W / 2 + 0.34 * W * Math.sin((i * 2 * Math.PI) / windOf(colW))

/** Smooth trail through every node — a Catmull-Rom spline as cubic Béziers. */
function trail(xAt: (i: number) => number): string {
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
function bands(rounds: number) {
  const live = SKINS.filter((b) => b.first <= rounds)
  return live.map((b, i) => {
    const nextFirst = live[i + 1]?.first ?? rounds + 1
    const bottom = b.first <= 1 ? H : yAt(b.first - 1) + STEP / 2
    const top = nextFirst > rounds ? 0 : yAt(nextFirst - 1) + STEP / 2
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
  const BANDS = useMemo(() => bands(ROUNDS), [])
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
    return () => window.removeEventListener('resize', measure)
  }, [])
  const xAt = useMemo(() => xOf(colW), [colW])
  const TRAIL = useMemo(() => trail(xAt), [xAt])

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
          </div>
        </div>
      </div>

      <div ref={trailRef} className="trail" style={{ height: H }}>
        {/* THE FLOOR, one element per block. It used to be two pseudo-elements on .trail, which is
            exactly two grounds and no more; four skins do not fit in two, so each block paints its
            own band and every one of them fades into the block below at its own top edge. */}
        {BANDS.map((b) => (
          <div key={b.skin} className={`ground ${b.skin}`} style={{ top: b.top, height: b.height }} />
        ))}
        <svg className="trail-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
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
            className={`era-band ${skinOf(e.first)} ${xAt(e.first - 1) > W / 2 ? 'left' : 'right'}`}
            key={e.name}
            style={{ top: yAt(e.first - 1) - 18 }}
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
          <div className={`node-notes ${xAt(cur - 1) > W / 2 ? 'left' : 'right'}`} style={{ top: yAt(cur - 1) }}>
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
          const can = playable(progress, level)
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
                  left: `${(100 * xAt(i)) / W}%`,
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
              onClick={() => can && onPlay(level)}
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
        <span className="cap">Tap a cleared level to replay it for a better rating</span>
        <button className="map-link danger" onClick={() => setAskReset(true)}>
          Reset this campaign
        </button>
      </div>
    </>
  )
}
