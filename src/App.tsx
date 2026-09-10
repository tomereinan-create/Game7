import { useEffect, useState } from 'react'
import { CAP_LIMIT, ROUNDS, SIGMA } from './config'
import { achCheckMeta, achResetCampaign, achSettleSeries, onUnlocked, type AchDef } from './state/achievements'
import { Achievements } from './ui/Achievements'
import { TeamDb } from './ui/TeamDb'
import { odds } from './engine/odds'
import type { Tactics } from './engine/tactics'
import CAMPAIGNS from './data/campaigns.json'
import { applyMod, compile, meanMargin, simSeries, starsFor } from './engine/resolver'
import { aiTempo, boxContext, pace, reconcileTactics, tacticsMod } from './engine/tactics'
import { benchHeal, buy, capBonus, checkpointLevel, duraBoost, livesBought, paceMastery, playbookRank, respec, subsPerRound } from './engine/tree'
import type { Assignment } from './engine/offense'
import { Tree } from './ui/Tree'
import { makeRng, randomSeed } from './engine/rng'
import { PLAYERS } from './engine/pool'
import type { Lineup, Opponent, Player, SeriesResult } from './engine/types'
import type { BoxCtx } from './engine/boxstats'
import {
  advanceTo,
  applyWear,
  callsPlan,
  planFor,
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
import { useUserMode } from './state/viewmode'
import { Draft } from './ui/Draft'
import { Home, type Mode } from './ui/Home'
import { LevelMap, skinAt } from './ui/LevelMap'
import { MyTeam, orderFive } from './ui/MyTeam'
import { myColor } from './ui/teamColors'
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
  /** The noise the series was simmed at — paced (r57), not the bare SIGMA. A12. */
  sigma: number
  plan: Tactics | null
  pc: { ours: number; theirs: number; margin: number } | null
  /**
   * THE LEVEL THE RESULT SCREEN MAY ADVANCE TO, or null. His ruling: "Add a rematch button, and
   * advance(If you win your latest stage(not if you go back to a stage you already won))."
   *
   * Decided HERE, at the sim, and not on the result screen: settling is what MOVES the frontier,
   * so once finish() has written the stars every level just won looks like the latest one. The
   * rule itself is `advanceTo` in state/campaign.ts, reading the save as it stood before the ball
   * went up.
   */
  next: number | null
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
  /**
   * AUTO-COMPLETE (his ruling: "I want an auto complete mode to see the latter stages"). A way of
   * LOOKING at the ladder, and his second ruling makes that literal: "When moving the auto mode to
   * off, clear back all the completed stages and return to normal." So it BORROWS the ladder
   * rather than spending it — the real stars are kept here the moment it is switched on and put
   * back the moment it is switched off, and walking out of the campaign puts them back too.
   *
   * The mode itself is session state: it is a lens, not a setting, and it must not still be on
   * tomorrow waiting for a mis-tap.
   */
  const [auto, setAuto] = useState<{ mode: CampaignMode; stars: number[] } | null>(null)
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

  /**
   * USER MODE IS A ROOM, NOT A FILTER (his ruling: the design bundle's user mode). It used to be
   * subtractive — every screen deleted its ratings and left the hole. The bundle gives user mode
   * its own skin and its own copy, so the difference has to reach CSS that no component owns: the
   * ladder's club tickets, the jersey floor, the dockside rails. One class on the body says which
   * room we are in, and every `body.um` rule hangs off it.
   */
  const userMode = useUserMode()
  useEffect(() => {
    document.body.classList.toggle('um', userMode)
    return () => document.body.classList.remove('um')
  }, [userMode])

  /**
   * THE DOCK MEASURES ITSELF (E9). Nearly every screen ends in a dock fixed to the foot of the
   * window, and the page under it has to keep exactly that much floor clear or its last card is
   * read from under the gradient. That height was written down by hand in four bottom paddings —
   * 120px on a phone, 180 on a desk — and it was the height of a ONE-ROW dock. Every dock that is
   * not one row was covering content: the three-door result screen (two rows of buttons), which
   * bolted an empty spacer div under the page to make up the difference, and the two-button inner
   * that several screens stand on. A number copied into four stylesheet rules cannot follow the
   * shape of a button bar that changes per screen.
   *
   * So it is measured. The TALLEST dock standing — a sheet can carry its own on top of the page's —
   * goes to `--dock` on the root, and every bottom padding is `calc(var(--dock) + ...)`. No deps:
   * this runs after every render, which is every time a screen swaps, and a ResizeObserver on each
   * dock catches the shapes that change WITHOUT one (the draft's dock button growing to two rows
   * mid-spin). The write is synchronous in the effect body, so the padding is right in the same
   * frame the dock appears; the cleanup drops the token so the CSS fallback takes over again.
   *
   * ResizeObserver is guarded: it is everywhere this app ships, but a static render in a test has
   * no window at all, and one missing constructor must not take the whole app down.
   */
  useEffect(() => {
    const root = document.documentElement
    const write = () => {
      let tall = 0
      for (const d of document.querySelectorAll<HTMLElement>('.dock')) tall = Math.max(tall, d.getBoundingClientRect().height)
      // a screen with no dock at all (the map, the front door) hands the token back to the
      // stylesheet rather than collapsing the page's floor to nothing
      if (tall > 0) root.style.setProperty('--dock', `${Math.round(tall)}px`)
      else root.style.removeProperty('--dock')
    }
    write()
    const RO = typeof ResizeObserver === 'function' ? ResizeObserver : null
    const ro = RO ? new RO(write) : null
    if (ro) for (const d of document.querySelectorAll<HTMLElement>('.dock')) ro.observe(d)
    return () => {
      ro?.disconnect()
      root.style.removeProperty('--dock')
    }
  })

  const cm: CampaignMode | null = mode !== null && (MODES as string[]).includes(mode) ? (mode as CampaignMode) : null
  /**
   * A SCREEN THAT STANDS ON NO BLOCK (his ruling: "No more yellow and black. Anywhere black and
   * yellow change to either the according stage, or to black in 1 — home page theme"). A custom
   * matchup, the hot-seat table and the auction are not on the ladder, so they have no arena, hall,
   * hardwood or dusk to wear — and what they wore instead was the house: gold on near-black. They
   * take the front door's room instead, which is the room they were opened from.
   *
   * The condition is the one the home fab already used to decide whether to take a skin at all: no
   * campaign in play. The front door itself is `tunnel` and is not counted here.
   */
  useEffect(() => {
    const off = mode !== null && cm === null
    document.body.classList.toggle('offstage', off)
    return () => document.body.classList.remove('offstage')
  }, [mode, cm])

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
    if (!opponent || !prog || !cm || !level) return
    // Our defense is whatever the board assigned; the AI always plays optimal. On top of it comes
    // the PLAN, priced in points of spread like every other modifier — in ALL THREE MODES now (his
    // report: "Tactics arent visable in boths campaigns(Salary and normal)"). `planFor` is the one
    // rule: the death match always has a plan, everywhere else the Playbook node opens one, and
    // the names are read against the five that is actually playing. See state/campaign.ts.
    const plan = planFor(cm, prog, five.map((p) => p.name))
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
    const result = simSeries(mine, theirs, makeRng(seed), sig, toWin)
    setPending({
      five,
      mine,
      theirs,
      result,
      seed,
      assignment,
      boxCtx,
      pre,
      sigma: sig,
      plan,
      pc: pc ? { ours: pc.ours, theirs: pc.theirs, margin: pc.margin } : null,
      next: advanceTo(prog, level, result.won),
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

  /**
   * SETTLING THE NIGHT. A win keeps the better of old and new stars; a loss costs only the attempt.
   *
   * This used to be finish() itself, and finish() was the only door off the result screen. His
   * ruling — "Add a rematch button, and advance(If you win your latest stage…)" — opens two more,
   * and ALL THREE SETTLE FIRST: the stars, the record, the play count, the death match's wear and
   * the achievements are written right here, so a rematch that skipped it would throw away the
   * night he had just played. The doors differ only in where they leave him. Returns true when the
   * night really settled, so a door that cannot settle does not navigate either.
   */
  const settle = () => {
    if (!cm || !prog || !level || !pending) return false
    const stars = [...prog.stars]
    if (pending.result.won) stars[level - 1] = Math.max(stars[level - 1], starsFor(pending.result))
    /**
     * THE RECORD (his ruling: the draft's own card carries it beside the franchise name). Counted
     * here because this is the one place a series settles for all three modes, and counted per
     * NIGHT rather than per level: replaying a cleared level for a better star is another series
     * won or lost, and the record is what the franchise did, not which rungs it holds.
     */
    const rec = prog.record ?? { w: 0, l: 0 }
    const record = pending.result.won ? { w: rec.w + 1, l: rec.l } : { w: rec.w, l: rec.l + 1 }
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
      const next = { ...prog, stars, record, plays: prog.plays + 1, wear, subsUsed: 0 }
      const settled = pending.result.won ? { ...next, roster: names } : die(next)
      commit(cm, settled)
      settleAch(settled)
    } else {
      const settled = { ...prog, stars, record, plays: prog.plays + 1 }
      commit(cm, settled)
      settleAch(settled)
    }
    return true
  }

  /** His word, unchanged: settle the night and go back to the map. */
  const finish = () => {
    if (settle()) {
      setPending(null)
      setLevel(null)
    }
  }
  /**
   * REMATCH (his ruling: "Add a rematch button"). The same level again, straight from here, without
   * walking back to the map and tapping the ticket. It settles first and then simply keeps `level`
   * where it is, which drops him on the draft — and because settling bumped `plays`, `levelSeed`
   * spins a different wheel, exactly as a replay off the map does.
   */
  const rematch = () => {
    if (settle()) setPending(null)
  }
  /**
   * ADVANCE (his ruling: "and advance(If you win your latest stage(not if you go back to a stage
   * you already won))"). Straight into the next level's draft. WHICH level, and whether there is
   * one at all, was decided at the sim and is carried in `pending.next`; it settles first for the
   * same reason a rematch does.
   */
  const advance = () => {
    const to = pending?.next ?? null
    if (to !== null && settle()) {
      setPending(null)
      setLevel(to)
    }
  }

  /** Put the real ladder back. Called when auto is switched off, and on the way out of a campaign. */
  const autoOff = (a: { mode: CampaignMode; stars: number[] }) => {
    setProgress((all) => {
      const p = { ...all[a.mode], stars: a.stars }
      saveProgress(a.mode, p)
      return { ...all, [a.mode]: p }
    })
    setAuto(null)
  }

  /**
   * AND FLIPPING TO USER MODE PUTS IT BACK (his ruling, 2026-09-08: "Remove auto complete from all
   * user mode campaigns"). The map hides the auto door in user mode, and hiding a switch is only
   * safe if something else can still turn it off: `auto` is session state and it BORROWS the
   * ladder — every level marked cleared at one star — so a run left in user mode with auto still
   * on is a save that reads 150 cleared when three were played.
   *
   * Today the switch cannot strand it by accident, because the only doors to the view mode are on
   * the two home screens and every route home runs `leave`, which already puts the ladder back.
   * That is where the switch HAPPENS to live, not a rule about it, and it is one new door away
   * from being false — so the mode itself says no rather than the route to it. The flip is a
   * switch-off, through the same `autoOff` the door calls, so the stars that come back are exactly
   * the ones that were taken. It sits above every early return in this component so that it runs
   * whether or not a campaign is open.
   */
  useEffect(() => {
    if (userMode && auto) autoOff(auto)
    // `autoOff` is redefined every render and is not a dependency: `auto` going null ends this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMode, auto])

  const leave = () => {
    // walking home with auto still on would leave a borrowed ladder in the save
    if (auto) autoOff(auto)
    setMode(null)
    setLevel(null)
    setPending(null)
    setPickTeam(false)
    setStaff(false)
    setMyTeam(false)
    // H1: the four overlay flags were NOT cleared here, so an overlay opened from the front door
    // survived the walk home and could still be mounted over a campaign screen. Defence in depth —
    // the trophy case is a real .sheet now and freezes the page behind it — but the database is
    // deliberately in-flow (see the note at .tdb-sheet), so nothing else stops that one.
    setRoster(false)
    setArchs(false)
    setAch(false)
    setTeamDb(false)
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
    /* HIS RULING: "The home and map icons should be the same design as the stage." The two fabs
       are painted out of --you / --surface-2 / --line-3, which the skinned screens already
       re-point on the body — but the MAP itself is not a skinned body (it paints a floor per
       block, not one for the page), so on the one screen the icon is read against four different
       floors it stayed house gold. It carries the block's own skin as a class instead, which
       works on every screen whether the body is skinned or not — and only inside a CAMPAIGN: a
       custom matchup, a hot-seat table and the auction stand on no block of the ladder, so an
       ember or a mint disc there would be naming a room they are not in. */
    <button className={`home-fab ${cm ? skin : ''}`} onClick={leave} aria-label="Home" title="Home">
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
          /* his ruling: the five stands in the colours picked when the campaign was started */
          club={myColor(prog.team)}
          /* his ruling: the way back to the map is the block's own map icon here too */
          skin={skin}
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
          auto={!!auto}
          onToggleAuto={() => (auto ? autoOff(auto) : setAuto({ mode: cm, stars: prog.stars }))}
          onAutoTo={(level) => {
            // one star for every level up to the one tapped, and never less than already earned
            commit(cm, { ...prog, stars: prog.stars.map((s, i) => (i < level ? Math.max(s, 1) : s)) })
          }}
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
    /**
     * THE TWO NEW DOORS OFF THE RESULT (his ruling: "Add a rematch button, and advance(If you win
     * your latest stage(not if you go back to a stage you already won))").
     *
     * ADVANCE is offered when `pending.next` names a level — the rule is `advanceTo` in
     * state/campaign.ts and it was read at the sim, off the save as it stood before the night
     * settled. A loss, a replay of a stage already won, and level 150 all come back null there.
     *
     * REMATCH is offered whatever the result — after a loss it is the obvious thing to want, after
     * a win it is how a better star is chased — with ONE exception, and it is the conservative
     * reading of a subtle case. A death-match loss with no lives left runs `die()`, which resets
     * the whole run: no stars, no five, no tree. Offering to replay the level a dead run died on
     * would be offering to resurrect it, so the death match's last loss keeps its single door back
     * to the map. A loss the run survives (a life absorbed it) still rematches like any other.
     */
    const runEnded = death && !pending.result.won && prog.lives === 0
    return (
      <>
        {sheet}
        {homeFab}
        <Series
          boxCtx={pending.boxCtx ?? null}
          sigma={pending.sigma}
          opponent={opponent}
          five={pending.five}
          mine={pending.mine}
          theirs={pending.theirs}
          teamName={teamName}
          result={pending.result}
          seed={pending.seed}
          skin={skin}
          assignment={pending.assignment}
          onAdvance={finish}
          onRematch={runEnded ? undefined : rematch}
          onNext={pending.next !== null ? advance : undefined}
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
        /* THE PLAN REACHES THE DRAFT IN EVERY MODE THAT HAS ONE (his report: "Tactics arent
           visable in boths campaigns(Salary and normal)"). `callsPlan` is the same rule the sim
           reads, so the odds card here and the margin there can never disagree; the draft gates
           and reconciles it against its own five, which is the only five it knows. */
        tactics={callsPlan(cm, prog) ? prog.tactics : null}
        /* AND THE CAMPAIGN AND THE CAP CALL IT HERE. My team is the death match's room — it exists
           for a five that is carried, its durability, the one change a round and the bench — and a
           mode that drafts a fresh five every level has none of that. But a PLAN is not a roster:
           it is a call about the five about to play, so it belongs where that five is chosen and
           where it is already priced. The death match keeps calling it in My team and is handed no
           door here, so nothing about that mode moves. */
        onTactics={death ? undefined : (t) => commit(cm, { ...prog, tactics: t })}
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
        /* The worn-out door. My team only renders with no level open (it is the map's room, not
           the draft's), so this closes the level on the way — and it does NOT spend the attempt
           the way walking out does: a five with a worn-out man in it cannot take the floor at
           all, so this is not a peek at the roster, it is the only move left. */
        onMyTeam={death && prog.roster ? () => { setLevel(null); setMyTeam(true) } : undefined}
      />
    </>
  )
}
