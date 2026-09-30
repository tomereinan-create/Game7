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
import { useLesson } from '../state/tutorial'
import { mapDoorLesson } from './lessons'

/** Whether this machine has asked for less motion. The draft reads it the same way. */
const reduceMotion = () => {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const FAST_MS = 75
const SLOW_MS = 240
/**
 * THE CLOSING MINUTES OF A CLOSE GAME 7 RUN SLOW — his ruling, 2026-09-30: "If a game 7 is 5 pts
 * or less in the last 5 min, slow down the sim (if its back to 6 its still slowed down, once it
 * reach 5 in the last 5 its slowed down to the rest)."
 *
 * A LATCH, NOT A TEST. His parenthesis is the whole rule: the tape does not speed up again when
 * the lead goes back out to six, because what it is reading has become a close finish and stays
 * one. So the first tick inside the last five minutes with five or fewer between them turns it on,
 * and it stays on to the buzzer.
 */
const CLUTCH_MS = 430
const CLUTCH_SECS = 5 * 60
const CLUTCH_PTS = 5
/** "5:55" -> 355. A clock this cannot read is not a clutch clock. */
const secsOf = (clock: string) => {
  const [m, sec] = clock.split(':').map(Number)
  return Number.isFinite(m) && Number.isFinite(sec) ? m * 60 + sec : Infinity
}
/** One game lands on the filmstrip every this many ms (his ruling: "1 game by 1"). */
const GAME_MS = 600

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
function PlayerLines({ title, tone, lines, per = 'per game' }: { title: string; tone: 'you' | 'them'; lines: PlayerBox[]; /** what one row IS — averages over the series, or one night's line */ per?: string }) {
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
        <span className="label">{title}{per ? ` · ${per}` : ''}</span>
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
  onMyTeam,
  onAdvance,
  onRematch,
  onNext,
  reveal: revealGames = true,
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
  /**
   * Whether the series LANDS a game at a time on this screen (his ruling, 2026-09-29: "Simming a
   * series, should be 1 game by 1, not all immidiately") or is simply settled when it opens.
   * Default on. Off for a machine that has asked for less motion, and for a render that wants the
   * finished screen without running any timers - which is what the tests pin.
   */
  reveal?: boolean
  /** A hot-seat table keeps its HOME / REMATCH pair: Home sits left of the advance button. */
  onHome?: () => void
  /**
   * THE DEATH MATCH'S OWN DOOR — his ruling, 2026-09-30: "After simming, add myteam button in
   * deathmatch campaign." A run carries ONE five from the first level to the last and a change
   * before each one, so the moment a series ends is exactly when he wants to look at who is worn
   * and who he might swap. It was two screens away: back to the map, then My team. Absent in every
   * other mode, which has no such screen.
   */
  onMyTeam?: () => void
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

  const tape = useMemo(() => {
    if (!decider) return null
    // The tape plays from the game's own box now (B2/B3), so it needs the stat lines and the same
    // tactical context the box scores consume.
    return buildTicker(decider.margin, five, opponent.players, makeRng(seed ^ 0x5bf03635), LINES, boxCtx ?? undefined)
  }, [decider, five, opponent.players, seed, boxCtx])

  const [i, setI] = useState(0)
  const [analysis, setAnalysis] = useState(false)
  const [boxOpen, setBoxOpen] = useState(false)
  /**
   * WHICH NIGHT HE HAS OPENED - his ruling, 2026-09-29: "After simming, make every game pressable,
   * to see what happnenned in that game(Box score wise)." The filmstrip under the verdict was five
   * chips that said 111-85 and nothing else; every one of those nights was rolled in full and then
   * averaged away. `box.perGame` keeps them (see `seriesBox`), so a chip is a door now.
   */
  const [gameOpen, setGameOpen] = useState<number | null>(null)
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
  /**
   * GAME 7 GOES LAST, BECAUSE IT IS LAST — his ruling, 2026-09-29: "If the series got to 7, show
   * the 7 animation after loading the 6 games, then the animation. Currently, the game 7 animation
   * is happenning and then I get games 1-6 (Which will always end 3-3)."
   *
   * Exactly right, and it is the landing I added this morning that made it wrong: the tape was
   * built to be the FIRST thing this screen did, because before the landing existed there was
   * nothing for it to come after. So he watched the decider, learned the series, and was then
   * shown six games whose ending he already knew and which could only ever add up to 3-3.
   *
   * The screen runs in three phases now — the first six chips land, the seventh is played on the
   * tape, and then it lands too and the series may speak. `live` therefore starts FALSE whenever
   * the landing is on, and is turned on by the landing reaching the decider. With the landing off
   * (reduced motion, or a render that wants the settled screen) the tape opens the screen exactly
   * as it always did.
   */
  const [live, setLive] = useState(!!decider && (!revealGames || reduceMotion()))
  /** The decider has been played. A ref: it must not restart the tape by re-rendering. */
  const tapeRun = useRef(!decider)
  /** How many games may land before the tape: all of them, or all but the decider. */
  const preGames = result.games.length - (decider ? 1 : 0)
  const timer = useRef<number | null>(null)
  /**
   * THE SERIES LANDS ONE GAME AT A TIME - his ruling, 2026-09-29: "Simming a series, should be 1
   * game by 1, not all immidiately."
   *
   * The engine resolves the whole series in one call and always has; what he was shown was the
   * FINISHED thing - 4-1 as a headline over five scores that were simply there. A series is five
   * nights and it should arrive like five nights. So the strip fills a chip at a time, the score
   * over it counts up as it does, and nothing that PRONOUNCES on the series - the note, the stars,
   * the rafters, where it was won, whose night it was, the doors - appears until it is decided.
   * Presentation only: not one number changes, and one tap anywhere skips to the end.
   */
  const [shown, setShown] = useState(() => (revealGames && !reduceMotion() ? 0 : result.games.length))
  const reveal = useRef<number | null>(null)
  /**
   * THE SETTLED NIGHT TAKES THE WHOLE DESK - his ruling, 2026-09-29: "Yes fix the result screen
   * too", on the band of content this screen drew across the top of a 1,500px window with black
   * under it.
   *
   * The 2026-09-08 ruling ("so it wont be all in the middle and having to scroll down") gave this
   * screen the WIDTH - three columns instead of a 562px strip - and the height was never asked
   * about, so the grid stayed `align-items: start` and the three groups ended wherever their
   * content did. Same measurement as the draft board's, for the same reason: what stands above
   * this grid and what the dock reserves below it are both variables no rule can read.
   */
  const resultBox = useRef<HTMLDivElement | null>(null)

  /** Latched the first time the last five minutes are inside five points; see `CLUTCH_MS`. */
  const clutch = useRef(false)
  useEffect(() => {
    if (!live || !tape) return
    if (i >= tape.ticks.length) {
      tapeRun.current = true
      setLive(false)
      return
    }
    const t = tape.ticks[i]
    // the 4th is the last quarter this game plays; anything past it is an overtime and is closer
    // still, so it latches too
    if (!clutch.current && t.q >= 4 && secsOf(t.clock) <= CLUTCH_SECS && Math.abs(t.us - t.them) <= CLUTCH_PTS) clutch.current = true
    const delay = clutch.current ? CLUTCH_MS : t.slow ? SLOW_MS : FAST_MS
    timer.current = window.setTimeout(() => setI((n) => n + 1), delay)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [i, live, tape])

  const skip = () => {
    if (timer.current) window.clearTimeout(timer.current)
    tapeRun.current = true
    setLive(false)
    if (tape) setI(tape.ticks.length)
  }

  const done = !live
  /** Every game is on the strip and the series may speak. */
  const settled = shown >= result.games.length
  /* THE COACH ON THE RESULT (tutorial mode) — his ruling, 2026-09-30: "Remove Tutorial · The result
     and instead point on back to map in order to show the stars use (staff)." One step, after a
     win that banked something, lighting the map door (`data-door="map"` on whichever button carries
     it in this dock's shape): the stars are spent on the map, and that is where the coach goes next. */
  useLesson('result.map', settled && result.won && !exhibition, () => mapDoorLesson(starsFor(result)))
  /** The landing stops at the decider until the tape has played it. */
  const revealCap = tapeRun.current ? result.games.length : preGames
  useEffect(() => {
    if (!done || shown >= revealCap) return
    reveal.current = window.setTimeout(() => setShown((n) => n + 1), GAME_MS)
    return () => {
      if (reveal.current) window.clearTimeout(reveal.current)
    }
  }, [done, revealCap, shown])
  /* AND THE TAPE TAKES OVER when the six are down. `live` is what hides the strip and draws the
     scorebug; when the tape ends it hands the screen back and the landing finishes the job. */
  useEffect(() => {
    if (!decider || tapeRun.current || live || shown < preGames) return
    setLive(true)
  }, [decider, live, shown, preGames])
  const skipReveal = () => {
    if (reveal.current) window.clearTimeout(reveal.current)
    tapeRun.current = true
    setShown(result.games.length)
  }
  /** The series score as far as the strip has got, which is the final one once it is settled. */
  const runWins = result.games.slice(0, shown).filter((g) => g.won).length
  const runLosses = shown - runWins
  /**
   * HIS RULING: "Change photo 1 so it wont be all in the middle and having to scroll down."
   *
   * THE CAUSE, not the symptom: this screen never opted into `body.wide`, so on a 1900px desk it
   * inherited `#root`'s 562px phone column and drew the whole night — verdict, rafters, filmstrip,
   * both cards — down one narrow strip with the rest of the window black either side, and the foot
   * of it below the fold. The draft, My team, the map and the staff tree all take this class; the
   * result screen is the one that was left out. With it on, `.result` below lays the settled night
   * across the window (see the stylesheet), and a screen that spends its width stops needing
   * height.
   *
   * ONLY ONCE THE NIGHT HAS SETTLED. While Game 7 is on the tape this screen is a scorebug and a
   * play-by-play feed, which he did not ask about and which reads as a broadcast precisely because
   * it is a column; widening that would be redesigning something that was not ruled on.
   *
   * A LAYOUT effect for the reason the draft's own comment gives: leaving for the map is one
   * commit, and a passive cleanup here would tear `wide` back off the body a beat AFTER the map
   * had put it on.
   */
  useLayout(() => {
    if (!done) return
    document.body.classList.add('wide')
    return () => document.body.classList.remove('wide')
  }, [done])
  useLayout(() => {
    const fit = () => {
      const el = resultBox.current
      if (!el) return
      el.style.minHeight = ''
      // a phone stacks this screen and has no height to hand out
      if (window.innerWidth < 900) return
      const root = document.getElementById('root')
      const foot = root ? parseFloat(getComputedStyle(root).paddingBottom) || 0 : 0
      const room = window.innerHeight - el.getBoundingClientRect().top - foot
      // MIN-height: with the box scores open the screen is longer than the window and scrolls,
      // which is what that door is for
      if (room > 420) el.style.minHeight = `${Math.floor(room)}px`
    }
    fit()
    window.addEventListener('resize', fit)
    document.fonts?.ready.then(fit).catch(() => {})
    return () => window.removeEventListener('resize', fit)
  })
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

      {/*
        THE NIGHT, LAID ACROSS THE WINDOW (his ruling: "Change photo 1 so it wont be all in the
        middle and having to scroll down.").

        Both halves of that sentence are one problem. Everything a settled series has to say was
        stacked down a single 562px column with the rest of a 1900px desk black either side, and the
        foot of the stack — the two cards, and after them the dock — was below the fold. So the
        blocks are grouped by WHAT THEY ARE and the stylesheet stands the groups side by side:

          .res-lead   the score, the rafters and the filmstrip — the things you read IN ORDER
          .res-won    WHERE IT WAS WON — a self-contained card
          .res-night  THE NIGHT BELONGED TO — a self-contained card
          .res-more   the box scores, opened on request, which want the whole width when they come

        BELOW 900px THESE GROUPS DO NOT EXIST: every one of them is `display: contents` on a phone,
        so the DOM order below IS the phone's order, unchanged to the pixel — a phone has no width
        to spend and the order was already right. The grouping only bites on a desk.
      */}
      {done ? (
        <div ref={resultBox} className={`result${settled ? '' : ' landing'}`} onClick={settled ? undefined : skipReveal}>
          <div className="res-lead">
            {/* Verdict first (design 2g): the series score as the headline, the seven games as a filmstrip. */}
            <div className={`verdict final ${user ? 'um-on' : ''}`}>
              <div className="v-kick">Series · best of seven</div>
              <div className="v-row">
                <span className="v-side you">{myAb}</span>
                <h1 className={!settled ? '' : result.won ? 'w' : 'l'}>
                  <span className="u">{runWins}</span>
                  <span className="d">–</span>
                  <span className="t">{runLosses}</span>
                </h1>
                <span className="v-side them">{opponent.ab ?? teamCode(opponent.team)}</span>
              </div>
              {/* "Game 1", not "Game 1 of 4" — his ruling, 2026-09-29: "it says game 1 of X, but
                  then I can know the series result." Quite right: the LENGTH of a series is its
                  result. A best-of-seven that runs four games was a sweep and one that runs seven
                  went the distance, so a caption that counts towards a total hands him the ending
                  before the first chip lands. It counts up and says nothing about where it stops. */}
              {settled ? <p>{seriesNote(result.won, result.wins, result.losses)}</p> : <p className="v-landing">Game {Math.min(shown + 1, result.games.length)}…</p>}
              {settled && result.won && !exhibition ? (
                <div className="stars">
                  {'★'.repeat(starsFor(result))}
                  <span>{'★'.repeat(3 - starsFor(result))}</span>
                </div>
              ) : null}
            </div>

            {/* USER MODE'S RAFTERS (the design bundle, screen 6). The verdict, the filmstrip and the
                duels below are FACTS and the bundle leaves all three alone in both modes — what it adds
                for user mode is the room they are read in: confetti over the boards, and the banner for
                the level going up in the rafters behind them. Scout mode reads the verdict on black.
                It stays directly under the score, in the same group, because the band is the ROOM the
                score was read in: its boards and its confetti are absolutely positioned inside it, so
                it carries its own frame wherever the group is put. */}
            {user && settled ? (
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

            {/* The filmstrip is a ROW of game chips and must never break mid-series, so it stays in
                the lead group whatever the width: one track, one line, G1 to G7 in order. */}
            <div className="strip">
              {/**
               * THE STRIP IS THE WHOLE SERIES UNTIL IT IS DECIDED — his ruling, 2026-09-30: "Its
               * showing 4 tickets before the series ends, so I know it will be a sweep."
               *
               * Quite right, and it is the same leak the caption had: the LENGTH of a series is
               * its result. Four slots on the strip is a sweep announced before the first chip
               * lands, five is 4-1, and so on. While it lands the strip is the format — seven
               * slots for a best of seven — and it settles to the games actually played, which is
               * the strip his earlier ruling read and is unchanged.
               *
               * EVERY SLOT IS DRAWN FROM THE FIRST FRAME, empty until its game arrives: a strip
               * that GREW would move the chips already on it sideways as each one landed, and the
               * thing he is watching is the scores, not the layout.
               */}
              {Array.from({ length: settled ? result.games.length : Math.max(result.games.length, result.toWin * 2 - 1) }, (_, k) => k).map((k) => {
                const played = k < result.games.length
                const s = played ? scoresOf(result, tape ? { us: tape.us, them: tape.them } : null)[k] : null
                const won = played && result.games[k].won
                const clinch = played && k === result.games.length - 1 && result.won
                const here = played && k < shown
                if (!here || !s)
                  return (
                    <span className="gt pending" key={k} aria-hidden>
                      <i>G{k + 1}</i>
                      <b>–</b>
                    </span>
                  )
                return (
                  <button
                    type="button"
                    className={`gt ${clinch && settled ? 'clinch' : won ? 'w' : 'l'}`}
                    key={k}
                    disabled={!box || !settled}
                    aria-label={`Game ${k + 1}, ${s.us} to ${s.them} — box score`}
                    onClick={() => setGameOpen(k)}
                  >
                    <i>G{k + 1}</i>
                    <b>
                      {s.us}
                      <em>–</em>
                      {s.them}
                    </b>
                  </button>
                )
              })}
            </div>
          </div>

          {box && settled ? (
            <div className="res-won">
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
            </div>
          ) : null}

          {box && settled
            ? (() => {
                const star = [...box.usLines].sort((a, b) => b.pts - a.pts)[0]
                const answer = [...box.themLines].sort((a, b) => b.pts - a.pts)[0]
                return (
                  <div className="res-night">
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
                      {/* HIS RULING: "Remove this part." The game-by-game list is gone from this
                          card. It printed G1 111-85 / G2 108-100 / G3 114-91 / G4 101-97 — which
                          is the filmstrip's own line, chip for chip, already standing under the
                          verdict where the series is read. One screen said the same four scores
                          twice, and the filmstrip is the copy that earns its place: it is part of
                          reading the result, not something you open. Full box scores still opens
                          what only it has — the series stats and both sides' player lines. */}
                    </div>
                  </div>
                )
              })()
            : null}

          {/* WHAT HE ASKED FOR, WHEN HE ASKS FOR IT. The box scores and the analysis door are the
              only things on this screen that are opened rather than read, so they take the full
              width UNDER the three groups above and never push the result off the fold. */}
          <div className="res-more" hidden={!settled}>
            {/*
              E1 (2026-09-09): this door was NOT gated. User mode says "Play blind. No ratings, no
              verdict." and the draft screen keeps that promise everywhere — the court tags, both teams'
              dials, the Matchup panel, the spread and the odds are all behind `!user`. Then the series
              settled and this button opened the whole engine anyway: the spread, the per-game and
              per-series odds, the talent/fit/modifier decomposition, both defensive reads. One link
              undid the mode. The other rating surfaces on this screen were already gated; this was the
              hole.
            */}
            {!user ? (
              <button className="linkb" onClick={() => setAnalysis(true)}>
                Full analysis →
              </button>
            ) : null}
            {/* see `onMyTeam` above — the death match's five is the thing it is about */}
            {onMyTeam ? (
              <button className="linkb" onClick={onMyTeam}>
                My team →
              </button>
            ) : null}

            {boxOpen ? (
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

            {boxOpen && box ? (
              <>
                <PlayerLines title={teamName} tone="you" lines={box.usLines} />
                <PlayerLines title={opponent.team} tone="them" lines={box.themLines} />
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* The full-analysis sheet is `position: fixed; inset: 0` and belongs to no group; it stands
          outside the result grid so it is never sized by a grid track. */}
      {/* ONE NIGHT, IN FULL - his ruling, 2026-09-29: "After simming, make every game pressable, to
          see what happnenned in that game(Box score wise)."

          NOT A SECOND WAY OF SAYING THE SERIES. Everything already on this screen is an AVERAGE
          over the games played - "per game - 5 played" is written on the card that holds it - and
          an average is exactly what a filmstrip chip is not: G4 101-97 was a night, and until now
          the only thing the screen would tell him about it was its final score. This is that
          night's own box, rolled in the same pass as the rest of the series (`box.perGame`), so
          the five of them add up to the averages standing beside them.

          The same full-screen sheet the playbook and the board use, with the same DONE in its top
          bar. `Duel` and `PlayerLines` are the cards this screen already draws the series with -
          nothing here is a new way of reading a box, only a new box to read. */}
      {gameOpen !== null && box && box.perGame[gameOpen] ? (
        (() => {
          const g = box.perGame[gameOpen]
          const sc = scoresOf(result, tape ? { us: tape.us, them: tape.them } : null)[gameOpen]
          const won = result.games[gameOpen].won
          return (
            <div className="sheet sheet2 gamesheet" onClick={(e) => e.stopPropagation()}>
              <div className="topbar">
                <span>Game {gameOpen + 1}</span>
                <button onClick={() => setGameOpen(null)}>← Done</button>
              </div>
              <div className="rule2" />
              <div className="gs-score">
                <span className={`gs-side ${won ? 'you' : ''}`}>
                  <i>{teamName}</i>
                  <b>{sc.us}</b>
                </span>
                <em>{won ? 'won' : 'lost'}</em>
                <span className={`gs-side ${won ? '' : 'them'}`}>
                  <i>{opponent.team}</i>
                  <b>{sc.them}</b>
                </span>
              </div>
              <div className="card">
                <div className="card-head">
                  <span className="label">Where this one went</span>
                  <span className="cap">game {gameOpen + 1} of {result.games.length}</span>
                </div>
                <div className="duels">
                  <Duel label="Points" a={sc.us} b={sc.them} aText={String(sc.us)} bText={String(sc.them)} />
                  <Duel label="FG%" a={g.us.fgm / Math.max(1, g.us.fga)} b={g.them.fgm / Math.max(1, g.them.fga)} aText={pc(g.us.fgm, g.us.fga)} bText={pc(g.them.fgm, g.them.fga)} />
                  <Duel label="3P%" a={g.us.tpm / Math.max(1, g.us.tpa)} b={g.them.tpm / Math.max(1, g.them.tpa)} aText={pc(g.us.tpm, g.us.tpa)} bText={pc(g.them.tpm, g.them.tpa)} />
                  <Duel label="Rebounds" a={g.us.reb} b={g.them.reb} aText={f1(g.us.reb)} bText={f1(g.them.reb)} />
                  <Duel label="Assists" a={g.us.ast} b={g.them.ast} aText={f1(g.us.ast)} bText={f1(g.them.ast)} />
                  <Duel label="Turnovers" a={g.us.tov} b={g.them.tov} aText={f1(g.us.tov)} bText={f1(g.them.tov)} lowerBetter />
                </div>
              </div>
              {/* not "per game": one row here IS the game */}
              <PlayerLines title={teamName} tone="you" lines={g.usLines} per={`game ${gameOpen + 1}`} />
              <PlayerLines title={opponent.team} tone="them" lines={g.themLines} per={`game ${gameOpen + 1}`} />
            </div>
          )
        })()
      ) : null}
      {analysis ? <Analysis mine={five} theirs={opponent.players} assignment={assignment} sigma={sigma} myName={teamName} theirName={opponent.team} onClose={() => setAnalysis(false)} /> : null}

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
        ) : !settled ? (
          /* The ways on are not offered until the series has one - a NEXT LEVEL under a 2-1 strip
             is a door out of a night that has not finished happening. */
          <div className="dock-inner">
            <button className="btn ghost" onClick={skipReveal}>
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
              <button className="btn ghost" data-door="map" onClick={onAdvance}>
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
        ) : onNext ? (
          /* A WAY ON AND A WAY BACK, and no rematch — which is what a SWEPT level docks now (his
             ruling: "dont offer me rematch when I sweep"). Without this shape the missing rematch
             took the Next level door down with it, because the three-door case asks for both. */
          <div className="dock-inner two">
            <button className="btn ghost" data-door="map" onClick={onAdvance}>
              {mainLabel}
            </button>
            <button className="btn" onClick={onNext}>
              Next level
            </button>
          </div>
        ) : onRematch ? (
          /* TWO DOORS. The gold one is always the one on the right, and it is always the furthest
             forward thing on offer: after a win that is still his word for leaving (the stars are
             banked on the way), after a loss it is the rematch — "the obvious thing to want". */
          <div className="dock-inner two">
            <button className="btn ghost" data-door={result.won ? undefined : 'map'} onClick={result.won ? onRematch : onAdvance}>
              {result.won ? 'Rematch' : mainLabel}
            </button>
            <button className="btn" data-door={result.won ? 'map' : undefined} onClick={result.won ? onAdvance : onRematch}>
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
            <button className={`btn ${advanceLabel || result.won ? '' : 'ghost'}`} data-door="map" onClick={onAdvance}>
              {mainLabel}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
