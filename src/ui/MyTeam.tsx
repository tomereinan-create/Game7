import { useRef, useState } from 'react'
import { PLAYERS } from '../engine/pool'
import { eligible } from '../engine/positions'
import { WEAR_OUT } from '../state/campaign'
import type { Player } from '../engine/types'
import { CardName } from './CardSheet'
import { bare, capPct, landOn, salaryLine, WHEEL, type TeamSeason } from './Draft'
import { DetailGrid, LINES } from './Stat'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const posOf = (name: string) => eligible(LINES[name]?.pos)
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
  allowed,
  used,
  capMax,
  onSpend,
  onSwap,
  onBack,
}: {
  five: Player[]
  wear: Record<string, number>
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
  const left = (n: string) => wear[n] ?? BY_NAME.get(n)?.attrs.durability ?? 99
  const broken = five.filter((p) => left(p.name) <= WEAR_OUT).map((p) => p.name)
  // A worn-out man's replacement is the round's change, not a bonus on top of it — but every worn
  // man can always be replaced, or the run soft-locks on a five it cannot field.
  const spinsLeft = Math.max(allowed - used, broken.length)
  /** The men this spin may send away: the worn-out ones while any remain, otherwise anyone. */
  const outs = broken.length ? broken : five.map((p) => p.name)

  const [spinning, setSpinning] = useState(false)
  const [spun, setSpun] = useState<TeamSeason | null>(null)
  const [display, setDisplay] = useState<TeamSeason | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [out, setOut] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const capUsed = five.reduce((t, p) => t + (capPct(p.name) ?? 0), 0)
  /** Who on the five this candidate could replace: shared position, and the payroll stays legal. */
  const replaceable = (n: string) =>
    capPct(n) === null
      ? []
      : outs.filter(
          (o) => posOf(n).some((x) => posOf(o).includes(x)) && capUsed - (capPct(o) ?? 0) + (capPct(n) ?? 0) <= capMax + 1e-9,
        )

  const taken = new Set(five.map((p) => bare(p.name)))
  const openPos = [...new Set(outs.flatMap((o) => posOf(o)))]

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
    onSwap(out, sel)
    setSpun(null)
    setDisplay(null)
    setSel(null)
    setOut(null)
    setInfo(null)
  }

  const row = (p: Player, opts: { sub: string; dim?: boolean; on?: boolean; onTap?: () => void }) => (
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
        .sort((a, b) => b.ovr - a.ovr)
    : []

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
      <div className="draft" style={{ paddingTop: 8 }}>
        <section className="col a">
          <div className="card" style={{ paddingBottom: 4 }}>
            <div className="card-head">
              <span className="label">Your five</span>
              <span className="cap">
                {capUsed.toFixed(1)}% of {capMax}% cap
              </span>
            </div>
            {five.map((p) =>
              row(p, {
                sub:
                  left(p.name) <= WEAR_OUT
                    ? `${posOf(p.name).join(' · ')} · WORN OUT — must be replaced`
                    : `${posOf(p.name).join(' · ')} · ${left(p.name)} durability left`,
                dim: left(p.name) <= WEAR_OUT,
                on: out === p.name,
                onTap: sel ? () => setOut(outs.includes(p.name) && replaceable(sel).includes(p.name) ? p.name : out) : undefined,
              }),
            )}
            <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
              {broken.length
                ? `${broken.length === 1 ? 'A man is' : `${broken.length} men are`} worn out — the spin replaces ${broken.length === 1 ? 'him' : 'them'}, and nothing else.`
                : 'A series costs every man who plays it one durability a game. The wheel spends the change the moment it turns.'}
            </div>
          </div>
        </section>
        <section className="col b">
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
                      sub: outsFor.length ? posOf(p.name).join(' · ') : `${posOf(p.name).join(' · ')} · no legal swap`,
                      dim: !outsFor.length,
                      on: sel === p.name,
                      onTap: () => {
                        if (!outsFor.length) return
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
              {sel && out ? `${sel} in, ${out} out` : sel ? 'Tap the man he replaces' : 'Tap a player to swap him in'}
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
