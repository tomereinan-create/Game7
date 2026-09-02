import { useEffect, useMemo, useRef, useState } from 'react'
import { ROUNDS } from '../config'
import type { Opponent } from '../engine/types'
import { fieldGauges, seasonGauges } from '../engine/gauges'
import { balance, canBuy, NODE, NODES } from '../engine/tree'
import { Dial } from './MatchupPanel'
import { currentLevel, playable, totalStars, type Progress } from '../state/campaign'
import { Ask } from './Ask'

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

/**
 * The campaign map as a ticket trail (design 2d, his ruling over 2c): the
 * winding trail stays, the discs become game tickets with the record on the
 * stub. Cleared tickets are solid gold with their stars; the next one pulses
 * and shows the opponent's OFF/DEF dials; everything beyond is dim.
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
  /** The ticket stub: team abbreviation (with year off the home era) and the record. */
  const stub = (o: Opponent) => {
    const ab = o.season && o.era !== eras[0]?.name ? `'${String(o.season).slice(2)} ${o.ab ?? ''}` : (o.ab ?? '')
    return o.record ? `${ab} ${o.record}` : ab
  }
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
      <div className="map-top">
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

      <div className="trail" style={{ height: H }}>
        <svg className="trail-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <path className="trail-dim" d={TRAIL} pathLength={1} />
          <path className="trail-lit" d={TRAIL} pathLength={1} style={{ strokeDasharray: `${litLen} 1` }} />
        </svg>

        {eras.map((e) => (
          <div
            className={`era-band ${xAt(e.first - 1) > W / 2 ? 'left' : 'right'}`}
            key={e.name}
            style={{ top: yAt(e.first - 1) - 18 }}
          >
            <b>{e.name}</b>
            <i>
              {e.years[0] === e.years[1] ? e.years[0] : `${e.years[0]}–${e.years[1]}`}
              {e.handicap ? ` · opponents +${e.handicap}` : ''}
            </i>
          </div>
        ))}
        {teamNote && cur && onMyTeam ? (
          <button
            className={`node-note ${xAt(cur - 1) > W / 2 ? 'left' : 'right'}`}
            style={{ top: yAt(cur - 1) - 6 }}
            onClick={onMyTeam}
          >
            {teamNote} →
          </button>
        ) : null}
        {opponents.map((o) => {
          const level = o.round
          const i = level - 1
          const stars = progress.stars[i]
          const state = stars > 0 ? 'done' : level === cur ? 'now' : 'locked'
          const can = playable(progress, level)
          return (
            <button
              key={level}
              ref={state === 'now' ? nowRef : undefined}
              className={`node ${state} ${o.champion ? 'champ' : ''}`}
              style={{ left: `${(100 * xAt(i)) / W}%`, top: yAt(i) }}
              disabled={!can}
              onClick={() => can && onPlay(level)}
              aria-label={`Level ${level}${state !== 'locked' ? `, ${o.team}` : ''}${stars ? `, ${stars} stars` : ''}`}
            >
              <span className="ticket">
                {state === 'now' ? <span className="ticket-next">NEXT</span> : null}
                <span className="ticket-n">{level}</span>
                <span className="ticket-stub">{revealed(state) ? stub(o) : '?'}</span>
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
      <div className="map-foot">
        <span className="cap">Tap a cleared level to replay it for a better rating</span>
        <button className="map-link danger" onClick={() => setAskReset(true)}>
          Reset this campaign
        </button>
      </div>
    </>
  )
}
