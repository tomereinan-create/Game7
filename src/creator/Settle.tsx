import { useEffect, useMemo, useState } from 'react'
import { SIGMA } from '../config'
import { compile, simSeries } from '../engine/resolver'
import { makeRng } from '../engine/rng'
import { Series } from '../ui/Series'
import { seriesSeed } from '../engine/batch'
import { CREATOR } from './params'
import { asOpponent, fiveFor, seasonName, teamSeason } from './teams'

/** How many series the win-chance bar is the share of. The videos say the number; it must be true. */
export const SIMS = 10_000
/**
 * The batch's own seeds: series i of the 10,000 is seeded `BATCH_BASE + i`, the same rule
 * scripts/batch-sim.ts uses with its default base — so the bar on screen and the script's table
 * agree to the series. Independent of the featured series' seed, so a matchup's number never moves
 * when a different series of it is filmed.
 */
export const BATCH_BASE = 1

/**
 * "SETTLE IT" (P6, creator mode with `a` and `b`): two real team-seasons, the share of 10,000
 * seeded series each one wins, counted up on screen, then ONE featured series played out — the one
 * `seed` names, which is how a video features the closest Game 7 the batch script found. Nothing is
 * saved; with `auto=1` the featured series starts by itself once the count has landed.
 */
export function CreatorSettle() {
  const c = CREATOR!
  const A = teamSeason(c.a!)
  const B = teamSeason(c.b!)
  const sides = useMemo(() => {
    if (!A || !B) return null
    // B loads with A's men sitting out — Custom's rule, and scripts/batch-sim.ts's default — so
    // the bar on screen and the script's table are the same 10,000 series
    const fa = fiveFor(A)
    const fb = fiveFor(B, new Set(fa.map((p) => p.player)))
    return { fa, fb, mine: compile(fa, fb), theirs: compile(fb, fa) }
  }, [A, B])
  const [done, setDone] = useState(0)
  const [wins, setWins] = useState(0)
  const [play, setPlay] = useState(false)

  useEffect(() => {
    document.body.classList.add('creator')
    if (!sides) return
    // the batch runs in slices so the count can be watched climbing; ~2.5 s end to end (timers, not
    // animation frames, so a background tab still finishes the count)
    let i = 0
    let w = 0
    let t = 0
    const step = () => {
      const end = Math.min(SIMS, i + 70)
      for (; i < end; i++) if (simSeries(sides.mine, sides.theirs, makeRng(seriesSeed(BATCH_BASE, i)), SIGMA).won) w++
      setDone(i)
      setWins(w)
      if (i < SIMS) t = window.setTimeout(step, 16)
    }
    t = window.setTimeout(step, 16)
    return () => window.clearTimeout(t)
  }, [sides])

  useEffect(() => {
    if (!c.auto || done < SIMS || play) return
    const t = window.setTimeout(() => setPlay(true), 2600)
    return () => window.clearTimeout(t)
  }, [c.auto, done, play])

  if (!A || !B || !sides) {
    return (
      <div className="cr-settle">
        <p className="cr-err">
          Unknown team-season. Use the season's closing year and the club's letters, e.g. <code>a=1996-CHI&amp;b=2017-GSW</code>.
        </p>
      </div>
    )
  }

  if (play) {
    const result = simSeries(sides.mine, sides.theirs, makeRng(c.seed), SIGMA)
    return (
      <Series
        opponent={asOpponent(B, 1)}
        five={sides.fa}
        mine={sides.mine}
        theirs={sides.theirs}
        teamName={seasonName(A)}
        teamAb={A.ab}
        result={result}
        seed={c.seed}
        exhibition
        kicker="Settle it"
        onAdvance={() => setPlay(false)}
        onSettled={() => (document.body.dataset.creatorDone = '1')}
      />
    )
  }

  const pct = done ? (100 * wins) / done : 50
  const side = (t: typeof A, five: typeof sides.fa, tone: 'a' | 'b') => (
    <div className={`cr-side ${tone}`}>
      <b className="cr-team">{seasonName(t)}</b>
      <i className="cr-rec">{t.rec ? `${t.rec} that season` : ''}</i>
      <ul>
        {five.map((p) => (
          <li key={p.name}>{p.name}</li>
        ))}
      </ul>
    </div>
  )
  return (
    <div className="cr-settle">
      <span className="cr-kicker">Settle it · {SIMS.toLocaleString('en-US')} sims</span>
      {side(A, sides.fa, 'a')}
      <div className="cr-bar" role="img" aria-label={`${seasonName(A)} win ${pct.toFixed(0)}% of ${done} simulated series`}>
        <div className="cr-bar-a" style={{ width: `${pct}%` }} />
        <span className="cr-pa">{pct.toFixed(0)}%</span>
        <span className="cr-pb">{(100 - pct).toFixed(0)}%</span>
      </div>
      <div className="cr-count">
        <b>{done.toLocaleString('en-US')}</b> series simulated
      </div>
      {side(B, sides.fb, 'b')}
      {c.auto ? null : (
        <button className="btn cr-go" disabled={done < SIMS} onClick={() => setPlay(true)}>
          Play the featured series →
        </button>
      )}
    </div>
  )
}
