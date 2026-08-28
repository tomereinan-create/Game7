import { useEffect, useMemo, useRef } from 'react'
import { ROUNDS } from '../config'
import type { Opponent } from '../engine/types'
import { ratings100 } from '../engine/offense'
import { balance } from '../engine/tree'
import { currentLevel, playable, totalStars, type Progress } from '../state/campaign'

/**
 * The campaign map as a season ledger (design 2c): dense ruled rows with a lit
 * spine, grouped by era, worst record first. Cleared rows carry their best star
 * rating and can be replayed; the current level is pinned gold with a PLAY chip;
 * everything beyond is dim. One total at the top — that's the score.
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
  onReset: () => void
}) {
  const cur = currentLevel(progress)
  const total = totalStars(progress)
  const cleared = progress.stars.filter((s) => s > 0).length
  const bal = balance(progress)
  // Opponent dials, opponent-independent by construction, so computed once per map.
  const dials = useMemo(() => opponents.map((o) => ratings100(o.players)), [opponents])
  /** How far ahead the map reveals: what you have cleared, and the one you are on. */
  const revealed = (state: string) => state !== 'locked'
  const nowRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  /** The era blocks, each a run of consecutive levels. */
  const blocks = eras.map((e, k) => {
    const end = eras[k + 1] ? eras[k + 1].first - 1 : ROUNDS
    return { era: e, list: opponents.filter((o) => o.round >= e.first && o.round <= end) }
  })

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

      {blocks.map(({ era, list }) => {
        // The spine lights through the last row that is cleared or up now.
        const lit = list.filter((o) => progress.stars[o.round - 1] > 0 || o.round === cur).length
        const frac = list.length ? Math.round((100 * lit) / list.length) : 0
        return (
          <section key={era.name}>
            <div className="ledger-head">
              <span className="nm">{era.name}</span>
              <i />
              <span className="yr">
                {era.years[0] === era.years[1] ? era.years[0] : `${era.years[0]}–${era.years[1]}`}
                {era.handicap ? ` · opponents +${era.handicap}` : ''} · worst record first
              </span>
            </div>
            <div className="ledger">
              <div
                className="ledger-spine"
                style={{ background: `linear-gradient(to bottom, var(--you) 0, var(--you) ${frac}%, var(--line-2) ${frac}%)` }}
              />
              {list.map((o) => {
                const level = o.round
                const i = level - 1
                const stars = progress.stars[i]
                const state = stars > 0 ? 'done' : level === cur ? 'now' : 'locked'
                const can = playable(progress, level)
                const sub = revealed(state)
                  ? [
                      state === 'now' ? 'UP NEXT' : (o.ab ?? ''),
                      o.season && state !== 'now' ? `'${String(o.season).slice(2)}` : '',
                      o.record ?? '',
                      `OFF ${Math.round(dials[i].off)} · DEF ${Math.round(dials[i].def)}`,
                      o.champion ? 'CHAMP' : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : null
                return (
                  <div key={level} style={{ display: 'contents' }}>
                    <button
                      ref={state === 'now' ? nowRef : undefined}
                      className={`lrow ${state} ${o.champion ? 'champ' : ''}`}
                      disabled={!can}
                      onClick={() => can && onPlay(level)}
                      aria-label={`Level ${level}${revealed(state) ? `, ${o.team}` : ''}${stars ? `, ${stars} stars` : ''}`}
                    >
                      <span className="ln">{level}</span>
                      <span className="lwho">
                        <b>{revealed(state) ? o.team : '?'}</b>
                        {sub ? <i>{sub}</i> : null}
                      </span>
                      {state === 'now' ? (
                        <span className="lplay">PLAY</span>
                      ) : (
                        <span className="node-stars">
                          {[1, 2, 3].map((k) => (
                            <i key={k} className={k <= stars ? 'lit' : ''}>
                              ★
                            </i>
                          ))}
                        </span>
                      )}
                    </button>
                    {state === 'now' && teamNote && onMyTeam ? (
                      <button className="lnote" onClick={onMyTeam}>
                        {teamNote} →
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="map-foot">
        <span className="cap">Tap a cleared level to replay it for a better rating</span>
        <button className="map-link danger" onClick={onReset}>
          Reset this campaign
        </button>
      </div>
    </>
  )
}
