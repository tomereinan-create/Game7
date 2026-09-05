import { useEffect, useRef, useState } from 'react'
import { archetype, PLAYERS } from '../engine/pool'
import { useLayout } from './useLayout'
import { eligible, POSITIONS, type Pos } from '../engine/positions'
import { canMoveSlot, moveSlot, type Slots } from '../engine/slots'
// (orderFive lives below — the roster's slot order is derived here and honored everywhere)
import { WEAR_OUT } from '../state/campaign'
import type { Player } from '../engine/types'
import { CardName } from './CardSheet'
import { CourtFive, type Side } from './CourtFive'
import { bandSlot, ManBand } from './ManBand'
import { ChipRow } from './ChipRow'
import { gateTactics, heliMan, pnrPair, popPair, postMan, postOption, triangleReaders, SCHEMES, schemeFit, styleFit, STYLES, tacticsParts, type Tactics } from '../engine/tactics'
import { usageSurplus } from '../engine/offense'
import { bare, capPct, landOn, salaryLine, WHEEL, type TeamSeason } from './Draft'
import { DetailGrid, LINES } from './Stat'
import { useUserMode } from '../state/viewmode'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const posOf = (name: string) => eligible(LINES[name]?.pos)

/**
 * THE ROSTER'S SLOT ORDER, PG to C. If the saved order is already legal it is kept exactly — a
 * switch the player made by hand is never undone. Otherwise the least-flexible men place first
 * and a matching rebuilds a legal order; a five with no cover comes back unchanged.
 */
export function orderFive(names: string[]): string[] {
  if (names.length === POSITIONS.length && names.every((n, i) => posOf(n).includes(POSITIONS[i]))) return names
  const at: Partial<Record<Pos, string>> = {}
  const order = [...names].sort((a, b) => posOf(a).length - posOf(b).length)
  const fit = (i: number): boolean => {
    if (i === order.length) return true
    for (const x of posOf(order[i])) {
      if (at[x]) continue
      at[x] = order[i]
      if (fit(i + 1)) return true
      delete at[x]
    }
    return false
  }
  if (!fit(0)) return names
  return POSITIONS.map((x) => at[x]!)
}
const f1 = (v: number | undefined) => (v === undefined ? '–' : v.toFixed(1))
/** The name a chip wears: the season tag off, and the surname alone. */
const shortName = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '').split(' ').slice(-1)[0]
const CONF = { E: 'Eastern Conference', W: 'Western Conference' }

/**
 * DEATH MATCH ONLY — the team screen on the map. The five with their durability, and the round's
 * spin: one change between series (plus Extra sub ranks), used here and nowhere else. A worn-out
 * man takes the spin — replacing him IS the change, there is no bonus spin for losing a man.
 *
 * The spin is spent the moment the wheel turns (committed upstream), so walking away from a landed
 * roster does not buy another look. The one exception is the forced case: while a worn-out man is
 * on the five the wheel keeps turning until he is replaced, because a run that cannot field five
 * is not a run.
 */
export function MyTeam({
  five,
  wear,
  boost = 0,
  tactics,
  playbook,
  onTactics,
  bench,
  benchOpen = false,
  heal = 0,
  onSign,
  onRest,
  onReorder,
  allowed,
  used,
  capMax,
  onSpend,
  onSwap,
  onBack,
}: {
  five: Player[]
  wear: Record<string, number>
  /** Iron men: extra durability every man carries, read at evaluation. */
  boost?: number
  /** The plan: who the offense runs through, the tempo, the shot diet, the glass. */
  tactics: Tactics
  /** The Playbook node's rank: 0 none, 1 the men and the tempo, 2 the diet and the glass, 3 all of it. */
  playbook: number
  onTactics: (t: Tactics) => void
  /** The bench node: the sixth man, resting. Null while the spot is empty. */
  bench?: Player | null
  benchOpen?: boolean
  /** Durability the resting man recovers per settled series. */
  heal?: number
  /** The wheel signs a sixth man to an EMPTY bench (spends the change like any spin). */
  onSign?: (inn: string) => void
  /** The free exchange the node sells: the floor man sits, the rested man takes his place. */
  onRest?: (floorName: string) => void
  /** Two floor men switched positions by hand — the new slot order, PG to C. */
  onReorder: (next: string[]) => void
  /** The round's allowance: 1 plus the Survival branch's Extra sub ranks. */
  allowed: number
  /** Changes already spent since the last series settled. */
  used: number
  /** The payroll ceiling — the death match runs on the salary cap. */
  capMax: number
  /** The wheel turned: a change is spent, whatever comes of it. */
  onSpend: () => void
  /** `out` leaves the five, `in` joins it. */
  onSwap: (out: string, inn: string) => void
  onBack: () => void
}) {
  const left = (n: string) => (wear[n] ?? BY_NAME.get(n)?.attrs.durability ?? 99) + boost
  const broken = five.filter((p) => left(p.name) <= WEAR_OUT).map((p) => p.name)
  // A worn-out man's replacement is the round's change, not a bonus on top of it — but every worn
  // man can always be replaced, or the run soft-locks on a five it cannot field.
  const spinsLeft = Math.max(allowed - used, broken.length)
  /**
   * The men this spin may send away: the worn-out ones while any remain, otherwise anyone —
   * including the resting man, and an EMPTY bench itself (a spin can sign a sixth man outright).
   */
  const BENCH_SLOT = '::bench'
  const outs = broken.length
    ? broken
    : [...five.map((p) => p.name), ...(bench ? [bench.name] : []), ...(benchOpen && !bench ? [BENCH_SLOT] : [])]

  // Like the draft, this screen earns the full width of a desktop.
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
    document.body.classList.add('wide')
    return () => document.body.classList.remove('wide')
  }, [])
  const [spinning, setSpinning] = useState(false)
  const [spun, setSpun] = useState<TeamSeason | null>(null)
  const [display, setDisplay] = useState<TeamSeason | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [out, setOut] = useState<string | null>(null)
  /** Resting mode: the bench row was tapped, the next floor tap makes the exchange. */
  const [resting, setResting] = useState(false)
  /** Switching mode: a floor man was tapped with nothing else pending; the next tap trades spots. */
  const [moving, setMoving] = useState<string | null>(null)
  /**
   * The man showing in the band. Declared up here because floorOpts shares one tap between the
   * roster rows and the court spots, so both open him from the same place.
   */
  const [band, setBand] = useState<string | null>(null)
  /** A tap on a man opens him in the band; the same man again closes it. */
  const showMan = (name: string) => setBand((cur) => (cur === name ? null : name))
  /**
   * The rectangle the band lays into, when there is one. Null means this screen at this size has
   * no free floor — a phone, a short window, or every column tall — and the panel goes inline
   * under the man instead, so pressing a player always shows him.
   */
  const [slot, setSlot] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const user = useUserMode()
  const timer = useRef<number | null>(null)

  const capUsed = five.reduce((t, p) => t + (capPct(p.name) ?? 0), 0)
  /**
   * Can these five men cover the five positions at all? A tiny backtracking matching — five men,
   * five slots. This, not "does the new man play the old man's spot", is what makes a swap legal:
   * an SG-only man may replace a PG-only man when the SG already on the five can slide to PG.
   */
  const canField = (names: string[]): boolean => {
    const used = new Set<Pos>()
    const order = [...names].sort((a, b) => posOf(a).length - posOf(b).length)
    const fit = (i: number): boolean => {
      if (i === order.length) return true
      for (const x of posOf(order[i])) {
        if (used.has(x)) continue
        used.add(x)
        if (fit(i + 1)) return true
        used.delete(x)
      }
      return false
    }
    return fit(0)
  }
  /**
   * Who this candidate could replace. A floor swap must leave a five that fields and a payroll
   * that fits; the bench is outside both — the cap judges the five ON THE FLOOR — but a bench
   * man must still be priced, or the free rest-exchange would smuggle him in under the cap.
   */
  const replaceable = (n: string) =>
    capPct(n) === null
      ? []
      : outs.filter((o) =>
          o === BENCH_SLOT || o === bench?.name
            ? true
            : capUsed - (capPct(o) ?? 0) + (capPct(n) ?? 0) <= capMax + 1e-9 &&
              canField([...five.map((p) => p.name).filter((x) => x !== o), n]),
        )

  /** The rest-exchange is legal when the resulting floor five fields and fits the cap. */
  const canRest = (floorName: string) =>
    !!bench &&
    capPct(bench.name) !== null &&
    capUsed - (capPct(floorName) ?? 0) + (capPct(bench.name) ?? 0) <= capMax + 1e-9 &&
    canField([...five.map((p) => p.name).filter((x) => x !== floorName), bench.name])

  /** The five arrive in SLOT ORDER (PG to C) — the saved order is the assignment. */
  const assigned: Record<string, Pos> = Object.fromEntries(five.map((p, i) => [p.name, POSITIONS[i]]))
  /**
   * A hand switch is legal when each man fits the other's spot — which is exactly what
   * canMoveSlot says, so it says it. Tapping two men and dragging one onto the other now run the
   * same rule out of engine/slots rather than two copies of it.
   */
  const asSlots = (): Slots => Object.fromEntries(five.map((p, i) => [POSITIONS[i], p.name]))
  const canSwitch = (a: string, b: string) => {
    const ia = five.findIndex((p) => p.name === a)
    const ib = five.findIndex((p) => p.name === b)
    return ia >= 0 && ib >= 0 && canMoveSlot(asSlots(), posOf, POSITIONS[ia], POSITIONS[ib])
  }
  const doSwitch = (a: string, b: string) => {
    const ia = five.findIndex((p) => p.name === a)
    const ib = five.findIndex((p) => p.name === b)
    if (ia < 0 || ib < 0) return
    const next = moveSlot(asSlots(), posOf, POSITIONS[ia], POSITIONS[ib])
    onReorder(POSITIONS.map((x) => next[x]).filter((n): n is string => !!n))
  }
  /** The court's own gesture: slot to slot, same rule, same commit. */
  const courtSwap = {
    can: (from: string, to: string) => canMoveSlot(asSlots(), posOf, from as Pos, to as Pos),
    commit: (from: string, to: string) => {
      const next = moveSlot(asSlots(), posOf, from as Pos, to as Pos)
      onReorder(POSITIONS.map((x) => next[x]).filter((n): n is string => !!n))
      setMoving(null)
    },
  }

  const taken = new Set([...five.map((p) => bare(p.name)), ...(bench ? [bare(bench.name)] : [])])
  // Every position is open to the wheel — a swap can free ANY slot through a reshuffle, and the
  // afford callback below runs the exact matching per candidate anyway.
  const openPos = [...POSITIONS]

  const spin = () => {
    if (spinning || spun || spinsLeft <= 0) return
    onSpend() // the wheel does not turn twice for one change
    setSpinning(true)
    const steps = 14
    let i = 0
    const tick = () => {
      setDisplay(WHEEL[Math.floor(Math.random() * WHEEL.length)])
      i++
      if (i < steps) {
        timer.current = window.setTimeout(tick, 45 + i * i * 1.2)
      } else {
        const res = landOn(taken, openPos, () => Math.random(), null, (n) => replaceable(n).length > 0)
        setDisplay(res)
        setSpun(res)
        setSpinning(false)
      }
    }
    tick()
  }

  const confirm = () => {
    if (!sel || !out || !replaceable(sel).includes(out)) return
    if (out === BENCH_SLOT) onSign?.(sel)
    else onSwap(out, sel)
    setSpun(null)
    setDisplay(null)
    setSel(null)
    setOut(null)
    setInfo(null)
  }

  const row = (p: Player, opts: { sub: string; dim?: boolean; on?: boolean; onTap?: () => void; dur?: number; worn?: boolean }) => {
    /**
     * HIS RULING: "Remove what Ive marked, no need for duplicates". The same duplicate the draft
     * had: pressing a man here opened his archetype card AND, right under it, the tap-open grid —
     * the same season, the same fourteen numbers, twice. The card is the one that stays (it carries
     * the tag's sentence too), so while it is up the grid does not print, and the row's chevron
     * closes the card rather than doing nothing. Everything the grid alone used to say — who he was
     * that season, and the league's TS — reads on the card, via seasonWho() / leagueTS().
     */
    const carded = band === p.name && !slot
    return (
    <div key={p.name} style={{ display: 'contents' }}>
      <div
        className={`row dr ${opts.on ? 'on' : ''} ${opts.dim ? 'off' : ''}`}
        role="button"
        tabIndex={0}
        onClick={opts.onTap}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && opts.onTap) {
            e.preventDefault()
            opts.onTap()
          }
        }}
      >
        <span className="pname">
          {/* his report: the sub line's durability tail truncates on the phone — the number gets its own badge */}
          {opts.dur !== undefined ? (
            <span className={`mt-dur ${opts.worn ? 'danger' : ''}`}>
              <b>{opts.dur}</b>
              <i>DUR</i>
            </span>
          ) : null}
          <span className="who">
            <CardName p={p} />
            <i>{opts.sub}</i>
            <i className="sal">{salaryLine(p.name)}</i>
          </span>
        </span>
        <span className="mini">
          {f1(LINES[p.name]?.ppg)} <i>·</i> {f1(LINES[p.name]?.rpg)} <i>·</i> {f1(LINES[p.name]?.apg)}
        </span>
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
      {carded ? <ManBand p={p} inline /> : null}
      {info === p.name && !carded ? <DetailGrid p={p} mode="stats" /> : null}
    </div>
    )
  }

  const roster = spun
    ? spun.p
        .filter((n) => !taken.has(bare(n)))
        .map((n) => BY_NAME.get(n)!)
        .filter(Boolean)
        // his ruling (same as the draft wheel): the roster reads like a box score — points first, OVR the tiebreak
        .sort((a, b) => (LINES[b.name]?.ppg ?? 0) - (LINES[a.name]?.ppg ?? 0) || b.ovr - a.ovr)
    : []

  // One source of truth for a floor man's state: the rows and the court spots share it,
  // so a tap on the court IS the tap on his row — swap, rest, switch, all of it.
  const floorOpts = (p: Player) => {
    const worn = left(p.name) <= WEAR_OUT
    const blocked =
      (sel ? !replaceable(sel).includes(p.name) : false) ||
      (resting ? !canRest(p.name) : false) ||
      (moving !== null && moving !== p.name ? !canSwitch(moving, p.name) : false)
    // his ruling: the band fills on the tap that is already there — the swap, the rest, the
    // position switch all still happen, and the man's sentence and season line come up with them
    const act = sel
        ? () => setOut(outs.includes(p.name) && replaceable(sel).includes(p.name) ? p.name : out)
        : resting
          ? () => {
              if (!canRest(p.name)) return
              onRest?.(p.name)
              setResting(false)
            }
          : moving
            ? () => {
                if (moving === p.name) return setMoving(null)
                if (!canSwitch(moving, p.name)) return
                doSwitch(moving, p.name)
                setMoving(null)
              }
            : () => setMoving(p.name)
    return { worn, blocked, on: out === p.name || moving === p.name, onTap: () => { act(); showMan(p.name) } }
  }
  const benchTap = bench
    ? sel
      ? () => setOut(replaceable(sel).includes(bench.name) ? bench.name : out)
      : () => {
          setMoving(null)
          setResting((r) => !r)
        }
    : undefined
  /** The gated plan — an ungated call shows nothing on the floor, same law as the sim. */
  const plan = gateTactics(tactics, playbook)
  /**
   * Which side of the ball he is coaching. It lives here, not in the court, because his
   * ruling made it govern the whole screen: the floor's shape AND which half of the panel
   * is on show. Held for as long as he is on the screen, so changing a call never bounces
   * him back to offense.
   */
  const [side, setSide] = useState<Side>('off')
  /** What each side actually has to offer at this Playbook rank. */
  const sideHas = { off: playbook >= 1, def: playbook >= 2 }

  /**
   * HIS RULING — the five outrank the plan. "When making a change in my team, make sure
   * that everything is visable and I dont have to scroll down to see the players. If there
   * is no enough space, dont show me the tactics."
   *
   * So the third box is conditional, and the condition is MEASURED, not guessed at from a
   * breakpoint: with the men's box and the floor laid out as they actually are, does the
   * bottom of the floor still land above the dock? Stacked on a phone the two heights add;
   * side by side on a desk the taller one governs. A 24px hysteresis band stops the panel
   * flickering as dropping it reflows the columns that produced the measurement.
   */
  const menBox = useRef<HTMLElement | null>(null)
  const floorBox = useRef<HTMLElement | null>(null)
  /** The wheel's box, and the men inside it that scroll rather than pushing the page down. */
  const wheelBox = useRef<HTMLElement | null>(null)
  const rosterList = useRef<HTMLDivElement | null>(null)
  const [rosterEnd, setRosterEnd] = useState(false)
  const onRosterScroll = () => {
    const el = rosterList.current
    if (el) setRosterEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
  }
  const [tight, setTight] = useState(false)
  /**
   * The man whose card is open in the band, and how much black floor there is to put it on. The
   * room is measured from the bottom of the boxes to the dock, so the band only ever occupies
   * space the layout already had — it cannot push a box, the dock, or the page.
   */
  const bandMan = band ? (five.find((p) => p.name === band) ?? roster.find((p) => p.name === band) ?? (bench?.name === band ? bench : null)) : null
  const [showAnyway, setShowAnyway] = useState(false)
  /** A change is in play: the wheel has turned, or a man is picked, resting or moving. */
  const changing = !!(spun || spinning || sel || out || resting || moving)
  const measure = (reset = false) => {
    const a = menBox.current
    const b = floorBox.current
    if (!a || !b) return
    const stacked = window.innerWidth < 900
    const top = a.getBoundingClientRect().top + window.scrollY
    const dock = document.querySelector<HTMLElement>('.dock')
    const avail = window.innerHeight - top - (dock?.offsetHeight ?? 0)
    // stacked, the two heights add; side by side, the taller one governs
    // The landed roster gets whatever is left between the top of the list and the dock, so the
    // page never scrolls no matter how long the team is. Floor of 3 rows: below that, scroll it.
    const list = rosterList.current
    // Stacked on a phone the page scrolls whatever we do — four boxes never fit 812px — so the
    // list runs its full length there rather than trapping him in a scroll inside a scroll, which
    // is miserable with a thumb. The ordering is what saves him on that width: the wheel's men sit
    // directly under his five. The cap is for the side-by-side layout, where the page CAN fit.
    if (list && stacked) {
      // overflow off too, not just the cap: a couple of rounding pixels are enough to make the box
      // scrollable, and a 4px nested scroller eats the thumb swipe meant for the page.
      list.style.maxHeight = ''
      list.style.overflowY = 'visible'
    }
    if (list && !stacked) {
      list.style.overflowY = 'auto'
      // What trails the list inside its card (the card's own bottom padding) has to come out of
      // the budget too, or the card clears the dock by exactly that much and the page scrolls.
      const card = wheelBox.current?.querySelector('.card')
      const lb = list.getBoundingClientRect()
      const trail = card ? Math.max(0, card.getBoundingClientRect().bottom - lb.bottom) : 0
      const room = window.innerHeight - lb.top - (dock?.offsetHeight ?? 0) - trail - 8
      list.style.maxHeight = `${Math.max(196, Math.round(room))}px`
      setRosterEnd(list.scrollTop + list.clientHeight >= list.scrollHeight - 2)
    }
    if (list && stacked) setRosterEnd(true)
    /*
     * THE BLACK RECTANGLE is not the strip under the grid — that is 22px. It is the floor under
     * the two SHORT columns, beside the tall one: the wheel's box runs to the bottom of the row
     * while the five and the floor stop well above it. So the room is the row's bottom minus
     * whichever of those two reaches lower, and the band is laid into that rectangle end-aligned.
     * Measured without the band in the sum, so mounting it can never feed back into the row.
     */
    const grid = a.parentElement
    const rowBottom = grid ? Math.min(grid.getBoundingClientRect().bottom, window.innerHeight - (dock?.offsetHeight ?? 0)) : 0
    const cols = grid ? ([...grid.children] as HTMLElement[]).filter((e) => e.classList.contains('col')) : []
    setSlot(stacked || !grid ? null : bandSlot(grid, cols, rowBottom))
    const need = stacked ? a.offsetHeight + b.offsetHeight : Math.max(a.offsetHeight, b.offsetHeight)
    // The latch only opens on a real viewport change. Dropping the plan reflows the very columns
    // this measured, so letting content alone clear it would flip the panel on and off forever.
    setTight((was) => (need > avail ? true : reset ? false : was))
  }
  // Re-measured on every state that changes what the two boxes are tall enough to hold, because
  // a ResizeObserver alone does not fire in a backgrounded tab.
  useEffect(measure)
  useEffect(() => {
    const onResize = () => measure(true)
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(() => measure())
    if (menBox.current) ro.observe(menBox.current)
    if (floorBox.current) ro.observe(floorBox.current)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])
  /** The plan is only sacrificed while he is actually deciding, and never against his say-so. */
  const dropTactics = tight && changing && !showAnyway
  /** What the panel is worth, kept sayable even when the panel itself is gone. */
  const worth = (() => {
    if (user || playbook <= 0) return null
    const w = tacticsParts(gateTactics(tactics, playbook), five).reduce((a, x) => a + x.pts, 0)
    return `${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(1)}`
  })()

  return (
    <>
      <div className="topbar">
        <span>My team</span>
        <span>
          {spinsLeft > 0 ? (
            <b>
              {spinsLeft} {spinsLeft === 1 ? 'change' : 'changes'} left
            </b>
          ) : (
            'no changes left'
          )}
        </span>
        <button onClick={onBack}>← Map</button>
      </div>
      <div className="ladder" />
      {/* two columns only when the plan has stepped aside AND nothing took its box — mid-swap the
          wheel is already in it, so the grid stays three across. */}
      <div className={`myteam ${dropTactics && !display ? 'plan-hidden' : ''}`} style={{ paddingTop: 8 }}>
        {/* BOX ONE — the men. His ruling put the stats and the durability on the left, and the
            court no longer stands above them: these five rows are the first thing on the screen
            at every width, so a change never asks him to scroll to see who he is deciding about. */}
        <section className="col a" ref={menBox}>
          <div className="card" style={{ paddingBottom: 4 }}>
            <div className="card-head">
              <span className="label">Your five</span>
              {/* the payroll rides with the men — the salary line is printed on these rows */}
              <span className="cap">
                {capUsed.toFixed(1)}% of {capMax}% cap
              </span>
            </div>
            {five.map((p) => {
              const o = floorOpts(p)
              return row(p, {
                // the number lives in the DUR badge now, so the sub can never truncate it away
                sub: o.worn
                  ? `${assigned[p.name] ?? posOf(p.name)[0]} · ${archetype(p)} · WORN OUT — must be replaced`
                  : `${assigned[p.name] ?? posOf(p.name)[0]}${posOf(p.name).length > 1 ? ` (plays ${posOf(p.name).join(' · ')})` : ''} · ${archetype(p)}`,
                dur: left(p.name),
                worn: o.worn,
                dim: o.worn || o.blocked,
                on: o.on,
                onTap: o.onTap,
              })
            })}
            {benchOpen ? (
              bench ? (
                row(bench, {
                  sub: `BENCH · ${archetype(bench)} · resting, does not play${heal ? ` · +${heal} a series` : ''}`,
                  dur: left(bench.name),
                  on: resting || out === bench.name,
                  onTap: benchTap,
                })
              ) : sel ? (
                <button className={`sortb ${out === BENCH_SLOT ? 'on' : ''}`} style={{ margin: '6px 0 10px' }} onClick={() => setOut(BENCH_SLOT)}>
                  Sign him to the empty bench →
                </button>
              ) : (
                <div className="seriesnow-note">The bench is empty — the wheel can sign a sixth man outright.</div>
              )
            ) : null}
            {sel
              ? (() => {
                  const legal = replaceable(sel).filter((o) => o !== BENCH_SLOT)
                  const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')
                  return (
                    <div className="seriesnow-note">
                      {legal.length
                        ? `${short(sel)} (${capPct(sel) ?? 0}% of cap) fits over: ${legal.map(short).join(', ')}.`
                        : `${short(sel)} has no legal way in.`}{' '}
                      The dimmed men cannot make way — the swap must leave a five that fields and a payroll inside the {capMax}% cap.
                    </div>
                  )
                })()
              : null}
            {resting ? <div className="seriesnow-note">Tap the floor man who sits — the exchange is free, positions permitting.</div> : null}
            <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
              {broken.length
                ? `${broken.length === 1 ? 'A man is' : `${broken.length} men are`} worn out — the spin replaces ${broken.length === 1 ? 'him' : 'them'}, and nothing else.`
                : 'A series costs every man who plays it one durability a game. The wheel spends the change the moment it turns.'}
            </div>
          </div>
        </section>
        {/* BOX TWO — where they stand. The court and its OFFENSE/DEFENSE toggle, which still
            governs the whole screen; the position note rides with it, positions being its subject. */}
        <section className="col b" ref={floorBox}>
          <div className="card" style={{ paddingBottom: 4 }}>
            <div className="card-head">
              <span className="label">On the floor</span>
            </div>
            {/* his ruling: the five stands on the floor — same taps as the rows beside it, plan and all */}
            <CourtFive
              plan={plan}
              side={side}
              onSide={setSide}
              swap={courtSwap}
              spots={five.map((p, i) => {
                const o = floorOpts(p)
                return {
                  p,
                  // the slot is what the drag picks him up BY, and what data-slot publishes as a target
                  slot: POSITIONS[i],
                  tag: o.worn ? `${POSITIONS[i]} · worn out` : `${POSITIONS[i]} · ${left(p.name)} left`,
                  danger: o.worn,
                  dim: !o.worn && o.blocked,
                  on: o.on,
                  onTap: o.onTap,
                }
              })}
              bench={
                benchOpen && bench
                  ? {
                      p: bench,
                      tag: `bench · ${left(bench.name)}${heal ? ` · +${heal}/srs` : ''}`,
                      on: resting || out === bench.name,
                      onTap: benchTap,
                    }
                  : null
              }
            />
            {moving ? (
              <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
                Tap the man he switches positions with — both must fit the other’s spot. Tap him again to cancel.
              </div>
            ) : null}
          </div>
        </section>
        {/* BOX THREE — the plan while he is planning, the landed roster while he is swapping.
            His ruling: mid-swap the two lists he chooses between are his five and the wheel's men,
            so the wheel takes this box outright rather than growing underneath the plan in the
            narrowest column on the screen. */}
        {!display ? (
        <section className="col c">
          {dropTactics ? (
            <div className="card" style={{ paddingBottom: 4 }}>
              <div className="card-head">
                <span className="label">Tactics</span>
                <span className="cap">{worth ? `worth ${worth} pts of spread` : 'set'}</span>
              </div>
              <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
                Your plan is still called and still priced — it is out of the way while you make the change, so
                the five stay on one screen.
              </div>
              <button className="sortb" style={{ margin: '0 0 10px' }} onClick={() => setShowAnyway(true)}>
                Show the tactics anyway →
              </button>
            </div>
          ) : (
          <div className="card" style={{ paddingBottom: 4 }}>
            <div className="card-head">
              <span className="label">Tactics</span>
              <span className="cap">
                {playbook <= 0
                  ? 'locked'
                  : user
                    ? 'your plan'
                    : (() => {
                        const w = tacticsParts(gateTactics(tactics, playbook), five).reduce((a, x) => a + x.pts, 0)
                        return `worth ${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(1)} pts of spread`
                      })()}
              </span>
            </div>
            {/* his ruling: the court's toggle governs the whole screen, so the panel shows one
                side at a time. The group headings are gone with it — a rule reading OFFENSE
                directly under a lit OFFENSE chip said the same thing twice and cost a row. */}
            {/* HIS RULING: "Helio will overtake main playmaker and scorrer, as helio becomes both".
                While helio is called, the creator holds both jobs, so the two rows stop taking a
                call: they grey out and say who has it instead. The saved names are untouched
                underneath and come back the moment the style changes. */}
            {side === 'off' && playbook >= 1 ? ([
              ['Main scorer', 'scorer'],
              ['Main playmaker', 'playmaker'],
            ] as const).map(([label, key]) => {
              const heliMans = tactics.style === 'helio' && playbook >= 2 ? heliMan(five, tactics.helio).creator : null
              return (
              <div className={`posbar ${heliMans ? 'superseded' : ''}`} key={key}>
                <span className="cap">{label}</span>
                {heliMans ? (
                  <span className="tnote">helio · {shortName(heliMans.name)} runs everything</span>
                ) : (
                <ChipRow>
                  <button className={`sortb ${tactics[key] === null ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, [key]: null })}>
                    —
                  </button>
                  {five.map((p) => (
                    <button
                      key={p.name}
                      className={`sortb ${tactics[key] === p.name ? 'on' : ''}`}
                      onClick={() => onTactics({ ...tactics, [key]: p.name })}
                    >
                      {shortName(p.name)}
                    </button>
                  ))}
                </ChipRow>
                )}
              </div>
            )}) : null}
            {side === 'off' && playbook >= 1 ? (
            <div className="posbar">
              <span className="cap">Tempo</span>
              <ChipRow>
                {(['slow', 'normal', 'fast'] as const).map((k) => (
                  <button key={k} className={`sortb ${tactics.tempo === k ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, tempo: k })}>
                    {k}
                  </button>
                ))}
              </ChipRow>
            </div>
            ) : null}
            {side === 'off' && playbook >= 2 ? (
            <div className="posbar">
              <span className="cap">Playstyle</span>
              <ChipRow>
                {STYLES.map(({ key, label }) => (
                  <button key={key} className={`sortb ${tactics.style === key ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, style: key })}>
                    {key === 'balanced' || user ? label : `${label} ${Math.round(styleFit(key, five, undefined, tactics))}`}
                  </button>
                ))}
              </ChipRow>
            </div>
            ) : null}
            {/* HIS RULING: "When selenting pnr you have to select the 2 handler and screener". The
                pick-and-roll is two calls, so calling it opens two more rows — the same chips as
                Main scorer, the same five men. They open lit on the pair the engine would pick
                itself, so the call is never blank and never a mystery; naming a man who already
                holds the other job trades the two rather than putting one man in both. */}
            {side === 'off' && playbook >= 2 && (tactics.style === 'pnr' || tactics.style === 'pickpop')
              ? (() => {
                  // recal_129: pick-and-pop is the same two men, so it opens the same two rows and
                  // reads the same `pnr` field — only the engine's default screener differs
                  const pair = tactics.style === 'pickpop' ? popPair(five, tactics.pnr) : pnrPair(five, tactics.pnr)
                  const at = { handler: pair.handler?.name ?? '', screener: pair.screener?.name ?? '' }
                  const call = (role: 'handler' | 'screener', name: string) => {
                    const other = role === 'handler' ? 'screener' : 'handler'
                    const next = { ...at, [role]: name }
                    if (next[other] === name) next[other] = at[role] && at[role] !== name ? at[role] : (five.find((q) => q.name !== name)?.name ?? name)
                    onTactics({ ...tactics, pnr: { handler: next.handler, screener: next.screener } })
                  }
                  return ([
                    ['Handler', 'handler'],
                    ['Screener', 'screener'],
                  ] as const).map(([label, role]) => (
                    <div className="posbar" key={role}>
                      <span className="cap">{label}</span>
                      <ChipRow>
                        {five.map((p) => (
                          <button key={p.name} className={`sortb ${at[role] === p.name ? 'on' : ''}`} onClick={() => call(role, p.name)}>
                            {shortName(p.name)}
                          </button>
                        ))}
                      </ChipRow>
                    </div>
                  ))
                })()
              : null}
            {/* HIS RULING: "In post up playstyle, there need to be a post up target." The mirror of
                the pair, for one man: calling post-up opens one more row, the same chips as Main
                scorer and the same five men. It opens lit on the hub the engine would feed itself,
                so the call is never blank; tapping the lit man is a no-op rather than a way to
                un-call it, exactly as the pair's rows behave. */}
            {side === 'off' && playbook >= 2 && tactics.style === 'postup'
              ? (() => {
                  const hub = postMan(five, tactics.post).hub?.name ?? ''
                  return (
                    <div className="posbar">
                      <span className="cap">Post target</span>
                      <ChipRow>
                        {five.map((p) => (
                          <button
                            key={p.name}
                            className={`sortb ${hub === p.name ? 'on' : ''}`}
                            onClick={() => onTactics({ ...tactics, post: p.name })}
                          >
                            {shortName(p.name)}
                          </button>
                        ))}
                      </ChipRow>
                    </div>
                  )
                })()
              : null}
            {/* HIS RULING: "Add pick n pop". One line so the difference from the roll is on the
                screen and not only in the number: the screener shoots instead of diving. */}
            {side === 'off' && playbook >= 2 && tactics.style === 'pickpop' ? (
              <div className="posbar superseded">
                <span className="cap">Pick-and-pop</span>
                <span className="tnote">the screener steps out — his jumper, not his roll</span>
              </div>
            ) : null}
            {/* HIS RULING: "Add Triangle". The triangle names nobody — it is a read, not a call on a
                man — so instead of a chip row it says what the engine found: who the entry pass
                goes to, and how many men on the floor can play out of it. */}
            {side === 'off' && playbook >= 2 && tactics.style === 'triangle'
              ? (() => {
                  const post = postOption(five)
                  const readers = triangleReaders(five).length
                  return (
                    <div className="posbar superseded">
                      <span className="cap">Triangle</span>
                      <span className="tnote">
                        {post ? `${shortName(post.name)} on the block · ${readers} read${readers === 1 ? 'er' : 'ers'}` : 'no post option'}
                      </span>
                    </div>
                  )
                })()
              : null}
            {/* HIS RULING: "In helio, allow me to pick a creator." The third one-man call, opening
                lit on the man the engine would run the offense through — and the row above it has
                just told him this same man is now his scorer and his playmaker too. */}
            {side === 'off' && playbook >= 2 && tactics.style === 'helio'
              ? (() => {
                  const c = heliMan(five, tactics.helio).creator?.name ?? ''
                  return (
                    <div className="posbar">
                      <span className="cap">Creator</span>
                      <ChipRow>
                        {five.map((p) => (
                          <button key={p.name} className={`sortb ${c === p.name ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, helio: p.name })}>
                            {shortName(p.name)}
                          </button>
                        ))}
                      </ChipRow>
                    </div>
                  )
                })()
              : null}
            {side === 'off' && playbook >= 3 ? (
            <div className="posbar">
              <span className="cap">Hunt the mismatch</span>
              <ChipRow>
                <button className={`sortb ${tactics.hunt ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, hunt: !tactics.hunt })}>
                  {tactics.hunt ? 'hunting' : 'off'}
                </button>
              </ChipRow>
            </div>
            ) : null}
            {/* the glass is two calls, not one: sending men to the offensive boards and ganging
                the defensive boards are priced apart, so each sits with its own side */}
            {side === 'off' && playbook >= 2 ? (
            <div className="posbar">
              <span className="cap">Crash the glass</span>
              <ChipRow>
                <button className={`sortb ${tactics.crashOff ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, crashOff: !tactics.crashOff })}>
                  {tactics.crashOff ? 'crashing' : 'off'}
                </button>
              </ChipRow>
            </div>
            ) : null}
            {side === 'def' && playbook >= 3 ? (
            <div className="posbar">
              <span className="cap">Defensive scheme</span>
              <ChipRow>
                {SCHEMES.map(({ key, label }) => (
                  <button key={key} className={`sortb ${tactics.scheme === key ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, scheme: key })}>
                    {key === 'matchup' || user ? label : `${label} ${Math.round(schemeFit(key, five))}`}
                  </button>
                ))}
              </ChipRow>
            </div>
            ) : null}
            {side === 'def' && playbook >= 2 ? (
            <div className="posbar">
              <span className="cap">Crash the glass</span>
              <ChipRow>
                <button className={`sortb ${tactics.crashDef ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, crashDef: !tactics.crashDef })}>
                  {tactics.crashDef ? 'crashing' : 'off'}
                </button>
              </ChipRow>
            </div>
            ) : null}
            {/* a side with nothing on it says what opens it, rather than going blank */}
            {playbook >= 1 && !sideHas[side] ? (
              <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
                Nothing to call on defense yet — the next Playbook rank opens the glass, and the one after it the
                scheme and the hunt.
              </div>
            ) : null}
            {(() => {
              if (user) return null
              if (playbook <= 0)
                return (
                  <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
                    Tactics are called from the bench: the PLAYBOOK node, at the end of the Coach branch, opens them — the men and the tempo first, then the shot diet and the glass, then the scheme and the hunt.
                  </div>
                )
              const plan = gateTactics(tactics, playbook)
              const parts = tacticsParts(plan, five)
              return parts.length ? (
                <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
                  {parts.map((x) => `${x.label} ${x.pts >= 0 ? '+' : '−'}${Math.abs(x.pts).toFixed(1)}`).join(' · ')}
                  {plan.scheme !== 'matchup' || plan.hunt ? ' · the scheme and the hunt price fully at the draft, against the level’s five' : ''}
                  {plan.tempo !== 'normal'
                    ? ` · ${plan.tempo} pace: your surplus ${usageSurplus(five) >= 0 ? '+' : ''}${usageSurplus(five).toFixed(0)} — the matchup readout is at the draft`
                    : ''}
                </div>
              ) : (
                <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
                  Every call is priced by the five you actually have — with the grain it pays, against it it costs.
                  {playbook < 3 ? ` The next Playbook rank opens ${playbook === 1 ? 'the shot diet and the glass' : 'the scheme and the hunt'}.` : ''}
                </div>
              )
            })()}
          </div>
          )}
        </section>
        ) : null}
        {display ? (
          <section className="col c wheel" ref={wheelBox}>
            <div className={`card ${spinning ? 'spin-live' : ''}`}>
              <div className="card-head">
                <span className="label">{spinning ? 'The wheel is spinning' : 'It lands on'}</span>
              </div>
              <div className="spin-team">{display.team}</div>
              <div className="spin-sub">
                {display.y} · {CONF[display.c]}
                {display.rec ? ` · ${display.rec}` : ''}
              </div>
              {spun && !spinning ? (
                <>
                  <div className="rowhead dr">
                    <span>Roster · {roster.length}</span>
                    <span className="gcap">PTS · REB · AST</span>
                    <span />
                  </div>
                  {/* The head and the column rule stay put; only the men scroll, in a box measured
                      to stop above the dock. An edge fade says there is more below. */}
                  <div className={`spin-wrap ${rosterEnd ? 'at-end' : ''}`}>
                  <div className="spin-roster" ref={rosterList} onScroll={onRosterScroll}>
                  {roster.map((p) => {
                    const outsFor = replaceable(p.name)
                    return row(p, {
                      sub: `${posOf(p.name).join(' · ')} · ${archetype(p)}${outsFor.length ? '' : ' · no legal swap'}`,
                      dim: !outsFor.length,
                      on: sel === p.name,
                      onTap: () => {
                        showMan(p.name)
                        if (!outsFor.length) return
                        setResting(false)
                        setSel(sel === p.name ? null : p.name)
                        setOut(outsFor.length === 1 ? outsFor[0] : null)
                      },
                    })
                  })}
                  </div>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        ) : null}
        {/* Only where the floor exists: on a phone the boxes stack, the rectangle is zero, and
            nothing mounts — that width keeps the route it has, the row's own detail toggle. */}
        {slot ? <ManBand p={bandMan} at={slot} /> : null}
      </div>
      <div className="dock">
        <div className="dock-inner">
          {spinning ? (
            <button className="btn" disabled>
              Spinning…
            </button>
          ) : spun ? (
            <button className="btn" disabled={!sel || !out} onClick={confirm}>
              {sel && out
                ? out === BENCH_SLOT
                  ? `Sign ${sel} to the bench`
                  : `${sel} in, ${out} out`
                : sel
                  ? 'Tap the man he replaces'
                  : 'Tap a player to swap him in'}
            </button>
          ) : spinsLeft > 0 ? (
            <button className="btn" onClick={spin}>
              {broken.length ? 'Spin to replace him' : 'Change a man · spin'}
            </button>
          ) : (
            <button className="btn ghost" onClick={onBack}>
              No changes left — back to the map
            </button>
          )}
        </div>
      </div>
    </>
  )
}
