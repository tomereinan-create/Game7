import { useMemo, useState } from 'react'
import { DRAFT_SIZE, SIGMA } from '../config'
import { PLAYERS } from '../engine/pool'
import { compile, simSeries } from '../engine/resolver'
import { LINES } from './Stat'
import { makeRng } from '../engine/rng'
import type { Player, SeriesResult } from '../engine/types'
import { Bars } from './Bars'
import { WHEEL, type TeamSeason } from './Draft'
import { ovrOf, startingFive, winsOf, YEARS } from './TeamDb'
import { PlayerCard } from './PlayerCard'

const VS_POOL = 12
const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
/** Snake order so the first pick isn't decisive: A B B A A B B A A B. */
const ORDER: (0 | 1)[] = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]

/** A shared pool for two drafters: real starters and stars, so both sides get players worth arguing over. */
function versusPool(seed: number): Player[] {
  const rng = makeRng(seed)
  const seen = new Set<string>()
  const out: Player[] = []
  for (const p of rng.shuffle(PLAYERS.filter((x) => (LINES[x.name]?.ppg ?? 0) >= 18))) {
    if (seen.has(p.player)) continue
    seen.add(p.player)
    out.push(p)
    if (out.length === VS_POOL) break
  }
  return out
}

/**
 * Hot-seat: two people, one phone. Alternate picks from one board, then the
 * two fives play a best-of-seven with the exact campaign resolver.
 */
export function Versus({ onHome }: { onHome: () => void }) {
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)
  const [names, setNames] = useState<[string, string]>(['Player 1', 'Player 2'])
  const [picks, setPicks] = useState<[string[], string[]]>([[], []])
  // his ruling: either player may load a real team instead of drafting - the whole five at once
  const [loaded, setLoaded] = useState<[string[] | null, string[] | null]>([null, null])
  const [loadFor, setLoadFor] = useState<0 | 1 | null>(null)
  const [loadYear, setLoadYear] = useState(YEARS[0])
  const [loadSort, setLoadSort] = useState<'rec' | 'ovr'>('rec')
  const [loadFlip, setLoadFlip] = useState(false)
  const pickLoadSort = (k: 'rec' | 'ovr') => {
    if (k === loadSort) setLoadFlip((f) => !f)
    else {
      setLoadSort(k)
      setLoadFlip(false)
    }
  }
  const [info, setInfo] = useState<string | null>(null)
  const [result, setResult] = useState<SeriesResult | null>(null)

  const pool = useMemo(() => versusPool(seed), [seed])
  const countOf = (i: 0 | 1) => (loaded[i] ? DRAFT_SIZE : picks[i].length)
  const done = countOf(0) + countOf(1) === DRAFT_SIZE * 2
  // a loaded side is off the clock: the snake collapses to whoever still drafts
  const turn = picks[0].length + picks[1].length
  const who: 0 | 1 = loaded[0] && !loaded[1] ? 1 : loaded[1] && !loaded[0] ? 0 : ORDER[Math.min(turn, ORDER.length - 1)]

  const five = (i: 0 | 1) => (loaded[i] ? (loaded[i]!.map((n) => BY_NAME.get(n)).filter(Boolean) as Player[]) : pool.filter((p) => picks[i].includes(p.name)))
  const A = five(0)
  const B = five(1)
  /** One man, one matchup - a pool card whose player is already fielded (either side) is dead. */
  const fielded = new Set([...A, ...B].map((p) => p.player))

  const take = (p: Player) => {
    if (done || result || loaded[who]) return
    if (picks[0].includes(p.name) || picks[1].includes(p.name) || fielded.has(p.player)) return
    setPicks((cur) => {
      const next: [string[], string[]] = [[...cur[0]], [...cur[1]]]
      next[who].push(p.name)
      return next
    })
  }

  const loadTeam = (t: TeamSeason) => {
    if (loadFor === null) return
    const side = loadFor
    const other = five(side === 0 ? 1 : 0)
    const otherMen = new Set(other.map((p) => p.player))
    const poolCands = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p && !otherMen.has(p.player))
    const names5 = startingFive(poolCands).five.filter((p): p is Player => !!p).map((p) => p.name)
    setLoaded((cur) => {
      const next: [string[] | null, string[] | null] = [cur[0], cur[1]]
      next[side] = names5
      return next
    })
    setPicks((cur) => {
      const next: [string[], string[]] = [[...cur[0]], [...cur[1]]]
      next[side] = []
      return next
    })
    setNames((cur) => {
      const next: [string, string] = [cur[0], cur[1]]
      next[side] = `'${String(t.y).slice(2)} ${t.team.split(' ').pop()}`
      return next
    })
    setLoadFor(null)
  }

  const sim = () => setResult(simSeries(compile(A), compile(B), makeRng((Math.random() * 0xffffffff) >>> 0), SIGMA))

  const reset = () => {
    setSeed((Math.random() * 0xffffffff) >>> 0)
    setPicks([[], []])
    setLoaded([null, null])
    setNames(['Player 1', 'Player 2'])
    setLoadFor(null)
    setInfo(null)
    setResult(null)
  }

  const owner = (p: Player): 0 | 1 | null =>
    picks[0].includes(p.name) ? 0 : picks[1].includes(p.name) ? 1 : null

  if (result) {
    const p1won = result.won
    const w = p1won ? names[0] : names[1]
    const hi = Math.max(result.wins, result.losses)
    const lo = Math.min(result.wins, result.losses)
    return (
      <>
        <div className="topbar">
          <span>Player vs Friend</span>
          <span>Final</span>
        </div>
        <div className="rule2" />
        <div className="card gcard">
          {result.games.map((g) => (
            <div className="gline" key={g.game}>
              <span className="g">G{g.game}</span>
              <span className={`wl ${g.won ? 'w' : 'p2'}`}>{g.won ? 'P1' : 'P2'}</span>
              <span className="sc">
                {g.us}–{g.them}
              </span>
            </div>
          ))}
        </div>
        <div className="verdict">
          <h1 className={p1won ? 'w' : 'p2'}>
            {w} wins {hi}–{lo}
          </h1>
          <p>{lo === 0 ? 'A sweep.' : lo === 3 ? 'It went the distance.' : `${w} takes the series.`}</p>
        </div>
        <div className="card">
          <Bars
            mine={compile(A, B)}
            theirs={compile(B, A)}
            title="The two fives"
            leftLabel="PLAYER 1"
            rightLabel="PLAYER 2"
            leftWord="P1"
            rightWord="P2"
          />
        </div>
        <div className="dock">
          <div className="dock-inner two">
            <button className="btn ghost" onClick={onHome}>
              Home
            </button>
            <button className="btn" onClick={reset}>
              Rematch
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="topbar">
        <span>Player vs Friend</span>
      </div>
      <div className="rule2" />

      <div className="vs-head">
        <div className={`vs-side ${!done && who === 0 && !loaded[0] ? 'now' : ''}`}>
          <b>{names[0]}</b>
          <span>{loaded[0] ? 'a real five, loaded' : `${picks[0].length}/5 picked${!done && who === 0 ? ' · on the clock' : ''}`}</span>
          <button className="map-link" onClick={() => setLoadFor(loadFor === 0 ? null : 0)}>
            {loaded[0] ? 'Swap the team →' : 'Load a real team →'}
          </button>
        </div>
        <div className="vs-mid">
          SNAKE
          <br />
          ORDER
        </div>
        <div className={`vs-side r ${!done && who === 1 && !loaded[1] ? 'now' : ''}`}>
          <b>{names[1]}</b>
          <span>{loaded[1] ? 'a real five, loaded' : `${picks[1].length}/5 picked${!done && who === 1 ? ' · on the clock' : ''}`}</span>
          <button className="map-link" onClick={() => setLoadFor(loadFor === 1 ? null : 1)}>
            {loaded[1] ? 'Swap the team →' : 'Load a real team →'}
          </button>
        </div>
      </div>

      {loadFor !== null ? (
        <div className="card">
          <div className="card-head">
            <span className="label">A real team · for {names[loadFor]}</span>
            <button className="chip-btn" onClick={() => setLoadFor(null)}>
              Never mind
            </button>
          </div>
          <div className="yr-rail">
            {YEARS.map((y) => (
              <button key={y} className={`sortb ${y === loadYear ? 'on' : ''}`} onClick={() => setLoadYear(y)}>
                {y}
              </button>
            ))}
          </div>
          <div className="filterbar">
            <button className={`sortb ${loadSort === 'rec' ? (loadFlip ? 'on asc' : 'on') : ''}`} onClick={() => pickLoadSort('rec')}>
              Best record
            </button>
            <button className={`sortb ${loadSort === 'ovr' ? (loadFlip ? 'on asc' : 'on') : ''}`} onClick={() => pickLoadSort('ovr')}>
              OVR
            </button>
          </div>
          {WHEEL.filter((t) => t.y === loadYear)
            .sort((a, b) => {
              if (loadSort === 'ovr') {
                const oa = ovrOf(a)
                const ob = ovrOf(b)
                // "—" teams stay last in both directions
                if (oa === null || ob === null) return (oa === null ? 1 : 0) - (ob === null ? 1 : 0)
                const d = ob - oa || winsOf(b.rec) - winsOf(a.rec)
                return loadFlip ? -d : d
              }
              const d = winsOf(b.rec) - winsOf(a.rec)
              return loadFlip ? -d : d
            })
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
                <span className="tdb-gauge">{ovrOf(t) === null ? '—' : `OVR ${ovrOf(t)}`}</span>
                <span className="tdb-go">→</span>
              </button>
            ))}
          <div className="cap hint">Their best legal five by OVR takes the side — the draft board is the other player’s.</div>
        </div>
      ) : null}

      {A.length && B.length ? (
        <div className="card">
          <Bars
            mine={compile(A, B)}
            theirs={compile(B, A)}
            title="Player 1 vs Player 2"
            leftLabel="PLAYER 1"
            rightLabel="PLAYER 2"
            leftWord="P1"
            rightWord="P2"
          />
        </div>
      ) : null}

      <div className="pool">
        <div className="card-head">
          <span className="label">Draft board — {VS_POOL} players</span>
          <span className="cap" style={{ letterSpacing: '0.02em' }}>
            IN·OUT│ID·PD
          </span>
        </div>
        {pool.map((p) => {
          const o = owner(p)
          return (
            <PlayerCard
              key={p.name}
              p={p}
              pick={null}
              owner={o}
              ownerLabel={o !== null ? names[o].toUpperCase() : undefined}
              dimmed={o === null && fielded.has(p.player)}
              expanded={info === p.name}
              onClick={() => take(p)}
              onInfo={() => setInfo(info === p.name ? null : p.name)}
            />
          )
        })}
      </div>

      <div className="dock">
        <div className="dock-inner">
          <button className={`btn ${done ? '' : who === 1 ? 'them' : 'ghost'}`} disabled={false} onClick={done ? sim : undefined}>
            {done ? 'Sim the series' : `${names[who]} — pick ${DRAFT_SIZE - picks[who].length} more`}
          </button>
        </div>
      </div>
    </>
  )
}
