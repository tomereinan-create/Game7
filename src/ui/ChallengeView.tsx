import { useEffect, useMemo, useState } from 'react'
import { track } from '../analytics'
import { night } from '../engine/odds'
import { PLAYERS } from '../engine/pool'
import { simSeries } from '../engine/resolver'
import { makeRng, randomSeed } from '../engine/rng'
import type { Assignment } from '../engine/offense'
import type { Opponent, Player, SeriesResult } from '../engine/types'
import type { Lineup } from '../engine/types'
import { unpackLineup, type Challenge } from '../share/challenge'
import { autoTeam } from '../state/autoteam'
import { clubCode, freshProgress, loadTeam } from '../state/campaign'
import { Draft } from './Draft'
import { Series } from './Series'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const POS = ['PG', 'SG', 'SF', 'PF', 'C']
const sideName = (n: string, y?: number) => (y ? `${n} '${String(y).slice(2)}` : n)

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
function YourTurn({ opponent, onDone }: { opponent: Opponent; onDone: () => void }) {
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
        track('series_complete', { mode: 'challenge', won: false })
        setNight({ five, mine: n.mine, theirs: n.theirs, sigma: n.sigma, seed: s, result: simSeries(n.mine, n.theirs, makeRng(s), n.sigma, toWin) })
      }}
      onBack={onDone}
      onRoster={() => {}}
    />
  )
}
