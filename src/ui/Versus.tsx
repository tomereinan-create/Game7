import { useMemo, useState } from 'react'
import { DRAFT_SIZE, SIGMA } from '../config'
import { PLAYERS } from '../engine/pool'
import { compile, simSeries } from '../engine/resolver'
import { LINES } from './Stat'
import { makeRng } from '../engine/rng'
import type { Player, SeriesResult } from '../engine/types'
import { Bars } from './Bars'
import { PlayerCard } from './PlayerCard'

const VS_POOL = 12
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

/** The resolver's notes are written from side A's chair; on a neutral screen name the sides. */
function neutral(note: string, [a, b]: [string, string]): string {
  const map: Record<string, string> = {
    'we owned the paint': `${a} owned the paint`,
    'walled off inside': `${b} walled off the paint`,
    'our threes rained': `${a} rained threes`,
    'ice cold from deep': `${a} ice cold from deep`,
    'their paint game died': `${b}'s paint game died`,
    'they killed us inside': `${b} killed it inside`,
    'we locked the arc': `${a} locked the arc`,
    'threes rained on us': `${b} rained threes`,
    'better players, simple': `${a} had the better players`,
  }
  return map[note] ?? note
}

/**
 * Hot-seat: two people, one phone. Alternate picks from one board, then the
 * two fives play a best-of-seven with the exact campaign resolver.
 */
export function Versus({ onHome }: { onHome: () => void }) {
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)
  const names: [string, string] = ['Player 1', 'Player 2']
  const [picks, setPicks] = useState<[string[], string[]]>([[], []])
  const [info, setInfo] = useState<string | null>(null)
  const [result, setResult] = useState<SeriesResult | null>(null)

  const pool = useMemo(() => versusPool(seed), [seed])
  const turn = picks[0].length + picks[1].length
  const done = turn === DRAFT_SIZE * 2
  const who = ORDER[Math.min(turn, ORDER.length - 1)]

  const five = (i: 0 | 1) => pool.filter((p) => picks[i].includes(p.name))
  const A = five(0)
  const B = five(1)

  const take = (p: Player) => {
    if (done || result) return
    if (picks[0].includes(p.name) || picks[1].includes(p.name)) return
    setPicks((cur) => {
      const next: [string[], string[]] = [[...cur[0]], [...cur[1]]]
      next[who].push(p.name)
      return next
    })
  }

  const sim = () => setResult(simSeries(compile(A), compile(B), makeRng((Math.random() * 0xffffffff) >>> 0), SIGMA))

  const reset = () => {
    setSeed((Math.random() * 0xffffffff) >>> 0)
    setPicks([[], []])
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
              <span className="note">{neutral(g.note, names)}</span>
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
        <div className={`vs-side ${!done && who === 0 ? 'now' : ''}`}>
          <b>{names[0]}</b>
          <span>
            {picks[0].length}/5 picked{!done && who === 0 ? ' · on the clock' : ''}
          </span>
        </div>
        <div className="vs-mid">
          SNAKE
          <br />
          ORDER
        </div>
        <div className={`vs-side r ${!done && who === 1 ? 'now' : ''}`}>
          <b>{names[1]}</b>
          <span>
            {picks[1].length}/5 picked{!done && who === 1 ? ' · on the clock' : ''}
          </span>
        </div>
      </div>

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
              dimmed={false}
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
