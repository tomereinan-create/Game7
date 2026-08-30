import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import SALARIES from '../data/salaries.json'
import TEAMSEASONS from '../data/teamseasons.json'
import { CAP_LIMIT, CAP_RESERVE, DRAFT_SIZE, ROUNDS, SIGMA } from '../config'
import { archetype, PLAYERS } from '../engine/pool'
import { eligible, POSITIONS, type Pos } from '../engine/positions'
import { canMoveSlot, moveSlot } from '../engine/slots'
import { odds } from '../engine/odds'
import { Analysis } from './Analysis'
import { CardName } from './CardSheet'
import { naiveAssignment, ratings100, type Assignment } from '../engine/offense'
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

export interface TeamSeason {
  y: number
  c: 'E' | 'W'
  team: string
  ab: string
  /** Division that season (four before the 2004 realignment, six after), and the team's record. */
  div: string | null
  rec: string | null
  p: string[]
}
export const WHEEL = TEAMSEASONS as TeamSeason[]
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

/** A slot chip's name: three letters of the man's last name (design 2e's command strip). */
const ab3 = (n: string) =>
  (n.replace(/ '\d\d( \([a-z]\))?$/, '').trim().split(/\s+/).pop() ?? '').replace(/\W/g, '').slice(0, 3).toUpperCase()

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
  stars,
  teamName,
  salary = false,
  wallet,
  handicap = 0,
  carry = null,
  wear = {},
  spinLeft = false,
  tactics = null,
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
  /** Death match: durability left per carried man. A man at WEAR_OUT or less must be replaced. */
  wear?: Record<string, number>
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
  /** A drafted player whose position is being changed (tap). */
  const [moving, setMoving] = useState<Pos | null>(null)
  const [analysis, setAnalysis] = useState(false)
  // USER MODE: every choice still works; nothing says whether it was good.
  const user = useUserMode()
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
  const rng = useRef(makeRng(seed))
  const avoidRef = useRef<TeamSeason | null>(null)
  /** Decided ahead of the spin so the Wheel whisperer can show it; the spin just lands there. */
  const [upcoming, setUpcoming] = useState<TeamSeason | null>(null)
  /** What the player is allowed to know about the next landing: Sight seeing, or nothing. */
  const seen = has('scout_wheel') ? upcoming : null
  /** Exact ratings rank 3: which opposing man has his sheet open. */
  const [oppOpen, setOppOpen] = useState<string | null>(null)
  /** Design 2e: the opponent folds into a scout bar; the full card opens on demand. */
  const [scoutOpen, setScoutOpen] = useState(false)
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

  const picks = POSITIONS.map((x) => slots[x]).filter((n): n is string => !!n)
  /** One man per five: a different season of the same player is still him. */
  const takenMen = new Set(picks.map(bare))
  const five = picks.map((n) => BY_NAME.get(n)!).filter(Boolean)
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
        // his ruling: the wheel's roster reads like a box score — points per game first, OVR as the tiebreak
        .sort((a, b) => (LINES[b.name]?.ppg ?? 0) - (LINES[a.name]?.ppg ?? 0) || b.ovr - a.ovr)
    : []

  const dock = () => {
    // A worn-out man cannot take the floor, and the change lives in MY TEAM on the map — the
    // draft only holds the door until he has been replaced there.
    if (full && broken.length)
      return (
        <button className="btn" disabled>
          {broken.length === 1 ? '1 man is worn out' : `${broken.length} men are worn out`} — replace him in My team
        </button>
      )
    if (full)
      return (
        <button
          className="btn"
          onClick={() => {
            // his ruling: an unspent My team change is worth a second look before the series runs
            if (spinLeft && !window.confirm('You still have a change left in My team. Sim the series without it?')) return
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
      {/* The command strip (design 2e): the five and the odds pinned as a scoreboard. */}
      <div className="cmd">
        <div className="cmd-top">
          <span>
            Level {opponent.round} of {ROUNDS} · vs {opponent.team.split(' ').pop()}
          </span>
          <span className="r">
            <b>★ {stars}</b>
            <button onClick={() => onBack(picks.length > 0)}>← Map</button>
          </span>
        </div>
        <div className="cmd-slots">
          {POSITIONS.map((x) => {
            const n = slots[x]
            const pend = !n && sel && slot === x
            return (
              <span key={x} className={`cslot ${n ? 'full' : pend ? 'pend' : ''}`}>
                <i>{x}</i>
                <b>{n ? ab3(n) : pend && sel ? `${ab3(sel)}?` : '·'}</b>
              </span>
            )
          })}
        </div>
        <div className="cmd-odds">
          {chance && !user ? (
            <>
              <span>
                SPREAD{' '}
                <b className={chance.spread >= 0 ? 'you' : 'them'}>
                  {chance.spread >= 0 ? '−' : '+'}
                  {Math.abs(chance.spread).toFixed(1)}
                </b>
              </span>
              <span>
                GAME <b className={chance.game >= 0.5 ? 'you' : 'them'}>{(100 * chance.game).toFixed(0)}%</b>
              </span>
              <span>
                SERIES <b className={chance.series >= 0.5 ? 'you' : 'them'}>{(100 * chance.series).toFixed(0)}%</b>
              </span>
            </>
          ) : (
            <span className="dim">{open.length ? `OPEN ${open.join(' ')}` : 'FIVE SET'}</span>
          )}
          <span className="dim">
            {picks.length} OF {DRAFT_SIZE}
          </span>
        </div>
      </div>

      <div className="draft">
      <section className="col a">
      <button className="scoutbar" onClick={() => setScoutOpen((v) => !v)}>
        <span className="sc-l">
          <i>Scout the opponent</i>
          <b>
            {opponent.team} {opponent.record ? <span>{opponent.record}</span> : null}
          </b>
        </span>
        <span className="sc-r">
          {user
            ? scoutOpen
              ? '▴'
              : '▾'
            : `OFF ${Math.round(ratings100(opponent.players).off)} · DEF ${Math.round(ratings100(opponent.players).def)} ${scoutOpen ? '▴' : '▾'}`}
        </span>
      </button>
      {scoutOpen ? (
      <div className="card" style={{ paddingBottom: 6 }}>
        <div className="card-head">
          <span className="label">
            Level {opponent.round} opponent{opponent.record ? ` · ${opponent.record}` : ''}
          </span>
          <span className="cap">Season lines</span>
        </div>
        <div className="opp-name">{opponent.team}</div>
        {user ? null : <TeamDials five={opponent.players} tone="them" />}
        <div className="opp-line">
          {opponent.record ? `${opponent.record} · ` : ''}{user ? '' : <>vs you: OFF {theirs.off.toFixed(1)} · DRTG {theirs.drtg.toFixed(1)} · NET{' '}</>}
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
      ) : null}

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
                  sub: `${unpriced(p.name) ? `${posLine(p.name)} · no salary on record` : priced ? `${posLine(p.name)} · over the cap` : posLine(p.name)} · ${archetype(p)}`,
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
          {/* The three headline numbers live on the command strip now (design 2e); this card keeps the why. */}
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
              {/* the full fits, opponent included — transition's matchup quarter prices HERE */}
              Style fits vs {opponent.team}:{' '}
              {STYLES.filter((x) => x.key !== 'balanced')
                .map((x) => `${x.label} ${Math.round(styleFit(x.key, five, opponent.players))}${plan.style === x.key ? ' ← called' : ''}`)
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
        {five.length ? <TeamDials five={five} tone="you" /> : null}
        {POSITIONS.map((x) => {
          const n = slots[x]
          const p = n ? BY_NAME.get(n) : undefined
          return p ? (
            <div key={x} style={{ display: 'contents' }}>
              {scoutRow(p, {
                on: true,
                slot: x,
                sub: `${
                  carried
                    ? `${x} · ${left(p.name) <= WEAR_OUT ? 'WORN OUT — must be replaced' : `${left(p.name)} durability left`}`
                    : posOf(p.name).length > 1
                      ? `${x} · can play ${posOf(p.name).join(' · ')}`
                      : x
                } · ${archetype(p)}`,
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
        <div className="dock-inner">{dock()}</div>
      </div>
    </>
  )
}
