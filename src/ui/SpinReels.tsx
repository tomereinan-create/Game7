import { useEffect, useMemo, useRef, useState } from 'react'
import type { TeamSeason } from '../data/wheel'

/**
 * THE WHEEL, AS TWO REELS (his ruling, with a picture of Hearthstone's Finding Opponent screen:
 * "I want 2 wheels, one for team, and one for year. Pressing spin will spin both (unless selected
 * to spin 1 only), and the team will show first, then the year. But instead of a wheel like
 * roullete, it will be like the picture").
 *
 * The picture is not a roulette and not a slot machine either: it is a LIST running past a fixed
 * marker — rows stacked in a window, the one in the middle lit and pinched between two arrows,
 * everything above and below it falling away into the dark. So that is what this is. A strip of
 * rows behind a five-row window, travelling upward and easing to a stop with the answer under the
 * arrows.
 *
 * TWO REELS, AND THE SECOND ONE WAITS. The wheel has always landed on a team-SEASON — one row of
 * the WHEEL, a franchise and a year together — and splitting it in two is what makes it readable:
 * the team stops first and the year keeps running for another second, so you learn which club you
 * got before you learn which of its teams. The year reel is loaded with the seasons that franchise
 * actually has on the wheel, so the two never disagree and the second stop is a real narrowing
 * rather than a decoration.
 *
 * THE RESULT IS STILL DECIDED BEFORE ANYTHING MOVES, exactly as it was with the disc and with the
 * flicker before it — `landOn` picks, and the reels are then run to it. A wheel that decided by
 * where it stopped could stop on a man you cannot field or afford, which is the whole reason
 * `landOn` takes the taken men, the open slots and the afford test.
 */

/** Row height in px. The maths needs it as a number, so it is stated here and not in the CSS. */
const H = 30
/** Rows visible in the window: two above the answer, two below. */
const WINDOW = 5

/*
 * THE SPIN IS THREE PHASES: RUN, BRAKE, STEP.
 *
 * His first ruling — "Have a spinning animation for both ... but make it animated" — killed the one
 * long ease-out, because an ease-out spends most of its distance in its first third and crawls the
 * rest, so the reel slid once and then dawdled. It never read as spinning because it never spun.
 * So the RUN is flat out and LINEAR, and that is the blur.
 *
 * His second — "Instead of it spinning back in the end just have it slowly stops, 1 step back
 * maximum at the end. Like its trying to get to the last part and cant, or its trying to get to the
 * last part and gets there. But not 10 back steps like now" — is about what came after it. A brake
 * that sheds 1.05 px/ms evenly needs 420px to do it in, and 420px is FOURTEEN ROWS: fourteen names
 * grinding past at walking pace, which is the long unnatural tail he is describing.
 *
 * You cannot stop faster without either jolting or slowing down first, so the brake stops ONE ROW
 * SHORT and a third phase takes the last one on its own. The reel therefore comes to rest, and then
 * one final name eases up into the arrows — a single step, and never more than a single step,
 * whatever the reel or the answer. That is the whole of his "1 step maximum at the end".
 *
 * Each hand-off is continuous by construction, so none of them reads as a jerk:
 *   RUN   linear at SPEED.
 *   BRAKE a quadratic ease-out — its speed at t=0 is twice its own average, so making its distance
 *         `SPEED × BRAKE_MS / 2` starts it at exactly the speed the run ended at, and it finishes
 *         at a standstill.
 *   STEP  starts and ends at a standstill too (an ease-in-out), so it can only be the deliberate
 *         last step it looks like.
 */
/** Constant speed of the run, px/ms. 35 rows a second: fast enough to blur, slow enough to read as
 *  names going past rather than as noise. */
const SPEED = 1.05
/** How long the flat-out phase runs on the TEAM reel. */
const SPIN_MS = 1000
/** HIS 0.8s: the year reel simply stays flat out for that much longer before it starts braking. */
export const REEL_STAGGER_MS = 800
/** The brake — down from 800ms, because it now only has to reach the row BEFORE the answer. */
const BRAKE_MS = 420
/** The last step. Slow enough to be watched, which is the point of it. */
const STEP_MS = 280
/** y = 1 − (1 − t)², a quadratic ease-out, as a cubic Bézier. Its initial slope is 2 — see above. */
const BRAKE = 'cubic-bezier(0.333, 0.667, 0.667, 1)'
/** Still at both ends: the reel has stopped, and this is it reaching for the last row. */
const STEP = 'cubic-bezier(0.5, 0.02, 0.32, 1)'

/** When each reel comes to rest, measured from the press. */
export const REEL_TEAM_MS = SPIN_MS + BRAKE_MS + STEP_MS
export const REEL_YEAR_MS = SPIN_MS + REEL_STAGGER_MS + BRAKE_MS + STEP_MS

export interface ReelSpin {
  team: { rows: string[]; at: number }
  year: { rows: string[]; at: number }
  /** Bumped on every spin, so landing on the same row twice still runs the reel. */
  nonce: number
  /** Which reel was held still for this spin, if either. */
  held: Hold
}

/** Nothing held spins both; holding one is his "spin 1 only". */
export type Hold = 'team' | 'year' | null

/** Enough rows for the window to look like a list rather than a label. */
const MIN_ROWS = 7

/**
 * Load the two reels so that both land on the team-season `landOn` chose.
 *
 * The team reel is that franchise plus a dozen others; the year reel is the seasons THAT franchise
 * has on the wheel, which is why the year can only be read after the team has stopped.
 */
export function buildReels(landed: TeamSeason, pool: TeamSeason[], rnd: () => number, nonce: number, held: Hold = null, prev?: ReelSpin | null): ReelSpin {
  const teams: string[] = [landed.team]
  const seen = new Set([landed.team])
  let guard = 0
  while (teams.length < 13 && guard++ < 900) {
    const t = pool[Math.floor(rnd() * pool.length)]
    if (!t || seen.has(t.team)) continue
    seen.add(t.team)
    teams.push(t.team)
  }
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[teams[i], teams[j]] = [teams[j], teams[i]]
  }

  const years = [...new Set(pool.filter((t) => t.team === landed.team).map((t) => t.y))].sort((a, b) => a - b)
  // a franchise the wheel holds three seasons of gives a three-row reel; repeat it rather than
  // invent years it never played, so the strip is long enough to read as a list
  const rows: number[] = []
  while (rows.length < MIN_ROWS && years.length) rows.push(...years)
  const yearRows = (rows.length ? rows : [landed.y]).map(String)

  const built = {
    team: { rows: teams, at: Math.max(0, teams.indexOf(landed.team)) },
    year: { rows: yearRows, at: Math.max(0, yearRows.indexOf(String(landed.y))) },
  }
  // A HELD REEL IS HELD, not rebuilt: it keeps the rows it was already showing, so the one thing
  // that did not spin does not quietly reshuffle its neighbours underneath the answer.
  return {
    team: held === 'team' && prev ? prev.team : built.team,
    year: held === 'year' && prev ? prev.year : built.year,
    nonce,
    held,
  }
}

/** Where the strip sits when row `index` of it is under the arrows. */
export const offsetOf = (index: number) => -(index * H) + Math.floor(WINDOW / 2) * H

export interface ReelPlan {
  /** How many rows to lay end to end, so the strip never runs out from under the window. */
  strip: number
  /** Where it starts, where the brake takes over, where the brake leaves it, and where it rests. */
  start: number
  mid: number
  step: number
  end: number
  spinMs: number
  brakeMs: number
  stepMs: number
}

/**
 * The whole journey, worked out backwards from the one position that has to be exact.
 *
 * Only the END has to line up — the answer under the arrows — so the landing row is the LAST row of
 * the strip that carries it and still leaves the two rows the window shows below it. Everything
 * before that is measured in pixels off the end: brake distance, then spin distance. The strip is
 * then made long enough to hold the lot, in whole copies of the list so the rows repeat evenly.
 */
export function reelPlan(rows: number, at: number, spinMs: number): ReelPlan {
  const brake = (SPEED * BRAKE_MS) / 2
  const run = SPEED * spinMs
  // rows the journey needs — run, brake and the one last step — plus the window and a row of slack,
  // rounded up to whole copies of the list
  const need = Math.ceil((run + brake + H) / H) + WINDOW + 2
  const copies = Math.max(2, Math.ceil((need + rows) / rows))
  const strip = copies * rows
  // the last row of the strip that is `at`, keeping the two rows the window shows underneath it
  const below = Math.floor(WINDOW / 2)
  let land = at
  while (land + rows <= strip - 1 - below) land += rows
  const end = offsetOf(land)
  // THE BRAKE STOPS ONE ROW SHORT. Everything before is measured back from there, so the last step
  // is exactly one row — H — and cannot be anything else.
  const step = end + H
  return { strip, start: step + brake + run, mid: step + brake, step, end, spinMs, brakeMs: BRAKE_MS, stepMs: STEP_MS }
}

function Reel({
  label,
  rows,
  at,
  ms,
  spinning,
  frozen,
  held,
  onHold,
  nonce,
  wide,
}: {
  label: string
  rows: string[]
  at: number
  ms: number
  spinning: boolean
  /** Was this reel held for the spin now running — i.e. must it stay where it is? */
  frozen: boolean
  /** Is it held for the NEXT one? That is a live choice and lights up the moment it is made. */
  held: boolean
  onHold?: () => void
  nonce: number
  wide?: boolean
}) {
  const plan = useMemo(() => reelPlan(rows.length, at, ms - BRAKE_MS - STEP_MS), [rows.length, at, ms])
  const [move, setMove] = useState<{ y: number; ms: number; ease: string }>(() => ({ y: plan.end, ms: 0, ease: 'linear' }))
  /** The flat-out phase, which is the only one that blurs. */
  const [fast, setFast] = useState(false)
  /**
   * EACH REEL LIGHTS WHEN IT STOPS, not when the pair does — that is the whole point of the team
   * running two-thirds as long as the year. `spinning` belongs to the spin; this belongs to the
   * reel.
   */
  const [done, setDone] = useState(true)

  /** Read at effect time and not depended on, so only a NEW spin starts the strip moving. */
  const moving = useRef(spinning)
  moving.current = spinning

  useEffect(() => {
    if (!moving.current || frozen) {
      // held, or reduced motion, or a reel rendered already landed: just be there
      setFast(false)
      setDone(true)
      setMove({ y: plan.end, ms: 0, ease: 'linear' })
      return
    }
    setDone(false)
    // stand at the top of the journey for one frame, or there is nothing to travel FROM
    setFast(false)
    setMove({ y: plan.start, ms: 0, ease: 'linear' })

    const timers: number[] = []
    const go = () => {
      setFast(true)
      setMove({ y: plan.mid, ms: plan.spinMs, ease: 'linear' })
      timers.push(
        // the brake takes over at the speed the run left off at, and stops one row short
        window.setTimeout(() => {
          setFast(false)
          setMove({ y: plan.step, ms: plan.brakeMs, ease: BRAKE })
        }, plan.spinMs),
        // and then the one last step, from a standstill to a standstill
        window.setTimeout(() => setMove({ y: plan.end, ms: plan.stepMs, ease: STEP }), plan.spinMs + plan.brakeMs),
        window.setTimeout(() => setDone(true), plan.spinMs + plan.brakeMs + plan.stepMs + 40),
      )
    }
    // A page that is not being painted never fires a frame, and the spin lands on a timer
    // regardless — so the strip is released on a timer too rather than snapped round after the
    // fact. Whichever gets there first wins, and only once: two arms would schedule two brakes.
    let armed = false
    const arm = () => {
      if (armed) return
      armed = true
      go()
    }
    const raf = requestAnimationFrame(arm)
    const late = window.setTimeout(arm, 140)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(late)
      for (const t of timers) window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  const strip = useMemo(() => Array.from({ length: plan.strip }, (_, i) => rows[i % rows.length]), [rows, plan.strip])
  const running = spinning && !frozen && !done

  return (
    <div className={`reel ${wide ? 'wide' : ''} ${running ? 'live' : 'set'} ${held ? 'held' : ''}`}>
      <div className="reel-cap">
        <span>{label}</span>
        {onHold ? (
          <button className="reel-hold" onClick={onHold} aria-pressed={held}>
            {held ? 'held' : 'hold'}
          </button>
        ) : null}
      </div>
      <div className="reel-win" style={{ height: WINDOW * H }}>
        <div
          className={`reel-strip ${fast ? 'fast' : ''}`}
          style={{ transform: `translateY(${move.y}px)`, transitionDuration: `${move.ms}ms`, transitionTimingFunction: move.ease }}
        >
          {strip.map((r, i) => (
            <div className="reel-row" style={{ height: H }} key={i}>
              {r}
            </div>
          ))}
        </div>
        {/* the marker does not move: the list runs past it, and the answer is whatever is under it */}
        <div className="reel-mark" style={{ height: H, top: Math.floor(WINDOW / 2) * H }} aria-hidden>
          <i className="reel-arrow l" />
          <i className="reel-arrow r" />
        </div>
      </div>
    </div>
  )
}

/**
 * `spin.held` is what was held for the spin now running; `hold` is what is held for the NEXT one.
 * They are different questions and were briefly the same prop, which made the toggle look dead
 * until the following spin rebuilt the reels.
 */
export function SpinReels({ spin, spinning, hold = null, onHold }: { spin: ReelSpin; spinning: boolean; hold?: Hold; onHold?: (h: Hold) => void }) {
  return (
    <div className="reels">
      <Reel
        wide
        label="Team"
        rows={spin.team.rows}
        at={spin.team.at}
        ms={REEL_TEAM_MS}
        spinning={spinning}
        frozen={spin.held === 'team'}
        held={hold === 'team'}
        onHold={onHold ? () => onHold(hold === 'team' ? null : 'team') : undefined}
        nonce={spin.nonce}
      />
      <Reel
        label="Year"
        rows={spin.year.rows}
        at={spin.year.at}
        ms={REEL_YEAR_MS}
        spinning={spinning}
        frozen={spin.held === 'year'}
        held={hold === 'year'}
        onHold={onHold ? () => onHold(hold === 'year' ? null : 'year') : undefined}
        nonce={spin.nonce}
      />
    </div>
  )
}
