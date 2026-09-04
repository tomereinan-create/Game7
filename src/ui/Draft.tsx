import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import SALARIES from '../data/salaries.json'
import { WHEEL, type TeamSeason } from '../data/wheel'
import { CAP_LIMIT, CAP_RESERVE, DRAFT_SIZE, SIGMA } from '../config'
import { archetype, PLAYERS } from '../engine/pool'
import { eligible, POSITIONS, type Pos } from '../engine/positions'
import { canMoveSlot, moveSlot } from '../engine/slots'
import { odds } from '../engine/odds'
import { Analysis } from './Analysis'
import { Ask } from './Ask'
import { CardName, useCard } from './CardSheet'
import { CourtFive } from './CourtFive'
import { bandSlot, ManBand } from './ManBand'
import { ChipRow } from './ChipRow'
import { naiveAssignment, type Assignment } from '../engine/offense'
import { aiTempo, gateTactics, pace, styleFit, STYLES, tacticsMod, type Tactics } from '../engine/tactics'
import { capBonus, duraBoost, owned, paceMastery, playbookRank, rank, respinSeason, type NodeId } from '../engine/tree'
import { WEAR_OUT, type Progress } from '../state/campaign'
import { Matchups } from './Matchups'
import { MatchupPanel, TeamDials } from './MatchupPanel'
import { applyMod, compile, meanMargin } from '../engine/resolver'
import { makeRng } from '../engine/rng'
import type { Opponent, Player } from '../engine/types'
import { DetailGrid, LINES } from './Stat'
import { useUserMode } from '../state/viewmode'

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

const CONF = { E: 'Eastern Conference', W: 'Western Conference' }

const f1 = (v: number | undefined) => (v === undefined ? '–' : v.toFixed(1))
/** The three numbers everyone reads first. */
const Mini = ({ name }: { name: string }) => {
  const l = LINES[name]
  return (
    <span className="mini">
      {f1(l?.ppg)} <i>·</i> {f1(l?.rpg)} <i>·</i> {f1(l?.apg)}
    </span>
  )
}

const posOf = (name: string) => eligible(LINES[name]?.pos)
const posLine = (name: string) => posOf(name).join(' · ')

/**
 * HIS RULING: "Add the ability to draft a player by dragging him to the court". The drop's law,
 * kept out of the component so it can be read and tested on its own. A man carried off the wheel's
 * roster may land on a ring that is OPEN and that he can play — this is DRAFTING, not swapping, so
 * an occupied ring is never a target and neither is a position he cannot fill.
 */
export const canDropAt = (slots: Partial<Record<Pos, string>>, at: (n: string) => Pos[], name: string, to: Pos) =>
  !slots[to] && at(name).includes(to)

/** The drop that drafts: exactly the five the "Draft … at …" button would have left behind. */
export const dropDraft = (slots: Partial<Record<Pos, string>>, at: (n: string) => Pos[], name: string, to: Pos) =>
  canDropAt(slots, at, name, to) ? { ...slots, [to]: name } : slots

/** Bare-name index: the same man in a different year is still the same man. */
const PLAYER_OF = new Map(PLAYERS.map((p) => [p.name, p.player]))
export const bare = (name: string) => PLAYER_OF.get(name) ?? name

/** A settled spin: a team-season with at least one available player who can fill an open slot. */
export function landOn(taken: Set<string>, open: Pos[], next: () => number, avoid?: TeamSeason | null, afford?: (n: string) => boolean): TeamSeason | null {
  const ok = (t: TeamSeason) =>
    t !== avoid && t.p.some((n) => !taken.has(bare(n)) && posOf(n).some((x) => open.includes(x)) && (!afford || afford(n)))
  for (let i = 0; i < 400; i++) {
    const t = WHEEL[Math.floor(next() * WHEEL.length)]
    if (ok(t)) return t
  }
  // Random tries exhausted: scan the whole wheel from a random offset rather than
  // falling back to a team that fails the filter (that is how a 1980 roster with no
  // salary on record used to appear in the Salary Cap campaign).
  const start = Math.floor(next() * WHEEL.length)
  for (let i = 0; i < WHEEL.length; i++) {
    const t = WHEEL[(start + i) % WHEEL.length]
    if (ok(t)) return t
  }
  return null
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
export function Draft({
  opponent,
  seed,
  teamName,
  salary = false,
  wallet,
  handicap = 0,
  carry = null,
  wear = {},
  spinLeft = false,
  death = false,
  tactics = null,
  onSim,
  onBack,
  onRoster,
}: {
  opponent: Opponent
  seed: number
  teamName: string
  /** Salary Cap campaign: every row also shows that season's salary and share of the cap. */
  salary?: boolean
  /** The campaign's staff tree: what's owned gates what this screen can do. */
  wallet: Progress
  /** Points of spread the opponent carries in this campaign. */
  handicap?: number
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
  /** Death match: a My team change is still unspent — simming now deserves a second look. */
  spinLeft?: boolean
  /** Death match: the My team plan — the sim prices it, so the odds here must too. */
  tactics?: Tactics | null
  onSim: (five: Player[], assignment: Assignment, toWin: number) => void
  /** Leaving mid-draft: `started` says picks exist, so the attempt is spent and the wheel reseeds. */
  onBack: (started: boolean) => void
  onRoster: () => void
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
  const [sel, setSel] = useState<string | null>(null)
  const [slot, setSlot] = useState<Pos | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  /**
   * The man showing in the band under the boxes, and the black floor there is to put him on. Same
   * ruling and same measurement as My team: the gap between the columns and the dock, so the band
   * only ever uses space the layout already had.
   */
  const [band, setBand] = useState<string | null>(null)
  /**
   * The rectangle the band lays into, when there is one. Null means this screen at this size has
   * no free floor — a phone, a short window, or every column tall — and the panel goes inline
   * under the man instead, so pressing a player always shows him. Named apart from this screen's
   * own `slot`, which is a position.
   */
  const [floor, setFloor] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  /** Where the band goes: the free columns and the room under them. Named apart from this
      screen's own `slot`, which is a position. */
  const showMan = (name: string) => setBand((cur) => (cur === name ? null : name))
  /** A drafted player whose position is being changed (tap). */
  const [moving, setMoving] = useState<Pos | null>(null)
  const [analysis, setAnalysis] = useState(false)
  /** His ruling: an unspent My team change earns a second look before the sim — as an
   * IN-GAME dialog (browser popups never render on his phone). */
  const [askSim, setAskSim] = useState(false)
  // USER MODE: every choice still works; nothing says whether it was good.
  const user = useUserMode()
  const openCard = useCard()
  // Screens open at the top; the map's own scroll position must not carry over.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  const [board, setBoard] = useState<number[] | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const toWin = 4 // best of seven, always
  const plan = tactics ? gateTactics(tactics, playbookRank(wallet)) : null
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
  // The draft is the one screen that earns the full width of a desktop.
  useEffect(() => {
    document.body.classList.add('wide')
    return () => document.body.classList.remove('wide')
  }, [])
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
  const gridRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const measure = () => {
      const g = gridRef.current
      if (!g || window.innerWidth < 900) return setFloor(null)
      const dock = document.querySelector<HTMLElement>('.dock')
      const cols = ([...g.children] as HTMLElement[]).filter((e) => e.classList.contains('col'))
      const rowBottom = Math.min(g.getBoundingClientRect().bottom, window.innerHeight - (dock?.offsetHeight ?? 0))
      setFloor(bandSlot(g, cols, rowBottom))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })
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
  const naiveMap = full && assignment === 'naive' ? naiveAssignment(five, opponent.players) : null
  const theirs = useMemo(() => applyMod(compile(opponent.players, five.length ? five : undefined), { bonus: handicap }), [opponent, five, handicap])
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

  const spin = (force = false) => {
    if (spinning || (spun && !force) || full || dead) return
    setSpinning(true)
    setSel(null)
    setSlot(null)
    setInfo(null)
    const steps = 14
    let i = 0
    const tick = () => {
      setDisplay(WHEEL[Math.floor(Math.random() * WHEEL.length)])
      i++
      if (i < steps) {
        timer.current = window.setTimeout(tick, 45 + i * i * 1.2)
      } else {
        const res = upcoming ?? landOn(takenMen, open, () => rng.current.next(), avoidRef.current, (n) => !overCap(n))
        avoidRef.current = null
        setUpcoming(null)
        setDisplay(res)
        setSpun(res)
        setSpinning(false)
        if (!res) setDead(true)
      }
    }
    tick()
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
  }
  const dragMove = (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return
    d.moved = true
    setDrag({ from: d.from, x: e.clientX, y: e.clientY, over: slotAt(e.clientX, e.clientY) })
  }
  const dragEnd = (e: PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.moved) {
      const to = slotAt(e.clientX, e.clientY)
      if (to) move(d.from, to)
      setMoving(null)
    } else {
      // A press without movement is the TAP — and the row drag synthesises it here rather than
      // calling the row's own onTap, which is why pressing a man in his five showed nothing: the
      // showMan wired onto those rows was never reached. The tap opens him in the band too.
      setMoving(moving === d.from ? null : d.from)
      const n = slots[d.from]
      if (n) showMan(n)
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
    // the name opens his card and the chevron opens his line: both are controls, not handles
    if ((e.target as HTMLElement).closest('.cardname, .pinfo')) return
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
  const roster = spun
    ? widenRoster(spun, wide)
        .filter((n) => !takenMen.has(bare(n)))
        .map((n) => BY_NAME.get(n)!)
        .filter(Boolean)
        // his ruling: the wheel's roster reads like a box score — points per game first, OVR as the tiebreak
        .sort((a, b) => (LINES[b.name]?.ppg ?? 0) - (LINES[a.name]?.ppg ?? 0) || b.ovr - a.ovr)
    : []

  const dock = () => {
    // A worn-out man cannot take the floor, and the change lives in MY TEAM on the map — the
    // draft only holds the door until he has been replaced there.
    // His ruling: pressing it takes him there. It used to be a dead disabled button that named
    // the problem and left him to find My team himself.
    if (full && broken.length)
      return (
        <button className="btn" onClick={onRoster}>
          {broken.length === 1 ? '1 man is worn out' : `${broken.length} men are worn out`} — replace him in My team →
        </button>
      )
    if (full)
      return (
        <button
          className="btn"
          onClick={() => {
            if (spinLeft) {
              setAskSim(true)
              return
            }
            onSim(five, assignment, toWin)
          }}
        >
          Sim the series{toWin !== 4 ? ` · best of ${toWin * 2 - 1}` : ''}
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
              ? `No cap room — ${capUsed.toFixed(1)}% of ${capMax}% used`
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
    },
  ) => {
    /**
     * HIS RULING: "Remove what Ive marked, no need for duplicates". Tapping a man in the wheel's
     * roster opened his archetype card AND, right under it, the tap-open grid — the same season,
     * the same fourteen numbers, twice. The card is the one that stays (it carries the tag's
     * sentence as well), so while it is up the grid does not print, and the row's chevron closes
     * the card rather than doing nothing. Everything the grid alone used to say — who he was that
     * season, and the league's TS — now reads on the card.
     */
    const carded = band === p.name
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
        onPointerCancel={opts.slot ? () => { dragRef.current = null; setDrag(null) } : opts.pull ? pullCancel : undefined}
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
            <CardName p={p} />
            <i>{opts.sub}</i>
            {salary ? <i className="sal">{salaryLine(p.name)}</i> : null}
          </span>
        </span>
        <Mini name={p.name} />
        <button
          className={`pinfo ${carded || info === p.name ? 'open' : ''}`}
          aria-label={`${p.name} season line`}
          aria-expanded={carded || info === p.name}
          onClick={(e) => {
            e.stopPropagation()
            if (carded) setBand(null)
            else setInfo(info === p.name ? null : p.name)
          }}
        >
          ▾
        </button>
      </div>
      {carded && !floor ? <ManBand p={p} inline /> : null}
      {info === p.name && !carded ? <DetailGrid p={p} mode="stats" /> : null}
    </div>
    )
  }

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
      <button className="map-fab" onClick={() => onBack(picks.length > 0)} aria-label="Level map" title="Back to the level map">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 5 3 7.5v12L9 17l6 2.5 6-2.5v-12L15 7 9 5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 5v12M15 7v12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="draft" ref={gridRef}>
      <section className="col a">
      {/* The scout bar is gone by his ruling: the panel below carries the team, the
          record and the dials, so a header that only repeated them and offered a
          collapse he never wanted was a lid on an always-open box. */}
      <div className="card" style={{ paddingBottom: 6 }}>
        <div className="card-head">
          <span className="label">
            Level {opponent.round} opponent{opponent.record ?? opponent.tag ? ` · ${opponent.record ?? opponent.tag}` : ''}
          </span>
          <span className="cap">Season lines</span>
        </div>
        <div className="opp-name">{opponent.team}</div>
        {user ? null : <TeamDials five={opponent.players} tone="them" vs={opponent.season ?? 'field'} />}
        <div className="opp-line">
          {opponent.record ?? opponent.tag ? `${opponent.record ?? opponent.tag} · ` : ''}{user ? '' :<>vs you: OFF {theirs.off.toFixed(1)} · DRTG {theirs.drtg.toFixed(1)} · NET{' '}</>}
          {theirs.net > 0 ? '+' : ''}
          {theirs.net.toFixed(1)}
        </div>
        <div className="opp-line">
          {has('scout_ratings')
            ? `Inside ${Math.round(theirs.in)} · Outside ${Math.round(theirs.out)} · Interior D ${Math.round(theirs.id)} · Perimeter D ${Math.round(theirs.pd)}`
            : 'Exact axis ratings — Scout · Exact ratings node'}
        </div>
        {/* his ruling: read their five as a LINEUP, not a list — the same half court the team
            db and My team draw. Their tactics are unknown pre-series, so no plan: balanced shape.
            Names and slots are what the roster list below already shows ungated; the OVR on a tag
            is the Scout node's reward, so it rides the same rank-2 gate as the numbers block. */}
        <CourtFive
          spots={opponent.players.map((p, i) => ({
            p,
            tag: `${opponent.positions?.[i] ?? POSITIONS[i]}${!user && rank(wallet, 'scout_ratings') >= 2 ? ` · ${p.ovr}` : ''}`,
            onTap: () => openCard(p),
          }))}
        />
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
          <span className="gcap">PTS · REB · AST</span>
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
                  ? posOf(p.name).length > 1
                    ? `${opponent.positions[i]} · can play ${posLine(p.name)}`
                    : opponent.positions[i]
                  : posLine(p.name)
            } · ${archetype(p)}`,
            short: true,
            onTap: () => setInfo(info === p.name ? null : p.name),
          }),
        )}
      </div>

      </section>

      <section className="col b">
      {display ? (
        <div className={`card ${spinning ? 'spin-live' : ''}`} style={{ paddingBottom: spun ? 4 : 14 }}>
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
          <div className="spin-team">{display.team}</div>
          <div className="spin-sub">
            {display.y} · {CONF[display.c]}
            {display.div ? ` · ${display.div}` : ''}
            {display.rec ? ` · ${display.rec}` : ''}
          </div>
          {spun ? (
            <>
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
                <span className="gcap">PTS · REB · AST</span>
                <span />
              </div>
              {/* his ruling: the drag is the other way to draft, so the list says so */}
              <div className="cap hint">Tap a man to scout him — or press and drag him onto an open spot on the court.</div>
              {roster.map((p) => {
                const fits = posOf(p.name).filter((x) => open.includes(x))
                const priced = overCap(p.name)
                return scoutRow(p, {
                  sub: `${unpriced(p.name) ? `${posLine(p.name)} · no salary on record` : priced ? `${posLine(p.name)} · over the cap` : posLine(p.name)} · ${archetype(p)}`,
                  dur: death ? left(p.name) : undefined,
                  on: sel === p.name,
                  dim: !fits.length || priced,
                  // his ruling: he can be carried out of this list and onto an open ring
                  pull: fits.length > 0 && !priced,
                  onTap: () => {
                    showMan(p.name)
                    select(p.name)
                  },
                })
              })}
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
      {analysis ? (
        <Analysis mine={five} theirs={opponent.players} assignment={assignment} myName={teamName} theirName={opponent.team} onClose={() => setAnalysis(false)} />
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
      {full && has('coach_manual') ? (
        <div className="card staffbar">
          <button className="sortb on" onClick={() => setBoardOpen(true)}>
            Matchup board{board ? ' · set' : ''}
          </button>
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
            <span className="cap">noise σ {sigma}</span>
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
              <i>Spread</i>
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
          {plan && five.length === DRAFT_SIZE && !user ? (
            <div className="seriesnow-note">
              {/* the full fits, opponent included — the scheme's matchup delta prices HERE */}
              Style fits vs {opponent.team}:{' '}
              {STYLES.filter((x) => x.key !== 'balanced')
                /* the pnr fit is the fit of HIS pair when he named one, so this list and the price agree */
                .map((x) => `${x.label} ${Math.round(styleFit(x.key, five, opponent.players, plan))}${plan.style === x.key ? ' ← called' : ''}`)
                .join(' · ')}
              {plan.style === 'balanced' ? ' · no call — the style is picked in My team' : ''}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="card" style={{ paddingBottom: 4 }}>
        <div className="card-head">
          <span className="label">Your five</span>
          <span className={`count ${five.length ? 'on' : ''}`}>
            {five.length} OF {DRAFT_SIZE}
          </span>
        </div>
        {salary ? (
          <div className={`capbar ${capUsed > capMax ? 'over' : ''}`}>
            <div className="capline">
              <span>Payroll</span>
              <b>
                {capUsed.toFixed(1)}% of {capMax}%
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
        {five.length ? <TeamDials five={five} tone="you" vs="field" /> : null}
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
        <CourtFive
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
              // his ruling: the floor opens him in the band. CardName on his row still opens the
              // full sheet, so the card is one tap away rather than stranded.
              onTap: p ? () => showMan(p.name) : undefined,
            }
          })}
        />
        {POSITIONS.map((x) => {
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
                    : posOf(p.name).length > 1
                      ? `${x} · can play ${posOf(p.name).join(' · ')}`
                      : x
                } · ${archetype(p)}`,
                // the number lives in the DUR badge now, so the sub can never truncate it away
                dur: death ? left(p.name) : undefined,
                worn: carried ? left(p.name) <= WEAR_OUT : false,
                dim: carried ? left(p.name) <= WEAR_OUT : false,
                onTap: () => {
                  showMan(p.name)
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
        })}
      </div>

      {five.length > 1 ? <div className="cap hint">Drag a player onto another position, or tap him to pick one.</div> : null}
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
      <button className="linkb" onClick={onRoster}>
        See every player →
      </button>
      </section>
      {/* the black floor the columns leave; nothing mounts where there is none, as on a phone */}
      {floor ? <ManBand p={band ? (BY_NAME.get(band) ?? null) : null} at={floor} /> : null}
      </div>

      {askSim ? (
        <Ask
          label="Before you sim"
          text="You still have a change left in My team. Sim the series without it?"
          yes="Sim without it"
          onYes={() => onSim(five, assignment, toWin)}
          onClose={() => setAskSim(false)}
        />
      ) : null}
      <div className="dock">
        <div className="dock-inner">{dock()}</div>
      </div>
    </>
  )
}
