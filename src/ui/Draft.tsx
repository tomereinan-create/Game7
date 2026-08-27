import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import SALARIES from '../data/salaries.json'
import TEAMSEASONS from '../data/teamseasons.json'
import { CAP_LIMIT, CAP_RESERVE, DRAFT_SIZE, ROUNDS, SIGMA } from '../config'
import { PLAYERS } from '../engine/pool'
import { eligible, POSITIONS, type Pos } from '../engine/positions'
import { canMoveSlot, moveSlot } from '../engine/slots'
import { odds } from '../engine/odds'
import { Analysis } from './Analysis'
import { CardName } from './CardSheet'
import { naiveAssignment, readsOf, type Assignment } from '../engine/offense'
import { capBonus, owned, rank, respinSeason, type NodeId } from '../engine/tree'
import { WEAR_OUT, type Progress } from '../state/campaign'
import { Matchups } from './Matchups'
import { MatchupPanel, TeamDials } from './MatchupPanel'
import { applyMod, compile, meanMargin } from '../engine/resolver'
import { makeRng } from '../engine/rng'
import type { Opponent, Player } from '../engine/types'
import { DetailGrid, LINES } from './Stat'

interface TeamSeason {
  y: number
  c: 'E' | 'W'
  team: string
  ab: string
  /** Division that season (four before the 2004 realignment, six after), and the team's record. */
  div: string | null
  rec: string | null
  p: string[]
}
const WHEEL = TEAMSEASONS as TeamSeason[]
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

/** Bare-name index: the same man in a different year is still the same man. */
const PLAYER_OF = new Map(PLAYERS.map((p) => [p.name, p.player]))
const bare = (name: string) => PLAYER_OF.get(name) ?? name

/** A settled spin: a team-season with at least one available player who can fill an open slot. */
function landOn(taken: Set<string>, open: Pos[], next: () => number, avoid?: TeamSeason | null, afford?: (n: string) => boolean): TeamSeason | null {
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
  stars,
  teamName,
  salary = false,
  wallet,
  handicap = 0,
  carry = null,
  subs = 0,
  wear = {},
  series = null,
  onSim,
  onBack,
  onRoster,
}: {
  opponent: Opponent
  seed: number
  stars: number
  teamName: string
  /** Salary Cap campaign: every row also shows that season's salary and share of the cap. */
  salary?: boolean
  /** The campaign's staff tree: what's owned gates what this screen can do. */
  wallet: Progress
  /** Points of spread the opponent carries in this campaign. */
  handicap?: number
  /** Death match: the five carried in from the last level, already in their slots. */
  carry?: Player[] | null
  /** Death match: how many of them may be changed before this level. */
  subs?: number
  /** Death match: durability left per carried man. A man at WEAR_OUT or less must be replaced. */
  wear?: Record<string, number>
  /** Death match: the series already in progress, if this is a break between games. */
  series?: { games: { won: boolean; us: number; them: number }[]; wins: number; losses: number; toWin: number } | null
  onSim: (five: Player[], assignment: Assignment, toWin: number, sigma?: number) => void
  /** Leaving mid-draft: `started` says picks exist, so the attempt is spent and the wheel reseeds. */
  onBack: (started: boolean) => void
  onRoster: () => void
}) {
  // Death match starts with last level's five already placed; a normal draft starts empty.
  const [slots, setSlots] = useState<Partial<Record<Pos, string>>>(() => {
    if (!carry?.length) return {}
    const start: Partial<Record<Pos, string>> = {}
    const free = [...POSITIONS]
    for (const p of carry) {
      const fit = free.find((x) => eligible(LINES[p.name]?.pos).includes(x)) ?? free[0]
      if (fit) {
        start[fit] = p.name
        free.splice(free.indexOf(fit), 1)
      }
    }
    return start
  })
  /** Death match: which carried men have been sent away. Each one spends a change. */
  const [swapped, setSwapped] = useState<string[]>([])
  /** Death match: landed wheels walked away from. The wheel does not turn twice for one change. */
  const [burned, setBurned] = useState(0)
  const [spun, setSpun] = useState<TeamSeason | null>(null)
  const [display, setDisplay] = useState<TeamSeason | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [slot, setSlot] = useState<Pos | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  /** A drafted player whose position is being changed (tap). */
  const [moving, setMoving] = useState<Pos | null>(null)
  const [analysis, setAnalysis] = useState(false)
  // Screens open at the top; the map's own scroll position must not carry over.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  const [board, setBoard] = useState<number[] | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const toWin = 4 // best of seven, always
  const [sigmaPick, setSigmaPick] = useState<number | null>(null)
  const sigma = sigmaPick ?? SIGMA
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
  const rng = useRef(makeRng(seed))
  const avoidRef = useRef<TeamSeason | null>(null)
  /** Decided ahead of the spin so the Wheel whisperer can show it; the spin just lands there. */
  const [upcoming, setUpcoming] = useState<TeamSeason | null>(null)
  /** What the player is allowed to know about the next landing: Sight seeing, or nothing. */
  const seen = has('scout_wheel') ? upcoming : null
  /** Exact ratings rank 3: which opposing man has his sheet open. */
  const [oppOpen, setOppOpen] = useState<string | null>(null)
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
    },
    [],
  )

  const reads = useMemo(() => readsOf(opponent.players), [opponent])
  const picks = POSITIONS.map((x) => slots[x]).filter((n): n is string => !!n)
  /** One man per five: a different season of the same player is still him. */
  const takenMen = new Set(picks.map(bare))
  const five = picks.map((n) => BY_NAME.get(n)!).filter(Boolean)
  // Defense is a pairing: both ratings are against the other five, and change as you draft.
  const full = picks.length === DRAFT_SIZE
  /** Death match: changes left before this level. A normal draft is not limited. */
  const carried = carry?.length ? carry.map((p) => p.name) : null
  // With a carried five every slot is taken, but a SWAP can vacate any of them — so for the wheel,
  // the landing filter and the assign chips, every position is open. Without this the decide effect
  // finds no landable team on a full five and declares the wheel dead.
  const open = carried ? [...POSITIONS] : POSITIONS.filter((x) => !slots[x])
  /** Durability left for a man on this five — his card's number until he has played on it. */
  const left = (n: string) => wear[n] ?? BY_NAME.get(n)?.attrs.durability ?? 99
  /** Worn out: he cannot take the floor again, so he must go — even if you would rather he stayed. */
  const broken = carried ? picks.filter((n) => carried.includes(n) && left(n) <= WEAR_OUT) : []
  // A forced change is not charged against the round's allowance: two men breaking down in the same
  // week buys two changes, because the alternative is fielding four.
  // Between games the allowance is ONE change (plus any the durability floor forces); before the
  // series starts it is the round's allowance from the Survival branch.
  const allowed = series ? 1 : subs
  const subsLeft = carried ? Math.max(allowed, broken.length) - swapped.length - burned : Infinity
  /** In a death match the wheel only turns while you still have a change to spend. */
  const canSpin = subsLeft > 0
  // Salary Cap campaign: the five's combined share of the cap may not pass CAP_LIMIT.
  const capUsed = salary ? picks.reduce((a, n) => a + (capPct(n) ?? 0), 0) : 0
  const capMax = CAP_LIMIT + capBonus(wallet)
  const capLeft = capMax - capUsed
  /** Every slot still to fill after this one keeps 5% of the cap, so a five never ends up short. */
  const reserve = CAP_RESERVE * Math.max(0, DRAFT_SIZE - picks.length - 1)
  const budget = capLeft - reserve
  /** In the Salary Cap campaign a player must have a salary on record and fit this pick's budget. */
  const unpriced = (name: string) => salary && capPct(name) === null
  /**
   * A SWAP frees the outgoing man's salary, and until the incoming man is aimed at a slot the
   * outgoing man could be anyone he can replace — so the budget credits the richest of them. The
   * plain budget on a carried five is (at best) whatever the cap reserve left over, which priced
   * every candidate out and killed the wheel before it turned.
   */
  const swapRoom = (name: string) => {
    const spots = posOf(name)
    return Math.max(0, ...spots.map((x) => (slots[x] ? capPct(slots[x]!) ?? 0 : 0)))
  }
  const overCap = (name: string) =>
    salary && (unpriced(name) || (capPct(name) ?? 0) > (carried ? capLeft + swapRoom(name) : budget) + 1e-9)
  /** The affordable check per SLOT: he may fit replacing the expensive man but not the cheap one. */
  const fitsCap = (name: string, x: Pos) =>
    !salary || !carried || (capPct(name) ?? 0) <= capLeft + (slots[x] ? capPct(slots[x]!) ?? 0 : 0) + 1e-9
  // Defensive assignment: naive until the Coach node; the board (if owned) overrides with the player's own map.
  const assignment: Assignment = full && board && has('coach_manual') ? board : has('coach_optimal') ? 'optimal' : 'naive'
  const naiveMap = full && assignment === 'naive' ? naiveAssignment(five, opponent.players) : null
  const theirs = useMemo(() => applyMod(compile(opponent.players, five.length ? five : undefined), { bonus: handicap }), [opponent, five, handicap])
  const mine = five.length ? compile(five, opponent.players, assignment) : null
  const chance = full && mine ? odds(mine, theirs, sigma, toWin) : null
  /** Their optimal board against your five, as [their man, your man] short names. */
  const theirBoard = useMemo(() => {
    if (!full) return [] as [string, string][]
    const short = (n: string) => n.replace(/ '\d\d$/, '').split(' ').slice(-1)[0]
    return naiveAssignment(opponent.players, five).map((j, i) => [short(opponent.players[i].name), short(five[j].name)] as [string, string])
  }, [full, opponent, five])
  /** Matchup coaching rank 2: what the board you are playing is worth against a naive one. */
  const assignWorth = useMemo(() => {
    if (!full || !mine) return null
    const naive = compile(five, opponent.players, 'naive')
    return meanMargin(mine, theirs) - meanMargin(naive, theirs)
  }, [full, mine, five, opponent, theirs])

  // Decide the next landing as soon as the wheel is idle (deterministic: the rng is
  // drawn in the same order either way). Shown only with the Wheel whisperer.
  useEffect(() => {
    if (spun || spinning || (full && !carried) || !canSpin || upcoming) return
    const next = landOn(takenMen, open, () => rng.current.next(), avoidRef.current, (n) => !overCap(n))
    setUpcoming(next)
    setDead(!next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spun, spinning, full, picks.length])

  const spin = (force = false) => {
    if (spinning || (spun && !force) || (full && !carried) || !canSpin || dead) return
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
    const fits = posOf(name).filter((x) => (carried ? fitsCap(name, x) : open.includes(x)))
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

  /** Death match: keep the five after seeing where the wheel landed. The change is spent. */
  const keepFive = () => {
    setBurned((b) => b + 1)
    setSpun(null)
    setDisplay(null)
    setSel(null)
    setSlot(null)
    setInfo(null)
  }

  const confirm = () => {
    if (!sel || !slot) return
    if (carried && !fitsCap(sel, slot)) return // the swap would put the five over the cap
    if (carried) {
      if (subsLeft <= 0) return
      const outgoing = slots[slot]
      // only a man you CARRIED costs a change; swapping out someone you just brought in is free,
      // so a mis-aimed pick can be corrected without spending the round's other changes.
      if (outgoing && carried.includes(outgoing) && !swapped.includes(outgoing)) setSwapped((c) => [...c, outgoing])
    }
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
      setMoving(moving === d.from ? null : d.from) // a press without movement = the tap
    }
    setDrag(null)
  }

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
        .sort((a, b) => b.ovr - a.ovr || (LINES[b.name]?.ppg ?? 0) - (LINES[a.name]?.ppg ?? 0))
    : []

  const dock = () => {
    // The wheel outranks the play button: while it spins, or while a landed roster waits for a
    // pick, a carried five is still FULL — the old order shadowed this branch and made every
    // death-match change unreachable.
    if (spinning)
      return (
        <button className="btn" disabled>
          Spinning…
        </button>
      )
    if (spun)
      return (
        <>
          <button className="btn" disabled={!sel || !slot} onClick={confirm}>
            {sel && slot
              ? `${carried ? 'Swap in' : 'Draft'} ${sel} at ${slot}`
              : salary && budget < 1
                ? `No cap room — ${capUsed.toFixed(1)}% of ${capMax}% used`
                : carried
                  ? 'Tap a player to swap him in'
                  : 'Tap a player to scout him'}
          </button>
          {carried && !broken.length ? (
            <button className="btn ghost" onClick={keepFive}>
              Keep the five — the change is spent
            </button>
          ) : null}
        </>
      )
    // A worn-out man cannot take the floor, so the series cannot start until he is replaced. The
    // change he forces is free — `subsLeft` already counts him — and it is not optional.
    if (full && broken.length)
      return (
        <button className="btn" onClick={() => spin()}>
          {broken.length === 1 ? '1 man is worn out' : `${broken.length} men are worn out`} — spin to replace
        </button>
      )
    if (full && (series || carried)) {
      const play = (
        <button className="btn" onClick={() => onSim(five, assignment, toWin, sigmaPick ?? undefined)}>
          Play game {series ? series.games.length + 1 : 1}
        </button>
      )
      // The offered switch: one change before game 1 of every series (plus the Survival branch's
      // extras), and one between games. The wheel only turns while a change is in hand.
      return canSpin ? (
        <>
          {play}
          <button className="btn ghost" onClick={() => spin()}>
            Change a man · spin
          </button>
        </>
      ) : (
        play
      )
    }
    if (full)
      return (
        <button className="btn" onClick={() => onSim(five, assignment, toWin, sigmaPick ?? undefined)}>
          Sim the series{toWin !== 4 ? ` · best of ${toWin * 2 - 1}` : ''}
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
    opts: { tone?: 'you' | 'them'; sub: string; onTap: () => void; dim?: boolean; on?: boolean; short?: boolean; slot?: Pos },
  ) => (
    <div key={p.name} style={{ display: 'contents' }}>
      <div
        className={`row dr ${opts.short ? 'short' : ''} ${opts.on ? 'on' : ''} ${opts.dim ? 'off' : ''} ${opts.slot ? 'grab' : ''} ${
          drag && opts.slot && drag.over === opts.slot ? (canMove(drag.from, opts.slot) ? 'drop-ok' : 'drop-no') : ''
        } ${drag && opts.slot === drag.from ? 'lifted' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={!!opts.on}
        data-slot={opts.slot}
        onPointerDown={opts.slot ? dragStart(opts.slot) : undefined}
        onPointerMove={opts.slot ? dragMove : undefined}
        onPointerUp={opts.slot ? dragEnd : undefined}
        onPointerCancel={opts.slot ? () => { dragRef.current = null; setDrag(null) } : undefined}
        onClick={opts.slot ? undefined : opts.onTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            opts.onTap()
          }
        }}
      >
        <span className="pname">
          <span className="who">
            <CardName p={p} />
            <i>{opts.sub}</i>
            {salary ? <i className="sal">{salaryLine(p.name)}</i> : null}
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
      {info === p.name ? <DetailGrid p={p} mode="stats" /> : null}
    </div>
  )

  return (
    <>
      <div className="topbar">
        <span>
          Level <b>{opponent.round}</b> of {ROUNDS}
        </span>
        <span>
          <b>★ {stars}</b>
        </span>
        <button onClick={() => onBack(picks.length > 0)}>← Map</button>
      </div>
      <div className="ladder">
        {Array.from({ length: ROUNDS }, (_, i) => (
          <span
            key={i}
            className={`rung ${i + 1 < opponent.round ? 'done' : i + 1 === opponent.round ? 'now' : ''}`}
          />
        ))}
      </div>
      <div className="rule2" />

      <div className="draft">
      <section className="col a">
      <div className="card" style={{ paddingBottom: 6 }}>
        <div className="card-head">
          <span className="label">
            Level {opponent.round} opponent{opponent.record ? ` · ${opponent.record}` : ''}
          </span>
          <span className="cap">Season lines</span>
        </div>
        <div className="opp-name">{opponent.team}</div>
        <TeamDials five={opponent.players} tone="them" />
        <div className="opp-line">
          {opponent.record ? `${opponent.record} · ` : ''}vs you: OFF {theirs.off.toFixed(1)} · DRTG {theirs.drtg.toFixed(1)} · NET{' '}
          {theirs.net > 0 ? '+' : ''}
          {theirs.net.toFixed(1)}
        </div>
        <div className="opp-line">
          {has('scout_ratings')
            ? `Inside ${Math.round(theirs.in)} · Outside ${Math.round(theirs.out)} · Interior D ${Math.round(theirs.id)} · Perimeter D ${Math.round(theirs.pd)}`
            : 'Exact axis ratings — Scout · Exact ratings node'}
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
                  <span className="oppman-nums">
                    <i>{p.ovr}</i>
                    <i>{p.o_ovr}</i>
                    <i>{p.d_ovr}</i>
                  </span>
                </button>
                {oppOpen === p.name ? <DetailGrid p={p} /> : null}
              </div>
            ))}
            <div className="oppmen-cap">
              {rank(wallet, 'scout_ratings') >= 3 ? 'OVR · OFF · DEF — tap a man for his sheet' : 'OVR · OFF · DEF — rank 3 opens their sheets'}
            </div>
          </div>
        ) : null}
        {!has('scout_reads') ? (
          <div className="reads locked">
            <div className="read">
              <span className="rk">Matchup reads</span>
              <b>Scout · 3★ node</b>
              <i>their hunt orientation, steal target and anchor hiding spot, before you draft</i>
            </div>
          </div>
        ) : null}
        <div className="reads" hidden={!has('scout_reads')}>
          <div className="read">
            <span className="rk">{reads.fiveOut ? 'Five out' : 'Hide your anchor on'}</span>
            <b>{reads.fiveOut ? `worst shooter ${reads.worstShooter.name.replace(/ '\d\d$/, '')} still out ${reads.worstShooter.out}` : reads.worstShooter.name}</b>
            <i>{reads.fiveOut ? 'no hiding spot — rim protection loses value' : `out ${reads.worstShooter.out} · rim protection holds full value`}</i>
          </div>
          <div className="read">
            <span className="rk">Steal target</span>
            <b>{reads.star.name}</b>
            <i>
              usage {reads.star.usg.toFixed(1)} · ball security {reads.star.ballsec} — {reads.star.ballsec < 40 ? 'loose with it' : reads.star.ballsec < 70 ? 'average hands' : 'hard to strip'}
            </i>
          </div>
          {rank(wallet, 'scout_reads') >= 2 && full ? (
            <div className="read">
              <span className="rk">Their board</span>
              <b>{theirBoard.map(([d, o]) => `${d} on ${o}`).join(' · ')}</b>
              <i>who they put on whom, if they coach it optimally</i>
            </div>
          ) : null}
          <div className="read">
            <span className="rk">They hunt</span>
            <b>{reads.paintOrient >= 0.6 ? 'the paint' : reads.paintOrient <= 0.4 ? 'the perimeter' : 'both ways'}</b>
            <i>{Math.round(reads.paintOrient * 100)}% of their scoring weight lives at the rim</i>
          </div>
        </div>
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
            sub:
              naiveMap && naiveMap.indexOf(i) >= 0
                ? `${opponent.positions?.[i] ?? ''} · guarded by ${five[naiveMap.indexOf(i)].name.replace(/ '\d\d( \([a-z]\))?$/, '')}`
                : opponent.positions?.[i]
                  ? posOf(p.name).length > 1
                    ? `${opponent.positions[i]} · can play ${posLine(p.name)}`
                    : opponent.positions[i]
                  : posLine(p.name),
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
              {roster.map((p) => {
                const fits = posOf(p.name).filter((x) => open.includes(x))
                const priced = overCap(p.name)
                return scoutRow(p, {
                  sub: unpriced(p.name) ? `${posLine(p.name)} · no salary on record` : priced ? `${posLine(p.name)} · over the cap` : posLine(p.name),
                  on: sel === p.name,
                  dim: !fits.length || priced,
                  onTap: () => select(p.name),
                })
              })}
              {sel ? (
                <div className="posbar">
                  <span className="cap">Assign to</span>
                  <div className="poschips">
                    {POSITIONS.map((x) => {
                      const can = open.includes(x) && posOf(sel).includes(x) && fitsCap(sel, x)
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
                  </div>
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
      {five.length ? (
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
      {full && (has('coach_manual') || has('coach_sigma')) ? (
        <div className="card staffbar">
          {full && has('coach_manual') ? (
            <button className="sortb on" onClick={() => setBoardOpen(true)}>
              Matchup board{board ? ' · set' : ''}
            </button>
          ) : null}
          {full && has('coach_sigma') ? (
            <div className="poschips">
              {(rank(wallet, 'coach_sigma') >= 3 ? [4, 6, 8, 10, 13, 16, 20] : rank(wallet, 'coach_sigma') >= 2 ? [6, 8, 10, 13, 16] : [8, 10, 13]).map((k) => (
                <button key={k} className={`sortb ${sigma === k ? 'on' : ''}`} onClick={() => setSigmaPick(k)}>
                  σ {k}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {series ? (
        <div className="card seriesnow">
          <div className="card-head">
            <span className="label">
              Game {series.games.length + 1} of {series.toWin * 2 - 1}
            </span>
            <span className="cap">
              {series.wins}–{series.losses}
              {series.wins > series.losses ? ' up' : series.wins < series.losses ? ' down' : ' level'}
            </span>
          </div>
          <div className="seriesnow-games">
            {series.games.map((g, i) => (
              <span key={i} className={g.won ? 'w' : 'l'}>
                {g.won ? 'W' : 'L'} {g.us}–{g.them}
              </span>
            ))}
          </div>
          <div className="seriesnow-note">
            {broken.length
              ? `${broken.length === 1 ? 'A man is' : `${broken.length} men are`} spent — replace before the next game.`
              : subsLeft > 0
                ? 'One change before the next game, if you want it. Every man on the floor loses a point of durability a night.'
                : 'Change made. Play it out.'}
          </div>
        </div>
      ) : null}
      {full && rank(wallet, 'coach_optimal') >= 2 && assignWorth !== null ? (
        <div className="card assignworth">
          <span className="label">Assignment</span>
          <b>
            {assignWorth >= 0 ? '+' : '−'}
            {Math.abs(assignWorth).toFixed(1)}
          </b>
          <i>points of spread against a naive board</i>
        </div>
      ) : null}
      {full ? <MatchupPanel mine={five} theirs={opponent.players} myName={teamName} theirName={opponent.team} assignment={assignment} /> : null}
      {chance ? (
        <div className="card odds">
          <div className="card-head">
            <span className="label">Before you sim</span>
            <span className="cap">noise σ {sigma}</span>
          </div>
          <div className="odds-grid">
            <div>
              <b className={chance.spread >= 0 ? 'you' : 'them'}>
                {chance.spread >= 0 ? '−' : '+'}
                {Math.abs(chance.spread).toFixed(1)}
              </b>
              <i>spread</i>
            </div>
            <div>
              <b className={chance.game >= 0.5 ? 'you' : 'them'}>{(100 * chance.game).toFixed(0)}%</b>
              <i>to win a game</i>
            </div>
            <div>
              <b className={chance.series >= 0.5 ? 'you' : 'them'}>{(100 * chance.series).toFixed(0)}%</b>
              <i>to win the series</i>
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
              era <b>{chance.parts.modifiers >= 0 ? '+' : '−'}{Math.abs(chance.parts.modifiers).toFixed(1)}</b>
            </span>
            <span className="eq">
              = <b>{chance.parts.total >= 0 ? '+' : '−'}{Math.abs(chance.parts.total).toFixed(1)}</b>
            </span>
          </div>
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
        {five.length ? <TeamDials five={five} tone="you" /> : null}
        {POSITIONS.map((x) => {
          const n = slots[x]
          const p = n ? BY_NAME.get(n) : undefined
          return p ? (
            <div key={x} style={{ display: 'contents' }}>
              {scoutRow(p, {
                on: true,
                slot: x,
                sub: carried
                  ? `${x} · ${left(p.name) <= WEAR_OUT ? 'WORN OUT — must be replaced' : `${left(p.name)} durability left`}`
                  : posOf(p.name).length > 1
                    ? `${x} · can play ${posOf(p.name).join(' · ')}`
                    : x,
                dim: carried ? left(p.name) <= WEAR_OUT : false,
                onTap: () => setMoving(moving === x ? null : x),
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
                  <div className="poschips">
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
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className={`row dr slot-open ${drag && drag.over === x ? (canMove(drag.from, x) ? 'drop-ok' : 'drop-no') : ''}`}
              data-slot={x}
              key={x}
            >
              <span className="pname">
                <span className="who">
                  <b>{x}</b>
                  <i>open</i>
                </span>
              </span>
              <span />
              <span />
            </div>
          )
        })}
      </div>

      {five.length > 1 ? <div className="cap hint">Drag a player onto another position, or tap him to pick one.</div> : null}
      {drag ? (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {slots[drag.from]}
        </div>
      ) : null}
      <button className="linkb" onClick={onRoster}>
        See every player →
      </button>
      </section>
      </div>

      <div className="dock">
        <div className={`dock-inner ${(spun && carried && !broken.length) || (full && !spinning && !spun && (series || carried) && canSpin && !broken.length) ? 'two' : ''}`}>{dock()}</div>
      </div>
    </>
  )
}
