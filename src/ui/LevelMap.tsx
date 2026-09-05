import { useEffect, useMemo, useRef, useState } from 'react'
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
const xAt = (i: number) => W / 2 + 0.34 * W * Math.sin((i * 2 * Math.PI) / 7) // winds every 7 levels
const yAt = (i: number) => H - PAD - STEP * i // level 1 at the bottom, climbing

/** Smooth trail through every node — a Catmull-Rom spline as cubic Béziers. */
function trail(): string {
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
const TRAIL = trail()

/** Roman numerals for the era kicker — the ladder is four tiers and will not outgrow this. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

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
  eras: { name: string; years: [number, number]; handicap: number; first: number }[]
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
  /**
   * THE SEAM. The first tier is 1b, everything after is 1c — read off the tiers, not typed. With
   * one tier only (or none passed) the whole map stays in the arena, which is what a mode with no
   * second era should look like rather than a map skinned half in a floor it never reaches.
   */
  const seamLevel = eras[1]?.first ?? ROUNDS + 1
  const skinOf = (level: number) => (level < seamLevel ? 'arena' : 'wood')
  /** Halfway between the last arena ticket and the first hardwood one, as a % of the trail. */
  const seamY = seamLevel > ROUNDS ? -PAD : yAt(seamLevel - 1) + STEP / 2
  const seamPct = (100 * seamY) / H
  /** The skin of the level you are ON — what the sticky header, the notices and the foot wear. */
  const skin = skinOf(cur ?? ROUNDS)
  const nowRef = useRef<HTMLButtonElement>(null)
  // Destructive actions ask IN the game (browser popups never render on his phone).
  const [askReset, setAskReset] = useState(false)

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

      <div className="trail" style={{ height: H, '--split': `${seamPct}%` } as React.CSSProperties}>
        <svg className="trail-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {/* The lit trail is ONE stroke in two colours. userSpaceOnUse pins the stops to the
              viewBox, so the painted cream line becomes the ember line at exactly the y the floor
              changes — the seam is never a couple of pixels off from the ground behind it. */}
          <defs>
            <linearGradient id="trailSplit" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
              <stop offset="0" stopColor="rgba(246,238,221,0.82)" />
              <stop offset={Math.max(0, seamPct / 100 - 0.006)} stopColor="rgba(246,238,221,0.82)" />
              <stop offset={Math.min(1, seamPct / 100 + 0.006)} stopColor="#ff6a2e" />
              <stop offset="1" stopColor="#ffb36b" />
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
              {e.handicap ? ` · opponents +${e.handicap}` : ''}
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
