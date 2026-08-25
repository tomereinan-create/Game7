import { useState } from 'react'
import { ROUNDS, SIGMA } from './config'
import { coachById } from './data/coaches'
import CAMPAIGNS from './data/campaigns.json'
import { applyMod, compile, simGame, simSeries, starsFor } from './engine/resolver'
import { buy, checkpointLevel, livesBought, respec, subsPerRound } from './engine/tree'
import type { Assignment } from './engine/offense'
import { Tree } from './ui/Tree'
import { makeRng, randomSeed } from './engine/rng'
import { PLAYERS } from './engine/pool'
import type { CoachId, GameResult, Lineup, Opponent, Player, SeriesResult } from './engine/types'
import {
  applyWear,
  die,
  levelSeed,
  loadProgress,
  MODES,
  resetProgress,
  saveProgress,
  totalStars,
  type CampaignMode,
  type Progress,
  type Team,
} from './state/campaign'
import { CoachSelect } from './ui/CoachSelect'
import { Draft } from './ui/Draft'
import { Home, type Mode } from './ui/Home'
import { LevelMap } from './ui/LevelMap'
import { Archetypes } from './ui/Archetypes'
import { Roster } from './ui/Roster'
import { Series } from './ui/Series'
import { TeamSetup } from './ui/TeamSetup'
import { Custom } from './ui/Custom'
import { Versus } from './ui/Versus'

interface Tier {
  id: string
  name: string
  years: [number, number]
  handicap: number
  blurb: string
  levels: Opponent[]
}
const TIERS = CAMPAIGNS as unknown as Tier[]
/** One campaign: the four era blocks in order, levels renumbered 1..120, each carrying its era and handicap. */
export const LEVELS: Opponent[] = TIERS.flatMap((t, ti) =>
  t.levels.map((o, i) => ({ ...o, round: ti * t.levels.length + i + 1, era: t.name, handicap: t.handicap })),
)
export const ERAS = TIERS.map((t, ti) => ({ name: t.name, years: t.years, handicap: t.handicap, first: ti * t.levels.length + 1 }))
const TITLE = (m: CampaignMode) => (m === 'salary' ? 'Salary Cap Campaign' : 'Campaign')

interface Pending {
  five: Player[]
  mine: Lineup
  theirs: Lineup
  result: SeriesResult
  seed: number
  assignment: Assignment
}


export default function App() {
  // Which front-door mode is active. The two campaigns share every screen
  // after Home; only the save slot and the salary line differ.
  const [mode, setMode] = useState<Mode | null>(null)
  const [progress, setProgress] = useState<Record<CampaignMode, Progress>>(
    () => Object.fromEntries(MODES.map((m) => [m, loadProgress(m)])) as Record<CampaignMode, Progress>,
  )
  const [level, setLevel] = useState<number | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  /**
   * DEATH MATCH: a series in progress. The five can change between games, so the series cannot be
   * simmed in one go — it is played a game at a time and this holds the score while it is live.
   */
  const [run, setRun] = useState<{ games: GameResult[]; wins: number; losses: number; five: string[]; toWin: number; sigma: number; assignment: Assignment } | null>(null)
  const [pickCoach, setPickCoach] = useState(false)
  const [pickTeam, setPickTeam] = useState(false)
  const [staff, setStaff] = useState(false)
  const [roster, setRoster] = useState(false)
  const [archs, setArchs] = useState(false)

  const cm: CampaignMode | null = mode !== null && (MODES as string[]).includes(mode) ? (mode as CampaignMode) : null
  /** The death match runs ON the salary cap: same payroll rules, with the run on the line. */
  const death = cm === 'death'
  const capped = cm === 'salary' || death
  const opponents = LEVELS
  const prog = cm ? progress[cm] : null
  const coach = coachById(prog?.coach ?? 'def')
  const opponent = level ? opponents[Math.min(level, ROUNDS) - 1] : null
  /** Death match: last level's five, ready to be carried in. Null at the start of a run. */
  const carried = death && prog?.roster ? (prog.roster.map((n) => PLAYERS.find((p) => p.name === n)).filter(Boolean) as Player[]) : null
  const carry = carried && carried.length === 5 ? carried : null

  const commit = (m: CampaignMode, p: Progress) => {
    saveProgress(m, p)
    setProgress((all) => ({ ...all, [m]: p }))
  }

  const setTeam = (t: Team) => {
    if (!cm || !prog) return
    commit(cm, { ...prog, team: t })
    setPickTeam(false)
  }
  const teamName = prog?.team ? `${prog.team.city} ${prog.team.name}` : 'Your team'

  const setCoach = (c: CoachId) => {
    if (!cm || !prog) return
    commit(cm, { ...prog, coach: c })
    setPickCoach(false)
  }

  const sim = (five: Player[], assignment: Assignment, toWin: number, sigma?: number) => {
    if (!opponent || !prog || !cm) return
    // Our defense is whatever the coach (or the board) assigned; the AI always plays optimal.
    const mine = applyMod(compile(five, opponent.players, assignment), coach.mod)
    // The era's handicap: points of spread the opponent brings to every game of this campaign.
    const theirs = applyMod(compile(opponent.players, five), { bonus: opponent.handicap ?? 0 })
    const seed = randomSeed()
    const sig = sigma ?? coach.sigma ?? SIGMA
    if (!death) {
      setPending({ five, mine, theirs, result: simSeries(mine, theirs, makeRng(seed), sig, toWin), seed, assignment })
      return
    }
    // DEATH MATCH: one game. Every man on the floor loses a point of durability for playing it.
    // Same five, possibly in a different slot order: the draft re-seeds positions from the carried
    // roster each game, so the order is not stable. Identity is the SET of men, not their sequence.
    const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
    const prior = run && same(run.five, five.map((p) => p.name)) ? run : null
    const games = [...(prior?.games ?? [])]
    const g = simGame(mine, theirs, makeRng(seed), sig, games.length + 1)
    games.push(g)
    const wins = (prior?.wins ?? 0) + (g.won ? 1 : 0)
    const losses = (prior?.losses ?? 0) + (g.won ? 0 : 1)
    const names = five.map((p) => p.name)
    const wear = applyWear(prog.wear, names, 1, (n) => PLAYERS.find((p) => p.name === n)?.attrs.durability ?? 50)
    commit(cm, { ...prog, wear, roster: names })
    const next = { games, wins, losses, five: names, toWin, sigma: sig, assignment }
    setRun(next)
    if (wins >= toWin || losses >= toWin) {
      // the series is decided: hand the accumulated games to the normal result screen
      setPending({ five, mine, theirs, result: { games, wins, losses, won: wins >= toWin, toWin }, seed, assignment })
      setRun(null)
    }
  }


  /** Back to the map. A win keeps the better of old and new stars; a loss costs only the attempt. */
  const finish = () => {
    if (!cm || !prog || !level || !pending) return
    const stars = [...prog.stars]
    if (pending.result.won) stars[level - 1] = Math.max(stars[level - 1], starsFor(pending.result))
    if (death) {
      // Durability was already spent game by game as they were played; nothing more to charge here.
      const names = pending.five.map((p) => p.name)
      const next = { ...prog, stars, plays: prog.plays + 1 }
      commit(cm, pending.result.won ? { ...next, roster: names } : die(next))
      setRun(null)
    } else {
      commit(cm, { ...prog, stars, plays: prog.plays + 1 })
    }
    setPending(null)
    setLevel(null)
  }

  const leave = () => {
    setMode(null)
    setLevel(null)
    setPending(null)
    setPickCoach(false)
    setPickTeam(false)
    setStaff(false)
  }

  // The roster is an overlay, not a screen: leaving the draft to look something
  // up must not throw away the picks already made.
  const sheet = roster ? <Roster onBack={() => setRoster(false)} /> : archs ? <Archetypes onBack={() => setArchs(false)} /> : null

  if (mode === null) {
    return (
      <>
        {sheet}
        <Home
          progress={progress}
          onPick={(m) => {
            if (m === 'database') setRoster(true)
            else if (m === 'archetypes') setArchs(true)
            else setMode(m)
          }}
        />
      </>
    )
  }

  // One home icon, pinned top-right on every screen but Home.
  const homeFab = (
    <button className="home-fab" onClick={leave} aria-label="Home" title="Home">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 10.5V20h13v-9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M10 20v-5.5h4V20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  )

  if (mode === 'custom')
    return (
      <>
        {sheet}
        {homeFab}
        <Custom onHome={leave} />
      </>
    )

  if (mode === 'versus' || !cm || !prog)
    return (
      <>
        {homeFab}
        <Versus onHome={leave} />
      </>
    )

  if (prog.team === null || pickTeam) {
    return (
      <>
        {sheet}
        {homeFab}
        <TeamSetup
          title={TITLE(cm)}
          initial={prog.team}
          onDone={setTeam}
          onBack={pickTeam ? () => setPickTeam(false) : leave}
        />
      </>
    )
  }

  if (prog.coach === null || pickCoach) {
    return (
      <>
        {sheet}
        {homeFab}
        <CoachSelect
          best={prog.stars.filter((s) => s > 0).length}
          onStart={setCoach}
          onRoster={() => setRoster(true)}
        />
      </>
    )
  }

  if (staff && (!level || !opponent)) {
    return (
      <>
        {sheet}
        {homeFab}
        <Tree
          wallet={prog}
          salary={capped}
          death={death}
          onBuy={(id) => {
            const next = buy(prog, id)
            if (!next) return
            // Survival nodes take effect the moment they are bought: a life bought is a life in hand,
            // and a checkpoint bought is ground you can no longer lose.
            commit(cm, death ? { ...next, lives: livesBought(next), checkpoint: checkpointLevel(next) } : next)
          }}
          onRespec={() => {
            if (window.confirm(`Reset your staff? All ${prog.spent} stars come back and every node is unlearned.`)) commit(cm, respec(prog))
          }}
          onBack={() => setStaff(false)}
        />
      </>
    )
  }

  if (!level || !opponent) {
    return (
      <>
        {sheet}
        {homeFab}
        <LevelMap
          title={TITLE(cm)}
          progress={prog}
          opponents={opponents}
          eras={ERAS}
          coachName={coach.name}
          teamName={teamName}
          onPlay={setLevel}
          onCoach={() => setPickCoach(true)}
          onTeam={() => setPickTeam(true)}
          onStaff={() => setStaff(true)}
          onReset={() => {
            if (window.confirm(`Reset the ${TITLE(cm)}? All 120 levels and their stars start over.`)) {
              setProgress((all) => ({ ...all, [cm]: resetProgress(cm) }))
            }
          }}
        />
      </>
    )
  }

  if (pending) {
    return (
      <>
        {sheet}
        {homeFab}
        <Series
          opponent={opponent}
          five={pending.five}
          mine={pending.mine}
          theirs={pending.theirs}
          teamName={teamName}
          result={pending.result}
          seed={pending.seed}
          assignment={pending.assignment}
          onAdvance={finish}
        />
      </>
    )
  }

  return (
    <>
      {sheet}
      {homeFab}
      <Draft
        // the game number is part of the identity: each break between games is a FRESH screen, so the
        // change allowance, the wheel and the slots all reset and re-seed from the five as it stands now
        key={`${cm}-${level}-${prog.plays}-${run?.games.length ?? 0}`}
        opponent={opponent}
        seed={levelSeed(prog, level)}
        coach={coach}
        handicap={opponent.handicap ?? 0}
        stars={totalStars(prog)}
        teamName={teamName}
        salary={capped}
        wallet={prog}
        carry={carry}
        subs={subsPerRound(prog)}
        wear={prog.wear}
        series={run ? { games: run.games, wins: run.wins, losses: run.losses, toWin: run.toWin } : null}
        onSim={sim}
        onBack={(started) => {
          // The staff tree lives on the map only. Walking out of a draft with picks on the
          // board is allowed, but it spends the attempt: the wheel reseeds, so there is no
          // peeking at a roster, buying a node, and coming back to the same spin.
          if (started) {
            if (!window.confirm('Leave this draft? Your picks are lost and the wheel reseeds.')) return
            commit(cm, { ...prog, plays: prog.plays + 1 })
          }
          setLevel(null)
        }}
        onRoster={() => setRoster(true)}
      />
    </>
  )
}
