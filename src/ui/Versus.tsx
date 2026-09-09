import { useMemo, useState } from 'react'
import { DRAFT_SIZE, SIGMA } from '../config'
import { PLAYERS } from '../engine/pool'
import { compile, simSeries } from '../engine/resolver'
import { isRateable } from '../engine/offense'
import { POSITIONS, type Pos } from '../engine/positions'
import { canStillFill, type Slots } from '../engine/slots'
import { LINES } from './Stat'
import { makeRng } from '../engine/rng'
import type { Player, SeriesResult } from '../engine/types'
import { Bars } from './Bars'
import { WHEEL, posOf, type TeamSeason } from './Draft'
import { ovrOf, startingFive, winsOf, YEARS } from './TeamDb'
import { PlayerCard } from './PlayerCard'
import { Series } from './Series'

const VS_POOL = 12
const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
/** Snake order so the first pick isn't decisive: A B B A A B B A A B. */
const ORDER: (0 | 1)[] = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]
/** Both sides' rings, as a multiset — ten demands, not five. */
const BOTH_FIVES: Pos[] = [...POSITIONS, ...POSITIONS]

/**
 * A shared pool for two drafters: real starters and stars, so both sides get players worth arguing
 * over — AND a board that can actually field two legal fives.
 *
 * G10 (2026-09-10), his ruling: there IS a position constraint here. Enforcing it exposed the
 * generator, which never looked at `pos` at all: measured, 36.25% of boards could not fill ten
 * rings from twelve position-blind cards before the first tap. The other two modes engineer around
 * this with unlimited supply behind the screen — the campaign's `landOn` refuses to settle the
 * wheel on a team with nobody for an open ring, and Bid's `lotIdx` skips a lot neither chair can
 * field. A hot seat has one board of twelve and no queue behind it, so the board itself has to be
 * legal.
 *
 * REJECTION, NOT CONSTRUCTION. Re-drawing the same generator until it passes keeps the board's
 * positional mix exactly as it was — it is the same distribution conditioned on legality. Reserving
 * a ring per man instead would reshape it (measured: point guards per board 3.42 -> 3.29 while
 * centres rise). Measured over 2000 seeds: mean 1.58 draws, worst 10, 0.00% infeasible. Enlarging
 * the pool is NOT the fix — 12 gives 36.25%, 20 gives 4.25%, 30 gives 0.35%; size alone never
 * reaches zero.
 */
function drawPool(seed: number): Player[] {
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
export function versusPool(seed: number): Player[] {
  let board = drawPool(seed)
  for (let k = 1; k <= 50 && !canStillFill(board.map((p) => p.name), posOf, BOTH_FIVES); k++) {
    board = drawPool((seed + k * 0x9e3779b9) >>> 0)
  }
  return board
}

/**
 * THE RINGS STILL OWED, minus the one a pick would fill. A LOADED side owes nothing — its five is
 * already standing — so its open rings must not be counted, or the guard would refuse picks in
 * order to protect a side that is finished. Demand is a MULTISET: two sides each wanting a point
 * guard is two demands, not one.
 *
 * Pure and exported so the draft's law can be driven to exhaustion without the screen around it.
 */
export function demandMinus(slots: readonly [Slots, Slots], loaded: readonly [boolean, boolean], side: 0 | 1, ring: Pos | null): Pos[] {
  const out: Pos[] = []
  let dropped = ring === null
  for (const i of [0, 1] as const) {
    if (loaded[i]) continue
    for (const r of POSITIONS) {
      if (slots[i][r]) continue
      if (!dropped && i === side && r === ring) {
        dropped = true
        continue
      }
      out.push(r)
    }
  }
  return out
}

/**
 * WHERE THIS MAN MAY GO: an OPEN ring he can play, and only if the board can still field everything
 * else afterwards. The second half is what a per-ring check misses — a pick can be perfectly legal
 * on its own and still leave the other drafter with no centre and no way to finish.
 */
export function legalRingsFor(
  slots: readonly [Slots, Slots],
  loaded: readonly [boolean, boolean],
  who: 0 | 1,
  remaining: readonly Player[],
  name: string,
): Pos[] {
  if (loaded[who]) return []
  const rest = remaining.filter((q) => q.name !== name).map((q) => q.name)
  return POSITIONS.filter((r) => !slots[who][r] && posOf(name).includes(r) && canStillFill(rest, posOf, demandMinus(slots, loaded, who, r)))
}

/**
 * Hot-seat: two people, one phone. Alternate picks from one board, then the
 * two fives play a best-of-seven with the exact campaign resolver.
 */
export function Versus({ onHome }: { onHome: () => void }) {
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)
  const [names, setNames] = useState<[string, string]>(['Player 1', 'Player 2'])
  /**
   * G10: a side is a BOARD OF FIVE RINGS now, not a flat list. It was `[string[], string[]]`, so
   * there was nothing to constrain against — `take()` had no ring, nothing counted filled rings,
   * and the resolver was handed a board-ordered list. This is the campaign's own shape
   * (Draft.tsx) and Bid's, so all three modes now agree about what a five is.
   */
  const [slots, setSlots] = useState<[Slots, Slots]>([{}, {}])
  /** Which sides took a whole real team instead of drafting — they are off the clock. */
  const [loaded, setLoaded] = useState<[boolean, boolean]>([false, false])
  /** Every ring filled by DRAFTING, newest last, so the last pick can be taken back. */
  const [order, setOrder] = useState<{ side: 0 | 1; ring: Pos }[]>([])
  /** A man who can fill more than one open ring needs to be told where he is going. */
  const [choosing, setChoosing] = useState<{ name: string; rings: Pos[] } | null>(null)
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
  // the seed rides along with the series: the box scores and the Game 7 tape are drawn from it
  const [result, setResult] = useState<{ r: SeriesResult; seed: number } | null>(null)

  const pool = useMemo(() => versusPool(seed), [seed])

  const openOf = (i: 0 | 1) => POSITIONS.filter((x) => !slots[i][x])
  const countOf = (i: 0 | 1) => DRAFT_SIZE - openOf(i).length
  const done = countOf(0) === DRAFT_SIZE && countOf(1) === DRAFT_SIZE
  // a loaded side is off the clock: the snake collapses to whoever still drafts
  const turn = (loaded[0] ? 0 : countOf(0)) + (loaded[1] ? 0 : countOf(1))
  const who: 0 | 1 = loaded[0] && !loaded[1] ? 1 : loaded[1] && !loaded[0] ? 0 : ORDER[Math.min(turn, ORDER.length - 1)]

  /** Floor order, the way the campaign hands a five to the resolver. */
  const five = (i: 0 | 1) => POSITIONS.map((x) => BY_NAME.get(slots[i][x] ?? '')).filter((p): p is Player => !!p)
  const A = five(0)
  const B = five(1)
  /** One man, one matchup - a pool card whose player is already fielded (either side) is dead. */
  const fielded = new Set([...A, ...B].map((p) => p.player))
  /** Board cards nobody has taken and whose man is not already on a floor. */
  const remaining = pool.filter((p) => !fielded.has(p.player))

  const legalRings = (p: Player): Pos[] =>
    done || result || fielded.has(p.player) ? [] : legalRingsFor(slots, loaded, who, remaining, p.name)

  const place = (name: string, ring: Pos) => {
    setSlots((cur) => {
      const next: [Slots, Slots] = [{ ...cur[0] }, { ...cur[1] }]
      next[who][ring] = name
      return next
    })
    setOrder((cur) => [...cur, { side: who, ring }])
    setChoosing(null)
  }

  const take = (p: Player) => {
    const rings = legalRings(p)
    if (!rings.length) return
    if (rings.length === 1) place(p.name, rings[0])
    else setChoosing({ name: p.name, rings })
  }

  /**
   * G10's safety valve. Under the guard the board can always be finished, so this should never be
   * needed — but `done` can never become true if the invariant is ever broken, and the dock would
   * sit there forever. It also gives a misclick somewhere to go, which this mode had no answer for.
   */
  const undo = () => {
    const last = [...order].reverse().find((o) => !loaded[o.side])
    if (!last) return
    setSlots((cur) => {
      const next: [Slots, Slots] = [{ ...cur[0] }, { ...cur[1] }]
      delete next[last.side][last.ring]
      return next
    })
    setOrder((cur) => {
      const at = cur.lastIndexOf(last)
      return at < 0 ? cur : [...cur.slice(0, at), ...cur.slice(at + 1)]
    })
    setChoosing(null)
  }

  /**
   * A team-season this side may actually take. Two ways it can fail, and BOTH are refused with a
   * reason rather than hidden, so the drafter is not left wondering where a club went:
   *   - its best legal five is short (the rows that already print OVR "—"), or
   *   - taking it would strand the other drafter. Measured before the gate: 0.25% of
   *     club-by-state pairs strand, and 97 of 100 boards contain at least one such club — so
   *     without this the constraint would trade a 69% illegal-five rate for a rarer soft-lock.
   * This is exactly what `landOn` does for the wheel and `lotIdx` for the block: never offer a
   * choice that cannot be fielded.
   */
  const loadable = (t: TeamSeason, side: 0 | 1): { ok: true; five: Player[] } | { ok: false; why: string } => {
    const other = side === 0 ? 1 : 0
    const otherMen = new Set(five(other).map((p) => p.player))
    const cands = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p && !otherMen.has(p.player))
    const best = startingFive(cands).five
    if (!best.every(Boolean)) return { ok: false, why: 'their best five here is short' }
    const men = (best as Player[]).map((p) => p.player)
    const rest = remaining.filter((q) => !men.includes(q.player)).map((q) => q.name)
    if (!loaded[other] && !canStillFill(rest, posOf, openOf(other))) return { ok: false, why: `that would leave ${names[other]} unable to field a five` }
    return { ok: true, five: best as Player[] }
  }

  const loadTeam = (t: TeamSeason) => {
    if (loadFor === null) return
    const side = loadFor
    const check = loadable(t, side)
    if (!check.ok) return
    setSlots((cur) => {
      const next: [Slots, Slots] = [{ ...cur[0] }, { ...cur[1] }]
      next[side] = {}
      POSITIONS.forEach((x, i) => {
        const p = check.five[i]
        if (p) next[side][x] = p.name
      })
      return next
    })
    setLoaded((cur) => {
      const next: [boolean, boolean] = [cur[0], cur[1]]
      next[side] = true
      return next
    })
    setOrder((cur) => cur.filter((o) => o.side !== side))
    setNames((cur) => {
      const next: [string, string] = [cur[0], cur[1]]
      next[side] = `'${String(t.y).slice(2)} ${t.team.split(' ').pop()}`
      return next
    })
    setLoadFor(null)
    setChoosing(null)
  }

  const sim = () => {
    const s = (Math.random() * 0xffffffff) >>> 0
    // Rated AGAINST each other, the way the campaign and Custom sim and the way this screen's own
    // odds and analysis are compiled below — defense is a property of the pairing, so a five rated
    // on its own plays a different series from the one the spread on the result screen describes.
    setResult({ r: simSeries(compile(A, B), compile(B, A), makeRng(s), SIGMA), seed: s })
  }

  const reset = () => {
    setSeed((Math.random() * 0xffffffff) >>> 0)
    setSlots([{}, {}])
    setLoaded([false, false])
    setOrder([])
    setChoosing(null)
    setNames(['Player 1', 'Player 2'])
    setLoadFor(null)
    setInfo(null)
    setResult(null)
  }

  const ringOf = (p: Player): { side: 0 | 1; ring: Pos } | null => {
    for (const i of [0, 1] as const) for (const x of POSITIONS) if (slots[i][x] === p.name) return { side: i, ring: x }
    return null
  }

  // HIS RULING: the hot seat is treated the same as a campaign — the campaign's own series
  // screen, full box scores and Game 7 on the ticker. A loaded real team keeps its own short
  // name on the scorebug; a drafted chair stays P1 / P2.
  if (result) {
    const opponent = { round: 1, team: names[1], ab: loaded[1] ? undefined : 'P2', players: B, positions: [...POSITIONS] as string[] }
    return (
      <Series
        opponent={opponent}
        five={A}
        mine={compile(A, B)}
        theirs={compile(B, A)}
        teamName={names[0]}
        teamAb={loaded[0] ? undefined : 'P1'}
        result={result.r}
        seed={result.seed}
        exhibition
        kicker="Player vs Friend"
        advanceLabel="Rematch"
        onHome={onHome}
        onAdvance={reset}
      />
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
          <span>{loaded[0] ? 'a real five, loaded' : `${countOf(0)}/5 picked${!done && who === 0 ? ' · on the clock' : ''}`}</span>
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
          <span>{loaded[1] ? 'a real five, loaded' : `${countOf(1)}/5 picked${!done && who === 1 ? ' · on the clock' : ''}`}</span>
          <button className="map-link" onClick={() => setLoadFor(loadFor === 1 ? null : 1)}>
            {loaded[1] ? 'Swap the team →' : 'Load a real team →'}
          </button>
        </div>
      </div>

      {/* G10: the five rings each side is filling, so the board says what the mode is asking for. */}
      <div className="vs-head">
        {([0, 1] as const).map((i) => (
          <div key={i} className={`vs-side ${i === 1 ? 'r' : ''}`}>
            <span className="cap">
              {POSITIONS.map((x) => `${x}${slots[i][x] ? '' : ' ·'}`).join(' ')}
            </span>
          </div>
        ))}
      </div>

      {choosing ? (
        <div className="card">
          <div className="card-head">
            <span className="label">Where does {choosing.name} play?</span>
            <button className="chip-btn" onClick={() => setChoosing(null)}>
              Never mind
            </button>
          </div>
          <div className="filterbar">
            {choosing.rings.map((r) => (
              <button key={r} className="sortb" onClick={() => place(choosing.name, r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
            .map((t) => {
              const check = loadable(t, loadFor)
              return (
                <button key={t.team + t.y} className={`lrow ${check.ok ? '' : 'off'}`} disabled={!check.ok} onClick={() => loadTeam(t)}>
                  <span className="lwho">
                    <b>{t.team}</b>
                    <i>
                      {check.ok ? (
                        <>
                          {t.ab}
                          {t.rec ? ` · ${t.rec}` : ''}
                          {t.div ? ` · ${t.div}` : ''}
                        </>
                      ) : (
                        check.why
                      )}
                    </i>
                  </span>
                  <span className="tdb-gauge">{ovrOf(t) === null ? '—' : `OVR ${ovrOf(t)}`}</span>
                  <span className="tdb-go">→</span>
                </button>
              )
            })}
          <div className="cap hint">Their best legal five by OVR takes the side — the draft board is the other player’s.</div>
        </div>
      ) : null}

      {/* G5 (2026-09-10): this was `A.length && B.length`, so the ratings card lit at the FIRST
          card taken and printed a NET for a one-man lineup — -34.3 / -30.7, numbers that mean
          nothing. A rating is a rating of five men; commit a3bee71 established that law and
          gated the campaign draft on it, and these two hot-seat screens were left out of it. */}
      {isRateable(A) && isRateable(B) ? (
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
          const held = ringOf(p)
          const o = held ? held.side : null
          const rings = held ? [] : legalRings(p)
          const dead = !held && fielded.has(p.player)
          /**
           * G10: the row says what he can play, and when he cannot be taken it says WHY. Two
           * different refusals, and they must not share a sentence: "his rings are filled" is a lie
           * when the ring is open and the FEASIBILITY guard is what forbids him — measured, that is
           * about one card a draft, rising toward the seventh pick.
           */
          const label = held
            ? `${names[held.side].toUpperCase()} · ${held.ring}`
            : dead
              ? 'already on the other floor'
              : loaded[who]
                ? posOf(p.name).join(' · ')
                : rings.length
                  ? posOf(p.name).join(' · ')
                  : openOf(who).some((r) => posOf(p.name).includes(r))
                    ? `${posOf(p.name).join(' · ')} — taking him would strand the other five`
                    : `${posOf(p.name).join(' · ')} — those rings are filled`
          return (
            <PlayerCard
              key={p.name}
              p={p}
              pick={null}
              owner={o}
              ownerLabel={label}
              dimmed={!held && (dead || !rings.length)}
              expanded={info === p.name}
              onClick={() => take(p)}
              onInfo={() => setInfo(info === p.name ? null : p.name)}
            />
          )
        })}
      </div>

      <div className="dock">
        <div className="dock-inner">
          {!done && order.length ? (
            <button className="btn ghost" onClick={undo}>
              Take back {names[order[order.length - 1].side]}’s last pick
            </button>
          ) : null}
          <button className={`btn ${done ? '' : who === 1 ? 'them' : 'ghost'}`} disabled={false} onClick={done ? sim : undefined}>
            {done ? 'Sim the series' : `${names[who]} — pick ${DRAFT_SIZE - countOf(who)} more`}
          </button>
        </div>
      </div>
    </>
  )
}
