import { useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../analytics'
import { startingFive } from '../engine/bestfive'
import { night } from '../engine/odds'
import { PLAYERS } from '../engine/pool'
import { simSeries } from '../engine/resolver'
import { eligible, POSITIONS } from '../engine/positions'
import { makeRng, randomSeed } from '../engine/rng'
import type { Assignment } from '../engine/offense'
import type { Opponent, Player, SeriesResult } from '../engine/types'
import type { Lineup } from '../engine/types'
import { unpackLineup, type Challenge } from '../share/challenge'
import { autoTeam } from '../state/autoteam'
import { clubCode, freshProgress, loadTeam } from '../state/campaign'
import { Draft } from './Draft'
import { Series } from './Series'
import { LINES } from './Stat'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const POS = ['PG', 'SG', 'SF', 'PF', 'C']
const sideName = (n: string, y?: number) => (y ? `${n} '${String(y).slice(2)}` : n)

/**
 * THE OPPONENT AT ITS POSITIONS (the live check, 2026-10-22: a Custom five arrives in the order its
 * men were tapped, so "Your turn" seated Giannis at PG and Durant at C). The five is seated the way
 * the ladder seats a real team — the best legal board, PG to C — and a five that cannot fill all
 * five spots (no one who ever played PF) seats whom it can, and the rest take the open spots under
 * the position they actually played — a tag never names a spot a man never played.
 */
export function seatFive(players: Player[]): { players: Player[]; positions: string[] } {
  const { five, bench } = startingFive(players)
  const rest = [...bench]
  const seated = five.map((p) => p ?? rest.shift()!)
  return { players: seated, positions: five.map((p, i) => (p ? POSITIONS[i] : eligible(LINES[seated[i].name]?.pos)[0])) }
}

/**
 * A CHALLENGE LINK, OPENED (P11). Three steps, and nothing is saved by any of them:
 *   1. CALL IT — both fives, and the one question: who takes the series?
 *   2. WATCH IT — the very series that was shared, replayed from its seed game by game.
 *   3. YOUR TURN — spin your own five against the same opponent; its result is shareable in turn,
 *      which is the loop: every share is a link someone can play.
 */
export function ChallengeView({ c, onDone }: { c: Challenge; onDone: () => void }) {
  const A = c.a.p.map((n) => BY_NAME.get(n))
  const B = c.b.p.map((n) => BY_NAME.get(n))
  const ok = A.every(Boolean) && B.every(Boolean)
  const fiveA = A as Player[]
  const fiveB = B as Player[]
  const opponent: Opponent = { round: 1, team: c.b.n, ab: c.b.ab, season: c.b.y, positions: POS, players: fiveB }
  const mine = useMemo(() => unpackLineup(c.m), [c])
  const theirs = useMemo(() => unpackLineup(c.t), [c])
  const result = useMemo(() => simSeries(mine, theirs, makeRng(c.s), c.g, c.w), [mine, theirs, c])
  const [call, setCall] = useState<'a' | 'b' | null>(null)
  const [settled, setSettled] = useState(false)
  const [turn, setTurn] = useState(false)

  useEffect(() => {
    // a code whose replay disagrees with the score it was sent with is still a real series — it is
    // shown — but it is counted, because it means some mode's night is not fully in the link
    if (ok && `${result.wins}-${result.losses}` !== c.r) track('challenge_mismatch', { sent: c.r, replay: `${result.wins}-${result.losses}` })
  }, [ok, result, c])

  if (!ok)
    return (
      <div className="ch-page">
        <h2>This challenge can't be played</h2>
        <p>A player in it is not in this version of the game.</p>
        <button className="btn" onClick={onDone}>
          Play the game →
        </button>
      </div>
    )

  if (turn) return <YourTurn opponent={opponent} onDone={onDone} />

  if (call)
    return (
      <>
        {settled ? (
          <div className={`ch-called ${(call === 'a') === result.won ? 'right' : 'wrong'}`} role="status">
            {(call === 'a') === result.won ? 'You called it ✓' : 'You called it wrong ✗'}
          </div>
        ) : null}
        <Series
          opponent={opponent}
          five={fiveA}
          mine={mine}
          theirs={theirs}
          teamName={c.a.n}
          teamAb={c.a.ab}
          result={result}
          seed={c.s}
          sigma={c.g}
          exhibition
          replay
          kicker="Challenge"
          advanceLabel={`Your turn: beat ${sideName(c.b.n, c.b.y)} →`}
          onHome={onDone}
          onSettled={() => setSettled(true)}
          onAdvance={() => {
            track('challenge_turn', {})
            setTurn(true)
          }}
        />
      </>
    )

  const side = (s: Challenge['a'], five: Player[], k: 'a' | 'b') => (
    <button
      className={`ch-side ${k}`}
      onClick={() => {
        setCall(k)
        track('challenge_call', { side: k })
      }}
    >
      <b>{sideName(s.n, s.y)}</b>
      <ul>
        {five.map((p) => (
          <li key={p.name}>{p.name}</li>
        ))}
      </ul>
      <span className="ch-pick">They win it →</span>
    </button>
  )
  return (
    <div className="ch-page">
      <span className="ch-kick">A challenge · best of {2 * c.w - 1}</span>
      <h2>Who takes the series?</h2>
      {side(c.a, fiveA, 'a')}
      <div className="ch-vs">vs</div>
      {side(c.b, fiveB, 'b')}
      <p className="ch-note">Call it, then watch the series that was played — game by game.</p>
    </div>
  )
}

/** "Your turn": the wheel against the challenge's opponent, on a ladder that is never saved. */
function YourTurn({ opponent: shared, onDone }: { opponent: Opponent; onDone: () => void }) {
  const [opponent] = useState<Opponent>(() => ({ ...shared, label: 'Challenge opponent', ...seatFive(shared.players) }))
  /* LEAVING WITH MEN ON THE BOARD ASKS FIRST, as the home button does in the game: the first tap
     says what it costs, the second leaves. Three seconds, then it forgets. */
  const [armed, setArmed] = useState(false)
  const armTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(armTimer.current), [])
  const [wallet] = useState(freshProgress)
  const [team] = useState(() => loadTeam() ?? autoTeam())
  const [seed] = useState(randomSeed)
  const [night_, setNight] = useState<{ five: Player[]; mine: Lineup; theirs: Lineup; sigma: number; seed: number; result: SeriesResult } | null>(null)
  const name = `${team.city} ${team.name}`
  if (night_)
    return (
      <Series
        opponent={opponent}
        five={night_.five}
        mine={night_.mine}
        theirs={night_.theirs}
        teamName={name}
        teamAb={clubCode(team)}
        result={night_.result}
        seed={night_.seed}
        sigma={night_.sigma}
        exhibition
        kicker="Your turn"
        advanceLabel="Play the full game →"
        onAdvance={onDone}
      />
    )
  return (
    <>
    {armed ? (
      <div className="home-arm" role="status">
        Tap again to leave — your picks are lost
      </div>
    ) : null}
    <Draft
      opponent={opponent}
      seed={seed}
      teamName={name}
      teamAb={clubCode(team)}
      wallet={wallet}
      autoSpin
      onSim={(five: Player[], assignment: Assignment, toWin: number) => {
        const n = night(five, opponent.players, assignment, null)
        const s = randomSeed()
        const result = simSeries(n.mine, n.theirs, makeRng(s), n.sigma, toWin)
        track('series_complete', { mode: 'challenge', won: result.won, games: result.games.length })
        setNight({ five, mine: n.mine, theirs: n.theirs, sigma: n.sigma, seed: s, result })
      }}
      backLabel={armed ? 'Leave the challenge' : 'Leave'}
      onBack={(started) => {
        if (started && !armed) {
          setArmed(true)
          window.clearTimeout(armTimer.current)
          armTimer.current = window.setTimeout(() => setArmed(false), 3000)
          return
        }
        onDone()
      }}
      onRoster={() => {}}
    />
    </>
  )
}
