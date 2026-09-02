import { useEffect, useMemo, useState } from 'react'
import { SIGMA } from '../config'
import { achMachineWin } from '../state/achievements'
import { PLAYERS } from '../engine/pool'
import { eligible, POSITIONS } from '../engine/positions'
import { compile, simSeries } from '../engine/resolver'
import { makeRng } from '../engine/rng'
import type { Player, SeriesResult } from '../engine/types'
import { Bars } from './Bars'
import { HeatHex } from './HeatHex'
import { BUDGET, machineTakes, SLOTS, type MachineCtx, type Skill } from './machine'
import { PlayerCard } from './PlayerCard'
import { Series } from './Series'
import { LINES } from './Stat'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))

type Foe = 'friend' | 'bot'

interface Buy {
  name: string
  price: number
}
type Side = [(Buy | null)[], (Buy | null)[]]

const canSlot = (p: Player, j: number) => eligible(LINES[p.name]?.pos).includes(POSITIONS[j])

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
 * Hot-seat open outcry under the draft's position law: one man on the block at
 * a time, $20 a side, +$1 raises, a pass is final, and a side may only bid on
 * a man with a legal open slot for him. First to a full PG-C five, then the
 * campaign resolver plays the best-of-seven — the same table as Player vs
 * Friend. The second chair is a friend, or The Machine at three sharpnesses.
 */
export function Auction({ onHome }: { onHome: () => void }) {
  const [foe, setFoe] = useState<Foe>('friend')
  const [skill, setSkill] = useState<Skill>('pro')
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)
  const [lot, setLot] = useState(0) // queue pointer; the served lot may sit past it (see lotIdx)
  const [lotN, setLotN] = useState(0) // lots actually put on the block, for the kicker
  const [price, setPrice] = useState(0)
  const [top, setTop] = useState<0 | 1 | null>(null)
  const [passed, setPassed] = useState<[boolean, boolean]>([false, false])
  const [budget, setBudget] = useState<[number, number]>([BUDGET, BUDGET])
  const [slots, setSlots] = useState<Side>([Array<Buy | null>(SLOTS).fill(null), Array<Buy | null>(SLOTS).fill(null)])
  const [assign, setAssign] = useState<{ side: 0 | 1; name: string; price: number; opts: number[] } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [botSay, setBotSay] = useState<string | null>(null)
  const [info, setInfo] = useState(false)
  // the seed rides along with the series: the box scores and the Game 7 tape are drawn from it
  const [result, setResult] = useState<{ r: SeriesResult; seed: number } | null>(null)

  const names: [string, string] = ['Player 1', foe === 'bot' ? 'The Machine' : 'Player 2']
  const queue = useMemo(() => auctionQueue(seed), [seed])
  // Distribution knowledge for the Machine: the generator's front-tier composition — how
  // star-heavy it runs, how each chair's supply spreads — never the actual order ahead.
  const compo = useMemo(() => {
    const tier1 = queue.filter((x) => (LINES[x.name]?.ppg ?? 0) >= 18)
    return {
      pos: POSITIONS.map((_, j) => tier1.filter((x) => canSlot(x, j)).length / Math.max(1, tier1.length)),
      star: tier1.filter((x) => x.ovr >= 90).length / Math.max(1, tier1.length),
    }
  }, [queue])

  const countOf = (i: 0 | 1) => slots[i].filter(Boolean).length
  const full = (i: 0 | 1) => countOf(i) === SLOTS
  const done = full(0) && full(1)
  const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0)
  const legalOpen = (i: 0 | 1, p: Player) => POSITIONS.map((_, j) => j).filter((j) => !slots[i][j] && canSlot(p, j))

  // POSITIONAL NEVER-DEAD-END: serve the next man SOMEBODY can legally slot. The queue holds the
  // whole league, so every open slot type is always downstream — a lot nobody can field never airs.
  const lotIdx = useMemo(() => {
    for (let j = lot; j < queue.length; j++) {
      if (legalOpen(0, queue[j]).length || legalOpen(1, queue[j]).length) return j
    }
    return lot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot, queue, slots])
  const man = queue[lotIdx]

  const canPlay = (i: 0 | 1) => !!man && legalOpen(i, man).length > 0
  /** A pass is final; a full five — or no legal open slot for this lot — is out of the auction. */
  const outFor = (i: 0 | 1) => passed[i] || full(i) || !canPlay(i)
  /** Every future slot still needs $1 held — the most this side can pay for THIS man. */
  const ceiling = (i: 0 | 1) => budget[i] - (SLOTS - 1 - countOf(i))

  /**
   * THE COMPELLED DOLLAR (his ruling): "Each turn, one player is forced to bet 1$, so a player can
   * never be passed by both. Once a player has 5 players the other one gets the auto 1$ for the
   * following until he has 5 as well."
   *
   * The duty ALTERNATES by lot so the burden is symmetric and neither chair can game it: even lots
   * fall to P1, odd lots to the other. A side that is full, or has no legal open slot for this man,
   * cannot carry it and the duty passes across. If neither can field him the lot dies — the position
   * law outranks this rule — but the server only ever airs a man somebody can field, so in practice
   * that never happens and dead lots cease to exist.
   *
   * PART TWO FALLS OUT OF PART ONE, with no second branch: once a side has its five it is out for
   * every lot, so the duty lands on the other chair every time, and its compelled dollar meets a
   * dead table — bid() sells to it on the spot at $1. The auto-fill IS the forced opening bid with
   * nobody left to answer.
   */
  const compelled: 0 | 1 | null = (() => {
    if (!man) return null
    // must also be ABLE to pay the dollar; the $1-a-chair reserve guarantees it, and the guard
    // keeps the auto-bid effect from spinning if that invariant were ever broken.
    const fit = (i: 0 | 1) => !full(i) && legalOpen(i, man).length > 0 && ceiling(i) >= 1
    const first: 0 | 1 = ((lotN % 2) as 0 | 1)
    if (fit(first)) return first
    const second = other(first)
    return fit(second) ? second : null
  })()
  /** The compelled dollar has not landed yet this lot — both chairs wait one render for it. */
  const awaitingCompel = !!man && !done && !result && !assign && compelled !== null && price === 0 && top === null

  /**
   * The block is empty: no man left in the queue that either side could legally field. The server
   * above draws from the whole league and skips nobody-can-field lots, and the machine-sim's
   * penniless scenario never reaches this in 60 adversarial runs — but a dead button with chairs
   * still open would be the one way a side could be stuck short, so it is handled rather than
   * assumed away.
   */
  const dry = !done && !man
  const five = (i: 0 | 1) => slots[i].map((b) => (b ? BY_NAME.get(b.name) : undefined)).filter((p): p is Player => !!p)
  const A = five(0)
  const B = five(1)

  const advance = (text: string) => {
    setNote(text)
    setLot(lotIdx + 1)
    setLotN((n) => n + 1)
    setPrice(0)
    setTop(null)
    setPassed([false, false])
    setBotSay(null)
    setInfo(false)
  }

  const place = (side: 0 | 1, name: string, p: number, j: number) => {
    setBudget((cur) => (side === 0 ? [cur[0] - p, cur[1]] : [cur[0], cur[1] - p]))
    setSlots((cur) => {
      const next: Side = [[...cur[0]], [...cur[1]]]
      next[side][j] = { name, price: p }
      return next
    })
    setAssign(null)
    advance(`${name} to ${names[side]} · $${p} · ${POSITIONS[j]}`)
  }

  const sell = (i: 0 | 1, p: number) => {
    const opts = legalOpen(i, man)
    if (!opts.length) return advance(`${man.name} — no chair could field him, off the block`) // defensive; the gate forbids it
    // The Machine fills its thinnest-supply chair (by composition, not by peeking); a human with a choice picks.
    if (i === 1 && foe === 'bot') place(1, man.name, p, opts.reduce((best, j) => (compo.pos[j] < compo.pos[best] ? j : best), opts[0]))
    else if (opts.length === 1) place(i, man.name, p, opts[0])
    else setAssign({ side: i, name: man.name, price: p, opts })
  }

  const bid = (i: 0 | 1) => {
    if (done || result || assign || outFor(i) || top === i) return
    const p = price + 1
    if (p > ceiling(i)) return
    const k = other(i)
    // the other chair is beaten flat — out already, or a raise would break his $1-a-slot floor: auto-pass, sold
    if (outFor(k) || p + 1 > ceiling(k)) sell(i, p)
    else {
      setPrice(p)
      setTop(i)
    }
  }

  const pass = (i: 0 | 1) => {
    if (done || result || assign || outFor(i) || top === i) return
    const k = other(i)
    if (top === k) sell(k, Math.max(1, price)) // an unopposed take still costs $1
    else if (outFor(k)) advance(`${man.name} — no takers, off the block`)
    else setPassed((cur) => (i === 0 ? [true, cur[1]] : [cur[0], true]))
  }

  // The forced opening dollar lands the instant a lot opens, before either chair may act. It goes
  // through bid() like any other bid, so the ordinary settlement applies: if the other chair cannot
  // answer — full, no legal slot, or beaten flat by its own reserve — the man sells at $1 at once.
  useEffect(() => {
    if (!awaitingCompel || compelled === null) return
    bid(compelled)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingCompel, compelled, lotIdx])

  // The Machine answers on a short beat whenever the move is its: the lot just opened,
  // or the human holds the top bid. Every other state waits on the human, so nothing locks.
  // The valuation itself lives in machine.ts — pure, seeded, simulation-verified.
  useEffect(() => {
    if (foe !== 'bot' || done || result || !man || assign || outFor(1) || top === 1 || awaitingCompel) return
    const t = window.setTimeout(() => {
      const fit = legalOpen(1, man)
      const chairsBoth = 2 * SLOTS - countOf(0) - countOf(1)
      const ctx: MachineCtx = {
        seed,
        lot,
        price,
        skill,
        ovr: man.ovr,
        hard: ceiling(1),
        budget: budget[1],
        bought: countOf(1),
        chairsBoth,
        scarcest: fit.length ? Math.min(...fit.map((j) => 3 * chairsBoth * compo.pos[j])) : 99,
        starDensity: compo.star,
      }
      if (machineTakes(ctx) && price + 1 <= ceiling(1)) {
        setBotSay(`The Machine bids $${price + 1}`)
        bid(1)
      } else {
        setBotSay('The Machine passes')
        pass(1)
      }
    }, 550 + Math.random() * 150)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foe, skill, lot, price, top, passed, budget, slots, assign, done, result, awaitingCompel])

  const sim = () => {
    const s = (Math.random() * 0xffffffff) >>> 0
    const r = simSeries(compile(A), compile(B), makeRng(s), SIGMA)
    if (foe === 'bot' && r.won) achMachineWin(skill) // the human sits in the P1 chair; a Machine win banks nothing
    setResult({ r, seed: s })
  }

  const reset = () => {
    setSeed((Math.random() * 0xffffffff) >>> 0)
    setLot(0)
    setLotN(0)
    setPrice(0)
    setTop(null)
    setPassed([false, false])
    setBudget([BUDGET, BUDGET])
    setSlots([Array<Buy | null>(SLOTS).fill(null), Array<Buy | null>(SLOTS).fill(null)])
    setAssign(null)
    setNote(null)
    setBotSay(null)
    setInfo(false)
    setResult(null)
  }

  const pickFoe = (f: Foe) => {
    if (f === foe) return
    setFoe(f)
    reset() // a new chair means a new table
  }
  const pickSkill = (s: Skill) => {
    if (s === skill) return
    setSkill(s)
    reset()
  }

  // HIS RULING: the bid is treated the same as a campaign — the campaign's own series screen,
  // with the full box scores and Game 7 played out on the ticker. The chairs keep their names.
  if (result) {
    const opponent = { round: 1, team: names[1], ab: foe === 'bot' ? 'MACHINE' : 'P2', players: B, positions: [] as string[] }
    return (
      <Series
        opponent={opponent}
        five={A}
        mine={compile(A, B)}
        theirs={compile(B, A)}
        teamName={names[0]}
        teamAb="P1"
        result={result.r}
        seed={result.seed}
        exhibition
        kicker="1v1 Bid"
        advanceLabel="Rematch"
        onHome={onHome}
        onAdvance={reset}
      />
    )
  }

  return (
    <>
      <div className="topbar">
        <span>1v1 Bid</span>
        <span>$20 each · first to five</span>
      </div>
      <div className="rule2" />

      <div className="filterbar">
        <button className={`sortb ${foe === 'friend' ? 'on' : ''}`} onClick={() => pickFoe('friend')}>
          vs a friend
        </button>
        <button className={`sortb ${foe === 'bot' ? 'on' : ''}`} onClick={() => pickFoe('bot')}>
          vs the Machine
        </button>
        {foe === 'bot' ? (
          <>
            <button className={`sortb ${skill === 'rookie' ? 'on' : ''}`} onClick={() => pickSkill('rookie')}>
              Rookie
            </button>
            <button className={`sortb ${skill === 'pro' ? 'on' : ''}`} onClick={() => pickSkill('pro')}>
              Pro
            </button>
            <button className={`sortb ${skill === 'shark' ? 'on' : ''}`} onClick={() => pickSkill('shark')}>
              Shark
            </button>
          </>
        ) : null}
      </div>

      <div className="vs-head">
        <div className={`vs-side ${top === 0 ? 'now' : ''}`}>
          <b>{names[0]}</b>
          <span className="au-cash">${budget[0]}</span>
          <span>
            {countOf(0)}/5 men
            {full(0) ? ' · full' : passed[0] ? ' · passed this lot' : !canPlay(0) && man && !done ? ' · no slot for this lot' : ''}
          </span>
          {POSITIONS.map((pos, j) => (
            <span key={pos} className={`au-buy ${slots[0][j] ? '' : 'o'}`}>
              {pos} · {slots[0][j] ? `${slots[0][j]!.name} · $${slots[0][j]!.price}` : 'open'}
            </span>
          ))}
        </div>
        <div className="vs-mid">
          OPEN
          <br />
          OUTCRY
        </div>
        <div className={`vs-side r ${top === 1 ? 'now' : ''}`}>
          <b className={foe === 'bot' ? 'au-mach' : ''}>{names[1]}</b>
          <span className="au-cash">${budget[1]}</span>
          <span>
            {foe === 'bot' ? `${skill} · ` : ''}
            {countOf(1)}/5 men
            {full(1) ? ' · full' : passed[1] ? ' · passed this lot' : !canPlay(1) && man && !done ? ' · no slot for this lot' : ''}
          </span>
          {POSITIONS.map((pos, j) => (
            <span key={pos} className={`au-buy ${slots[1][j] ? '' : 'o'}`}>
              {pos} · {slots[1][j] ? `${slots[1][j]!.name} · $${slots[1][j]!.price}` : 'open'}
            </span>
          ))}
        </div>
      </div>

      {note ? <div className="cap hint">Last lot — {note}</div> : null}

      {!done && man ? (
        <>
          <div className="au-block">
            <div className="au-kick">
              {assign ? `Sold to ${names[assign.side]} · $${assign.price} — pick his spot` : `Lot ${lotN + 1} · on the block`}
            </div>
            {!assign ? (
              <>
                <div className={`au-price ${top === 0 ? 'p1' : top === 1 ? 'p2' : ''}`}>${price}</div>
                <div className="au-why">{top !== null ? `${names[top]} holds the bid` : 'no bids yet — a pass is final for this lot'}</div>
              </>
            ) : null}
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
          {/* the lot's shape at a glance — ungated, same open book as the dials */}
          <div className="au-hex">
            <HeatHex men={[man]} size={110} ungated />
          </div>
          {assign ? (
            <div className="au-actions one">
              <div className="au-panel">
                <div className="au-slotrow">
                  {assign.opts.map((j) => (
                    <button key={j} className="sortb" onClick={() => place(assign.side, assign.name, assign.price, j)}>
                      {POSITIONS[j]}
                    </button>
                  ))}
                </div>
                <div className="au-why">the slots his card can legally take</div>
              </div>
            </div>
          ) : (
            <div className="au-actions">
              {([0, 1] as const).map((i) => {
                if (i === 1 && foe === 'bot')
                  return (
                    <div className="au-panel" key={i}>
                      <div className="au-say">{botSay ?? (outFor(1) || top === 1 ? '' : 'The Machine is thinking')}</div>
                    </div>
                  )
                const slotsAfter = SLOTS - 1 - countOf(i)
                // HIS RULING: running out of money is not losing. A side held to its $1-a-chair
                // reserve cannot outbid anyone, but it still takes every man the other side passes
                // on — so the line says that, rather than reading like defeat.
                const why = passed[i]
                  ? 'passed — final for this lot'
                  : full(i)
                    ? 'five men — out of every auction'
                    : !canPlay(i)
                      ? 'no open slot he can play'
                      : awaitingCompel
                        ? compelled === i
                          ? 'compelled to open — $1'
                          : 'the other chair opens at $1'
                        : top === i
                          ? compelled === i && price === 1
                            ? full(other(i)) || !canPlay(other(i))
                              ? 'the other chair is out — he is yours at $1'
                              : 'compelled to open — $1 · the other chair answers'
                            : 'holds the bid — the other chair answers'
                          : price + 1 > ceiling(i)
                            ? ceiling(i) <= 1
                              ? `down to $1 a chair — you still take every man the other side passes on`
                              : slotsAfter > 0
                                ? `outbid here — $${slotsAfter} stays held for ${slotsAfter} slot${slotsAfter === 1 ? '' : 's'}`
                                : `outbid here — only $${budget[i]} left`
                            : null
                return (
                  <div className="au-panel" key={i}>
                    <button className={`btn ${i === 1 ? 'them' : ''}`} disabled={why !== null} onClick={() => bid(i)}>
                      {names[i]} — bid ${price + 1}
                    </button>
                    <button className="btn ghost" disabled={outFor(i) || top === i || awaitingCompel} onClick={() => pass(i)}>
                      Pass
                    </button>
                    {why ? <div className="au-why">{why}</div> : null}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : null}

      {A.length && B.length ? (
        <div className="card">
          <Bars
            mine={compile(A, B)}
            theirs={compile(B, A)}
            title={`Player 1 vs ${names[1]}`}
            leftLabel="PLAYER 1"
            rightLabel={names[1].toUpperCase()}
            leftWord="P1"
            rightWord="P2"
          />
        </div>
      ) : null}

      <div className="dock">
        <div className="dock-inner">
          <button className={`btn ${done || dry ? '' : 'ghost'}`} onClick={done || dry ? sim : undefined}>
            {done ? 'Sim the series' : dry ? 'The block is empty — play the men you have' : 'Bid a five into PG–C — every slot needs $1'}
          </button>
        </div>
      </div>
    </>
  )
}
