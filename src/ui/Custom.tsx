import { useMemo, useState } from 'react'
import { WHEEL, type TeamSeason } from './Draft'
import { startingFive, winsOf, YEARS } from './TeamDb'
import { DRAFT_SIZE, SIGMA } from '../config'
import { PLAYERS } from '../engine/pool'
import { compile, simSeries } from '../engine/resolver'
import { makeRng } from '../engine/rng'
import type { Player, SeriesResult } from '../engine/types'
import { PlayerDials } from './MatchupPanel'
import { MatchupPanel } from './MatchupPanel'
import { Series } from './Series'
import { CardName } from './CardSheet'
import { DetailGrid } from './Stat'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Custom matchup: build both fives by hand out of the whole database, then play
 * the series. No wheel, no positions, no cap — the sandbox for "who beats whom".
 * The same man may not appear twice, in either five, in any season.
 */
export function Custom({ onHome }: { onHome: () => void }) {
  const [side, setSide] = useState<0 | 1>(0)
  const [teams, setTeams] = useState<[string[], string[]]>([[], []])
  const [names, setNames] = useState<[string, string]>(['Team A', 'Team B'])
  const [q, setQ] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  const [result, setResult] = useState<{ r: SeriesResult; seed: number } | null>(null)
  // his ruling: any team-db team can be loaded whole — its best legal five fills the tapped card
  const [loadOpen, setLoadOpen] = useState(false)
  const [loadYear, setLoadYear] = useState(YEARS[0])

  const five = (i: 0 | 1) => teams[i].map((n) => BY_NAME.get(n)!).filter(Boolean)
  const A = five(0)
  const B = five(1)
  const takenMen = new Set([...teams[0], ...teams[1]].map((n) => BY_NAME.get(n)?.player ?? n))
  const ready = A.length === DRAFT_SIZE && B.length === DRAFT_SIZE

  const hits = useMemo(() => {
    const f = fold(q.trim())
    if (!f) return [...PLAYERS].sort((a, b) => b.ovr - a.ovr).slice(0, 40)
    return PLAYERS.filter((p) => fold(p.name).includes(f))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 60)
  }, [q])

  const add = (p: Player) => {
    if (teams[side].length >= DRAFT_SIZE || takenMen.has(p.player)) return
    setTeams((cur) => {
      const next: [string[], string[]] = [[...cur[0]], [...cur[1]]]
      next[side].push(p.name)
      return next
    })
  }
  const drop = (i: 0 | 1, name: string) =>
    setTeams((cur) => {
      const next: [string[], string[]] = [[...cur[0]], [...cur[1]]]
      next[i] = next[i].filter((n) => n !== name)
      return next
    })

  const sim = () => {
    if (!ready) return
    const seed = (Math.random() * 0xffffffff) >>> 0
    setResult({ r: simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA), seed })
  }

  if (result) {
    const opponent = { round: 1, team: names[1], players: B, positions: [] as string[] }
    return (
      <Series
        opponent={opponent}
        five={A}
        mine={compile(A, B)}
        theirs={compile(B, A)}
        teamName={names[0]}
        result={result.r}
        seed={result.seed}
        exhibition
        onAdvance={() => setResult(null)}
      />
    )
  }

  const loadTeam = (t: TeamSeason) => {
    // the same man may not appear twice across the matchup, so the other side's men sit this one out
    const other = new Set(teams[1 - side].map((n) => BY_NAME.get(n)?.player ?? n))
    const pool = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p && !other.has(p.player))
    const names5 = startingFive(pool).five.filter((p): p is Player => !!p).map((p) => p.name)
    setTeams((cur) => {
      const next: [string[], string[]] = [[...cur[0]], [...cur[1]]]
      next[side] = names5
      return next
    })
    setNames((cur) => {
      const next: [string, string] = [cur[0], cur[1]]
      next[side] = `'${String(t.y).slice(2)} ${t.team}`
      return next
    })
    setLoadOpen(false)
  }

  const roster = (i: 0 | 1) => (
    <div className={`card cu-side ${side === i ? 'on' : ''}`} onClick={() => setSide(i)}>
      <div className="card-head">
        <input
          className="cu-name"
          value={names[i]}
          onChange={(e) =>
            setNames((cur) => {
              const next: [string, string] = [cur[0], cur[1]]
              next[i] = e.target.value
              return next
            })
          }
        />
        <span className={`count ${teams[i].length === DRAFT_SIZE ? 'on' : ''}`}>
          {teams[i].length} OF {DRAFT_SIZE}
        </span>
      </div>
      {five(i).map((p) => (
        <div className="row dr on" key={p.name}>
          <span className="pname">
            <span className="who">
              <b>{p.name}</b>
              <i>OVR {p.ovr}</i>
            </span>
          </span>
          <span />
          <button className="pinfo" onClick={() => drop(i, p.name)} aria-label={`remove ${p.name}`}>
            ×
          </button>
        </div>
      ))}
      {teams[i].length === 0 ? <div className="cap">Tap this card, then pick five from the database.</div> : null}
    </div>
  )

  return (
    <>
      <div className="topbar">
        <span>Custom matchup</span>
      </div>
      <div className="rule2" />
      <div className="lede">Build both fives out of the whole database — any era, any five. Tap a team card to aim your picks at it.</div>

      <div className="cu-two">
        {roster(0)}
        {roster(1)}
      </div>

      {ready ? <MatchupPanel mine={A} theirs={B} myName={names[0]} theirName={names[1]} assignment="optimal" /> : null}

      <div className="card">
        <div className="card-head">
          <span className="label">{loadOpen ? `A real team · for ${names[side]}` : `Database · picking for ${names[side]}`}</span>
          {loadOpen ? (
            <button className="chip-btn" onClick={() => setLoadOpen(false)}>
              Pick by hand instead
            </button>
          ) : (
            <button className="chip-btn" onClick={() => setLoadOpen(true)}>
              Load a real team
            </button>
          )}
        </div>
        {loadOpen ? (
          <>
            <div className="yr-rail">
              {YEARS.map((y) => (
                <button key={y} className={`sortb ${y === loadYear ? 'on' : ''}`} onClick={() => setLoadYear(y)}>
                  {y}
                </button>
              ))}
            </div>
            {WHEEL.filter((t) => t.y === loadYear)
              .sort((a, b) => winsOf(b.rec) - winsOf(a.rec))
              .map((t) => (
                <button key={t.team + t.y} className="lrow" onClick={() => loadTeam(t)}>
                  <span className="lwho">
                    <b>{t.team}</b>
                    <i>
                      {t.ab}
                      {t.rec ? ` · ${t.rec}` : ''}
                      {t.div ? ` · ${t.div}` : ''}
                    </i>
                  </span>
                  <span className="tdb-go">→</span>
                </button>
              ))}
            <div className="cap hint">Their best legal five by OVR fills {names[side]} — men already on the other side sit out.</div>
          </>
        ) : (
          <>
        <input className="field" placeholder="Search a player…" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.map((p) => {
          const used = takenMen.has(p.player)
          return (
            <div key={p.name} style={{ display: 'contents' }}>
              <div className={`row dr ${used ? 'off' : ''}`}>
                <span className="pname" role="button" tabIndex={0} onClick={() => setInfo(info === p.name ? null : p.name)}>
                  <span className="who">
                    <CardName p={p} />
                    <i>{used ? 'already on a team' : 'tap the name for his card'}</i>
                  </span>
                </span>
                <PlayerDials p={p} tone={side === 0 ? 'you' : 'them'} />
                <button className="pinfo" disabled={used || teams[side].length >= DRAFT_SIZE} onClick={() => add(p)} aria-label={`add ${p.name}`}>
                  +
                </button>
              </div>
              {info === p.name ? <DetailGrid p={p} mode="stats" /> : null}
            </div>
          )
        })}
          </>
        )}
      </div>

      <div className="dock">
        <div className="dock-inner two">
          <button className="btn ghost" onClick={onHome}>
            Home
          </button>
          <button className="btn" disabled={!ready} onClick={sim}>
            {ready ? 'Sim the series' : `Pick ${DRAFT_SIZE * 2 - A.length - B.length} more`}
          </button>
        </div>
      </div>
    </>
  )
}
