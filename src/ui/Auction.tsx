import { useMemo, useState } from 'react'
import { SIGMA } from '../config'
import { PLAYERS } from '../engine/pool'
import { compile, simSeries } from '../engine/resolver'
import { makeRng } from '../engine/rng'
import type { Player, SeriesResult } from '../engine/types'
import { Bars } from './Bars'
import { PlayerCard } from './PlayerCard'
import { LINES } from './Stat'
import { neutral } from './Versus'

const BUDGET = 20
const SLOTS = 5
const NAMES: [string, string] = ['Player 1', 'Player 2']
const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))

interface Buy {
  name: string
  price: number
}

/** The block never runs dry: stars first (one season per man), then starters, then the rest of the league. */
function auctionQueue(seed: number): Player[] {
  const rng = makeRng(seed)
  const seen = new Set<string>()
  const out: Player[] = []
  for (const min of [18, 15, 0]) {
    for (const p of rng.shuffle(PLAYERS.filter((x) => (LINES[x.name]?.ppg ?? 0) >= min))) {
      if (seen.has(p.player)) continue
      seen.add(p.player)
      out.push(p)
    }
  }
  return out
}

/**
 * Hot-seat open outcry: one man on the block at a time, $20 a side, +$1 raises,
 * a pass is final for the lot. First to five men, then the campaign resolver
 * plays the best-of-seven — the same table as Player vs Friend.
 */
export function Auction({ onHome }: { onHome: () => void }) {
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)
  const [lot, setLot] = useState(0)
  const [price, setPrice] = useState(0)
  const [top, setTop] = useState<0 | 1 | null>(null)
  const [passed, setPassed] = useState<[boolean, boolean]>([false, false])
  const [budget, setBudget] = useState<[number, number]>([BUDGET, BUDGET])
  const [buys, setBuys] = useState<[Buy[], Buy[]]>([[], []])
  const [note, setNote] = useState<string | null>(null)
  const [info, setInfo] = useState(false)
  const [result, setResult] = useState<SeriesResult | null>(null)

  const queue = useMemo(() => auctionQueue(seed), [seed])
  const man = queue[lot]
  const full = (i: 0 | 1) => buys[i].length === SLOTS
  const done = full(0) && full(1)
  const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0)
  /** A pass is final; a full five is out of every auction. */
  const isOut = (i: 0 | 1) => passed[i] || full(i)
  /** Every future slot still needs $1 held — the most this side can pay for THIS man. */
  const ceiling = (i: 0 | 1) => budget[i] - (SLOTS - 1 - buys[i].length)

  const five = (i: 0 | 1) => buys[i].map((b) => BY_NAME.get(b.name)).filter((p): p is Player => !!p)
  const A = five(0)
  const B = five(1)

  const advance = (text: string) => {
    setNote(text)
    setLot((l) => l + 1)
    setPrice(0)
    setTop(null)
    setPassed([false, false])
    setInfo(false)
  }

  const sell = (i: 0 | 1, p: number) => {
    setBudget((cur) => (i === 0 ? [cur[0] - p, cur[1]] : [cur[0], cur[1] - p]))
    setBuys((cur) => {
      const next: [Buy[], Buy[]] = [[...cur[0]], [...cur[1]]]
      next[i].push({ name: man.name, price: p })
      return next
    })
    advance(`${man.name} to ${NAMES[i]} · $${p}`)
  }

  const bid = (i: 0 | 1) => {
    if (done || result || isOut(i) || top === i) return
    const p = price + 1
    if (p > ceiling(i)) return
    const k = other(i)
    // the other chair is beaten flat — out already, or a raise would break his $1-a-slot floor: auto-pass, sold
    if (isOut(k) || p + 1 > ceiling(k)) sell(i, p)
    else {
      setPrice(p)
      setTop(i)
    }
  }

  const pass = (i: 0 | 1) => {
    if (done || result || isOut(i) || top === i) return
    const k = other(i)
    if (top === k) sell(k, Math.max(1, price)) // an unopposed take still costs $1
    else if (isOut(k)) advance(`${man.name} — no takers, off the block`)
    else setPassed((cur) => (i === 0 ? [true, cur[1]] : [cur[0], true]))
  }

  const sim = () => setResult(simSeries(compile(A), compile(B), makeRng((Math.random() * 0xffffffff) >>> 0), SIGMA))

  const reset = () => {
    setSeed((Math.random() * 0xffffffff) >>> 0)
    setLot(0)
    setPrice(0)
    setTop(null)
    setPassed([false, false])
    setBudget([BUDGET, BUDGET])
    setBuys([[], []])
    setNote(null)
    setInfo(false)
    setResult(null)
  }

  if (result) {
    const p1won = result.won
    const w = p1won ? NAMES[0] : NAMES[1]
    const hi = Math.max(result.wins, result.losses)
    const lo = Math.min(result.wins, result.losses)
    return (
      <>
        <div className="topbar">
          <span>1v1 Bid</span>
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
              <span className="note">{neutral(g.note, NAMES)}</span>
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
        <span>1v1 Bid</span>
        <span>$20 each · first to five</span>
      </div>
      <div className="rule2" />

      <div className="vs-head">
        <div className={`vs-side ${top === 0 ? 'now' : ''}`}>
          <b>{NAMES[0]}</b>
          <span className="au-cash">${budget[0]}</span>
          <span>
            {buys[0].length}/5 men
            {full(0) ? ' · full' : passed[0] ? ' · passed this lot' : ''}
          </span>
          {buys[0].map((b) => (
            <span key={b.name} className="au-buy">
              {b.name} · ${b.price}
            </span>
          ))}
        </div>
        <div className="vs-mid">
          OPEN
          <br />
          OUTCRY
        </div>
        <div className={`vs-side r ${top === 1 ? 'now' : ''}`}>
          <b>{NAMES[1]}</b>
          <span className="au-cash">${budget[1]}</span>
          <span>
            {buys[1].length}/5 men
            {full(1) ? ' · full' : passed[1] ? ' · passed this lot' : ''}
          </span>
          {buys[1].map((b) => (
            <span key={b.name} className="au-buy">
              {b.name} · ${b.price}
            </span>
          ))}
        </div>
      </div>

      {note ? <div className="cap hint">Last lot — {note}</div> : null}

      {!done && man ? (
        <>
          <div className="au-block">
            <div className="au-kick">Lot {lot + 1} · on the block</div>
            <div className={`au-price ${top === 0 ? 'p1' : top === 1 ? 'p2' : ''}`}>${price}</div>
            <div className="au-why">{top !== null ? `${NAMES[top]} holds the bid` : 'no bids yet — a pass is final for this lot'}</div>
          </div>
          <div className="pool">
            <PlayerCard
              p={man}
              pick={null}
              owner={null}
              dimmed={false}
              expanded={info}
              onClick={() => setInfo(!info)}
              onInfo={() => setInfo(!info)}
            />
          </div>
          <div className="au-actions">
            {([0, 1] as const).map((i) => {
              const slotsAfter = SLOTS - 1 - buys[i].length
              const why = isOut(i)
                ? full(i)
                  ? 'five men — out of every auction'
                  : 'passed — final for this lot'
                : top === i
                  ? 'holds the bid — the other chair answers'
                  : price + 1 > ceiling(i)
                    ? slotsAfter > 0
                      ? `needs $${slotsAfter} held for ${slotsAfter} slot${slotsAfter === 1 ? '' : 's'}`
                      : `only $${budget[i]} left`
                    : null
              return (
                <div className="au-panel" key={i}>
                  <button className={`btn ${i === 1 ? 'them' : ''}`} disabled={why !== null} onClick={() => bid(i)}>
                    {NAMES[i]} — bid ${price + 1}
                  </button>
                  <button className="btn ghost" disabled={isOut(i) || top === i} onClick={() => pass(i)}>
                    Pass
                  </button>
                  {why ? <div className="au-why">{why}</div> : null}
                </div>
              )
            })}
          </div>
        </>
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

      <div className="dock">
        <div className="dock-inner">
          <button className={`btn ${done ? '' : 'ghost'}`} onClick={done ? sim : undefined}>
            {done ? 'Sim the series' : 'Bid to five men — every slot needs $1'}
          </button>
        </div>
      </div>
    </>
  )
}
