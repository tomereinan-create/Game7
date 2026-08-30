import { useEffect, useRef, useState } from 'react'
import { archetype, PLAYERS } from '../engine/pool'
import { eligible, POSITIONS, type Pos } from '../engine/positions'
// (orderFive lives below — the roster's slot order is derived here and honored everywhere)
import { WEAR_OUT } from '../state/campaign'
import type { Player } from '../engine/types'
import { CardName } from './CardSheet'
import { CourtFive } from './CourtFive'
import { gateTactics, styleFit, STYLES, tacticsParts, type Tactics } from '../engine/tactics'
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
  useEffect(() => {
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
  /** A hand switch is legal when each man fits the other's spot. */
  const canSwitch = (a: string, b: string) => {
    const ia = five.findIndex((p) => p.name === a)
    const ib = five.findIndex((p) => p.name === b)
    return ia >= 0 && ib >= 0 && posOf(a).includes(POSITIONS[ib]) && posOf(b).includes(POSITIONS[ia])
  }
  const doSwitch = (a: string, b: string) => {
    const next = five.map((p) => p.name)
    const ia = next.indexOf(a)
    const ib = next.indexOf(b)
    ;[next[ia], next[ib]] = [next[ib], next[ia]]
    onReorder(next)
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

  const row = (p: Player, opts: { sub: string; dim?: boolean; on?: boolean; onTap?: () => void; dur?: number; worn?: boolean }) => (
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
          className={`pinfo ${info === p.name ? 'open' : ''}`}
          aria-label={`${p.name} season line`}
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
    return {
      worn,
      blocked,
      on: out === p.name || moving === p.name,
      onTap: sel
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
            : () => setMoving(p.name),
    }
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
      <div className="myteam" style={{ paddingTop: 8 }}>
        <section className="col a">
          <div className="card" style={{ paddingBottom: 4 }}>
            <div className="card-head">
              <span className="label">Your five</span>
              <span className="cap">
                {capUsed.toFixed(1)}% of {capMax}% cap
              </span>
            </div>
            {/* his ruling: the five stands on the floor — same taps as the rows below, plan and all */}
            <CourtFive
              plan={plan}
              spots={five.map((p, i) => {
                const o = floorOpts(p)
                return {
                  p,
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
            {moving ? (
              <div className="seriesnow-note">
                Tap the man he switches positions with — both must fit the other’s spot. Tap him again to cancel.
              </div>
            ) : null}
            <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
              {broken.length
                ? `${broken.length === 1 ? 'A man is' : `${broken.length} men are`} worn out — the spin replaces ${broken.length === 1 ? 'him' : 'them'}, and nothing else.`
                : 'A series costs every man who plays it one durability a game. The wheel spends the change the moment it turns.'}
            </div>
          </div>
        </section>
        <section className="col b">
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
            {playbook >= 1 ? ([
              ['Main scorer', 'scorer'],
              ['Main playmaker', 'playmaker'],
            ] as const).map(([label, key]) => (
              <div className="posbar" key={key}>
                <span className="cap">{label}</span>
                <div className="poschips">
                  <button className={`sortb ${tactics[key] === null ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, [key]: null })}>
                    —
                  </button>
                  {five.map((p) => (
                    <button
                      key={p.name}
                      className={`sortb ${tactics[key] === p.name ? 'on' : ''}`}
                      onClick={() => onTactics({ ...tactics, [key]: p.name })}
                    >
                      {p.name.replace(/ '\d\d( \([a-z]\))?$/, '').split(' ').slice(-1)[0]}
                    </button>
                  ))}
                </div>
              </div>
            )) : null}
            {playbook >= 1 ? (
            <div className="posbar">
              <span className="cap">Tempo</span>
              <div className="poschips">
                {(['slow', 'normal', 'fast'] as const).map((k) => (
                  <button key={k} className={`sortb ${tactics.tempo === k ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, tempo: k })}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            ) : null}
            {playbook >= 2 ? (
            <div className="posbar">
              <span className="cap">Playstyle</span>
              <div className="poschips">
                {STYLES.map(({ key, label }) => (
                  <button key={key} className={`sortb ${tactics.style === key ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, style: key })}>
                    {key === 'balanced' || user ? label : `${label} ${Math.round(styleFit(key, five))}`}
                  </button>
                ))}
              </div>
            </div>
            ) : null}
            {playbook >= 3 ? (
            <>
            <div className="posbar">
              <span className="cap">Defensive scheme</span>
              <div className="poschips">
                {(['matchup', 'drop', 'switch'] as const).map((k) => (
                  <button key={k} className={`sortb ${tactics.scheme === k ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, scheme: k })}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className="posbar">
              <span className="cap">Hunt the mismatch</span>
              <div className="poschips">
                <button className={`sortb ${tactics.hunt ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, hunt: !tactics.hunt })}>
                  {tactics.hunt ? 'hunting' : 'off'}
                </button>
              </div>
            </div>
            </>
            ) : null}
            {playbook >= 2 ? (
            <div className="posbar">
              <span className="cap">Crash the glass</span>
              <div className="poschips">
                <button className={`sortb ${tactics.crashOff ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, crashOff: !tactics.crashOff })}>
                  offensive
                </button>
                <button className={`sortb ${tactics.crashDef ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, crashDef: !tactics.crashDef })}>
                  defensive
                </button>
              </div>
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
          {display ? (
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
                  {roster.map((p) => {
                    const outsFor = replaceable(p.name)
                    return row(p, {
                      sub: `${posOf(p.name).join(' · ')} · ${archetype(p)}${outsFor.length ? '' : ' · no legal swap'}`,
                      dim: !outsFor.length,
                      on: sel === p.name,
                      onTap: () => {
                        if (!outsFor.length) return
                        setResting(false)
                        setSel(sel === p.name ? null : p.name)
                        setOut(outsFor.length === 1 ? outsFor[0] : null)
                      },
                    })
                  })}
                </>
              ) : null}
            </div>
          ) : null}
        </section>
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
