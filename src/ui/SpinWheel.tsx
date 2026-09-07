import { useEffect, useMemo, useRef, useState } from 'react'
import type { TeamSeason } from './Draft'
import { cardInk, teamColor } from './teamColors'

/**
 * THE WHEEL (his ruling: "Instead of the wheel spinning like it currently does, add an actual
 * wheel with a design fitting to the stage").
 *
 * It used to be a word flickering in a box — the team name replaced fourteen times on a slowing
 * timer. The screen called it a wheel, the button called it a spin, and nothing on the page ever
 * turned. This is the wheel: twelve real team-seasons off the same WHEEL the draft uses, each
 * wedge painted in that club's own colours, under a fixed pointer at twelve o'clock.
 *
 * FITTING THE STAGE. The stage is the arena, and the arena is already drawn everywhere else in
 * this app: a near-black ground, a rake of shadow toward the rim so the disc sits under lights
 * rather than on a screen, hairline splits between the wedges, and a rim and a pointer in `--you`
 * — which on the My team screen is now the kit, so the wheel wears the team's colours the way the
 * floor beside it does. The twelve clubs are the only loud thing on it, which is the point: what
 * you are watching is which colour stops at the top.
 *
 * THE RESULT IS DECIDED BEFORE THE WHEEL MOVES, exactly as it was — `landOn` picks, and the disc
 * is then turned to put that wedge under the pointer. A wheel that decided by where it stopped
 * would be a different game (it could stop on a man you cannot afford or cannot field), so this
 * one is an animation of a decision, and it says so here rather than pretending otherwise.
 */

/** Twelve wedges: enough for the disc to read as a wheel, few enough for an abbreviation to fit. */
const N = 12
const R = 92
const HUB = 23

/** A point on the disc, degrees measured CLOCKWISE FROM TWELVE — the same way the pointer reads. */
const pt = (deg: number, r: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]
}

const wedge = (i: number) => {
  const [x0, y0] = pt(i * (360 / N), R)
  const [x1, y1] = pt((i + 1) * (360 / N), R)
  return `M100,100 L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`
}

export interface Spin {
  /** The twelve team-seasons on the disc, in wedge order. */
  segs: TeamSeason[]
  /** Which of them the pointer must finish on — the one `landOn` already chose. */
  at: number
  /** Bumped on every spin so a second spin of the SAME wedge still turns. */
  nonce: number
}

/**
 * Build a disc that contains the landed team. The other eleven are real team-seasons drawn at
 * random, no franchise twice, so the wheel is never two wedges of the same colour side by side.
 */
export function buildSpin(landed: TeamSeason, pool: TeamSeason[], rnd: () => number, nonce: number): Spin {
  const segs: TeamSeason[] = [landed]
  const seen = new Set([landed.ab])
  let guard = 0
  while (segs.length < N && guard++ < 800) {
    const t = pool[Math.floor(rnd() * pool.length)]
    if (!t || seen.has(t.ab)) continue
    seen.add(t.ab)
    segs.push(t)
  }
  // the pool is smaller than twelve franchises only in a test fixture; pad rather than throw
  while (segs.length < N) segs.push(pool[segs.length % pool.length] ?? landed)
  // shuffle, then find where the landed one ended up — the disc is turned to it, not it to the disc
  for (let i = segs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[segs[i], segs[j]] = [segs[j], segs[i]]
  }
  return { segs, at: segs.indexOf(landed), nonce }
}

/** How long the disc takes to stop. Long enough to be watched, short enough to be spun again. */
export const SPIN_MS = 2900

/** Whole turns before the wedge is delivered — the part that makes it feel thrown rather than set. */
const TURNS = 5

/**
 * The angle to turn the disc TO, so that wedge `at` finishes under the pointer at twelve o'clock.
 *
 * The disc turns clockwise and `wedge(i)` puts wedge i's middle at `i·30 + 15` degrees clockwise
 * from twelve, so a point at `mid` lands at `mid + turn`: the disc has to finish on `-mid`. It is
 * always reached going FORWARD from where the disc already is — five whole turns plus whatever is
 * left over — so a second spin never rewinds through the first.
 */
export function landingTurn(from: number, at: number): number {
  const mid = at * (360 / N) + 180 / N
  return from + TURNS * 360 + ((((-mid - (from % 360)) % 360) + 360) % 360)
}

export function SpinWheel({ spin, spinning }: { spin: Spin; spinning: boolean }) {
  /**
   * The disc starts where it stopped last time and is turned FORWARD to the answer, so a second
   * spin does not rewind through the first. `deg` only ever grows.
   */
  const deg = useRef(0)
  const [turn, setTurn] = useState(0)
  const [live, setLive] = useState(false)
  /**
   * Read at effect time, not depended on. The turn is started by a NEW disc and by nothing else —
   * if `spinning` were a dependency, the effect would fire again the moment the wheel stopped and
   * throw the disc five more times around from where it had just landed.
   */
  const moving = useRef(spinning)
  moving.current = spinning

  useEffect(() => {
    const from = deg.current
    const next = landingTurn(from, spin.at)
    deg.current = next
    if (!moving.current) {
      // reduced motion: the answer without the ride
      setLive(false)
      setTurn(next)
      return
    }
    // hold one frame at the old angle, or the browser has nothing to transition FROM
    setLive(false)
    setTurn(from)
    const raf = requestAnimationFrame(() => {
      setLive(true)
      setTurn(next)
    })
    // A page that is not being painted (a background tab, a hidden pane) never fires a frame, and
    // the spin lands on a timer regardless — so the disc is released on a timer too rather than
    // being left at nought and snapped round after the fact.
    const late = window.setTimeout(() => {
      setLive(true)
      setTurn(next)
    }, 140)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(late)
    }
  }, [spin.nonce, spin.at])

  const wedges = useMemo(
    () =>
      spin.segs.map((t, i) => {
        const c = teamColor(t.ab)
        return { t, i, c, ink: cardInk(c), mid: i * (360 / N) + 180 / N }
      }),
    [spin.segs],
  )

  return (
    <div className={`spinwheel ${spinning ? 'live' : 'set'}`}>
      <svg viewBox="0 0 200 200" role="img" aria-label={spinning ? 'The wheel is spinning' : `The wheel landed on ${spin.segs[spin.at]?.team}`}>
        <defs>
          {/* the rake: the disc is lit from the middle and falls away to the rim, which is what
              stops twelve flat club colours from reading as a pie chart */}
          <radialGradient id="sw-rake" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.42" />
          </radialGradient>
        </defs>

        <g className="sw-disc" style={{ transform: `rotate(${turn}deg)`, transitionDuration: live ? `${SPIN_MS}ms` : '0ms' }}>
          {wedges.map(({ t, i, c }) => (
            <path key={`${t.ab}${t.y}`} d={wedge(i)} fill={c.primary} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
          ))}
          <circle cx="100" cy="100" r={R} fill="url(#sw-rake)" />
          {/* the landed wedge keeps its own edge, so the answer is on the disc and not only under
              the pointer — it is still marked after the disc has stopped */}
          <path className="sw-won" d={wedge(spin.at)} fill="none" strokeWidth="1.6" />
          {wedges.map(({ t, c, ink, mid }) => (
            /*
             * The label rides its OWN wedge. Rotating the group by (mid - 90) points the group's
             * +x along that wedge's middle, so the label goes at x = 100 + r — to the RIGHT of the
             * centre. Placing it at x = 100 - r instead put every abbreviation on the wedge
             * opposite its colour, which is a wheel that lies about where it stopped.
             */
            <g
              key={`l${t.ab}${t.y}`}
              /* and the bottom half turns over on itself: a radial label below the axle reads
                 upside down otherwise, so NOP comes out dON. The second turn is about the label's
                 own centre, so it stays on its wedge and only the reading direction flips. */
              transform={`rotate(${(mid - 90).toFixed(2)} 100 100)${mid > 180 ? ' rotate(180 161 100.5)' : ''}`}
            >
              <text x="161" y="94.5" textAnchor="middle" dominantBaseline="central" fill={ink.darkInk ? '#12100e' : c.ink} className="sw-ab">
                {t.ab}
              </text>
              <text x="161" y="106.5" textAnchor="middle" dominantBaseline="central" fill={ink.darkInk ? '#12100e' : c.ink} className="sw-yr" opacity="0.72">
                &rsquo;{String(t.y).slice(2)}
              </text>
            </g>
          ))}
        </g>

        {/* the hub and the rim do not turn — they are the machine, not the disc */}
        <circle className="sw-rim" cx="100" cy="100" r={R} fill="none" />
        <circle className="sw-hub" cx="100" cy="100" r={HUB} />
        <circle className="sw-pin" cx="100" cy="100" r="4" />
        <path className="sw-point" d="M100,22 L92,4 L108,4 Z" />
      </svg>
    </div>
  )
}
