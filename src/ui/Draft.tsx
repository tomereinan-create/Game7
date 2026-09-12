import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import SALARIES from '../data/salaries.json'
import { WHEEL, type TeamSeason } from '../data/wheel'
import { CAP_LIMIT, CAP_RESERVE, DRAFT_SIZE, SIGMA } from '../config'
import { archetype, PLAYERS } from '../engine/pool'
import { teamCode } from '../engine/names'
import { useLayout } from './useLayout'
import { eligible, POSITIONS, type Pos } from '../engine/positions'
import { canMoveSlot, moveSlot } from '../engine/slots'
import { odds } from '../engine/odds'
import { Analysis } from './Analysis'
import { Ask } from './Ask'
import { useCard } from './CardSheet'
import { CourtFive, type Side } from './CourtFive'
import { ChipRow } from './ChipRow'
import { isRateable, naiveAssignment, RATEABLE, solveBoard, type Assignment } from '../engine/offense'
import { aiTempo, DEFAULT_TACTICS, gateTactics, pace, reconcileTactics, styleFit, STYLES, tacticsMod, type Tactics } from '../engine/tactics'
import { capBonus, duraBoost, owned, paceMastery, playbookRank, rank, respinSeason, type NodeId } from '../engine/tree'
import { WEAR_OUT, type Progress } from '../state/campaign'
import { Matchups } from './Matchups'
import { TacticsCalls, tacticsWorth, worthLine } from './TacticsPanel'
import { MatchupPanel, TeamDials } from './MatchupPanel'
import { applyMod, compile, meanMargin } from '../engine/resolver'
import { makeRng } from '../engine/rng'
import type { Opponent, Player } from '../engine/types'
import { DetailGrid, LINES, Mini, StatHead } from './Stat'
import { useUserMode } from '../state/viewmode'
// COACHING TIPS is all this screen takes off the rail now (his ruling, 2026-09-09). ManHead,
// ScoutsWord and TaleOfTheTape went with the two rails he removed — see the note in UserRail.
import { CoachSays, CoachTipsDoor } from './UserRail'
import { teamColor, type TeamColor } from './teamColors'
import { buildReels, REEL_YEAR_MS, SpinReels, type Hold, type ReelSpin } from './SpinReels'
// LegsLeft is no longer drawn here: it was the last block of user mode's game-night rail, which
// his ruling of 2026-09-09 removed whole. It still lives in JerseyFive.
import { TipOff, TIPOFF } from './JerseyFive'
import { coachSays } from './coachSays'
import type { Skin } from './LevelMap'

// the wheel data lives in data/wheel now (the gauges need it engine-side); old importers keep working
export { WHEEL } from '../data/wheel'
export type { TeamSeason } from '../data/wheel'
const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const SAL = SALARIES as Record<string, { sal: number; cap: number; pct: number }>
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`)
/** "$30.1M · 124% of cap", or an honest blank where the record has no figure. */
export const salaryLine = (name: string) => {
  const s = SAL[name]
  return s ? `${money(s.sal)} · ${s.pct}% of cap` : 'no salary on record'
}
/** A player's share of his season's cap, or null when the season has no salary on record. */
export const capPct = (name: string): number | null => SAL[name]?.pct ?? null

/**
 * WHY A ROSTER ROW IS DIMMED (C3 / C4, 2026-09-09). A row greys for two unrelated reasons — his
 * position is filled, or he costs more than the payroll has left — and both drew the same grey with
 * only the cap one carrying a word. On Cleveland '97 that put Hill, Brandon and Phills (14.3%, 5.4%
 * and 7.4% of the cap, all comfortably affordable) in the same state as a man nobody can pay for,
 * with nothing on screen to tell them apart.
 *
 * POSITION BEFORE PRICE when both bind: "over the cap — he costs 33.3%" invites the thought that
 * money is the obstacle and a cheaper board would free him. It would not, if his ring is gone. The
 * binding reason is the one printed.
 *
 * Pure, and exported, so the wording is tested without driving the screen.
 */
export function dimReason(a: {
  unpriced: boolean
  /** Open rings this man can play. Empty = his position is taken. */
  fits: number
  overCap: boolean
  /** Every position he can play, for the sentence. */
  positions: string[]
  /** His price, in points of the cap. */
  cost: number | null
  /** What is left to spend on this pick. */
  budget: number
}): string | undefined {
  if (a.unpriced) return 'no salary on record — he cannot be priced'
  if (!a.fits) return `no open spot — ${a.positions.join(' and ')} ${a.positions.length > 1 ? 'are' : 'is'} already filled`
  if (a.overCap) return `over the cap — he costs ${(a.cost ?? 0).toFixed(1)}%, ${Math.max(0, a.budget).toFixed(1)}% left to spend`
  return undefined
}


const CONF = { E: 'Eastern Conference', W: 'Western Conference' }


/** His lifetime rings. Exported so the hot seat enforces positions off the SAME definition (G10). */
export const posOf = (name: string) => eligible(LINES[name]?.pos)
const posLine = (name: string) => posOf(name).join(' · ')
/** The rings he can fill BESIDES the one he is already in — empty when there are none (E13). */
const alsoPlays = (name: string, here: string) => posOf(name).filter((x) => x !== here).join(' · ')

/**
 * HIS RULING: "Add the ability to draft a player by dragging him to the court". The drop's law,
 * kept out of the component so it can be read and tested on its own. A man carried off the wheel's
 * roster may land on a ring that is OPEN and that he can play — this is DRAFTING, not swapping, so
 * an occupied ring is never a target and neither is a position he cannot fill.
 */
export const canDropAt = (slots: Partial<Record<Pos, string>>, at: (n: string) => Pos[], name: string, to: Pos) =>
  !slots[to] && at(name).includes(to)

/**
 * HOW THE WHEEL'S ROSTER IS ORDERED (his ruling: "Have the eligible players first then the
 * ineligible"). Two keys, in this order:
 *
 *   1. CAN HE BE TAKEN — plays one of the open rings, and in the salary cap fits what is left of
 *      the payroll. These rows have always been dimmed; now they are also last, because a dim row
 *      still costs a scroll and a fifteen-man roster could open with four men who cannot be taken.
 *   2. WITHIN EACH HALF the list reads like a box score, his earlier ruling: points per game
 *      first, OVR as the tiebreak, and the name after that so the order never depends on which
 *      way the source list happened to arrive.
 *
 * Out here rather than inline so the rule can be read and tested without the screen around it.
 */
export const wheelOrder = <T extends { name: string; ovr: number }>(men: T[], draftable: (name: string) => boolean): T[] =>
  [...men].sort(
    (a, b) =>
      Number(draftable(b.name)) - Number(draftable(a.name)) ||
      (LINES[b.name]?.ppg ?? 0) - (LINES[a.name]?.ppg ?? 0) ||
      b.ovr - a.ovr ||
      a.name.localeCompare(b.name),
  )

/** The drop that drafts: exactly the five the "Draft … at …" button would have left behind. */
export const dropDraft = (slots: Partial<Record<Pos, string>>, at: (n: string) => Pos[], name: string, to: Pos) =>
  canDropAt(slots, at, name, to) ? { ...slots, [to]: name } : slots

/** Bare-name index: the same man in a different year is still the same man. */
const PLAYER_OF = new Map(PLAYERS.map((p) => [p.name, p.player]))
export const bare = (name: string) => PLAYER_OF.get(name) ?? name

/**
 * A settled spin: a team-season with at least one available player who can fill an open slot.
 *
 * `pool` is the wheel by default. His ruling on the two reels — "unless selected to spin 1 only" —
 * is what narrows it: holding the TEAM reel hands in that franchise's seasons and holding the YEAR
 * reel hands in that season's teams, so the spin is drawn from the half he did not hold. A hold
 * that leaves nothing legal returns null and the caller falls back to the whole wheel, because a
 * held reel must never be able to spend a spin on nothing.
 */
export function landOn(
  taken: Set<string>,
  open: Pos[],
  next: () => number,
  avoid?: TeamSeason | null,
  afford?: (n: string) => boolean,
  pool: TeamSeason[] = WHEEL,
): TeamSeason | null {
  if (!pool.length) return null
  const ok = (t: TeamSeason) =>
    t !== avoid && t.p.some((n) => !taken.has(bare(n)) && posOf(n).some((x) => open.includes(x)) && (!afford || afford(n)))
  for (let i = 0; i < 400; i++) {
    const t = pool[Math.floor(next() * pool.length)]
    if (ok(t)) return t
  }
  // Random tries exhausted: scan the whole pool from a random offset rather than
  // falling back to a team that fails the filter (that is how a 1980 roster with no
  // salary on record used to appear in the Salary Cap campaign).
  const start = Math.floor(next() * pool.length)
  for (let i = 0; i < pool.length; i++) {
    const t = pool[(start + i) % pool.length]
    if (ok(t)) return t
  }
  return null
}

/**
 * The half of the wheel a held reel leaves in play. Held nothing is the whole wheel; held the team
 * is that franchise across every season it has; held the year is that season across every club.
 */
export function heldPool(held: 'team' | 'year' | null, last: TeamSeason | null): TeamSeason[] {
  if (!held || !last) return WHEEL
  return held === 'team' ? WHEEL.filter((t) => t.team === last.team) : WHEEL.filter((t) => t.y === last.y)
}

/** The decade block a season sits in, clipped to the data (the 2020s run 2020–2026 here). */
const decadeOf = (y: number) => Math.floor(y / 10) * 10
/** How wide the wheel's landing opens: the team, its decade (or three), its division (or conference). */
type Wide = 'team' | 'decade' | 'decade3' | 'division' | 'conference'
/** Every man who wore the shirt across that decade, or who played in that division that season. */
function widenRoster(t: TeamSeason, mode: Wide): string[] {
  // a season with no division on file cannot widen to one — fall back to the roster itself
  if (mode === 'team' || (mode === 'division' && !t.div)) return t.p
  const d0 = decadeOf(t.y)
  const rows =
    mode === 'decade'
      ? WHEEL.filter((x) => x.ab === t.ab && decadeOf(x.y) === d0)
      : mode === 'decade3'
        ? WHEEL.filter((x) => x.ab === t.ab && Math.abs(decadeOf(x.y) - d0) <= 10)
        : mode === 'conference'
          ? WHEEL.filter((x) => x.y === t.y && x.c === t.c)
          : WHEEL.filter((x) => x.y === t.y && x.div && x.div === t.div)
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of rows) for (const n of x.p) if (!seen.has(n)) (seen.add(n), out.push(n))
  return out
}

/**
 * The campaign draft: five spins of the wheel, five positions to cover. Each
 * spin lands on a random year + conference + team; tap a player to scout him
 * (his real season line), assign him to one of his lifetime positions, and
 * confirm in the dock. The spin's decelerating shuffle is the app's one
 * motion besides the Game 7 ticker.
 */
// E16: a MAN's short name is not the same rule as a TEAM's — a man can carry a suffix. See names.ts.
// E3b: and a TEAM's short name is not the last word of it. This screen and the series screen each
// kept a private `bugName`/`bug` that upper-cased the final word, so the franchise he named put its
// NICKNAME on the bug — Salt Lake City Sevens read SEVENS — and every team anyone ever names in
// Boston read the same as every other. `teamCode` is the one rule, in names.ts, and it reads the
// city: SLC. Written `ab`s still win wherever the wheel has one.
/** Whether this machine has asked for less motion. Read at press time, not cached. */
const reduceMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function Draft({
  opponent,
  seed,
  teamName,
  salary = false,
  wallet,
  club = null,
  carry = null,
  wear = {},
  spinLeft = false,
  death = false,
  skin = 'arena',
  tactics = null,
  onTactics,
  onSim,
  onBack,
  onRoster,
  onMyTeam,
}: {
  opponent: Opponent
  seed: number
  teamName: string
  /** Salary Cap campaign: every row also shows that season's salary and share of the cap. */
  salary?: boolean
  /** The campaign's staff tree: what's owned gates what this screen can do. */
  wallet: Progress
  /** ONE CLUB FOR ALL THREE LADDERS (2026-09-11) — it left the per-ladder save, so it is handed in. */
  club?: TeamColor | null
  /** Death match: the five carried in from the last level, already in their slots. */
  carry?: Player[] | null
  /** Death match: durability left per carried man. A man at WEAR_OUT or less must be replaced. */
  wear?: Record<string, number>
  /**
   * HIS RULING: durability is the death match's rule and nobody else's. A man in the regular or
   * the Salary Cap campaign plays his series and the run does not carry him, so a DUR badge there
   * is furniture. Gated on the MODE, not on whether a wear record happens to exist — an empty wear
   * map is also what the first level of a death run looks like, and `carry` is null there too.
   */
  death?: boolean
  /**
   * HIS RULING: "Make the skill tree and the drafting (spin) the same design as your current
   * stage." Which block of the ladder the campaign is standing in — the draft wears its skin.
   */
  skin?: Skin
  /** Death match: a My team change is still unspent — simming now deserves a second look. */
  spinLeft?: boolean
  /**
   * THE PLAN — the sim prices it, so the odds here must too. Given in every mode that has a coach
   * on the bench (state/campaign.ts, `callsPlan`); null means no call and no price.
   */
  tactics?: Tactics | null
  /**
   * AND WHERE IT IS CALLED, in the campaign and the salary cap: the PLAYBOOK sheet off the staff
   * bar (his report: "Tactics arent visable in boths campaigns(Salary and normal)").
   *
   * The Matchup board beside it is the precedent, and the reason this is the right room: both are
   * Coach-branch calls about the five that is about to play, both are bought with stars, both are
   * meaningless until there is a five to make them about, and both are priced by the odds card
   * directly below. My team is the death match's own room — a carried five, its durability, the
   * round's one change, the bench — and a mode that drafts a fresh five every level has none of
   * that to put on a screen. Omitted (the death match) there is no door, and the plan is called in
   * My team exactly as it always was.
   */
  onTactics?: (t: Tactics) => void
  onSim: (five: Player[], assignment: Assignment, toWin: number) => void
  /** Leaving mid-draft: `started` says picks exist, so the attempt is spent and the wheel reseeds. */
  onBack: (started: boolean) => void
  onRoster: () => void
  /**
   * Death match only: the door to MY TEAM, which is the one room a worn-out man can be replaced
   * in. Separate from `onRoster` on purpose — that one opens the player database, and his report
   * is that the worn-out button was reaching it: "when I press so, it leads me to the players db,
   * instead of myteam."
   */
  onMyTeam?: () => void
}) {
  // Death match starts with last level's five already placed; a normal draft starts empty.
  // The carried five arrives in SLOT ORDER (PG to C) — the order My team shows and the player can
  // rearrange by hand — so the seeding honors it verbatim when it is legal, and only a five whose
  // saved order cannot field falls back to a matching, then to force-fitting.
  const [slots, setSlots] = useState<Partial<Record<Pos, string>>>(() => {
    if (!carry?.length) return {}
    const start: Partial<Record<Pos, string>> = {}
    if (carry.length === POSITIONS.length && carry.every((p, i) => eligible(LINES[p.name]?.pos).includes(POSITIONS[i]))) {
      carry.forEach((p, i) => (start[POSITIONS[i]] = p.name))
      return start
    }
    const order = [...carry].sort((a, b) => eligible(LINES[a.name]?.pos).length - eligible(LINES[b.name]?.pos).length)
    const fit = (i: number): boolean => {
      if (i === order.length) return true
      for (const x of eligible(LINES[order[i].name]?.pos)) {
        if (start[x]) continue
        start[x] = order[i].name
        if (fit(i + 1)) return true
        delete start[x]
      }
      return false
    }
    if (fit(0)) return start
    for (const x of POSITIONS) delete start[x]
    const free = [...POSITIONS]
    for (const p of carry) {
      const at = free.find((x) => eligible(LINES[p.name]?.pos).includes(x)) ?? free[0]
      if (at) {
        start[at] = p.name
        free.splice(free.indexOf(at), 1)
      }
    }
    return start
  })
  const [spun, setSpun] = useState<TeamSeason | null>(null)
  const [display, setDisplay] = useState<TeamSeason | null>(null)
  const [spinning, setSpinning] = useState(false)
  /** The two reels: which rows are on them and which row each has to finish under the arrows. */
  const [reels, setReels] = useState<ReelSpin | null>(null)
  /** What the reels last stopped on — the half a held reel keeps for the next spin. */
  const lastLanding = useRef<TeamSeason | null>(null)
  /** HIS RULING: "unless selected to spin 1 only". At most one reel is held; the other is spun. */
  const [hold, setHold] = useState<Hold>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [slot, setSlot] = useState<Pos | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  /*
   * NO BAND ON THE FLOOR HERE ANY MORE — his ruling: "Pressing on a player shouldnt open the thing
   * on the buttom left, it shall open photo #2." Every roster row already opens photo #2 where the
   * man stands (see `openLine`); the last two things still laying the panel into the black floor
   * were the rings of your own court and the shirts on the tip-off, and neither of those has a row
   * of its own to open out into. Both open his CARD now — the same sheet the opponent's five and
   * every name on this screen open, carrying photo #2's season line and the rest of the man.
   *
   * So the band's state, the rectangle that was measured for it and the inline fallback under a
   * row are all gone from this screen. `ManBand` itself lives on: My team gives it a column, and
   * that screen is not in this ruling.
   */
  /**
   * HIS RULING: "Pressing on a player shouldnt open the thing on the buttom left, it shall open
   * photo #2." Photo #2 is the row itself opened out — SEASON 2008 and the fourteen numbers under
   * it, printed inside the list, exactly what the row's own chevron has always opened. So a press
   * on a man in a roster list opens his line where he stands, and no press anywhere on this screen
   * puts a panel on the floor. Toggles, like the chevron: a second press on the same man closes
   * him again.
   */
  const openLine = (name: string) => setInfo((cur) => (cur === name ? null : name))
  /** A drafted player whose position is being changed (tap). */
  const [moving, setMoving] = useState<Pos | null>(null)
  const [analysis, setAnalysis] = useState(false)
  /** His ruling: an unspent My team change earns a second look before the sim — as an
   * IN-GAME dialog (browser popups never render on his phone). */
  const [askSim, setAskSim] = useState(false)
  /**
   * THE SHOT (the design bundle, screen 5). In user mode "Take the floor" does not cut straight to
   * the result: the ball goes up, the bug ticks two and the night settles behind it. `shooting` is
   * the ball in flight, `bump` the two points once they are in, `flash` the "+2" coming off the
   * board. All three are presentation — the series is simmed by the same call, 2.5s later — and
   * all three are dropped if the machine asks for less motion.
   */
  const [shooting, setShooting] = useState(false)
  const [bump, setBump] = useState(0)
  const [flash, setFlash] = useState(false)
  const shotTimers = useRef<number[]>([])
  useEffect(() => () => shotTimers.current.forEach(clearTimeout), [])
  // USER MODE: every choice still works; nothing says whether it was good.
  const user = useUserMode()
  /**
   * THE RECORD ON THE CARD HEAD — this campaign's series won and lost, and nothing else's. A
   * franchise that has not played yet has no record to print rather than a 0–0, which reads as a
   * result. Not gated on the mode: a win and a loss are facts about nights already played, which
   * is exactly what user mode keeps.
   */
  const record = wallet.record && wallet.record.w + wallet.record.l > 0 ? `${wallet.record.w}–${wallet.record.l}` : null
  const openCard = useCard()
  // Screens open at the top; the map's own scroll position must not carry over.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  const [board, setBoard] = useState<number[] | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const toWin = 4 // best of seven, always
  /** The board before the tip: 0–0 with a full first quarter on the clock (his ruling). */
  const bug = TIPOFF
  /** Which side of the ball the Playbook sheet is showing, exactly as My team holds it. */
  const [planSide, setPlanSide] = useState<Side>('off')
  const [planOpen, setPlanOpen] = useState(false)
  /** Whether the coaching tips are being read (his ruling: "Move Coaching tips to information button"). */
  const [tipsOpen, setTipsOpen] = useState(false)
  const has = (id: NodeId) => owned(wallet, id)
  // Per-draft allowances: an owned Front-office node is one use every draft.
  const [used, setUsed] = useState<Partial<Record<NodeId, number>>>({})
  /** Per-draft allowances are the node's RANK: three ranks of Extra spin is three respins a draft. */
  const allowance = (id: NodeId) => (id === 'fo_spin' || id === 'fo_respin' ? rank(wallet, id) : has(id) ? 1 : 0)
  const charges = (id: NodeId) => allowance(id) - (used[id] ?? 0)
  const onConsume = (id: NodeId) => setUsed((u) => ({ ...u, [id]: (u[id] ?? 0) + 1 }))
  /** A drafted player being dragged to another slot (press and drag). */
  const [drag, setDrag] = useState<{ from: Pos; x: number; y: number; over: Pos | null } | null>(null)
  const dragRef = useRef<{ from: Pos; x0: number; y0: number; moved: boolean } | null>(null)
  /**
   * HIS RULING: "Add the ability to draft a player by dragging him to the court". A man from the
   * wheel's roster, lifted off his row and carried to the floor. Kept apart from `drag` above,
   * which moves a man ALREADY drafted between his own rings — this one IS the pick.
   */
  const [pull, setPull] = useState<{ name: string; x: number; y: number; over: Pos | null } | null>(null)
  const pullRef = useRef<{ name: string; x0: number; y0: number; lifted: boolean } | null>(null)
  /** The press-and-hold timer, and the live finger position the edge-scroll loop reads. */
  const holdRef = useRef<number | null>(null)
  const pullXY = useRef({ x: 0, y: 0 })
  const rng = useRef(makeRng(seed))
  const avoidRef = useRef<TeamSeason | null>(null)
  /** Decided ahead of the spin so the Wheel whisperer can show it; the spin just lands there. */
  const [upcoming, setUpcoming] = useState<TeamSeason | null>(null)
  /** What the player is allowed to know about the next landing: Sight seeing, or nothing. */
  const seen = has('scout_wheel') ? upcoming : null
  /** Exact ratings rank 3: which opposing man has his sheet open. */
  const [oppOpen, setOppOpen] = useState<string | null>(null)
  /**
   * Design 2e: the opponent folds into a scout bar. His ruling: it arrives OPEN — he
   * should not have to press to see who he is playing. The bar still closes it.
   */
  /** No team-season on the wheel can legally fill an open slot (salary rules). */
  const [dead, setDead] = useState(false)
  /**
   * The draft takes the full width of a desktop — and, by his ruling ("Make the skill tree and the
   * drafting (spin) the same design as your current stage"), the SKIN of the block the campaign is
   * standing in. The skin is a body class because it has to reach the page's own ground, which is
   * outside anything this screen renders; it re-tints every token, so the wheel, the pool and the
   * board come with it rather than needing a skinned copy each.
   */
  /**
   * A LAYOUT effect, not a passive one, and the difference is a bug he reported: "Pressing on the
   * stage then on map leads me here instead of the normal map" — the map came back drawn in a
   * 562px column with its tickets scattered across the window and off the right edge.
   *
   * Leaving this screen for the map is ONE commit. React runs every layout-effect cleanup in it
   * before any layout-effect create, so a layout cleanup here lands before the map adds its own
   * classes; a PASSIVE cleanup lands after, and it was tearing `wide` back off the body a beat
   * after the map had put it on. The map measures its width in a layout effect, so it measured the
   * full window, then the stale cleanup shrank #root back to the phone column underneath it — a
   * trail laid out for 1878px inside a box 562px wide.
   */
  useLayout(() => {
    document.body.classList.add('wide', `sk-${skin}`)
    return () => document.body.classList.remove('wide', `sk-${skin}`)
  }, [skin])
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
      if (holdRef.current) window.clearTimeout(holdRef.current)
    },
    [],
  )

  const picks = POSITIONS.map((x) => slots[x]).filter((n): n is string => !!n)
  /** One man per five: a different season of the same player is still him. */
  const takenMen = new Set(picks.map(bare))
  const five = picks.map((n) => BY_NAME.get(n)!).filter(Boolean)
  /**
   * THE PLAN, READ AGAINST TONIGHT'S FIVE. `tactics` arrives already answered for by App — null
   * when this campaign has no coach on the bench at all (state/campaign.ts, `callsPlan`) — and
   * this is where it meets the men who are actually playing: the names are reconciled first, so a
   * main scorer left over from another night is not heard, then the Playbook rank gates the rest.
   * The same two steps `planFor` runs for the sim, in the same order, off the same save.
   */
  const called = tactics ? reconcileTactics(tactics, picks) : null
  const plan = called ? gateTactics(called, playbookRank(wallet)) : null
  /** The plan is CALLABLE here when this screen owns the room for it and the node has opened one. */
  const canCallPlan = !!onTactics && !!called && playbookRank(wallet) >= 1
  /**
   * AND A STYLE IS A RANK-2 CALL. `gateTactics` forces `style: 'balanced'` below rank 2, so at rank
   * 0 and rank 1 there is no style on this five and no way to pick one — the Playbook button either
   * is not drawn at all or opens a sheet with no style control in it. The Style fits line under the
   * odds priced all four of them anyway, and then closed by naming a room to go and call it in.
   * That is a rating for a decision he cannot make, which is the thing his standing ruling takes
   * off a screen. It is read where it can be acted on and nowhere else.
   */
  const canCallStyle = playbookRank(wallet) >= 2
  /** Something has actually been called — the door says so, the way the board's does. */
  const planCalled = !!plan && JSON.stringify(plan) !== JSON.stringify(gateTactics(DEFAULT_TACTICS, playbookRank(wallet)))
  /** What the plan is worth on this five against THIS opponent, for the sheet's head. */
  const planWorth = called ? tacticsWorth(called, playbookRank(wallet), five, opponent.players) : null
  /*
   * `focus` STOOD HERE AND IS GONE (his ruling, 2026-09-09: "Remove the player info on buttom
   * right from user mode."). It read the man user mode's rail was heading on — the man selected
   * off the wheel, failing that the last man drafted — and nothing on this screen asks that
   * question any more: the rail it fed has been taken off, and a man's own card, which says
   * everything it said and more, is still one tap away on the floor and on every row.
   */
  /**
   * THE WHEEL'S ROSTER SCROLLS IN ITS OWN BOX (his ruling). The cap is MEASURED rather than a vh
   * guess: what is above the list — the card head, the two reels, the team and its season line,
   * the hint — changes height with the spin and with the width, so the only honest budget is the
   * room actually left between the top of the list and the dock.
   *
   * STACKED ON A PHONE THE LIST RUNS ITS FULL LENGTH, exactly as My team's does and for the same
   * reason: four boxes never fit an 812px screen, so the page scrolls whatever we do, and a nested
   * scroller there only eats the thumb swipe meant for the page. Side by side on a desk the page
   * CAN fit, and that is where the ruling bites.
   */
  const rosterList = useRef<HTMLDivElement | null>(null)
  const [rosterEnd, setRosterEnd] = useState(false)
  /**
   * THE TWO FLOORS STAND ON ONE LINE (his ruling, 2026-09-09: "In both modes, have both 5s the
   * same size and alligned").
   *
   * MEASURED FIRST. Both courts are the same one rule — `width: 100%; max-width: 430px` inside two
   * `0.85fr` columns — and at 375, 414, 720, 900, 1024, 1150, 1280, 1440 and 1920, in both modes,
   * with and without the cap, they draw to the pixel the same: 321.0 wide at 375, 347.9 at 1440,
   * 430.0 at 1920, on both sides. NOTHING WAS EVER DIFFERENT ABOUT THEIR SIZE. What is different
   * is where each one STARTS, because the two cards do not carry the same things above their
   * floors: the opponent's has a headline — the team and its season at 28px — where yours goes
   * straight from the card head to the boards. At 1440 that is 72.7px in user mode; in scout mode
   * the `Full analysis →` door above your card pays part of it back and the gap is 32.7px. A floor
   * that starts seventy pixels below the other reads as a smaller floor, which is the whole of
   * what he was looking at.
   *
   * SO THE FIX IS THE START LINE, NOT THE SIZE. Whichever floor sits higher is dropped to meet the
   * other, and after that the two fives stand on one line and can be read across. The lower floor
   * is never lifted: what is above it are the words that say who these men are.
   *
   * ONLY SIDE BY SIDE. Under 900 the columns stack and there is no line to share — the floors are
   * already the same size, one above the other, which is a phone's own idea of aligned — so the
   * pad comes off and nothing moves.
   */
  const oppFloor = useRef<HTMLDivElement | null>(null)
  const myFloor = useRef<HTMLDivElement | null>(null)
  const onRosterScroll = () => {
    const el = rosterList.current
    if (el) setRosterEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
  }
  /**
   * A LAYOUT effect and no dependency array, on purpose and for two different reasons.
   *
   * NO DEPS: what stands above the list is not a dependency you can name — the spin lands, a man
   * is drafted, the Assign to bar appears, and now (his ruling: "Perhaps shorten the wheel once
   * the user opens a player up") the reels themselves fold away when a season line opens. Every
   * one of those moves the top of the box, so the box is measured after EVERY render.
   *
   * LAYOUT and not passive: the fold is a 250px jump. A passive effect runs after paint, so the
   * frame in which the reels go would be drawn with the OLD cap still on the list — the panel
   * opening into a box that has not grown yet, which is the flicker the ruling is about.
   */
  useLayout(() => {
    const measure = () => {
      const list = rosterList.current
      const dock = document.querySelector<HTMLElement>('.dock')
      const stacked = window.innerWidth < 900
      if (list && stacked) {
        // overflow off too, not just the cap: a couple of rounding pixels are enough to make the
        // box scrollable, and a 4px nested scroller swallows the page's own swipe
        list.style.maxHeight = ''
        list.style.overflowY = 'visible'
        setRosterEnd(true)
      }
      if (list && !stacked) {
        list.style.overflowY = 'auto'
        const lb = list.getBoundingClientRect()
        // what trails the list inside its card comes out of the budget too, or the card clears the
        // dock by exactly that much and the page scrolls after all
        const card = list.closest('.card')
        const trail = card ? Math.max(0, card.getBoundingClientRect().bottom - lb.bottom) : 0
        const room = window.innerHeight - lb.top - (dock?.offsetHeight ?? 0) - trail - 8
        list.style.maxHeight = `${Math.max(196, Math.round(room))}px`
        setRosterEnd(list.scrollTop + list.clientHeight >= list.scrollHeight - 2)
      }
      /* HIS RULING: "In both modes, have both 5s the same size and alligned." See `oppFloor` above
         for what was measured and why this is a start line rather than a size. Written straight
         onto the two elements, the way the roster's cap above is, so nothing re-renders: the pads
         come off first, the two tops are then read out of the same layout, and the higher floor
         takes the difference. Both reads are viewport-relative, so it holds however far apart the
         two CARDS start — in scout mode your column opens with the analysis door and the
         opponent's does not. */
      const [a, c] = [oppFloor.current, myFloor.current]
      if (a) a.style.paddingTop = ''
      if (c) c.style.paddingTop = ''
      // the FLOOR ITSELF, not its wrapper — the wrapper carries the margins (see `.court-line`),
      // so its own top is one 10px step above the boards and the line we are setting is the boards
      const floor = (el: HTMLDivElement) => (el.firstElementChild ?? el).getBoundingClientRect().top
      if (a && c && !stacked) {
        const [ta, tc] = [floor(a), floor(c)]
        const line = Math.max(ta, tc)
        if (line - ta >= 1) a.style.paddingTop = `${Math.round(line - ta)}px`
        if (line - tc >= 1) c.style.paddingTop = `${Math.round(line - tc)}px`
      }
    }
    measure()
    window.addEventListener('resize', measure)
    /* AND AGAIN WHEN THE TYPE LANDS. The app's faces are web fonts, and everything above the two
       floors is words — the opponent's headline is 28px serif, the labels are mono. Until those
       arrive the browser is drawing fallbacks at other heights, so a line taken at first paint is
       a line taken against the wrong words: measured in the harness, the floors ended up 8 to 16px
       apart when the swap landed after the read. Resolved once and for all after that, so on every
       later render this is the same measure() the line above already ran. */
    document.fonts?.ready.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', measure)
  })
  /**
   * AND THE LINE HE JUST OPENED HAS TO BE ON SCREEN. "it shall open photo #2" is only kept if he
   * can SEE photo #2, and the wheel's roster scrolls in a measured box: press the last man showing
   * and his season line opens below the fold of that box, which looks exactly like a press that
   * did nothing. So the box comes to him — far enough to show the end of the line, never so far
   * that it pushes his own row off the top, and only inside the box, never the page. Nothing to do
   * on a phone, where the list is not a scroller and the line opens under his thumb.
   */
  useEffect(() => {
    const list = rosterList.current
    if (!info || !list || list.style.overflowY !== 'auto') return
    const line = list.querySelector<HTMLElement>('.pdetail')
    const row = line?.previousElementSibling as HTMLElement | null
    if (!line || !row) return
    const box = list.getBoundingClientRect()
    const need = line.getBoundingClientRect().bottom - box.bottom + 8
    const spare = row.getBoundingClientRect().top - box.top
    const by = need > 0 ? Math.min(need, Math.max(0, spare)) : spare < 0 ? spare : 0
    if (by) list.scrollBy({ top: by, behavior: reduceMotion() ? 'auto' : 'smooth' })
  }, [info])
  // PACE (recal_57): the AI answers the tempo call off the surpluses; the readout below shows both.
  const pc = plan && five.length ? pace(plan.tempo, aiTempo(opponent.players, five, false), five, opponent.players, paceMastery(wallet)) : null
  const sigma = pc ? SIGMA * pc.sigmaMult : SIGMA
  const open = POSITIONS.filter((x) => !slots[x])
  // Defense is a pairing: both ratings are against the other five, and change as you draft.
  const full = picks.length === DRAFT_SIZE
  /** Death match: changes left before this level. A normal draft is not limited. */
  const carried = carry?.length ? carry.map((p) => p.name) : null
  /** Durability left for a man on this five — his card's number until he has played on it, plus
   * the Iron men boost, read at evaluation so a rank bought mid-run lifts the current five too. */
  const left = (n: string) => (wear[n] ?? BY_NAME.get(n)?.attrs.durability ?? 99) + duraBoost(wallet)
  /** Worn out: he cannot take the floor again, so he must go — even if you would rather he stayed. */
  const broken = carried ? picks.filter((n) => carried.includes(n) && left(n) <= WEAR_OUT) : []
  // Salary Cap campaign: the five's combined share of the cap may not pass CAP_LIMIT.
  const capUsed = salary ? picks.reduce((a, n) => a + (capPct(n) ?? 0), 0) : 0
  const capMax = CAP_LIMIT + capBonus(wallet)
  const capLeft = capMax - capUsed
  /** Every slot still to fill after this one keeps 5% of the cap, so a five never ends up short. */
  const reserve = CAP_RESERVE * Math.max(0, DRAFT_SIZE - picks.length - 1)
  const budget = capLeft - reserve
  /** In the Salary Cap campaign a player must have a salary on record and fit this pick's budget. */
  const unpriced = (name: string) => salary && capPct(name) === null
  const overCap = (name: string) => salary && ((capPct(name) ?? 0) > budget + 1e-9 || unpriced(name))
  // Defensive assignment: naive until the Coach node; the board (if owned) overrides with the player's own map.
  const assignment: Assignment = full && board && has('coach_manual') ? board : has('coach_optimal') ? 'optimal' : 'naive'
  /**
   * THE SAME BOARD, AS FIVE PAIRINGS, for the tip-off's nameplates. `assignment` is what the sim
   * is handed and it may be a WORD — 'optimal' is a board the engine solves at sim time, not a map
   * — so the panel cannot read it directly. Resolved here, and memoised, because solving optimal
   * walks all 120 permutations and this renders on every keystroke of the draft.
   */
  const boardMap = useMemo(
    () =>
      !full
        ? null
        : Array.isArray(assignment)
          ? assignment
          : assignment === 'optimal'
            ? solveBoard(five, opponent.players)
            : naiveAssignment(five, opponent.players),
    // five and the opponent are the whole of what either solver reads
    [full, assignment, five.map((p) => p.name).join('|'), opponent],
  )
  const naiveMap = full && assignment === 'naive' ? naiveAssignment(five, opponent.players) : null
  /**
   * COACHING TIPS — the whole of user mode's third column now (his ruling, 2026-09-09: "Add
   * coacing tips category instead."). Three sentences off the five that is about to play and the
   * five across from it: who the ball goes to, who has their best man, and where the glass stands.
   * Every one is a FACT said out loud; not one of them is a rating, a spread or a verdict on a
   * pick, which is what keeps them inside user mode at all.
   *
   * Empty until BOTH fives are five — see `coachSays`, which returns nothing before then — so the
   * card that draws them simply is not there while the draft is still going on.
   */
  const tips = user && full ? coachSays(five, opponent.players, assignment) : []
  const theirs = useMemo(() => compile(opponent.players, five.length ? five : undefined), [opponent, five])
  const mine = five.length ? (plan ? applyMod(compile(five, opponent.players, assignment), { ...tacticsMod(plan, five, opponent.players), bonus: (tacticsMod(plan, five, opponent.players).bonus ?? 0) + (pc?.margin ?? 0) }) : compile(five, opponent.players, assignment)) : null
  const chance = full && mine ? odds(mine, theirs, sigma, toWin) : null
  /** Matchup coaching rank 2: what the board you are playing is worth against a naive one. */
  const assignWorth = useMemo(() => {
    if (!full || !mine) return null
    const naive = compile(five, opponent.players, 'naive')
    return meanMargin(mine, theirs) - meanMargin(naive, theirs)
  }, [full, mine, five, opponent, theirs])

  // Decide the next landing as soon as the wheel is idle (deterministic: the rng is
  // drawn in the same order either way). Shown only with the Wheel whisperer.
  useEffect(() => {
    if (spun || spinning || full || upcoming) return
    const next = landOn(takenMen, open, () => rng.current.next(), avoidRef.current, (n) => !overCap(n))
    setUpcoming(next)
    setDead(!next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spun, spinning, full, picks.length])

  /**
   * HIS RULING: an actual wheel, and two of them — see ./SpinReels. The team-season is chosen
   * FIRST, exactly as it always was, and the reels are then run to it; a wheel that decided by
   * where it stopped could stop on a man this five cannot field or afford, which is the whole
   * reason `landOn` takes the taken men, the open slots and the afford test.
   *
   * A HELD REEL narrows the pool the landing is drawn from rather than the animation: hold the
   * team and the spin stays inside that franchise, hold the year and it stays inside that season.
   * `upcoming` (the Wheel whisperer's peek) is only good for an unheld spin, since it was drawn
   * against the whole wheel.
   */
  const spin = (force = false) => {
    if (spinning || (spun && !force) || full || dead) return
    const pool = heldPool(hold, lastLanding.current)
    const draw = (from: TeamSeason[]) => landOn(takenMen, open, () => rng.current.next(), avoidRef.current, (n) => !overCap(n), from)
    // a hold that leaves nothing legal must not be allowed to spend the spin on nothing
    const res = (hold ? draw(pool) : upcoming) ?? draw(WHEEL)
    avoidRef.current = null
    setUpcoming(null)
    if (!res) {
      setDead(true)
      return
    }
    setSel(null)
    setSlot(null)
    setInfo(null)
    setDisplay(res)
    setReels((prev) => buildReels(res, WHEEL, () => rng.current.next(), Date.now(), hold, prev))
    lastLanding.current = res
    // Reduced motion gets the answer and not the ride.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setSpun(res)
      return
    }
    setSpinning(true)
    // the year reel is the last to stop, so the landing is settled when IT does
    timer.current = window.setTimeout(() => {
      setSpun(res)
      setSpinning(false)
    }, REEL_YEAR_MS + 120)
  }

  const select = (name: string) => {
    if (sel === name) {
      setSel(null)
      setSlot(null)
      setInfo(null)
      return
    }
    // death match: every slot is full, so a man may be aimed at any position he can play
    const fits = posOf(name).filter((x) => open.includes(x))
    if (!fits.length || overCap(name)) {
      // no open slot, or he breaks the cap — still show the stats, just no pick
      setSel(null)
      setSlot(null)
      setInfo(info === name ? null : name)
      return
    }
    setSel(name)
    setSlot(fits[0])
    setInfo(name)
  }

  const confirm = () => {
    if (!sel || !slot) return
    setSlots((cur) => ({ ...cur, [slot]: sel }))
    setSpun(null)
    setDisplay(null)
    setSel(null)
    setSlot(null)
    setInfo(null)
  }

  const canMove = (from: Pos, to: Pos) => canMoveSlot(slots, posOf, from, to)
  const move = (from: Pos, to: Pos) => {
    if (!canMove(from, to)) return
    setSlots((cur) => moveSlot(cur, posOf, from, to))
    setMoving(null)
  }

  const slotAt = (x: number, y: number): Pos | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]')
    const s = el?.dataset.slot as Pos | undefined
    return s && POSITIONS.includes(s) ? s : null
  }
  const dragStart = (from: Pos) => (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    dragRef.current = { from, x0: e.clientX, y0: e.clientY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    /**
     * HIS RULING: "When holding down on a player to move/draft him a position, show the elgible
     * positions." The HOLD is the moment, not the travel — he wants to know where he is allowed
     * to put the man before he has dragged anywhere. So the same 300ms the drag-that-drafts uses
     * opens the move: the floor lights every ring this man may take, and a press that ends
     * without moving is still the tap it always was.
     */
    const [x, y] = [e.clientX, e.clientY]
    unhold()
    holdRef.current = window.setTimeout(() => {
      if (dragRef.current) setDrag({ from, x, y, over: null })
    }, HOLD_MS)
  }
  const dragMove = (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return
    d.moved = true
    unhold() // travelling: the hold has done its job and the drag takes over
    setDrag({ from: d.from, x: e.clientX, y: e.clientY, over: slotAt(e.clientX, e.clientY) })
  }
  const dragEnd = (e: PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    unhold()
    if (!d) return
    if (d.moved) {
      const to = slotAt(e.clientX, e.clientY)
      if (to) move(d.from, to)
      setMoving(null)
    } else {
      // A press without movement is the TAP — and the row drag synthesises it here rather than
      // calling the row's own onTap, which is why pressing a man in his five showed nothing: the
      // handler wired onto those rows was never reached. The tap opens his season line in the row.
      setMoving(moving === d.from ? null : d.from)
      const n = slots[d.from]
      if (n) openLine(n)
    }
    setDrag(null)
  }

  /**
   * THE DRAG THAT DRAFTS (his ruling: "Add the ability to draft a player by dragging him to the
   * court"). The roster list scrolls vertically under the same finger, so a press only becomes a
   * lift when it STAYS PUT for a moment or when it travels sideways; a vertical swipe hands the
   * gesture straight back to the page, and a press that never lifts is still the tap it always
   * was. Pointer events throughout — no HTML5 drag — so a mouse does exactly what a finger does.
   *
   * The rule and the commit are the ones the dock button already uses: `canDropAt` is the same
   * eligibility the "Assign to" chips offer, `overCap` is the same cap gate, and the drop leaves
   * the screen in the same state `confirm()` does.
   */
  const HOLD_MS = 300
  const canDrop = (name: string, to: Pos) => canDropAt(slots, posOf, name, to) && !overCap(name)
  /** Only the FLOOR is a target: a drafted man's row publishes data-slot too, and it is not one. */
  const courtSlotAt = (x: number, y: number): Pos | null => {
    const s = document.elementFromPoint(x, y)?.closest<HTMLElement>('.ct-spot[data-slot]')?.dataset.slot as Pos | undefined
    return s && POSITIONS.includes(s) ? s : null
  }
  /** The drop IS the pick — same transition as confirm(), which is what the dock button calls. */
  const draftAt = (name: string, to: Pos) => {
    if (!canDrop(name, to)) return
    setSlots((cur) => dropDraft(cur, posOf, name, to))
    setSpun(null)
    setDisplay(null)
    setSel(null)
    setSlot(null)
    setInfo(null)
  }
  const unhold = () => {
    if (holdRef.current) window.clearTimeout(holdRef.current)
    holdRef.current = null
  }
  const pullCancel = () => {
    unhold()
    pullRef.current = null
    setPull(null)
  }
  const lift = (x: number, y: number) => {
    const d = pullRef.current
    if (!d || d.lifted) return
    unhold()
    d.lifted = true
    pullXY.current = { x, y }
    setPull({ name: d.name, x, y, over: courtSlotAt(x, y) })
  }
  const pullStart = (name: string) => (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // the chevron opens his line: it is a control, not a handle. (The name was one too until his
    // ruling took the card off it — there is nothing to press on a name now.)
    if ((e.target as HTMLElement).closest('.pinfo')) return
    // nowhere for him to land — no open ring he can play, or the cap refuses him
    if (!POSITIONS.some((x) => canDrop(name, x))) return
    pullRef.current = { name, x0: e.clientX, y0: e.clientY, lifted: false }
    // capture so the man keeps following a finger that has left his row; a pointer the browser
    // will not give us is not a reason to refuse the drag
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* no capture available — the move handlers still fire on the captured-by-default touch */
    }
    const [x, y] = [e.clientX, e.clientY]
    unhold()
    holdRef.current = window.setTimeout(() => lift(x, y), HOLD_MS)
  }
  const pullMove = (e: PointerEvent) => {
    const d = pullRef.current
    if (!d) return
    if (!d.lifted) {
      const dx = e.clientX - d.x0
      const dy = e.clientY - d.y0
      // a vertical swipe is the list scrolling, and it stays the list's
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) return pullCancel()
      if (Math.abs(dx) <= 8) return
      lift(e.clientX, e.clientY)
    }
    pullXY.current = { x: e.clientX, y: e.clientY }
    setPull({ name: d.name, x: e.clientX, y: e.clientY, over: courtSlotAt(e.clientX, e.clientY) })
  }
  const pullEnd = (onTap?: () => void) => (e: PointerEvent) => {
    const d = pullRef.current
    unhold()
    pullRef.current = null
    if (!d) return
    if (d.lifted) {
      // released on a legal open ring he is drafted there; on anything else he goes back, no change
      const to = courtSlotAt(e.clientX, e.clientY)
      if (to) draftAt(d.name, to)
    } else {
      onTap?.() // under the threshold and inside the hold: a press is a tap, and taps still scout
    }
    setPull(null)
  }
  /**
   * While a man is in the air the page holds still under him — and on a phone it has to be able to
   * TRAVEL, because the floor he is going to sits below the roster he came from. A finger held near
   * an edge scrolls the page that way, and the ring under it is re-read as the floor arrives.
   */
  const lifted = !!pull
  useEffect(() => {
    if (!lifted) return
    const hold = (ev: TouchEvent) => ev.preventDefault()
    document.addEventListener('touchmove', hold, { passive: false })
    const EDGE = 84
    let raf = 0
    const step = () => {
      const { x, y } = pullXY.current
      const h = window.innerHeight
      const v = y < EDGE ? -Math.ceil(((EDGE - y) / EDGE) * 16) : y > h - EDGE ? Math.ceil(((y - (h - EDGE)) / EDGE) * 16) : 0
      if (v) {
        window.scrollBy(0, v)
        setPull((cur) => (cur ? { ...cur, over: courtSlotAt(x, y) } : cur))
      }
      raf = window.requestAnimationFrame(step)
    }
    raf = window.requestAnimationFrame(step)
    return () => {
      document.removeEventListener('touchmove', hold)
      window.cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifted])

  /** Front office: respin the team the wheel landed on (one charge). */
  const respinTeam = () => {
    if (!spun || spinning || charges('fo_spin') <= 0) return
    onConsume('fo_spin')
    avoidRef.current = spun
    setUpcoming(null)
    setSpun(null)
    setDisplay(null)
    setSel(null)
    setSlot(null)
    setInfo(null)
    spin(true) // one press: the respin IS the spin
  }
  /** Front office: same man, another season (one charge). */
  const respinVersion = (x: Pos) => {
    const n = slots[x]
    if (!n || charges('fo_respin') <= 0) return
    const p = BY_NAME.get(n)
    if (!p) return
    const q = respinSeason(p, rng.current, x, LINES)
    if (!q) return
    onConsume('fo_respin')
    setSlots((cur) => ({ ...cur, [x]: q.name }))
    setMoving(null)
  }

  const [wide, setWide] = useState<Wide>('team')
  /**
   * WHO CAN ACTUALLY BE DRAFTED RIGHT NOW: a man who plays one of the open rings and, in the
   * salary cap, one this payroll can still afford. The rows have always DIMMED the rest; his
   * ruling puts them at the bottom as well, because a dim row still costs a scroll and the top of
   * a roster was often four men who cannot be taken.
   */
  const draftable = (name: string) => posOf(name).some((x) => open.includes(x)) && !overCap(name)
  const roster = spun
    ? wheelOrder(
        widenRoster(spun, wide)
          .filter((n) => !takenMen.has(bare(n)))
          .map((n) => BY_NAME.get(n)!)
          .filter(Boolean),
        draftable,
      )
    : []

  /**
   * THE WHEEL IS SHORTENED WHILE HE IS READING A MAN (his ruling: "It should be shown clearly, not
   * like this. Perhaps shorten the wheel once the user opens a player up.").
   *
   * What he was looking at: a season line opening inside the measured roster box, squeezed into
   * whatever height was left, with a scrollbar of its own and the bottom row of numbers cut off
   * mid-glyph. Above that box sat the two reels, the team at display size and a two-line hint —
   * a quarter of the screen spent on a spin that has already landed.
   *
   * So the moment a man in THIS list opens, the wheel folds: the reels go, the hint goes, and the
   * team drops from display size to a single line that still says where the roster came from. The
   * height goes to the roster, which is measured after every render and therefore re-measures on
   * this very change. Close the man and every one of them comes back.
   *
   * The guard matters: `info` is shared with the opponent's list on the left, and opening one of
   * THEIR men must not fold a wheel he is still spinning.
   */
  const reading = !!spun && !spinning && !!info && roster.some((p) => p.name === info)

  /**
   * TAKE THE FLOOR. Scout mode sims and goes; user mode watches the last shot go in first. The
   * timings are the bundle's own — the two points land at 1520ms, the night settles at 2500ms —
   * and every one of them is a timeout this component owns and clears. A machine that has asked
   * for less motion gets the sim it always got.
   */
  const takeTheFloor = () => {
    if (!user || reduceMotion()) {
      onSim(five, assignment, toWin)
      return
    }
    setShooting(true)
    shotTimers.current.push(
      window.setTimeout(() => {
        setBump(2)
        setFlash(true)
      }, 1520),
      window.setTimeout(() => onSim(five, assignment, toWin), 2500),
    )
  }
  const dock = () => {
    // A worn-out man cannot take the floor, and the change lives in MY TEAM on the map — the
    // draft only holds the door until he has been replaced there.
    // His ruling: pressing it takes him there. It used to be a dead disabled button that named
    // the problem and left him to find My team himself.
    // AND IT HAS TO BE MY TEAM. The button said "replace him in My team" and opened the player
    // DATABASE, because it was wired to the same `onRoster` the "See every player" link below
    // uses — his report: "when I press so, it leads me to the players db, instead of myteam".
    if (full && broken.length)
      return (
        <button className="btn" onClick={onMyTeam ?? onRoster}>
          {broken.length === 1 ? '1 man is worn out' : `${broken.length} men are worn out`} — replace him in My team →
        </button>
      )
    if (full)
      return (
        <button
          className="btn"
          disabled={shooting}
          onClick={() => {
            if (spinLeft) {
              setAskSim(true)
              return
            }
            takeTheFloor()
          }}
        >
          {/* The bundle's own label for the button that starts the night. Scout mode says what the
              engine does ("sim the series"); user mode says what the team does. */}
          {user ? 'Take the floor →' : `Sim the series${toWin !== 4 ? ` · best of ${toWin * 2 - 1}` : ''}`}
        </button>
      )
    if (spinning)
      return (
        <button className="btn" disabled>
          Spinning…
        </button>
      )
    if (spun)
      return (
        <button className="btn" disabled={!sel || !slot} onClick={confirm}>
          {sel && slot
            ? `Draft ${sel} at ${slot}`
            : salary && budget < 1
              ? `No cap room — ${capUsed.toFixed(1)}% / ${capMax}% of cap used`
              : 'Tap a player to scout him'}
        </button>
      )
    if (dead)
      return (
        <button className="btn ghost" onClick={() => onBack(true)}>
          No legal team left — back to the map
        </button>
      )
    return (
      <button className="btn" onClick={() => spin()}>
        {picks.length === 0 ? 'Spin the wheel' : `Spin ${picks.length + 1} of ${DRAFT_SIZE}`}
      </button>
    )
  }

  const scoutRow = (
    p: Player,
    opts: {
      tone?: 'you' | 'them'
      sub: string
      onTap: () => void
      dim?: boolean
      on?: boolean
      short?: boolean
      slot?: Pos
      /**
       * His ruling: this man can be dragged from the list onto the court and drafted there. Only
       * the wheel's roster sets it — the opponent's men are not yours to take, and a man already
       * on your floor is moved by `slot` above, not drafted again.
       */
      pull?: boolean
      /** His ruling: durability reads next to the name on this screen too, same badge as My team. */
      dur?: number
      worn?: boolean
      /**
       * WHY THIS ROW IS DIMMED (C3, 2026-09-09). A row greys for two unrelated reasons — his
       * position is filled, or he costs more than the payroll has left — and both drew the same
       * grey with only the cap one carrying a word. On Cleveland '97 that put Hill, Brandon and
       * Phills (14.3%, 5.4% and 7.4% of the cap, all comfortably affordable) in the same state as
       * a man nobody can pay for, with nothing on screen to tell them apart.
       */
      why?: string
    },
  ) => {
    /**
     * ONE PANEL PER MAN, AND IT IS HIS OWN LINE. "Remove what Ive marked, no need for duplicates"
     * used to bite here because a man could be on the floor band and in this list at once; since
     * "it shall open photo #2" nothing on this screen opens a band at all, so a row has exactly
     * one thing to show and the chevron and the row itself both open it.
     */
    return (
    <div key={p.name} style={{ display: 'contents' }}>
      <div
        className={`row dr ${opts.short ? 'short' : ''} ${opts.on ? 'on' : ''} ${opts.dim ? 'off' : ''} ${opts.slot ? 'grab' : ''} ${
          opts.pull ? 'pull' : ''
        } ${drag && opts.slot && drag.over === opts.slot ? (canMove(drag.from, opts.slot) ? 'drop-ok' : 'drop-no') : ''} ${
          (drag && opts.slot === drag.from) || pull?.name === p.name ? 'lifted' : ''
        }`}
        role="button"
        tabIndex={0}
        aria-pressed={!!opts.on}
        data-slot={opts.slot}
        onPointerDown={opts.slot ? dragStart(opts.slot) : opts.pull ? pullStart(p.name) : undefined}
        onPointerMove={opts.slot ? dragMove : opts.pull ? pullMove : undefined}
        onPointerUp={opts.slot ? dragEnd : opts.pull ? pullEnd(opts.onTap) : undefined}
        onPointerCancel={opts.slot ? () => { unhold(); dragRef.current = null; setDrag(null) } : opts.pull ? pullCancel : undefined}
        /* a held press must not raise the phone's own long-press menu over the man being carried */
        onContextMenu={opts.pull ? (e) => { if (pullRef.current) e.preventDefault() } : undefined}
        onClick={opts.slot || opts.pull ? undefined : opts.onTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            opts.onTap()
          }
        }}
      >
        <span className="pname">
          {opts.dur !== undefined ? (
            <span className={`mt-dur ${opts.worn ? 'danger' : ''}`}>
              <b>{opts.dur}</b>
              <i>DUR</i>
            </span>
          ) : null}
          <span className="who">
            {/*
              HIS RULING: "Instead of the player page being shown when pressing on the player's
              name, add a small human icon once you open the stats, that will lead you there."
              So the name is a NAME here — no dotted underline, no press of its own. Every row on
              this screen opens the man's season line where he stands, and the person icon inside
              that opened line is the way through to his card. All three lists lose it together:
              they all open the same panel, and a name that is a door in one list and plain text
              in the next would be the same word doing two things on one screen.
            */}
            <b>{p.name}</b>
            <i>{opts.sub}</i>
            {/* C4: the cap verdict used to sit INSIDE `sub`, between the positions and the
                archetype — so the archetype was last and it was the archetype that truncated
                ("PF · C · OVER THE CAP · TWO-…"). It reads here instead, on the line that already
                carries the money, and `sub` is positions and archetype only. */}
            {salary || opts.why ? <i className="sal">{[salary ? salaryLine(p.name) : null, opts.why].filter(Boolean).join(' · ')}</i> : null}
          </span>
        </span>
        <Mini name={p.name} />
        <button
          className={`pinfo ${info === p.name ? 'open' : ''}`}
          aria-label={`${p.name} season line`}
          aria-expanded={info === p.name}
          onClick={(e) => {
            e.stopPropagation()
            setInfo(info === p.name ? null : p.name)
          }}
        >
          ▾
        </button>
      </div>
      {/* his ruling, above: the opened stats carry the only door to his card on this screen */}
      {info === p.name ? <DetailGrid p={p} mode="stats" onCard={() => openCard(p)} /> : null}
    </div>
    )
  }

  /**
   * YOUR FIVE AS ROWS — one per filled ring, in floor order. Lifted out of the card's body so it
   * can be handed WHOLE to the tip-off when the five is set (his ruling, 2026-09-09: "These
   * players should be shown not down"). Nothing about a row changes by moving: the tap still opens
   * his season where he stands, the chevron still toggles it, and the Move to chips still drop in
   * under him — this is the same JSX, rendered in one place instead of two.
   */
  const fiveRows = POSITIONS.map((x) => {
    const n = slots[x]
    const p = n ? BY_NAME.get(n) : undefined
    return p ? (
      <div key={x} style={{ display: 'contents' }}>
        {scoutRow(p, {
          on: true,
          slot: x,
          sub: `${
            carried && left(p.name) <= WEAR_OUT
              ? `${x} · WORN OUT — must be replaced`
              : /* E13, same string on my own five: only the OTHER rings after "can play". */
                alsoPlays(p.name, x)
                ? `${x} · can play ${alsoPlays(p.name, x)}`
                : x
          } · ${archetype(p)}`,
          // the number lives in the DUR badge now, so the sub can never truncate it away
          dur: death ? left(p.name) : undefined,
          worn: carried ? left(p.name) <= WEAR_OUT : false,
          dim: carried ? left(p.name) <= WEAR_OUT : false,
          // his ruling, and the same reading as the wheel's list: a man in a roster row opens
          // out where he stands. The keyboard reaches this; a finger arrives via dragEnd.
          onTap: () => {
            openLine(p.name)
            setMoving(moving === x ? null : x)
          },
        })}
        {moving === x ? (
          <div className="posbar">
            <span className="cap">
              Move to
              {charges('fo_respin') > 0 ? (
                <button className="chip-btn" onClick={() => respinVersion(x)}>
                  Another season
                </button>
              ) : null}
            </span>
            <ChipRow>
              {POSITIONS.map((y) => {
                const can = canMove(x, y)
                return (
                  <button
                    key={y}
                    className={`sortb ${y === x ? 'on' : ''} ${can ? '' : 'no'}`}
                    disabled={!can}
                    onClick={() => move(x, y)}
                    title={slots[y] && can ? `Swap with ${slots[y]}` : undefined}
                  >
                    {y}
                    {slots[y] && y !== x ? <small>⇄</small> : null}
                  </button>
                )
              })}
            </ChipRow>
          </div>
        ) : null}
      </div>
    ) : // an unfilled slot is a ghost ring on the floor above, which is also its drop
    // target — a list row repeating "PG / OPEN" under it would say nothing twice
    null
  })

  /**
   * THE HEAD OVER YOUR OWN MEN (his ruling: "Player PTS · REB · AST should show in my teams as
   * well"). The opponent's list has always been headed — the caption is what tells you the three
   * figures on the right are points, rebounds and assists, in that order, and nothing else on the
   * row says so. Your own five was the one list that read them bare. It is the same head, so it
   * rides with the rows into whichever of the two places they are rendered: under the floor while
   * the five is being built, and inside the tip-off once it is set.
   */
  const fiveHead = (
    <div className="rowhead dr">
      <span>Player</span>
      <StatHead />
      <span />
    </div>
  )

  return (
    <>
      {/*
        HIS RULING: "Move the map next to home, change it to a map icon, and move everything else
        (heat lakers your 5) higher." The command strip is gone with everything it carried — the
        level line, the star count, the OPEN slots and the pick counter all read again on the cards
        below (the opponent card names the level and the record, the wheel card names the open
        slots and the spin, the Your five card counts the picks). The three odds numbers were the
        one thing the strip alone said, so they moved down to the card that already explains them.
        The way back to the map is this button, pinned beside the global home button — it lives in
        THIS screen because only this screen knows whether picks are on the board, which is what
        spends the attempt.
      */}
      <button className={`map-fab ${skin}`} onClick={() => onBack(picks.length > 0)} aria-label="Level map" title="Back to the level map">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 5 3 7.5v12L9 17l6 2.5 6-2.5v-12L15 7 9 5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 5v12M15 7v12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* THE WHEEL'S COLUMN IS EMPTY ONCE THE FIVE IS SET, so the room goes to the team sheet
          (his ruling, 2026-09-09: "These players should be shown not down"). `set` is the state
          in which the middle column renders NOTHING AT ALL — five men in and no landed team left
          on the reels — which is the only thing that entitles the stylesheet to take its width.
          It is stated as both halves rather than just `full` so the class keeps meaning what it
          says: `spin` refuses a full five today, so the second half is always true, and if that
          ever stops being true the layout stops taking a column that has something in it.

          AND IN USER MODE, ONCE THE FIVE IS SET, THERE IS ONLY ONE COLUMN LEFT — `solo`. His
          ruling of 2026-09-09 reads the whole of the opponent's column back to me and ends "and my
          5 lined up. Keep only the middle part": what stays on that screen is the tip-off, and
          nothing else. `solo` is what tells the stylesheet the draft is down to a single column,
          so it can centre it at the size the panel actually wants instead of stretching one team
          sheet across a 1920px desk. Scout mode never takes this class: its left column carries
          the dials, the exact axis ratings and the opponent's sheets, and its right carries the
          matchup panel and the odds — that IS scout mode, and he named neither. */}
      <div className={`draft${full && !display ? ' set' : ''}${user && full && !display ? ' solo' : ''}`}>
      {/* THE OPPONENT'S COLUMN, GONE IN USER MODE ONCE THE FIVE IS SET (his ruling, above). It is
          how you scout who you are playing WHILE you draft, so it stands untouched until the fifth
          man is in — and the moment he is, the thing to look at is the two teams facing, not the
          card you were shopping from. Scout mode keeps it at every stage. */}
      {user && full ? null : (
      <section className="col a">
      {/* The scout bar is gone by his ruling: the panel below carries the team, the
          record and the dials, so a header that only repeated them and offered a
          collapse he never wanted was a lid on an always-open box. */}
      <div className="card" style={{ paddingBottom: 6 }}>
        <div className="card-head">
          {/* THE SAME TWO-PART HEAD AS YOUR OWN CARD (E3a): the name is the part that gives, the
              record beside it never does. `orec` and not `rec` because `rec` is painted in
              `var(--you)` — the accent that means YOUR side everywhere in this app — and the team
              you are playing does not get to wear it. */}
          <span className="label">
            <span className="tname">Level {opponent.round} opponent</span>
            {opponent.record ?? opponent.tag ? <i className="orec">· {opponent.record ?? opponent.tag}</i> : null}
          </span>
          <span className="cap">Season lines</span>
        </div>
        {/* HIS RULING, 2026-09-09: "Instead of Orlando Magic / 45–37. Have Orlando Magic 26'." The
            headline is the team AND THE SEASON IT PLAYED, written the way every card in this app
            writes a season — `Jalen Suggs '26` — rather than his shorthand. A five that never
            played one (the all-time franchise fives, the customs) has no year to print and gets
            its name alone: a lone apostrophe is not a season.
            THE RECORD HAS NOT GONE ANYWHERE. It reads in this card's own head one line above —
            LEVEL 16 OPPONENT · 45–37 — and for a five with no record the head prints the tag
            there instead ("all-time", "the 1990s"), which is what let the line below drop it. */}
        <div className="opp-name">
          {opponent.team}
          {opponent.season ? ` '${String(opponent.season).slice(2)}` : ''}
        </div>
        {user ? null : <TeamDials five={opponent.players} tone="them" vs={opponent.season ?? 'field'} />}
        {/* The NET is an engine number and the axis line below it is engine ratings — or, unbought,
            an advert for the node that sells them. User mode plays blind, and with the record gone
            up into the headline's own head there is nothing left on this line for it: the line is
            scout mode's alone now, and in user mode it is not drawn at all. */}
        {/* A14: "vs you" means rated against YOUR five, and there is no five until there are five.
            Against an empty board their anchor has nobody to hide behind and their hunted man
            nobody to be hunted by, so their NET read +14.3 off a single card and fell from there —
            every good man drafted looked like it was helping them. The line waits now. */}
        {user ? null : (
          <div className="opp-line">
            {isRateable(five)
              ? `vs you: OFF ${theirs.off.toFixed(1)} · DRTG ${theirs.drtg.toFixed(1)} · NET ${theirs.net > 0 ? '+' : ''}${theirs.net.toFixed(1)}`
              : `vs you: rated once your five is full (${five.length} of ${RATEABLE})`}
          </div>
        )}
        {user ? null : (
          <div className="opp-line">
            {has('scout_ratings')
              ? `Inside ${Math.round(theirs.in)} · Outside ${Math.round(theirs.out)} · Interior D ${Math.round(theirs.id)} · Perimeter D ${Math.round(theirs.pd)}`
              : 'Exact axis ratings — Scout · Exact ratings node'}
          </div>
        )}
        {/* his ruling: read their five as a LINEUP, not a list — the same half court the team
            db and My team draw. Their tactics are unknown pre-series, so no plan: balanced shape.
            Names and slots are what the roster list below already shows ungated; the OVR on a tag
            is the Scout node's reward, so it rides the same rank-2 gate as the numbers block. */}
        {/* the wrapper is the start line his ruling asks for and nothing else — see `oppFloor` */}
        <div className="court-line" ref={oppFloor}>
          <CourtFive
            /* His ruling: the opponent's five stand in the opponent's colours — BOTH MODES NOW
               ("Make usermode same as scout mode, in terms of the players colors being the same
               as their team's"). It was scout mode's alone because the design bundle drew user
               mode's floor in franchise blue, and that made one screen disagree with itself: the
               tip-off below already dresses their shirts in their club in user mode too, so the
               same five changed colour the moment the fifth man was drafted. A club is a fact
               about the team, not a rating, so nothing here is blind to gate. */
            club={teamColor(opponent.ab)}
            spots={opponent.players.map((p, i) => ({
              p,
              tag: `${opponent.positions?.[i] ?? POSITIONS[i]}${!user && rank(wallet, 'scout_ratings') >= 2 ? ` · ${p.ovr}` : ''}`,
              onTap: () => openCard(p),
            }))}
          />
        </div>
        {rank(wallet, 'scout_ratings') >= 2 ? (
          <div className="oppmen">
            {opponent.players.map((p) => (
              <div key={p.name} className="oppman">
                <button
                  className="oppman-row"
                  disabled={rank(wallet, 'scout_ratings') < 3}
                  onClick={() => setOppOpen((o) => (o === p.name ? null : p.name))}
                >
                  <span className="oppman-name">{p.name}</span>
                  {user ? null : (
                  <span className="oppman-nums">
                    <i>{p.ovr}</i>
                    <i>{p.o_ovr}</i>
                    <i>{p.d_ovr}</i>
                  </span>
                  )}
                </button>
                {oppOpen === p.name ? <DetailGrid p={p} mode={user ? 'stats' : undefined} /> : null}
              </div>
            ))}
            <div className="oppmen-cap">
              {rank(wallet, 'scout_ratings') >= 3 ? 'OVR · OFF · DEF — tap a man for his sheet' : 'OVR · OFF · DEF — rank 3 opens their sheets'}
            </div>
          </div>
        ) : null}
        {/* his ruling (post-r62): the Matchup reads block is gone from the scout card. */}
        <div className="rowhead dr">
          <span>Player</span>
          <StatHead />
          <span />
        </div>
        {naiveMap ? (
          <div className="naive-note">
            <b>Naive matchups</b> — your coach put the anchor on their most paint-oriented man and everyone else on his position. The Coach branch fixes it.
          </div>
        ) : null}
        {opponent.players.map((p, i) =>
          scoutRow(p, {
            tone: 'them',
            sub: `${
              naiveMap && naiveMap.indexOf(i) >= 0
                ? `${opponent.positions?.[i] ?? ''} · guarded by ${five[naiveMap.indexOf(i)].name.replace(/ '\d\d( \([a-z]\))?$/, '')}`
                : opponent.positions?.[i]
                  ? /* E13: `can play ${posLine}` re-listed the ring he is already standing in —
                       "SG · can play SG · SF". Only the OTHER rings belong after "can play". */
                    alsoPlays(p.name, opponent.positions[i])
                    ? `${opponent.positions[i]} · can play ${alsoPlays(p.name, opponent.positions[i])}`
                    : opponent.positions[i]
                  : posLine(p.name)
            } · ${archetype(p)}`,
            short: true,
            onTap: () => setInfo(info === p.name ? null : p.name),
          }),
        )}
      </div>

      </section>
      )}

      <section className="col b">
      {display ? (
        <div className={`card wheel-card ${spinning ? 'spin-live' : ''}`} style={{ paddingBottom: spun ? 4 : 14 }}>
          <div className="card-head">
            <span className="label">
              {spinning ? 'The wheel is spinning' : `Spin ${picks.length + 1} of ${DRAFT_SIZE} — it lands on`}
            </span>
            {spun ? (
              <span className="cap">
                Open: {open.join(' ')}
                {charges('fo_spin') > 0 ? (
                  <button className="chip-btn" onClick={respinTeam}>
                    Respin team
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
          {/* his ruling: once a man is open the reels have nothing left to say, so they fold and
              the roster takes their height. They come straight back when he closes the man. */}
          {reels && !reading ? <SpinReels spin={reels} spinning={spinning} hold={hold} onHold={spun ? setHold : undefined} /> : null}
          {/* the line under the reels is the ANSWER, so it waits for them: while they run, the rows
              under the arrows are the only thing to read. Reading a man, it is the whole of the
              wheel — the team at a line's height instead of a headline's. */}
          {spinning ? null : (
            <>
              <div className={`spin-team ${reading ? 'short' : ''}`}>{display.team}</div>
              <div className="spin-sub">
                {display.y} · {CONF[display.c]}
                {display.div ? ` · ${display.div}` : ''}
                {display.rec ? ` · ${display.rec}` : ''}
              </div>
            </>
          )}
          {spun ? (
            <>
              {/* his ruling: the drag is the other way to draft, so the list says so — until he
                  has taken the instruction and opened a man, when the height is worth more */}
              {reading ? null : (
                <div className="cap hint">Tap a man to scout him — or press and drag him onto an open spot on the court.</div>
              )}
              {/* HIS RULING: "Make the celtics scrollable instead of scrolling the entire page."
                  A fifteen-man roster ran the middle column past the fold, so reading to the end
                  of it meant scrolling the whole screen — and taking the opponent, the wheel and
                  your own five off the top with it. The head and the column rule stay put and only
                  the men move, in a box measured to stop above the dock, with an edge fade saying
                  there is more below. Same box My team's wheel already uses, same measurement. */}
              <div className={`spin-wrap ${rosterEnd ? 'at-end' : ''}`}>
              <div className="spin-roster" ref={rosterList} onScroll={onRosterScroll}>
              {/* HIS RULING: "Allign the pts reb ast." The head used to stand OUTSIDE this box,
                  which on a desk made it 15px wider than the rows: a scroller's bar is taken out
                  of its CONTENT width, not off the element, so every row was inset by the bar and
                  the head was not — and the three labels sat 15.2px right of the three figures,
                  at every width where the list is long enough to scroll. It rides INSIDE the box
                  now and sticks to its top, so it is measured by the same content width the rows
                  are and cannot drift whatever the platform's bar happens to be. It still stays
                  put while the men move, which is the whole of what it was outside for. */}
              <div className="rowhead dr">
                <span>
                  {wide === 'team'
                    ? 'Roster'
                    : wide === 'decade'
                      ? `${decadeOf(spun.y)}s ${spun.ab}`
                      : wide === 'decade3'
                        ? `${decadeOf(spun.y) - 10}s–${decadeOf(spun.y) + 10}s ${spun.ab}`
                        : wide === 'conference'
                          ? `${CONF[spun.c]} ${spun.y}`
                          : spun.div
                            ? `${spun.div} ${spun.y}`
                            : 'Roster'}{' '}
                  · {roster.length}
                </span>
                <StatHead />
                <span />
              </div>
              {roster.map((p) => {
                const fits = posOf(p.name).filter((x) => open.includes(x))
                const priced = overCap(p.name)
                const cost = capPct(p.name)
                return scoutRow(p, {
                  sub: `${posLine(p.name)} · ${archetype(p)}`,
                  why: dimReason({ unpriced: !!unpriced(p.name), fits: fits.length, overCap: !!priced, positions: posOf(p.name), cost, budget }),
                  dur: death ? left(p.name) : undefined,
                  on: sel === p.name,
                  dim: !fits.length || priced,
                  // his ruling: he can be carried out of this list and onto an open ring
                  pull: fits.length > 0 && !priced,
                  /**
                   * HIS RULING: "Pressing on a player shouldnt open the thing on the buttom left,
                   * it shall open photo #2." The press still PICKS him — the dock still says DRAFT
                   * HIM AT PG and the Assign to chips still appear — and `select` is where the
                   * season line is opened, so it is now the whole of the tap. Nothing on this
                   * screen opens the floor panel any more; there is no floor panel.
                   */
                  onTap: () => select(p.name),
                })
              })}
              </div>
              </div>
              {sel ? (
                <div className="posbar">
                  <span className="cap">Assign to</span>
                  <ChipRow>
                    {POSITIONS.map((x) => {
                      const can = open.includes(x) && posOf(sel).includes(x)
                      return (
                        <button
                          key={x}
                          className={`sortb ${slot === x ? 'on' : ''} ${can ? '' : 'no'}`}
                          disabled={!can}
                          onClick={() => can && setSlot(x)}
                        >
                          {x}
                        </button>
                      )
                    })}
                  </ChipRow>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : full ? null : (
        <div className="card wheel-idle">
          <div className="card-head">
            <span className="label">Spin {picks.length + 1} of {DRAFT_SIZE}</span>
            <span className="cap">Open: {open.join(' ')}</span>
          </div>
          <div className="spin-team dim">{has('scout_wheel') && upcoming ? upcoming.team : 'The wheel'}</div>
          <div className="spin-sub">
            {has('scout_wheel') && upcoming ? `${upcoming.y} · ${CONF[upcoming.c]} — sight seeing says so` : 'A random year, conference and team. Draft one from that roster.'}
          </div>
          {rank(wallet, 'scout_wheel') >= 2 && upcoming ? (
            <div className="whisper-roster">{upcoming.p.map((n) => n.replace(/ '\d\d$/, '')).join(' · ')}</div>
          ) : null}
          {has('fo_decade') || has('fo_division') ? (
            <>
              {/* the landing is Sight seeing's to reveal, and only if it has been paid for */}
              <div className="widen-cap">How wide the wheel opens</div>
              <div className="poschips widen">
                <button className={`sortb ${wide === 'team' ? 'on' : ''}`} onClick={() => setWide('team')}>
                  {seen ? seen.team : 'This team'}
                </button>
                {has('fo_decade') ? (
                  <button className={`sortb ${wide === 'decade' ? 'on' : ''}`} onClick={() => setWide('decade')}>
                    {seen ? `${decadeOf(seen.y)}s franchise` : 'A random decade'}
                  </button>
                ) : null}
                {rank(wallet, 'fo_decade') >= 2 ? (
                  <button className={`sortb ${wide === 'decade3' ? 'on' : ''}`} onClick={() => setWide('decade3')}>
                    {seen ? `${decadeOf(seen.y) - 10}s–${decadeOf(seen.y) + 10}s` : 'Three random decades'}
                  </button>
                ) : null}
                {has('fo_division') ? (
                  <button className={`sortb ${wide === 'division' ? 'on' : ''}`} onClick={() => setWide('division')}>
                    {seen ? `${seen.div ?? 'division'} ${seen.y}` : 'A random division'}
                  </button>
                ) : null}
                {rank(wallet, 'fo_division') >= 2 ? (
                  <button className={`sortb ${wide === 'conference' ? 'on' : ''}`} onClick={() => setWide('conference')}>
                    {seen ? `${CONF[seen.c]} ${seen.y}` : 'A random conference'}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      )}
      </section>

      <section className="col c">
      {/* USER MODE'S RAIL (the design bundle, screen 4). Everything below this in scout mode —
          the analysis door, the matchup panel, the odds card, the assignment's price — is a
          judgement on the pick, and user mode takes all of it off. What it used to leave behind
          was a gap; the bundle puts the man himself there instead: whose season is in front of
          you, what the tree says his shape is, and how many chairs are still empty. */}
      {analysis ? (
        <Analysis mine={five} theirs={opponent.players} assignment={assignment} sigma={sigma} myName={teamName} theirName={opponent.team} onClose={() => setAnalysis(false)} />
      ) : null}
      {five.length && !user ? (
        <button className="linkb" onClick={() => setAnalysis(true)}>
          Full analysis →
        </button>
      ) : null}
      {boardOpen && full ? (
        <Matchups
          mine={five}
          theirs={opponent.players}
          map={board ?? naiveAssignment(five, opponent.players)}
          onChange={setBoard}
          onBack={() => setBoardOpen(false)}
          canSolve={rank(wallet, 'coach_manual') >= 2}
        />
      ) : null}
      {/* THE PLAYBOOK SHEET — the same full-screen sheet the Matchup board opens into, carrying My
          team's own two boxes in one column: the floor with its OFFENSE/DEFENSE toggle, and the
          calls under it. Not one control is new; `TacticsCalls` IS My team's panel, and the court
          is the court, so the toggle that governs which half of the panel shows is the toggle it
          has always been. Gated on a full five for the same reason the board is: every call is a
          FIT question about the personnel, and there is nothing to fit until the five is in. */}
      {planOpen && full && canCallPlan ? (
        <div className="sheet sheet2" onClick={(e) => e.stopPropagation()}>
          <div className="topbar">
            <span>Playbook</span>
            <button onClick={() => setPlanOpen(false)}>← Done</button>
          </div>
          <div className="rule2" />
          <div className="card" style={{ paddingBottom: 4 }}>
            <div className="card-head">
              <span className="label">Tactics</span>
              {/* USER MODE KEEPS ITS BLINDFOLD (his ruling, the design bundle): the calls all work,
                  nothing says whether one was good. The same words My team's head uses. */}
              <span className="cap">{user || planWorth === null ? 'your plan' : worthLine(planWorth)}</span>
            </div>
            <CourtFive
              club={club}
              plan={plan}
              side={planSide}
              onSide={setPlanSide}
              spots={five.map((p, i) => ({ p, slot: POSITIONS[i], tag: user ? POSITIONS[i] : `${POSITIONS[i]} · ${p.ovr}`, onTap: () => openCard(p) }))}
            />
            {/* the opponent goes through, which My team cannot do: standing across from a named
                five, the scheme's and the hunt's fits here ARE the ones the odds card below uses */}
            <TacticsCalls
              tactics={called ?? tactics!}
              playbook={playbookRank(wallet)}
              five={five}
              theirs={opponent.players}
              side={planSide}
              onTactics={onTactics!}
            />
          </div>
        </div>
      ) : null}
      {full && (has('coach_manual') || canCallPlan) ? (
        <div className="card staffbar">
          {has('coach_manual') ? (
            <button className="sortb on" onClick={() => setBoardOpen(true)}>
              Matchup board{board ? ' · set' : ''}
            </button>
          ) : null}
          {canCallPlan ? (
            <button className="sortb on" onClick={() => setPlanOpen(true)}>
              Playbook{planCalled ? ' · called' : ''}
            </button>
          ) : null}
        </div>
      ) : null}
      {full && !user && rank(wallet, 'coach_optimal') >= 2 && assignWorth !== null ? (
        <div className="card assignworth">
          <span className="label">Assignment</span>
          <b>
            {assignWorth >= 0 ? '+' : '−'}
            {Math.abs(assignWorth).toFixed(1)}
          </b>
          <i>points of spread against a naive board</i>
        </div>
      ) : null}
      {full && !user ? <MatchupPanel mine={five} theirs={opponent.players} myName={teamName} theirName={opponent.team} assignment={assignment} /> : null}
      {chance && !user ? (
        <div className="card odds">
          <div className="card-head">
            <span className="label">Before you sim</span>
            {/* ONE DECIMAL, because it is a reading and not the number itself. A pace call multiplies
                SIGMA by 0.94 or 1.08 and the card printed the float raw — "noise σ 9.399999999999999"
                on a 375px phone. Only the death match could reach a pace call before this pass, so
                the plan arriving in the other two modes puts it in front of him twice more. The
                sigma the sim is handed is untouched; this is the label. */}
            <span className="cap">noise σ {sigma.toFixed(1)}</span>
          </div>
          {/* The three headline numbers came back down here when the command strip went (his
              ruling), onto the card that already carried the why — one read, in one place, right
              above the Sim button. */}
          <div className="odds-grid">
            <div>
              <b className={chance.spread >= 0 ? 'you' : 'them'}>
                {chance.spread >= 0 ? '−' : '+'}
                {Math.abs(chance.spread).toFixed(1)}
              </b>
              {/* WHOSE LINE IT IS (his report, 2026-09-09: he read the headline as sign-flipped
                  because it prints −6.8 while the decomposition below reads +6.8). It is not
                  flipped — this is the book convention, where the FAVOURITE lays the points, and
                  it agrees with everything else on the card: Φ(+6.8/σ) is the same 75% the game
                  cell prints. What it never said was WHOSE 6.8 it is, and a bare "Spread" over a
                  minus sign is exactly the reading he made. Naming the side turns it into the line
                  a book would post — SLC −6.8 — which can only be read one way. His ruling: keep
                  the convention, label it properly. */}
              <i>Spread · {chance.spread >= 0 ? teamCode(teamName) : (opponent.ab ?? teamCode(opponent.team))}</i>
            </div>
            <div>
              <b className={chance.game >= 0.5 ? 'you' : 'them'}>{(100 * chance.game).toFixed(0)}%</b>
              <i>A game</i>
            </div>
            <div>
              <b className={chance.series >= 0.5 ? 'you' : 'them'}>{(100 * chance.series).toFixed(0)}%</b>
              <i>The series</i>
            </div>
          </div>
          <div className="decomp">
            <span>
              talent <b>{chance.parts.talent >= 0 ? '+' : '−'}{Math.abs(chance.parts.talent).toFixed(1)}</b>
            </span>
            <span>
              fit <b>{chance.parts.fit >= 0 ? '+' : '−'}{Math.abs(chance.parts.fit).toFixed(1)}</b>
            </span>
            <span>
              {plan ? 'edge' : 'era'} <b>{chance.parts.modifiers >= 0 ? '+' : '−'}{Math.abs(chance.parts.modifiers).toFixed(1)}</b>
            </span>
            <span className="eq">
              = <b>{chance.parts.total >= 0 ? '+' : '−'}{Math.abs(chance.parts.total).toFixed(1)}</b>
            </span>
          </div>
          {pc && !user ? (
            <div className="seriesnow-note">
              {paceMastery(wallet) >= 1 ? (
                <>
                  Pace: your surplus {pc.ours >= 0 ? '+' : ''}{pc.ours.toFixed(0)} vs {pc.theirs >= 0 ? '+' : ''}{pc.theirs.toFixed(0)} —{' '}
                  {Math.abs(pc.ours - pc.theirs) <= 2 ? 'a wash' : pc.ours > pc.theirs ? 'pace favors you' : 'pace favors them'}
                </>
              ) : (
                <>Pace: your surplus {pc.ours >= 0 ? '+' : ''}{pc.ours.toFixed(0)} — Tempo control reads theirs</>
              )}
              {pc.lvl !== 0 ? ` · the night runs ${pc.lvl > 0 ? 'fast (variance shrinks)' : 'slow (variance grows)'}` : ''}
            </div>
          ) : null}
          {plan && five.length === DRAFT_SIZE && !user && canCallStyle ? (
            <div className="seriesnow-note">
              {/* the full fits, opponent included — the scheme's matchup delta prices HERE */}
              Style fits vs {opponent.team}:{' '}
              {STYLES.filter((x) => x.key !== 'balanced')
                /* the pnr fit is the fit of HIS pair when he named one, so this list and the price agree */
                .map((x) => `${x.label} ${Math.round(styleFit(x.key, five, opponent.players, plan))}${plan.style === x.key ? ' ← called' : ''}`)
                .join(' · ')}
              {/* and it names the room the plan is ACTUALLY called in, which is no longer one room:
                  the death match turns it in My team, the campaign and the cap on the Playbook
                  sheet off the staff bar above (his report) */}
              {plan.style === 'balanced' ? ` · no call — the style is picked in ${canCallPlan ? 'the Playbook' : 'My team'}` : ''}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="card" style={{ paddingBottom: 4 }}>
        <div className="card-head">
          {/* HIS RULING: "Instead of your five — put the name that I picked. Also, put the record
              next to my name as well (only from current campaign)." The card used to be headed
              YOUR FIVE, which is the one thing on this screen you can already see; the franchise
              you named and what it has done in this campaign are not written anywhere else on it.
              The record is this save's own — each of the three modes keeps its own ledger. */}
          {/* THE NAME IS A SPAN OF ITS OWN (E3a) because it is the only part of this head that may
              be shortened. It is a city and a nickname he typed, so it has no length to design for;
              it takes one line and is cut with an ellipsis when the card is narrower than the words
              are. The record and the 0 OF 5 beside it are never cut. */}
          <span className="label">
            <span className="tname">{teamName}</span>
            {record ? <i className="rec">{record}</i> : null}
          </span>
          <span className={`count ${five.length ? 'on' : ''}`}>
            {five.length} OF {DRAFT_SIZE}
          </span>
          {/* THE INFORMATION BUTTON (his ruling, 2026-09-09: "Move Coaching tips to information
              button"). The tips are read off BOTH fives, so there is nothing to say until the five
              is complete — which is also the state in which this card is the only one on the
              screen, so the `i` cannot be missed. See CoachTipsDoor for why the head and not the
              staff bar, the scorebug or the club band. */}
          {user && full && tips.length ? <CoachTipsDoor onOpen={() => setTipsOpen(true)} /> : null}
        </div>
        {salary ? (
          <div className={`capbar ${capUsed > capMax ? 'over' : ''}`}>
            <div className="capline">
              <span>Payroll</span>
              <b>
                {/* C5: this read "0.0% of 75%", which parses as a percentage OF 75% while the
                    player card beside it says "25% of cap". The arithmetic was never wrong — both
                    numbers are shares of the same season cap — but two phrasings on one screen
                    read as two denominators. One denominator, named once. */}
                {capUsed.toFixed(1)}% / {capMax}% of cap
              </b>
            </div>
            <div className="captrack">
              <i style={{ width: `${Math.min(100, (100 * capUsed) / capMax)}%` }} />
            </div>
            <span className="cap">
              {capLeft > 0 ? `${capLeft.toFixed(1)}% left` : 'no room left'}
              {reserve > 0 ? ` · ${reserve}% held for the ${Math.max(0, DRAFT_SIZE - picks.length - 1)} slots after this one · ${Math.max(0, budget).toFixed(1)}% to spend now` : ''}
            </span>
          </div>
        ) : null}
        {/* Your own five's OFF and DEF are engine ratings, the same two the opponent's dials show —
            and those already come off in user mode. Both sides go, or neither does. */}
        {five.length && !user ? <TeamDials five={five} tone="you" vs="field" /> : null}
        {/* his ruling: read your own side as a lineup too, the same floor the scout card draws.
            The five fills as he spins, so an unfilled slot stands on the floor as a dashed ghost
            ring wearing its position — the shape of the team he is building is visible from the
            first spin. A full five stands in its best-fit shape, as on the scout court — unless
            this is the death match and he CALLED a style in My team, in which case it stands in
            THAT, captioned as his (his ruling: "If I put 5 out on my tactics it should be shown
            here as well"). The gated plan goes through, so a call the playbook has not opened is
            drawn the way it is priced: not at all.
            Each spot publishes data-slot, which is all the existing drag hit-test needs to accept
            a drop here; tapping a man opens his card, as every other court does.
            His ruling adds the pick-up: a man can be dragged off his own ring onto another spot.
            An EMPTY ghost ring is a legal destination too — it is the same gesture and it moves a
            man into an open chair, which canMoveSlot already allows when the target is empty. */}
        {/* THE TIP-OFF, ONCE THE FIVE IS SET — BOTH MODES (his ruling, 2026-09-08). The half-court
            is a diagram for DECIDING: rings to drop a man onto, the shape the plan puts him in,
            who is on whom. With five men in there is nothing left on it to decide, and what the
            screen owes him instead is the team sheet — his five and theirs, facing, the board
            drawn on the nameplates, and a scoreboard reading nothing-all with a full quarter to
            play. It replaces user mode's own-five-only game night AND scout mode's court, which
            is the whole of "do the same in scout mode".
            The drag goes with the court; the man rows underneath still move a man by tap, so the
            only thing lost is the gesture, and only after the five is complete. */}
        {full ? (
          <TipOff
            bug={bug}
            us={teamCode(teamName)}
            them={opponent.ab ?? teamCode(opponent.team)}
            usName={teamName}
            themName={opponent.team}
            step={`Level ${opponent.round} · best of ${toWin * 2 - 1}`}
            bump={bump}
            flash={flash}
            shooting={shooting}
            mine={five}
            theirs={opponent.players}
            /* his kit on his shirts, their club on theirs — the two are told apart by colour before
               a name is read, and a club is a fact about the team, which is why it stands in both
               modes now that the two share this panel */
            myClub={club}
            theirClub={teamColor(opponent.ab)}
            map={boardMap}
            /* HIS RULING: "Pressing on a player shouldnt open the thing on the buttom left, it
               shall open photo #2." A shirt has no row to open out into, so it opens the man's
               card — which prints photo #2's season line and the rest of him, and is what a name
               has always opened everywhere else. Both fives: theirs open the same way the
               opponent's rings above already did. */
            onTap={(p) => openCard(p)}
            /* YOUR FIVE AS ROWS — SCOUT MODE ONLY NOW.
               HIS RULING, 2026-09-09 (the first of the day): "These players should be shown not
               down." The rows used to be laid under BOTH floors, which put them off the bottom of
               the screen while a screenful of black floor stood empty beside them, so they came
               INSIDE the panel and the stylesheet stood them beside the floors on a desk and under
               your own jerseys on a phone. That is still exactly what scout mode does.
               HIS RULING, 2026-09-09 (later the same day), listing what goes off user mode's game
               night and ending "and my 5 lined up. Keep only the middle part": in user mode they
               go entirely. The men are still on the screen — they are the five jerseys above, with
               their positions, their shirts and who each of them is on — and tapping one still
               opens his card and his season line. What is gone is the list of them.

               TWO CONTROLS RODE ON THOSE ROWS, AND THIS IS WHAT BECOMES OF THEM IN USER MODE.
               Recorded rather than quietly patched, because neither was named in the ruling:
                 · MOVE TO — the five position chips. The drag went when the court did, so the rows
                   were the last way to reposition a man once the five was complete. Accepted: at
                   five of five this panel is a TEAM SHEET, not a working diagram — the shape is
                   settled and the next press is TAKE THE FLOOR. Nothing is lost while the five is
                   being built, which is where the shape is actually decided; the rows and the
                   court both stand there, in both modes.
                 · ANOTHER SEASON — the `fo_respin` charge. That one is PAID FOR, and in user mode
                   its last door on this screen closes with the fifth pick: a charge left unspent
                   at that moment is unspent for the level. Flagged for him; no control has been
                   invented here to carry it. */
            rows={
              user ? undefined : (
                <>
                  {fiveHead}
                  {fiveRows}
                </>
              )
            }
          />
        ) : (
        /* the wrapper is the start line his ruling asks for and nothing else — see `oppFloor` */
        <div className="court-line" ref={myFloor}>
        <CourtFive
          /* HIS RULING: "Allow me to pick my team colors when starting a campaign." This floor is
             YOURS, so it stands in the kit picked on the name screen. `myColor` is null for a
             campaign that predates the picker, and null is the blue floor this has always been.
             THE COURT IS THE PARTIAL FIVE'S NOW, in both modes: the rings, the ghost slots and the
             drag are how a five gets BUILT, and the moment it is complete the tip-off above takes
             the panel. So nothing here is gated on the mode any more. */
          club={club}
          tactic={plan}
          swap={{ can: (a, b) => canMove(a as Pos, b as Pos), commit: (a, b) => move(a as Pos, b as Pos) }}
          spots={POSITIONS.map((x) => {
            const n = slots[x]
            const p = n ? BY_NAME.get(n) : undefined
            const worn = !!p && !!carried && left(p.name) <= WEAR_OUT
            return {
              p: p ?? null,
              slot: x,
              tag: p ? (worn ? `${x} · worn out` : user ? x : `${x} · ${p.ovr}`) : '',
              danger: worn,
              // one ring at a time lights: the man being drafted onto the floor, or the man
              // already on it being moved across it
              dropOk: pull ? (pull.over === x ? canDrop(pull.name, x) : null) : drag && drag.over === x ? canMove(drag.from, x) : null,
              /**
               * HIS RULING: "When holding down on a player to move/draft him a position, show the
               * elgible positions." `dropOk` above answers "is THIS the ring under his finger";
               * this answers the question he actually asked — "may he put the man here at all" —
               * for every ring at once, for as long as the hold lasts. `canDrop` is the draft's
               * law (an OPEN ring he can play, inside the cap) and `canMove` is the move's (any
               * ring he can play, and an occupied one only if the two men can swap): the same two
               * rules the dock button and the Move to chips answer with, said on the floor.
               */
              dropAble: pull ? canDrop(pull.name, x) : drag ? (drag.from === x ? null : canMove(drag.from, x)) : null,
              // HIS RULING: "Pressing on a player shouldnt open the thing on the buttom left, it
              // shall open photo #2." A ring is not a row — there is nothing under it to open out
              // — so the man on it opens his CARD, which carries photo #2's season line and the
              // rest. His own row below opens the line in place, as the ruling reads there.
              // The tap is only reached under the drag threshold, so dragging him is untouched.
              onTap: p ? () => openCard(p) : undefined,
            }
          })}
        />
        </div>
        )}
        {/* THE FIVE IS STILL BEING BUILT, so the rows follow the court they are filling. Once it
            is set they go INSIDE the tip-off instead — see the panel above and `.tip-rows`. */}
        {/* the head only once there is a man under it — an empty five is an empty list */}
        {full || !five.length ? null : fiveHead}
        {full ? null : fiveRows}
      </div>

      {/* THE HINT UNDER THE FLOOR IS GONE, in both modes — his ruling of 2026-09-09 opens its list
          with it: "Remove Drag a player onto another position, or tap him to pick one. / See every
          player → / …". It stood here whenever two men were in, saying out loud what the rings
          already teach the first time a man is held: the ring he is over lights, the ones he
          cannot take go cold. He named no mode, so it goes from both. */}
      {drag ? (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {slots[drag.from]}
        </div>
      ) : null}
      {/* his ruling: a ghost of the man rides the finger, and names the ring he is about to take */}
      {pull ? (
        <div className={`drag-ghost ${pull.over && !canDrop(pull.name, pull.over) ? 'no' : ''}`} style={{ left: pull.x, top: pull.y }}>
          {pull.name}
          {pull.over ? <em>{canDrop(pull.name, pull.over) ? `→ ${pull.over}` : `not ${pull.over}`}</em> : null}
        </div>
      ) : null}
      {/* `SEE EVERY PLAYER →` STOOD HERE AND IS GONE, in both modes (his ruling, 2026-09-09, second
          in the same list). It was the last door into the player database from user mode — the
          front door's book row is scout mode's alone — and that is the point of taking it off: a
          searchable table of every card in the game is a scouting tool, and user mode plays blind.
          `onRoster` is still a live prop: the worn-out-man button in the dock falls back to it when
          the death match has no My team door to give (`onMyTeam ?? onRoster`), so it stays wired. */}

      {/* THE GAME-NIGHT RAIL IS GONE, and so is the man's own rail before it (his rulings,
          2026-09-09: "Remove the player info on buttom right from user mode." and the list that
          runs "Level 16 · best of 7 / 45–37 / Orlando Magic / Tale of the tape / … / Legs left in
          the five").

          WHAT STOOD HERE. Before the five was full: the man you last touched, his season on
          franchise blue, his three headline numbers and the archetype's sentence under THE
          SCOUT'S WORD. Once it was full: the blue head naming the level, the record and the
          opponent, then Tale of the tape, What your coach says and Legs left in the five.

          WHAT STOOD HERE AFTER THAT: one section, the third of those four — "Add coacing tips
          category instead." `coachSays` is exactly that content — the three things scout mode
          prices as keys, said out loud with the number taken off — and it stood as a card headed
          COACHING TIPS at the foot of this column.

          AND NOW IT IS A BUTTON, NOT A CARD (his ruling, 2026-09-09: "Move Coaching tips to
          information button"). Same three sentences, same voice, not a word of them changed; they
          are read by pressing the `i` in the team sheet's head and they open in the sheet below —
          the same full-screen sheet MATCHUP BOARD and PLAYBOOK open into, which is why this is a
          door the game already has rather than a pattern invented for it.

          THEY CANNOT BE READ BEFORE THE FIVE IS FULL, and that is the ruling's own arithmetic
          rather than a choice: every tip is read off YOUR five AND THEIRS together — who the ball
          goes to on this floor, who has their best man, whose two bigs want the glass — so
          `coachSays` returns nothing at all until both fives are five. With two men drafted there
          is no tip to give, so there is no `i` in the head either: a door onto an empty room is
          worse than no door. */}
      {tipsOpen && user && full && tips.length ? (
        <div className="sheet sheet2" onClick={(e) => e.stopPropagation()}>
          <div className="topbar">
            <span>Coaching tips</span>
            <button onClick={() => setTipsOpen(false)}>← Done</button>
          </div>
          <div className="rule2" />
          {/* the block drops its own heading here and only here: the topbar one line above already
              says COACHING TIPS, and saying it twice in forty pixels is not emphasis */}
          <div className="card um-rail">
            <CoachSays lines={tips} heading={false} />
          </div>
        </div>
      ) : null}
      </section>
      </div>

      {askSim ? (
        <Ask
          label="Before you sim"
          text="You still have a change left in My team. Sim the series without it?"
          yes="Sim without it"
          onYes={() => {
            setAskSim(false)
            takeTheFloor()
          }}
          onClose={() => setAskSim(false)}
        />
      ) : null}
      <div className="dock">
        <div className="dock-inner">{dock()}</div>
      </div>
    </>
  )
}
