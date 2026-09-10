import { useEffect, useMemo, useRef, useState } from 'react'
import { ROUNDS } from '../config'
import { teamCode } from '../engine/names'
import { seriesNote } from '../engine/notes'
import { makeRng } from '../engine/rng'
import { starsFor } from '../engine/resolver'
import { buildTicker } from '../engine/ticker'
import type { Lineup, Opponent, Player, SeriesResult } from '../engine/types'
import { LINES } from './Stat'
import { seriesBox, type BoxCtx, type PlayerBox, type SeriesBox } from '../engine/boxstats'
import { Analysis } from './Analysis'
import type { Assignment } from '../engine/offense'
import { useLayout } from './useLayout'
import type { Skin } from './LevelMap'
import { useUserMode } from '../state/viewmode'

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

/** The current run over the last stretch of the tape — "7–2 run · CLASH", or nothing when it's trading. */
function runLine(ticks: { us: number; them: number }[], i: number, you: string, them: string): string | null {
  const from = Math.max(0, i - 10)
  if (i - 1 <= from) return null
  const du = ticks[i - 1].us - ticks[from].us
  const dt = ticks[i - 1].them - ticks[from].them
  if (du > dt + 2) return `${du}–${dt} run · ${you}`
  if (dt > du + 2) return `${dt}–${du} run · ${them}`
  return null
}

/** One diverging stat bar (design 2g): gold grows left-out, ice right-out, the leader saturated. */
function Duel({ label, a, b, aText, bText, lowerBetter = false }: { label: string; a: number; b: number; aText: string; bText: string; lowerBetter?: boolean }) {
  const share = a + b > 0 ? a / (a + b) : 0.5
  const wa = Math.max(20, Math.min(70, 48 + (share - 0.5) * 320))
  const lead = a === b ? 0 : (a > b) !== lowerBetter ? 1 : -1
  return (
    <div className="duel">
      <div className="duel-line">
        <b className={lead > 0 ? 'you' : ''}>{aText}</b>
        <span>{label}</span>
        <b className={lead < 0 ? 'them' : ''}>{bText}</b>
      </div>
      <div className="duel-bar">
        <i className="you" style={{ width: `${wa}%`, opacity: lead < 0 ? 0.55 : 1 }} />
        <i className="mid" />
        <i className="them" style={{ width: `${96 - wa}%`, opacity: lead > 0 ? 0.55 : 1 }} />
      </div>
    </div>
  )
}

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

/**
 * Exported so the blind rule can be PINNED rather than eyeballed: the box-score half of this table
 * is user mode's too, the Rating half is scout mode's alone, and tests/blindgates.test.ts reads
 * both off this function.
 */
export function seriesStats(mine: Lineup, theirs: Lineup, r: SeriesResult, g7: { us: number; them: number } | null, box: SeriesBox, user: boolean): StatRow[] {
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
  ]
  /**
   * AND THE RATING BLOCK IS SCOUT MODE'S ALONE. Everything above this line is a BOX SCORE — shots,
   * boards, assists, turnovers, what actually happened out there — and user mode is entitled to
   * every number of it. What follows is the four figures the engine RATED the two fives at, which
   * is the one thing his standing ruling takes off every screen: "user mode plays blind — no
   * ratings, no verdict, no odds". The Full analysis door beside this table was already behind
   * `!user`, and the dials, the Matchup panel and the odds all are; this table was the hole they
   * were all still visible through, because a user-mode reader who opened Full box scores got
   * Talent / Offense / Defense / Net printed for both teams at the foot of it.
   */
  if (!user)
    rows.push(
      { label: 'Rating', a: '', b: '', lead: 0, head: true },
      { label: 'Talent', a: f1(mine.talent), b: f1(theirs.talent), lead: cmp(mine.talent, theirs.talent) },
      { label: 'Offense', a: f1(mine.off), b: f1(theirs.off), lead: cmp(mine.off, theirs.off) },
      { label: 'Defense (pts allowed)', a: f1(mine.drtg), b: f1(theirs.drtg), lead: cmp(mine.drtg, theirs.drtg, true) },
      { label: 'Net', a: (mine.net > 0 ? '+' : '') + f1(mine.net), b: (theirs.net > 0 ? '+' : '') + f1(theirs.net), lead: cmp(mine.net, theirs.net) },
    )
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
  teamAb,
  result,
  seed,
  assignment = 'optimal',
  exhibition = false,
  boxCtx = null,
  sigma,
  kicker,
  advanceLabel,
  skin = null,
  onHome,
  onAdvance,
  onRematch,
  onNext,
}: {
  opponent: Opponent
  five: Player[]
  mine: Lineup
  theirs: Lineup
  teamName: string
  /**
   * OUR SCORE-BUG CODE, the mirror of opponent.ab. Only the screens that name their own sides pass
   * one — the hot seat's P1, the bid's P1 — and everything else leaves it off and gets `teamCode`
   * off the team's name: the CITY, three characters, "Salt Lake City Sevens" -> SLC. It used to be
   * the last word of the name, which put the nickname on the bug and made every team he ever named
   * in the same city read the same.
   */
  teamAb?: string
  result: SeriesResult
  seed: number
  assignment?: Assignment
  /** A one-off (custom matchup): no level line, no stars, no map. */
  exhibition?: boolean
  /** recal_61: the tactical state the box consumes — the death match passes it, others none. */
  boxCtx?: { us: BoxCtx; them: BoxCtx } | null
  /** The noise this series was simmed at, paced by the plan (r57) — passed on to Full Analysis. A12. */
  sigma?: number
  /** What the topbar calls this table; a campaign level names itself. */
  kicker?: string
  /** The right-hand dock button's word, when it is not "back to the map". */
  advanceLabel?: string
  /**
   * HIS RULING: "The post series screen should also be the same design as the stage." Which block
   * of the ladder this level belongs to — the night is played in that room, so the scorebug, the
   * tape and the box wear its floor and its ink. Null off the ladder: an exhibition and a hot-seat
   * table belong to no block, and keep the house colours.
   */
  skin?: Skin | null
  /** A hot-seat table keeps its HOME / REMATCH pair: Home sits left of the advance button. */
  onHome?: () => void
  onAdvance: () => void
  /**
   * HIS RULING: "Add a rematch button, and advance(If you win your latest stage(not if you go back
   * to a stage you already won))." Play this same level again, from here. Passed whatever the
   * result; absent when there is no level to go back to (an exhibition, a dead death-match run).
   */
  onRematch?: () => void
  /** The same ruling's other door: straight into the next level. The caller decides if it is his
   *  latest stage — this screen only knows whether it was handed the door. */
  onNext?: () => void
}) {
  const myAb = teamAb ?? teamCode(teamName)
  const decider = result.games.length === 7 ? result.games[6] : null
  const shown = decider ? result.games.slice(0, 6) : result.games

  const tape = useMemo(() => {
    if (!decider) return null
    // The tape plays from the game's own box now (B2/B3), so it needs the stat lines and the same
    // tactical context the box scores consume.
    return buildTicker(decider.margin, five, opponent.players, makeRng(seed ^ 0x5bf03635), LINES, boxCtx ?? undefined)
  }, [decider, five, opponent.players, seed, boxCtx])

  const [i, setI] = useState(0)
  const [analysis, setAnalysis] = useState(false)
  const [boxOpen, setBoxOpen] = useState(false)
  const user = useUserMode()
  // Screens open at the top; the map's own scroll position must not carry over.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  /* The skin is a body class for the same reason the map's, the draft's and the tunnel's are: it
     has to reach the page's own ground, which is outside anything this screen renders. */
  useLayout(() => {
    if (!skin) return
    document.body.classList.add(`sk-${skin}`)
    return () => document.body.classList.remove(`sk-${skin}`)
  }, [skin])
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
    () => (done ? seriesBox(five, opponent.players, LINES, result.games, scoresOf(result, tape ? { us: tape.us, them: tape.them } : null), makeRng(seed ^ 0x2545f491), boxCtx ?? undefined) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done, result, seed, tape],
  )
  const cur = tape ? tape.ticks.slice(Math.max(0, i - 8), i) : []
  const head = tape ? (i > 0 ? tape.ticks[i - 1] : { q: 1, clock: '12:00', us: 0, them: 0 }) : null
  /** His word for the door that settles the night and leaves. Unchanged by the two new ones. */
  const mainLabel = advanceLabel ?? (exhibition ? 'Back to the board' : result.won && opponent.round === ROUNDS ? 'Claim the title' : 'Back to the map')

  return (
    <>
      <div className="topbar">
        <span>
          {kicker ?? (exhibition ? (
            'Exhibition'
          ) : (
            <>
              Level <b>{opponent.round}</b> of {ROUNDS}
            </>
          ))}
        </span>
        <span>
          {teamName} · {opponent.team}
        </span>
      </div>
      <div className="rule2" />

      {decider && tape && !done ? (
        /* Game 7 as a true scorebug (design 2h): team panels on their tints, the run on the bug's foot. */
        <div className="scorebug">
          <div className="sb-grid">
            <div className="sb-side you">
              <i>{myAb}</i>
              <b>{head!.us}</b>
            </div>
            <div className="sb-mid">
              <span className="g7-badge">GAME 7</span>
              <span className="sb-clock">
                Q{head!.q} · {head!.clock}
              </span>
              <span className="g7-live">● LIVE</span>
            </div>
            <div className="sb-side them">
              <i>{opponent.ab ?? teamCode(opponent.team)}</i>
              <b>{head!.them}</b>
            </div>
          </div>
          <div className="sb-foot">
            <span className="you">{runLine(tape.ticks, i, myAb, opponent.ab ?? teamCode(opponent.team)) ?? ''}</span>
            <span>Series 3–3</span>
          </div>
        </div>
      ) : null}
      {decider && tape && !done ? (
        <div className="card" style={{ paddingTop: 10 }}>
          <div className="feed tall">
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
        /* Verdict first (design 2g): the series score as the headline, the seven games as a filmstrip. */
        <div className={`verdict final ${user ? 'um-on' : ''}`}>
          <div className="v-kick">Series · best of seven</div>
          <div className="v-row">
            <span className="v-side you">{myAb}</span>
            <h1 className={result.won ? 'w' : 'l'}>
              <span className="u">{result.wins}</span>
              <span className="d">–</span>
              <span className="t">{result.losses}</span>
            </h1>
            <span className="v-side them">{opponent.ab ?? teamCode(opponent.team)}</span>
          </div>
          <p>{seriesNote(result.won, result.wins, result.losses)}</p>
          {result.won && !exhibition ? (
            <div className="stars">
              {'★'.repeat(starsFor(result))}
              <span>{'★'.repeat(3 - starsFor(result))}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* USER MODE'S RAFTERS (the design bundle, screen 6). The verdict, the filmstrip and the
          duels below are FACTS and the bundle leaves all three alone in both modes — what it adds
          for user mode is the room they are read in: confetti over the boards, and the banner for
          the level going up in the rafters behind them. Scout mode reads the verdict on black. */}
      {done && user ? (
        <div className="um-rafters" aria-hidden>
          <span className="um-boards" />
          {result.won ? (
            <span className="um-banner">
              <i>{opponent.round}</i>
            </span>
          ) : null}
          {result.won
            ? Array.from({ length: 14 }, (_, k) => (
                <span
                  key={k}
                  className={`um-conf c${k % 4}`}
                  style={{ left: `${(k * 7.3 + 4) % 96}%`, animationDelay: `${(k % 7) * 0.31}s`, animationDuration: `${2.2 + (k % 5) * 0.22}s` }}
                />
              ))
            : null}
        </div>
      ) : null}
      {done ? (
        <div className="strip">
          {scoresOf(result, tape ? { us: tape.us, them: tape.them } : null).map((s, k) => {
            const won = result.games[k].won
            const clinch = k === result.games.length - 1 && result.won
            return (
              <span className={`gt ${clinch ? 'clinch' : won ? 'w' : 'l'}`} key={k}>
                <i>G{k + 1}</i>
                <b>
                  {s.us}
                  <em>–</em>
                  {s.them}
                </b>
              </span>
            )
          })}
        </div>
      ) : null}

      {done && box ? (
        <div className="card">
          <div className="card-head">
            <span className="label">Where it was won</span>
            <span className="cap">per game · {result.games.length} played</span>
          </div>
          <div className="duels">
            {(() => {
              const scores = scoresOf(result, tape ? { us: tape.us, them: tape.them } : null)
              const us = scores.reduce((a, s) => a + s.us, 0) / scores.length
              const them = scores.reduce((a, s) => a + s.them, 0) / scores.length
              return <Duel label="Points" a={us} b={them} aText={f1(us)} bText={f1(them)} />
            })()}
            <Duel label="FG%" a={box.us.fgm / box.us.fga} b={box.them.fgm / box.them.fga} aText={pc(box.us.fgm, box.us.fga)} bText={pc(box.them.fgm, box.them.fga)} />
            <Duel label="3P%" a={box.us.tpm / Math.max(1, box.us.tpa)} b={box.them.tpm / Math.max(1, box.them.tpa)} aText={pc(box.us.tpm, box.us.tpa)} bText={pc(box.them.tpm, box.them.tpa)} />
            <Duel label="Rebounds" a={box.us.reb} b={box.them.reb} aText={f1(box.us.reb)} bText={f1(box.them.reb)} />
            <Duel label="Turnovers" a={box.us.tov} b={box.them.tov} aText={f1(box.us.tov)} bText={f1(box.them.tov)} lowerBetter />
          </div>
        </div>
      ) : null}

      {done && box ? (
        (() => {
          const star = [...box.usLines].sort((a, b) => b.pts - a.pts)[0]
          const answer = [...box.themLines].sort((a, b) => b.pts - a.pts)[0]
          return (
            <div className="card night">
              <div className="card-head">
                <span className="label">The night belonged to</span>
              </div>
              <div className="night-row">
                <b className="you">{short(star.name)}</b>
                <span>
                  {f1(star.pts)} PTS · {pc(star.fgm, star.fga)} FG · {f1(star.reb)} REB
                </span>
              </div>
              <div className="night-row small">
                <b className="them">{short(answer.name)}</b>
                <span>{f1(answer.pts)} PTS · their best answer</span>
              </div>
              <button className="linkb" style={{ paddingTop: 12 }} onClick={() => setBoxOpen((v) => !v)}>
                {boxOpen ? 'Fold the box scores ↑' : 'Full box scores →'}
              </button>
            </div>
          )
        })()
      ) : null}

      {done && boxOpen ? (
        <div className="card gcard">
          {shown.map((g) => (
            <div className="gline" key={g.game}>
              <span className="g">G{g.game}</span>
              <span className={`wl ${g.won ? 'w' : 'l'}`}>{g.won ? 'W' : 'L'}</span>
              <span className="sc">
                {g.us}–{g.them}
              </span>
            </div>
          ))}
          {decider && tape ? (
            <div className="gline">
              <span className="g">G7</span>
              <span className={`wl ${decider.won ? 'w' : 'l'}`}>{decider.won ? 'W' : 'L'}</span>
              <span className="sc">
                {tape.us}–{tape.them}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {analysis ? <Analysis mine={five} theirs={opponent.players} assignment={assignment} sigma={sigma} myName={teamName} theirName={opponent.team} onClose={() => setAnalysis(false)} /> : null}
      {/*
        E1 (2026-09-09): this door was NOT gated. User mode says "Play blind. No ratings, no
        verdict." and the draft screen keeps that promise everywhere — the court tags, both teams'
        dials, the Matchup panel, the spread and the odds are all behind `!user`. Then the series
        settled and this button opened the whole engine anyway: the spread, the per-game and
        per-series odds, the talent/fit/modifier decomposition, both defensive reads. One link
        undid the mode. The other rating surfaces on this screen were already gated; this was the
        hole.
      */}
      {done && !user ? (
        <button className="linkb" onClick={() => setAnalysis(true)}>
          Full analysis →
        </button>
      ) : null}
      {done && boxOpen ? (
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
            {seriesStats(mine, theirs, result, tape ? { us: tape.us, them: tape.them } : null, box!, user).map((row) => (
              <div className={`sr ${row.head ? 'head' : ''}`} key={row.label}>
                <span className={`you ${row.lead > 0 ? 'lead' : ''}`}>{row.a}</span>
                <span className="rl">{row.label}</span>
                <span className={`them ${row.lead < 0 ? 'lead' : ''}`}>{row.b}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {done && boxOpen && box ? (
        <>
          <PlayerLines title={teamName} tone="you" lines={box.usLines} />
          <PlayerLines title={opponent.team} tone="them" lines={box.themLines} />
        </>
      ) : null}

      {/* The three-door dock used to bolt an empty 64px div under the page, because the page's
          bottom padding was written for a ONE-ROW dock and this one is two. It does not any more:
          App.tsx measures whatever dock is standing into `--dock`, and every bottom padding is
          calc'd off that — so the tall shape simply reports its own height and the floor follows. */}
      <div className="dock">
        {!done ? (
          <div className="dock-inner">
            <button className="btn ghost" onClick={skip}>
              Skip to result
            </button>
          </div>
        ) : onNext && onRematch ? (
          /* THREE DOORS (his ruling: "Add a rematch button, and advance…"). Three across at 375
             would put "Back to the map" in a 114px slot, and his own word does not fit that — so
             the dock goes two rows instead: the ways BACK share the top row, and the way ON stands
             alone across the foot, gold, nearest the thumb. Every target keeps the dock's own 52px
             height, well over the 44 a finger needs. */
          <div className="dock-inner stack">
            <div className="dock-row">
              <button className="btn ghost" onClick={onAdvance}>
                {mainLabel}
              </button>
              <button className="btn ghost" onClick={onRematch}>
                Rematch
              </button>
            </div>
            <button className="btn" onClick={onNext}>
              Next level
            </button>
          </div>
        ) : onRematch ? (
          /* TWO DOORS. The gold one is always the one on the right, and it is always the furthest
             forward thing on offer: after a win that is still his word for leaving (the stars are
             banked on the way), after a loss it is the rematch — "the obvious thing to want". */
          <div className="dock-inner two">
            <button className="btn ghost" onClick={result.won ? onRematch : onAdvance}>
              {result.won ? 'Rematch' : mainLabel}
            </button>
            <button className="btn" onClick={result.won ? onAdvance : onRematch}>
              {result.won ? mainLabel : 'Rematch'}
            </button>
          </div>
        ) : (
          <div className={onHome ? 'dock-inner two' : 'dock-inner'}>
            {onHome ? (
              <button className="btn ghost" onClick={onHome}>
                Home
              </button>
            ) : null}
            <button className={`btn ${advanceLabel || result.won ? '' : 'ghost'}`} onClick={onAdvance}>
              {mainLabel}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
