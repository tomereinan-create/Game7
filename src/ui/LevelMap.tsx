import { useEffect, useMemo, useRef } from 'react'
import { ROUNDS } from '../config'
import type { Opponent } from '../engine/types'
import { ratings100 } from '../engine/offense'
import { balance } from '../engine/tree'
import { Dial } from './MatchupPanel'
import { currentLevel, playable, totalStars, type Progress } from '../state/campaign'

/** Path geometry, in a 375-wide coordinate space stretched to the column. */
const W = 375
const STEP = 170 // vertical distance between levels (disc + stars + dials)
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
 * The campaign map: a winding trail of 120 levels in four era blocks, worst record at the
 * bottom, climbing. Cleared nodes carry their best star rating and can be
 * replayed; the next node is lit; everything beyond is dim. One total at the
 * top — that's the score.
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
  onReset: () => void
}) {
  const cur = currentLevel(progress)
  const total = totalStars(progress)
  const cleared = progress.stars.filter((s) => s > 0).length
  const bal = balance(progress)
  // Opponent dials, opponent-independent by construction, so computed once per map.
  const dials = useMemo(() => opponents.map((o) => ratings100(o.players)), [opponents])
  /** How far ahead the map reveals: what you have cleared, and the one you are on. */
  const revealed = (_level: number, state: string) => state !== 'locked'
  const label = (o: Opponent) => (o.season && o.era !== eras[0]?.name ? `'${String(o.season).slice(2)} ${o.ab ?? ''}` : (o.ab ?? ''))
  const nowRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  // The trail is lit up to the current level, unlit beyond it.
  const litIdx = cur ? cur - 1 : ROUNDS - 1
  const litLen = litIdx / (ROUNDS - 1)

  return (
    <>
      <div className="topbar">
        <span>{title}</span>
      </div>
      <div className="rule2" />

      <div className="map-head sticky">
        <div>
          <div className="map-kicker">{cur ? `Level ${cur} is up · ${opponents[cur - 1]?.era ?? ''}` : 'All cleared'}</div>
          <div className="map-total">
            <span className="star">★</span> {total}
            <i> / {ROUNDS * 3}</i>
          </div>
        </div>
        <div className="map-side">
          <div className="map-kicker">
            {cleared} of {ROUNDS} cleared
          </div>
          <button className="map-link staff" onClick={onStaff}>
            ★ {bal} to spend · Staff →
          </button>
          <button className="map-link" onClick={onTeam}>
            {teamName} · rename
          </button>
          {onMyTeam ? (
            <button className="map-link" onClick={onMyTeam}>
              My team →
            </button>
          ) : null}
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
              <span className="node-disc">
                <span className="node-n">{level}</span>
                <span className="node-ab">{revealed(level, state) ? label(o) : '?'}</span>
                {o.champion && revealed(level, state) ? <span className="node-champ">CHAMP</span> : null}
              </span>
              <span className="node-stars">
                {[1, 2, 3].map((k) => (
                  <i key={k} className={k <= stars ? 'lit' : ''}>
                    ★
                  </i>
                ))}
              </span>
              {revealed(level, state) ? (
                <span className="node-dials">
                  <Dial label="OFF" value={dials[i].off} tone="them" />
                  <Dial label="DEF" value={dials[i].def} tone="them" />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="map-foot">
        <span className="cap">Tap a cleared level to replay it for a better rating</span>
        <button className="map-link danger" onClick={onReset}>
          Reset this campaign
        </button>
      </div>
    </>
  )
}
