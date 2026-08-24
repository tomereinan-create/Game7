import { useEffect, useMemo, useRef, useState } from 'react'
import { ROUNDS } from '../config'
import { seriesNote } from '../engine/notes'
import { makeRng } from '../engine/rng'
import { starsFor } from '../engine/resolver'
import { buildTicker } from '../engine/ticker'
import type { Lineup, Opponent, Player, SeriesResult } from '../engine/types'
import { LINES } from './Stat'
import { seriesBox, type PlayerBox, type SeriesBox } from '../engine/boxstats'
import { Analysis } from './Analysis'
import type { Assignment } from '../engine/offense'

const FAST_MS = 75
const SLOW_MS = 240

interface StatRow {
  label: string
  a: string
  b: string
  /** 1 = left better, -1 = right better, 0 = tie / n.a. */
  lead: number
  head?: boolean
}

const f1 = (v: number) => v.toFixed(1)
const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')

/** A team's player box lines, averaged over the series. Columns sum to the team line every game. */
function PlayerLines({ title, tone, lines }: { title: string; tone: 'you' | 'them'; lines: PlayerBox[] }) {
  const cols: [string, (l: PlayerBox) => string][] = [
    ['PTS', (l) => f1(l.pts)],
    ['FG%', (l) => pc(l.fgm, l.fga)],
    ['3P%', (l) => pc(l.tpm, l.tpa)],
    ['FT%', (l) => pc(l.ftm, l.fta)],
    ['REB', (l) => f1(l.reb)],
    ['AST', (l) => f1(l.ast)],
    ['STL', (l) => f1(l.stl)],
    ['BLK', (l) => f1(l.blk)],
    ['TOV', (l) => f1(l.tov)],
  ]
  return (
    <div className={`card plines ${tone}`}>
      <div className="card-head">
        <span className="label">{title} · per game</span>
      </div>
      <div className="pl-scroll">
        <table className="pl">
          <thead>
            <tr>
              <th>Player</th>
              {cols.map(([h]) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...lines]
              .sort((a, b) => b.pts - a.pts)
              .map((l) => (
                <tr key={l.name}>
                  <td className="nm">{short(l.name)}</td>
                  {cols.map(([h, f]) => (
                    <td key={h}>{f(l)}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
const pc = (m: number, a: number) => (a > 0 ? `${((100 * m) / a).toFixed(1)}%` : '—')

/**
 * The two teams, one by the other: the series, the box-score averages over the
 * games played, and the rating the sim used. A loss shows the same table as a win.
 */
const scoresOf = (r: SeriesResult, g7: { us: number; them: number } | null) => r.games.map((g, i) => (i === 6 && g7 ? g7 : { us: g.us, them: g.them }))

function seriesStats(mine: Lineup, theirs: Lineup, r: SeriesResult, g7: { us: number; them: number } | null, box: SeriesBox): StatRow[] {
  const scores = scoresOf(r, g7)
  const n = scores.length
  const us = scores.reduce((a, s) => a + s.us, 0) / n
  const them = scores.reduce((a, s) => a + s.them, 0) / n
  const margins = r.games.map((g) => g.margin)
  const bestUs = Math.max(0, ...margins)
  const bestThem = Math.max(0, ...margins.map((m) => -m))
  const cmp = (a: number, b: number, lowerBetter = false) => (a === b ? 0 : (a > b) !== lowerBetter ? 1 : -1)
  const rows: StatRow[] = [
    { label: 'Series', a: String(r.wins), b: String(r.losses), lead: cmp(r.wins, r.losses), head: true },
    { label: 'Points per game', a: f1(us), b: f1(them), lead: cmp(us, them) },
    { label: 'Biggest win', a: bestUs ? `+${Math.round(bestUs)}` : '—', b: bestThem ? `+${Math.round(bestThem)}` : '—', lead: cmp(bestUs, bestThem) },
    { label: `Per game, ${scores.length} played`, a: '', b: '', lead: 0, head: true },
    { label: 'Field goals', a: `${f1(box.us.fgm)} / ${f1(box.us.fga)}`, b: `${f1(box.them.fgm)} / ${f1(box.them.fga)}`, lead: cmp(box.us.fgm / box.us.fga, box.them.fgm / box.them.fga) },
    { label: 'FG%', a: pc(box.us.fgm, box.us.fga), b: pc(box.them.fgm, box.them.fga), lead: cmp(box.us.fgm / box.us.fga, box.them.fgm / box.them.fga) },
    { label: 'Threes', a: `${f1(box.us.tpm)} / ${f1(box.us.tpa)}`, b: `${f1(box.them.tpm)} / ${f1(box.them.tpa)}`, lead: cmp(box.us.tpm, box.them.tpm) },
    { label: '3P%', a: pc(box.us.tpm, box.us.tpa), b: pc(box.them.tpm, box.them.tpa), lead: cmp(box.us.tpm / box.us.tpa, box.them.tpm / box.them.tpa) },
    { label: 'Free throws', a: `${f1(box.us.ftm)} / ${f1(box.us.fta)}`, b: `${f1(box.them.ftm)} / ${f1(box.them.fta)}`, lead: cmp(box.us.ftm, box.them.ftm) },
    { label: 'FT%', a: pc(box.us.ftm, box.us.fta), b: pc(box.them.ftm, box.them.fta), lead: cmp(box.us.ftm / box.us.fta, box.them.ftm / box.them.fta) },
    { label: 'Rebounds', a: f1(box.us.reb), b: f1(box.them.reb), lead: cmp(box.us.reb, box.them.reb) },
    { label: 'Assists', a: f1(box.us.ast), b: f1(box.them.ast), lead: cmp(box.us.ast, box.them.ast) },
    { label: 'Steals', a: f1(box.us.stl), b: f1(box.them.stl), lead: cmp(box.us.stl, box.them.stl) },
    { label: 'Blocks', a: f1(box.us.blk), b: f1(box.them.blk), lead: cmp(box.us.blk, box.them.blk) },
    { label: 'Turnovers', a: f1(box.us.tov), b: f1(box.them.tov), lead: cmp(box.us.tov, box.them.tov, true) },
    { label: 'Rating', a: '', b: '', lead: 0, head: true },
    { label: 'Talent', a: f1(mine.talent), b: f1(theirs.talent), lead: cmp(mine.talent, theirs.talent) },
    { label: 'Offense', a: f1(mine.off), b: f1(theirs.off), lead: cmp(mine.off, theirs.off) },
    { label: 'Defense (pts allowed)', a: f1(mine.drtg), b: f1(theirs.drtg), lead: cmp(mine.drtg, theirs.drtg, true) },
    { label: 'Net', a: (mine.net > 0 ? '+' : '') + f1(mine.net), b: (theirs.net > 0 ? '+' : '') + f1(theirs.net), lead: cmp(mine.net, theirs.net) },
  ]
  return rows
}

/**
 * The series as a broadcast, quietly: W/L ledger badges, tabular scores, the
 * sim's own note in serif italic. Game 7 gets a scorebug and a mono crawl —
 * the app's only motion, skippable always.
 */
export function Series({
  opponent,
  five,
  mine,
  theirs,
  teamName,
  result,
  seed,
  assignment = 'optimal',
  exhibition = false,
  onAdvance,
}: {
  opponent: Opponent
  five: Player[]
  mine: Lineup
  theirs: Lineup
  teamName: string
  result: SeriesResult
  seed: number
  assignment?: Assignment
  /** A one-off (custom matchup): no level line, no stars, no map. */
  exhibition?: boolean
  onAdvance: () => void
}) {
  const decider = result.games.length === 7 ? result.games[6] : null
  const shown = decider ? result.games.slice(0, 6) : result.games

  const tape = useMemo(() => {
    if (!decider) return null
    return buildTicker(decider.margin, five, opponent.players, makeRng(seed ^ 0x5bf03635))
  }, [decider, five, opponent.players, seed])

  const [i, setI] = useState(0)
  const [analysis, setAnalysis] = useState(false)
  // Screens open at the top; the map's own scroll position must not carry over.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  const [live, setLive] = useState(!!decider)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!live || !tape) return
    if (i >= tape.ticks.length) {
      setLive(false)
      return
    }
    const delay = tape.ticks[i].slow ? SLOW_MS : FAST_MS
    timer.current = window.setTimeout(() => setI((n) => n + 1), delay)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [i, live, tape])

  const skip = () => {
    if (timer.current) window.clearTimeout(timer.current)
    setLive(false)
    if (tape) setI(tape.ticks.length)
  }

  const done = !live
  const box = useMemo(
    () => (done ? seriesBox(five, opponent.players, LINES, result.games, scoresOf(result, tape ? { us: tape.us, them: tape.them } : null), makeRng(seed ^ 0x2545f491)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done, result, seed, tape],
  )
  const cur = tape ? tape.ticks.slice(Math.max(0, i - 8), i) : []
  const head = tape ? (i > 0 ? tape.ticks[i - 1] : { q: 1, clock: '12:00', us: 0, them: 0 }) : null

  return (
    <>
      <div className="topbar">
        <span>
          {exhibition ? (
            'Exhibition'
          ) : (
            <>
              Level <b>{opponent.round}</b> of {ROUNDS}
            </>
          )}
        </span>
        <span>
          {teamName} · {opponent.team}
        </span>
      </div>
      <div className="rule2" />

      <div className="card gcard">
        {shown.map((g) => (
          <div className="gline" key={g.game}>
            <span className="g">G{g.game}</span>
            <span className={`wl ${g.won ? 'w' : 'l'}`}>{g.won ? 'W' : 'L'}</span>
            <span className="sc">
              {g.us}–{g.them}
            </span>
            <span className="note">{g.note}</span>
          </div>
        ))}
        {decider && done && tape ? (
          <div className="gline">
            <span className="g">G7</span>
            <span className={`wl ${decider.won ? 'w' : 'l'}`}>{decider.won ? 'W' : 'L'}</span>
            <span className="sc">
              {tape.us}–{tape.them}
            </span>
            <span className="note">{decider.note}</span>
          </div>
        ) : null}
      </div>

      {decider && tape && !done ? (
        <div className="card">
          <div className="g7-head">
            <div className="l">
              <span className="g7-badge">GAME 7</span>
              <span className="g7-clock">
                Q{head!.q} · {head!.clock}
              </span>
            </div>
            <span className="g7-live">● LIVE</span>
          </div>
          <div className="g7-score">
            <span className="u">{head!.us}</span>
            <span className="d"> – </span>
            <span className="t">{head!.them}</span>
          </div>
          <div className="feed">
            {cur.map((t, k) => (
              <div className="feed-row" key={i - cur.length + k}>
                <span className="t">
                  Q{t.q} {t.clock}
                </span>
                <span>{t.text}</span>
                <span className="fs">
                  {t.us}–{t.them}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {done ? (
        <div className="verdict">
          <h1 className={result.won ? 'w' : 'l'}>
            {result.wins}–{result.losses}
          </h1>
          <p>{seriesNote(result.won, result.wins, result.losses)}</p>
          {result.won && !exhibition ? (
            <div className="stars">
              {'★'.repeat(starsFor(result))}
              <span>{'★'.repeat(3 - starsFor(result))}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {analysis ? <Analysis mine={five} theirs={opponent.players} assignment={assignment} myName={teamName} theirName={opponent.team} onClose={() => setAnalysis(false)} /> : null}
      {done ? (
        <button className="linkb" onClick={() => setAnalysis(true)}>
          Full analysis →
        </button>
      ) : null}
      {done ? (
        <div className="card">
          <div className="card-head">
            <span className="label">Series stats</span>
          </div>
          <div className="sstats">
            <div className="sh">
              <span className="you">{teamName}</span>
              <span />
              <span className="them">{opponent.team}</span>
            </div>
            {seriesStats(mine, theirs, result, tape ? { us: tape.us, them: tape.them } : null, box!).map((row) => (
              <div className={`sr ${row.head ? 'head' : ''}`} key={row.label}>
                <span className={`you ${row.lead > 0 ? 'lead' : ''}`}>{row.a}</span>
                <span className="rl">{row.label}</span>
                <span className={`them ${row.lead < 0 ? 'lead' : ''}`}>{row.b}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {done && box ? (
        <>
          <PlayerLines title={teamName} tone="you" lines={box.usLines} />
          <PlayerLines title={opponent.team} tone="them" lines={box.themLines} />
        </>
      ) : null}

      <div className="dock">
        <div className="dock-inner">
          {done ? (
            <button className={`btn ${result.won ? '' : 'ghost'}`} onClick={onAdvance}>
              {exhibition ? 'Back to the board' : result.won ? (opponent.round === ROUNDS ? 'Claim the title' : 'Back to the map') : 'Back to the map'}
            </button>
          ) : (
            <button className="btn ghost" onClick={skip}>
              Skip to result
            </button>
          )}
        </div>
      </div>
    </>
  )
}
