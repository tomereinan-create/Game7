import { useEffect, useState } from 'react'
import { CAP_LIMIT, ROUNDS, SIGMA } from './config'
import { achCheckMeta, achResetCampaign, achSettleSeries, onUnlocked, type AchDef } from './state/achievements'
import { Achievements } from './ui/Achievements'
import { TeamDb } from './ui/TeamDb'
import { odds } from './engine/odds'
import type { Tactics } from './engine/tactics'
import CAMPAIGNS from './data/campaigns.json'
import { applyMod, compile, meanMargin, simSeries, starsFor } from './engine/resolver'
import { aiTempo, boxContext, gateTactics, pace, reconcileTactics, tacticsMod } from './engine/tactics'
import { benchHeal, buy, capBonus, checkpointLevel, duraBoost, livesBought, paceMastery, playbookRank, respec, subsPerRound } from './engine/tree'
import type { Assignment } from './engine/offense'
import { Tree } from './ui/Tree'
import { makeRng, randomSeed } from './engine/rng'
import { PLAYERS } from './engine/pool'
import type { Lineup, Opponent, Player, SeriesResult } from './engine/types'
import type { BoxCtx } from './engine/boxstats'
import {
  applyWear,
  WEAR_OUT,
  currentLevel,
  die,
  levelSeed,
  loadProgress,
  MODES,
  resetProgress,
  saveProgress,
  starsFromUrl,
  type CampaignMode,
  type Progress,
  type Team,
} from './state/campaign'
import { Draft } from './ui/Draft'
import { Home, type Mode } from './ui/Home'
import { LevelMap, skinAt } from './ui/LevelMap'
import { MyTeam, orderFive } from './ui/MyTeam'
import { Archetypes } from './ui/Archetypes'
import { Roster } from './ui/Roster'
import { Series } from './ui/Series'
import { TeamSetup } from './ui/TeamSetup'
import { Custom } from './ui/Custom'
import { Versus } from './ui/Versus'
import { Auction } from './ui/Auction'

interface Tier {
  id: string
  name: string
  years: [number, number]
  blurb: string
  levels: Opponent[]
}
const TIERS = CAMPAIGNS as unknown as Tier[]
/**
 * One campaign: the four tiers in order, levels renumbered 1..ROUNDS, each carrying its tier name.
 * THE TIERS ARE NOT THE SAME LENGTH any more — his ruling put sixty champions in the
 * middle of a ladder of thirties — so the offsets are a running total. They used to be `ti *
 * t.levels.length`, which is only right while every tier is thirty and silently overlaps levels
 * the moment one is not.
 */
const FIRST: number[] = []
TIERS.reduce((n, t) => (FIRST.push(n + 1), n + t.levels.length), 0)
export const LEVELS: Opponent[] = TIERS.flatMap((t, ti) =>
  t.levels.map((o, i) => ({ ...o, round: FIRST[ti] + i, era: t.name })),
)
export const ERAS = TIERS.map((t, ti) => ({ name: t.name, years: t.years, first: FIRST[ti] }))
/** The one place a mode becomes a label — every screen (map, team setup, achievements) reads it. */
export const TITLE = (m: CampaignMode) => (m === 'salary' ? 'Salary Cap Campaign' : m === 'death' ? 'Death Match' : 'Campaign')

interface Pending {
  boxCtx?: { us: BoxCtx; them: BoxCtx } | null
  five: Player[]
  mine: Lineup
  theirs: Lineup
  result: SeriesResult
  seed: number
  assignment: Assignment
  /** Achievements read the moment of the sim: the resolver's pre-series odds and the called plan. */
  pre: number
  plan: Tactics | null
  pc: { ours: number; theirs: number; margin: number } | null
}


export default function App() {
  // Which front-door mode is active. The two campaigns share every screen
  // after Home; only the save slot and the salary line differ.
  const [mode, setMode] = useState<Mode | null>(null)
  const [progress, setProgress] = useState<Record<CampaignMode, Progress>>(() => {
    const all = Object.fromEntries(MODES.map((m) => [m, loadProgress(m)])) as Record<CampaignMode, Progress>
    // `?stars=1` marks the whole ladder cleared at one star — his door onto the later blocks.
    starsFromUrl(all)
    return all
  })
  const [level, setLevel] = useState<number | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [pickTeam, setPickTeam] = useState(false)
  const [staff, setStaff] = useState(false)
  const [myTeam, setMyTeam] = useState(false)
  const [roster, setRoster] = useState(false)
  const [archs, setArchs] = useState(false)
  const [ach, setAch] = useState(false)
  const [teamDb, setTeamDb] = useState(false)
  // unlock toasts: the trophy case speaks once, quietly, then leaves
  const [toasts, setToasts] = useState<AchDef[]>([])
  useEffect(
    () =>
      onUnlocked((d) => {
        setToasts((t) => [...t, d])
        window.setTimeout(() => setToasts((t) => t.filter((x) => x !== d)), 5000)
      }),
    [],
  )

  const cm: CampaignMode | null = mode !== null && (MODES as string[]).includes(mode) ? (mode as CampaignMode) : null
  /** The death match runs ON the salary cap: same payroll rules, with the run on the line. */
  const death = cm === 'death'
  const capped = cm === 'salary' || death
  const opponents = LEVELS
  const prog = cm ? progress[cm] : null
  const opponent = level ? opponents[Math.min(level, ROUNDS) - 1] : null
  /**
   * WHICH BLOCK THE CAMPAIGN IS STANDING IN, as a skin. The map has worn one per block of thirty
   * since the four-skins ruling; his ruling here — "Make the skill tree and the drafting (spin) the
   * same design as your current stage" — hands the same skin to the two screens the map opens into,
   * so a level, its draft and the staff room between them are all one room. A draft opened on a
   * level takes THAT level's skin (replaying level 4 from the dusk block is still an arena night);
   * with no level open it is wherever the ladder has got to, and a cleared ladder keeps the top.
   */
  const skin = skinAt(level ?? (prog ? (currentLevel(prog) ?? ROUNDS) : 1))
  /** Death match: last level's five, ready to be carried in. Null at the start of a run. */
  // the roster is kept in SLOT ORDER (PG to C); a saved order that no longer fields re-derives here
  const carried = death && prog?.roster ? (orderFive(prog.roster).map((n) => PLAYERS.find((p) => p.name === n)).filter(Boolean) as Player[]) : null
  const carry = carried && carried.length === 5 ? carried : null

  const commit = (m: CampaignMode, p: Progress) => {
    saveProgress(m, p)
    setProgress((all) => ({ ...all, [m]: p }))
    // the cheap achievement checks (stars banked, branches owned) fire on every save
    achCheckMeta(p, `${p.team ? `${p.team.city} ${p.team.name}` : 'Your team'} · ${TITLE(m)}`)
  }

  const setTeam = (t: Team) => {
    if (!cm || !prog) return
    commit(cm, { ...prog, team: t })
    setPickTeam(false)
  }
  const teamName = prog?.team ? `${prog.team.city} ${prog.team.name}` : 'Your team'

  const sim = (five: Player[], assignment: Assignment, toWin: number) => {
    if (!opponent || !prog || !cm) return
    // Our defense is whatever the board assigned; the AI always plays optimal. The death match
    // adds the My team plan, priced in points of spread like every other modifier.
    const plan = death ? gateTactics(prog.tactics, playbookRank(prog)) : null
    const base = compile(five, opponent.players, assignment)
    const theirs = compile(opponent.players, five)
    // PACE (recal_57): both teams pick a tempo — the AI reads the surpluses and answers — and the
    // night gets a relative volume-surplus term plus a variance shift, replacing the flat sigma map.
    const pc = plan ? pace(plan.tempo, aiTempo(opponent.players, five, meanMargin(theirs, base) < 0), five, opponent.players, paceMastery(prog)) : null
    const mine = plan ? applyMod(base, { ...tacticsMod(plan, five, opponent.players), bonus: (tacticsMod(plan, five, opponent.players).bonus ?? 0) + (pc?.margin ?? 0) }) : base
    const seed = randomSeed()
    const sig = pc ? SIGMA * pc.sigmaMult : SIGMA
    // Every mode sims the series entirely — the death match included (his ruling). Its wear is
    // charged when the series settles, in finish(), one durability per game it ran. The box scores
    // consume the tactical state (recal_61), so the context is captured at the moment of the sim.
    const boxCtx = plan && pc ? boxContext(plan, pc.lvl, five, opponent.players, assignment) : null
    const pre = odds(mine, theirs, sig, toWin).series
    setPending({
      five,
      mine,
      theirs,
      result: simSeries(mine, theirs, makeRng(seed), sig, toWin),
      seed,
      assignment,
      boxCtx,
      pre,
      plan,
      pc: pc ? { ours: pc.ours, theirs: pc.theirs, margin: pc.margin } : null,
    })
  }


  /** Achievements settle where the series does — everything they read was captured at sim time. */
  const settleAch = (nextProg: Progress) => {
    if (!cm || !prog || !level || !pending || !opponent) return
    achSettleSeries({
      mode: cm,
      team: `${teamName} · ${TITLE(cm)}`,
      level,
      five: pending.five,
      opponent,
      result: pending.result,
      seed: pending.seed,
      pre: pending.pre,
      plan: pending.plan,
      pc: pending.pc,
      boxCtx: pending.boxCtx ?? null,
      assignment: pending.assignment,
      prevProg: prog,
      nextProg,
    })
  }

  /** Back to the map. A win keeps the better of old and new stars; a loss costs only the attempt. */
  const finish = () => {
    if (!cm || !prog || !level || !pending) return
    const stars = [...prog.stars]
    if (pending.result.won) stars[level - 1] = Math.max(stars[level - 1], starsFor(pending.result))
    if (death) {
      // The series is simmed in one piece now, so its cost lands in one piece too: every man who
      // played loses one durability per game the series ran. The My team spin resets — one change
      // between series, spent there and nowhere else.
      const names = pending.five.map((p) => p.name)
      const wear = applyWear(prog.wear, names, pending.result.games.length, (n) => PLAYERS.find((p) => p.name === n)?.attrs.durability ?? 50)
      // THE BENCH HEALS. The sixth man played nothing, so he takes no wear — and each settled
      // series restores him, capped at his own card's durability, never past it.
      const heal = benchHeal(prog)
      if (prog.bench && heal > 0) {
        const cap = PLAYERS.find((p) => p.name === prog.bench)?.attrs.durability ?? 50
        wear[prog.bench] = Math.min(cap, (wear[prog.bench] ?? cap) + heal)
      }
      const next = { ...prog, stars, plays: prog.plays + 1, wear, subsUsed: 0 }
      const settled = pending.result.won ? { ...next, roster: names } : die(next)
      commit(cm, settled)
      settleAch(settled)
    } else {
      const settled = { ...prog, stars, plays: prog.plays + 1 }
      commit(cm, settled)
      settleAch(settled)
    }
    setPending(null)
    setLevel(null)
  }

  const leave = () => {
    setMode(null)
    setLevel(null)
    setPending(null)
    setPickTeam(false)
    setStaff(false)
    setMyTeam(false)
  }

  // The roster is an overlay, not a screen: leaving the draft to look something
  // up must not throw away the picks already made.
  const sheet = (
    <>
      {roster ? <Roster onBack={() => setRoster(false)} /> : archs ? <Archetypes onBack={() => setArchs(false)} /> : ach ? <Achievements onBack={() => setAch(false)} /> : teamDb ? <TeamDb onBack={() => setTeamDb(false)} /> : null}
      {toasts.length ? (
        <div className="ach-toasts">
          {toasts.map((d) => (
            <div className="ach-toast" key={d.id}>
              <i>Achievement · {d.tier}</i>
              <b>{d.name}</b>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )

  if (mode === null) {
    return (
      <>
        {sheet}
        <Home
          progress={progress}
          onPick={(m) => {
            if (m === 'database') setRoster(true)
            else if (m === 'archetypes') setArchs(true)
            else if (m === 'achievements') setAch(true)
            else if (m === 'teams') setTeamDb(true)
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

  if (mode === 'auction')
    return (
      <>
        {sheet}
        {homeFab}
        <Auction onHome={leave} />
      </>
    )

  if (mode === 'versus' || !cm || !prog)
    return (
      <>
        {sheet}
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

  // DEATH MATCH: the team screen. The five with their durability, and the round's one spin.
  if (myTeam && death && carry && (!level || !opponent)) {
    return (
      <>
        {sheet}
        {homeFab}
        <MyTeam
          five={carry}
          wear={prog.wear}
          boost={duraBoost(prog)}
          tactics={prog.tactics}
          playbook={playbookRank(prog)}
          bench={prog.bench ? (PLAYERS.find((x) => x.name === prog.bench) ?? null) : null}
          benchOpen={benchHeal(prog) > 0}
          heal={benchHeal(prog)}
          onSign={(inn) => commit(cm, { ...prog, bench: inn })}
          onRest={(floorName) => {
            // the free exchange the node sells: the floor man sits, the rested man takes his place
            if (!prog.roster || !prog.bench) return
            const roster = orderFive(prog.roster.map((n) => (n === floorName ? prog.bench! : n)))
            commit(cm, { ...prog, roster, bench: floorName, tactics: reconcileTactics(prog.tactics, roster) })
          }}
          onTactics={(t) => commit(cm, { ...prog, tactics: t })}
          allowed={subsPerRound(prog)}
          used={prog.subsUsed}
          capMax={CAP_LIMIT + capBonus(prog)}
          onSpend={() => commit(cm, { ...prog, subsUsed: prog.subsUsed + 1 })}
          onSwap={(out, inn) => {
            if (!prog.roster) return
            const wear = { ...prog.wear }
            delete wear[out]
            if (out === prog.bench) {
              // the wheel replaced the resting man, not a floor man
              commit(cm, { ...prog, bench: inn, wear })
              return
            }
            const roster = orderFive(prog.roster.map((n) => (n === out ? inn : n)))
            // the departed man may have been the named scorer or playmaker
            commit(cm, { ...prog, roster, wear, tactics: reconcileTactics(prog.tactics, roster) })
          }}
          onReorder={(next) => commit(cm, { ...prog, roster: next })}
          onBack={() => setMyTeam(false)}
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
          skin={skin}
          onBuy={(id) => {
            const next = buy(prog, id)
            if (!next) return
            // Survival nodes take effect the moment they are bought: a life bought is a life in hand,
            // and a checkpoint bought is ground you can no longer lose.
            commit(cm, death ? { ...next, lives: livesBought(next), checkpoint: checkpointLevel(next) } : next)
          }}
          onRespec={() => commit(cm, respec(prog))}
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
          teamName={teamName}
          onPlay={setLevel}
          onTeam={() => setPickTeam(true)}
          onStaff={() => setStaff(true)}
          salary={capped}
          death={death}
          onMyTeam={death && prog.roster ? () => setMyTeam(true) : undefined}
          teamNote={
            death && prog.roster
              ? (() => {
                  // the same reading My team and the draft use: raw durability plus the Iron men boost
                  const left = (n: string) => (prog.wear[n] ?? PLAYERS.find((p) => p.name === n)?.attrs.durability ?? 99) + duraBoost(prog)
                  const worn = prog.roster.filter((n) => left(n) <= WEAR_OUT).length
                  if (worn) return worn === 1 ? 'A man is worn out — replace him in My team' : `${worn} men are worn out — My team`
                  if (subsPerRound(prog) - prog.subsUsed > 0) return 'A change is waiting in My team'
                  return null
                })()
              : null
          }
          onReset={() => {
            // the two-tap arming lives in the map's Reset button itself — no browser popup
            achResetCampaign(cm)
            setProgress((all) => ({ ...all, [cm]: resetProgress(cm) }))
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
          boxCtx={pending.boxCtx ?? null}
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
        key={`${cm}-${level}-${prog.plays}`}
        opponent={opponent}
        seed={levelSeed(prog, level)}
        teamName={teamName}
        salary={capped}
        skin={skin}
        wallet={prog}
        carry={carry}
        wear={prog.wear}
        spinLeft={death && !!carry && subsPerRound(prog) - prog.subsUsed > 0}
        death={death}
        tactics={death ? prog.tactics : null}
        onSim={sim}
        onBack={(started) => {
          // The staff tree lives on the map only. Walking out of a draft with picks on the
          // board is allowed, but it spends the attempt: the wheel reseeds, so there is no
          // peeking at a roster, buying a node, and coming back to the same spin. No popup —
          // window.confirm never renders on his phone, which froze the Map button (his report).
          if (started) commit(cm, { ...prog, plays: prog.plays + 1 })
          setLevel(null)
        }}
        onRoster={() => setRoster(true)}
      />
    </>
  )
}
