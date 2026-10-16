import { useEffect, useMemo, useState } from 'react'
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
 * THE TABLE IS A LOG OF MOVES (2026-10-16, for online friends). One phone used to hold the
 * slots, the loaded flags and the pick order as state and mutate them on each tap; two phones
 * cannot share mutations, but they can share a list. So every tap is now a move, and the table
 * is whatever `replay` makes of the list — on one phone the list is local state, online it is the
 * room's log (state/room.ts), and the same function reads both.
 */
export type VsMove =
  | { k: 'pick'; side: 0 | 1; name: string; ring: Pos }
  | { k: 'load'; side: 0 | 1; team: string; y: number }
  | { k: 'undo' }
  | { k: 'sim'; seed: number }

export interface VsTable {
  /**
   * G10: a side is a BOARD OF FIVE RINGS now, not a flat list. It was `[string[], string[]]`, so
   * there was nothing to constrain against — `take()` had no ring, nothing counted filled rings,
   * and the resolver was handed a board-ordered list. This is the campaign's own shape
   * (Draft.tsx) and Bid's, so all three modes now agree about what a five is.
   */
  slots: [Slots, Slots]
  /** Which sides took a whole real team instead of drafting — they are off the clock. */
  loaded: [boolean, boolean]
  /** Every ring filled by DRAFTING, newest last, so the last pick can be taken back. */
  order: { side: 0 | 1; ring: Pos }[]
  /** A loaded real team's short name, which takes the chair's name on one phone. */
  teams: [string | null, string | null]
  /** Set once the series is simmed: the box scores and the Game 7 tape are drawn from it. */
  simSeed: number | null
}

/** Floor order, the way the campaign hands a five to the resolver. */
const fiveOf = (s: Slots) => POSITIONS.map((x) => BY_NAME.get(s[x] ?? '')).filter((p): p is Player => !!p)
const filled = (s: Slots) => POSITIONS.filter((x) => s[x]).length

/** Who is on the clock. A loaded side is off it: the snake collapses to whoever still drafts. */
export function onClock(slots: readonly [Slots, Slots], loaded: readonly [boolean, boolean]): 0 | 1 {
  if (loaded[0] !== loaded[1]) return loaded[0] ? 1 : 0
  const turn = (loaded[0] ? 0 : filled(slots[0])) + (loaded[1] ? 0 : filled(slots[1]))
  return ORDER[Math.min(turn, ORDER.length - 1)]
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
export function loadCheck(
  pool: readonly Player[],
  slots: readonly [Slots, Slots],
  loaded: readonly [boolean, boolean],
  t: TeamSeason,
  side: 0 | 1,
): { ok: true; five: Player[] } | { ok: false; why: 'short' | 'strands' } {
  const other = side === 0 ? 1 : 0
  const otherMen = new Set(fiveOf(slots[other]).map((p) => p.player))
  const cands = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p && !otherMen.has(p.player))
  const best = startingFive(cands).five
  if (!best.every(Boolean)) return { ok: false, why: 'short' }
  const men = (best as Player[]).map((p) => p.player)
  const fielded = new Set([...fiveOf(slots[0]), ...fiveOf(slots[1])].map((p) => p.player))
  const rest = pool.filter((q) => !fielded.has(q.player) && !men.includes(q.player)).map((q) => q.name)
  if (!loaded[other] && !canStillFill(rest, posOf, POSITIONS.filter((x) => !slots[other][x]))) return { ok: false, why: 'strands' }
  return { ok: true, five: best as Player[] }
}

/**
 * THE LOG, READ. Each move is held to the same law the screen applies before sending it — on the
 * clock, an open ring he can play, nobody stranded — and a move that fails it is skipped. On one
 * phone that never happens; online it means a move that slipped past one phone is skipped by both
 * alike, so the two tables cannot drift apart.
 */
export function replay(pool: readonly Player[], moves: readonly VsMove[]): VsTable {
  const slots: [Slots, Slots] = [{}, {}]
  const loaded: [boolean, boolean] = [false, false]
  let order: { side: 0 | 1; ring: Pos }[] = []
  const teams: [string | null, string | null] = [null, null]
  let simSeed: number | null = null
  for (const m of moves) {
    if (simSeed !== null) break
    if (m.k === 'pick') {
      const fielded = new Set([...fiveOf(slots[0]), ...fiveOf(slots[1])].map((p) => p.player))
      const remaining = pool.filter((p) => !fielded.has(p.player))
      if (m.side !== onClock(slots, loaded) || !remaining.some((p) => p.name === m.name)) continue
      if (!legalRingsFor(slots, loaded, m.side, remaining, m.name).includes(m.ring)) continue
      slots[m.side] = { ...slots[m.side], [m.ring]: m.name }
      order.push({ side: m.side, ring: m.ring })
    } else if (m.k === 'undo') {
      let at = order.length - 1
      while (at >= 0 && loaded[order[at].side]) at--
      if (at < 0) continue
      const last = order[at]
      const next = { ...slots[last.side] }
      delete next[last.ring]
      slots[last.side] = next
      order = [...order.slice(0, at), ...order.slice(at + 1)]
    } else if (m.k === 'load') {
      const t = WHEEL.find((w) => w.team === m.team && w.y === m.y)
      const check = t ? loadCheck(pool, slots, loaded, t, m.side) : null
      if (!t || !check?.ok) continue
      const five: Slots = {}
      POSITIONS.forEach((x, i) => {
        const p = check.five[i]
        if (p) five[x] = p.name
      })
      slots[m.side] = five
      loaded[m.side] = true
      order = order.filter((o) => o.side !== m.side)
      teams[m.side] = `'${String(t.y).slice(2)} ${t.team.split(' ').pop()}`
    } else if (m.k === 'sim') {
      if (filled(slots[0]) === DRAFT_SIZE && filled(slots[1]) === DRAFT_SIZE) simSeed = m.seed
    }
  }
  return { slots, loaded, order, teams, simSeed }
}

/** Online play: the room's seats, names and log stand in for this phone's own (state/room.ts). */
export interface VsOnline {
  seat: 0 | 1
  names: [string, string]
  seed: number
  moves: readonly VsMove[]
  present: [boolean, boolean]
  /** False while the socket is down — taps would go nowhere, so the dock says so. */
  connected: boolean
  send: (m: VsMove) => void
  rematch: () => void
  report: (winner: 0 | 1) => void
}

const newSeed = () => (Math.random() * 0xffffffff) >>> 0

/** The same series told from the other bench: every game's winner and score turned round. */
const mirror = (r: SeriesResult): SeriesResult => ({
  ...r,
  wins: r.losses,
  losses: r.wins,
  won: !r.won,
  games: r.games.map((g) => ({ ...g, margin: -g.margin, won: !g.won, us: g.them, them: g.us })),
})

/**
 * Hot-seat: two people, one phone. Alternate picks from one board, then the
 * two fives play a best-of-seven with the exact campaign resolver.
 *
 * Online (`online` set): the same table on two phones. This phone may only move for its own seat,
 * and only when that seat is on the clock; everything else — the board, the law, the series — is
 * the hot seat's, unchanged.
 */
export function Versus({ onHome, online }: { onHome: () => void; online?: VsOnline }) {
  const [localSeed, setLocalSeed] = useState(newSeed)
  const [localMoves, setLocalMoves] = useState<VsMove[]>([])
  const seed = online ? online.seed : localSeed
  const moves = online ? online.moves : localMoves
  const play = (m: VsMove) => (online ? online.send(m) : setLocalMoves((cur) => [...cur, m]))
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

  const pool = useMemo(() => versusPool(seed), [seed])
  const { slots, loaded, order, teams, simSeed } = useMemo(() => replay(pool, moves), [pool, moves])
  /** A drafted chair is Player 1 / Player 2 on one phone, a loaded one its club; online, the person. */
  const names: [string, string] = online ? online.names : [teams[0] ?? 'Player 1', teams[1] ?? 'Player 2']

  const openOf = (i: 0 | 1) => POSITIONS.filter((x) => !slots[i][x])
  const countOf = (i: 0 | 1) => DRAFT_SIZE - openOf(i).length
  const done = countOf(0) === DRAFT_SIZE && countOf(1) === DRAFT_SIZE
  const who = onClock(slots, loaded)
  /** Whether a tap on this phone is a move: always on one phone, only on your own clock online. */
  const mine = !online || (online.connected && who === online.seat)

  const A = fiveOf(slots[0])
  const B = fiveOf(slots[1])
  /** One man, one matchup - a pool card whose player is already fielded (either side) is dead. */
  const fielded = new Set([...A, ...B].map((p) => p.player))
  /** Board cards nobody has taken and whose man is not already on a floor. */
  const remaining = pool.filter((p) => !fielded.has(p.player))

  // the seed rides along with the series: the box scores and the Game 7 tape are drawn from it.
  // Rated AGAINST each other, the way the campaign and Custom sim and the way this screen's own
  // odds and analysis are compiled below — defense is a property of the pairing, so a five rated
  // on its own plays a different series from the one the spread on the result screen describes.
  const result = useMemo(() => {
    if (simSeed === null) return null
    const a = fiveOf(slots[0])
    const b = fiveOf(slots[1])
    return { r: simSeries(compile(a, b), compile(b, a), makeRng(simSeed), SIGMA), seed: simSeed }
  }, [simSeed, slots])

  // online, each phone tells the room who won the series it replayed — the head-to-head record
  useEffect(() => {
    if (online && result) online.report(result.r.won ? 0 : 1)
    // `online` is a new object every render; the result is what changes once per series
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const legalRings = (p: Player): Pos[] =>
    done || result || fielded.has(p.player) ? [] : legalRingsFor(slots, loaded, who, remaining, p.name)

  const place = (name: string, ring: Pos) => {
    play({ k: 'pick', side: who, name, ring })
    setChoosing(null)
  }

  const take = (p: Player) => {
    if (!mine) return
    const rings = legalRings(p)
    if (!rings.length) return
    if (rings.length === 1) place(p.name, rings[0])
    else setChoosing({ name: p.name, rings })
  }

  /**
   * G10's safety valve. Under the guard the board can always be finished, so this should never be
   * needed — but `done` can never become true if the invariant is ever broken, and the dock would
   * sit there forever. It also gives a misclick somewhere to go, which this mode had no answer for.
   * Online it is yours to use on your own last pick only, and only while it is still the last.
   */
  const lastPick = order.length ? order[order.length - 1] : null
  const canUndo = !done && !!lastPick && (!online || (online.connected && lastPick.side === online.seat))
  const undo = () => {
    play({ k: 'undo' })
    setChoosing(null)
  }

  const loadable = (t: TeamSeason, side: 0 | 1): { ok: true; five: Player[] } | { ok: false; why: string } => {
    const check = loadCheck(pool, slots, loaded, t, side)
    if (check.ok) return check
    return { ok: false, why: check.why === 'short' ? 'their best five here is short' : `that would leave ${names[side === 0 ? 1 : 0]} unable to field a five` }
  }

  const loadTeam = (t: TeamSeason) => {
    if (loadFor === null || !loadable(t, loadFor).ok) return
    play({ k: 'load', side: loadFor, team: t.team, y: t.y })
    setLoadFor(null)
    setChoosing(null)
  }

  const sim = () => play({ k: 'sim', seed: newSeed() })

  const reset = () => {
    if (online) online.rematch()
    else {
      setLocalSeed(newSeed())
      setLocalMoves([])
    }
    setChoosing(null)
    setLoadFor(null)
    setInfo(null)
  }

  const ringOf = (p: Player): { side: 0 | 1; ring: Pos } | null => {
    for (const i of [0, 1] as const) for (const x of POSITIONS) if (slots[i][x] === p.name) return { side: i, ring: x }
    return null
  }

  // HIS RULING: the hot seat is treated the same as a campaign — the campaign's own series
  // screen, full box scores and Game 7 on the ticker. A loaded real team keeps its own short
  // name on the scorebug; a drafted chair stays P1 / P2. Online the chairs are people, each
  // scorebug code is made from the person's name, and each phone reads the series from its own
  // bench: chair 2's phone gets it mirrored. Every game's winner and score is the same on both
  // phones (a box score's total depends only on the margin's size); the player lines inside a
  // box are rolled for whichever bench is "us", so those can read differently phone to phone.
  if (result) {
    const me = online?.seat ?? 0
    const foe = me === 0 ? 1 : 0
    const fives = [A, B] as const
    const opponent = { round: 1, team: names[foe], ab: loaded[foe] || online ? undefined : 'P2', players: fives[foe], positions: [...POSITIONS] as string[] }
    return (
      <Series
        opponent={opponent}
        five={fives[me]}
        mine={compile(fives[me], fives[foe])}
        theirs={compile(fives[foe], fives[me])}
        teamName={names[me]}
        teamAb={loaded[me] || online ? undefined : 'P1'}
        result={me === 0 ? result.r : mirror(result.r)}
        seed={result.seed}
        exhibition
        kicker={online ? 'Online · vs friend' : 'Player vs Friend'}
        advanceLabel="Rematch"
        onHome={onHome}
        onAdvance={reset}
      />
    )
  }

  return (
    <>
      <div className="topbar">
        <span>{online ? `Online · vs ${names[online.seat === 0 ? 1 : 0]}` : 'Player vs Friend'}</span>
      </div>
      <div className="rule2" />

      <div className="vs-head">
        <div className={`vs-side ${!done && who === 0 && !loaded[0] ? 'now' : ''}`}>
          <b>{names[0]}</b>
          <span>
            {loaded[0] ? 'a real five, loaded' : `${countOf(0)}/5 picked${!done && who === 0 ? ' · on the clock' : ''}`}
            {online ? (online.seat === 0 ? ' · you' : online.present[0] ? '' : ' · away') : ''}
          </span>
          {!online || (online.seat === 0 && !done) ? (
            <button className="map-link" onClick={() => setLoadFor(loadFor === 0 ? null : 0)}>
              {loaded[0] ? 'Swap the team →' : 'Load a real team →'}
            </button>
          ) : null}
        </div>
        <div className="vs-mid">
          SNAKE
          <br />
          ORDER
        </div>
        <div className={`vs-side r ${!done && who === 1 && !loaded[1] ? 'now' : ''}`}>
          <b>{names[1]}</b>
          <span>
            {loaded[1] ? 'a real five, loaded' : `${countOf(1)}/5 picked${!done && who === 1 ? ' · on the clock' : ''}`}
            {online ? (online.seat === 1 ? ' · you' : online.present[1] ? '' : ' · away') : ''}
          </span>
          {!online || (online.seat === 1 && !done) ? (
            <button className="map-link" onClick={() => setLoadFor(loadFor === 1 ? null : 1)}>
              {loaded[1] ? 'Swap the team →' : 'Load a real team →'}
            </button>
          ) : null}
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

      {choosing && mine ? (
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
            title={online ? `${names[0]} vs ${names[1]}` : 'Player 1 vs Player 2'}
            leftLabel={online ? names[0].toUpperCase() : 'PLAYER 1'}
            rightLabel={online ? names[1].toUpperCase() : 'PLAYER 2'}
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
          {canUndo && lastPick ? (
            <button className="btn ghost" onClick={undo}>
              {online ? 'Take back your last pick' : `Take back ${names[lastPick.side]}’s last pick`}
            </button>
          ) : null}
          <button
            className={`btn ${done ? '' : who === 1 ? 'them' : 'ghost'}`}
            disabled={!!online && !online.connected}
            onClick={done ? sim : undefined}
          >
            {online && !online.connected
              ? 'Reconnecting…'
              : done
                ? 'Sim the series'
                : !online
                  ? `${names[who]} — pick ${DRAFT_SIZE - countOf(who)} more`
                  : mine
                    ? `Your pick — ${DRAFT_SIZE - countOf(who)} more`
                    : `${names[who]} is picking…`}
          </button>
        </div>
      </div>
    </>
  )
}
