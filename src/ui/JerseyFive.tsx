import type { Player } from '../engine/types'
import { Ball } from './Ball'
import { LINES } from './Stat'
import { cardInk, type TeamColor } from './teamColors'

/**
 * GAME NIGHT'S FLOOR (the design bundle, screen 5) — user mode only.
 *
 * Scout mode reads the five as a half-court with five rings on it: where a man stands, what he
 * rates, who he is matched onto. That court is a WORKING diagram, and the bundle keeps it for the
 * mode that works. User mode is the mode that watches, so the same five stand here as jerseys on
 * a floor in perspective, under the rig, the way a broadcast would introduce them: position, the
 * shirt, and a paper nameplate with the man's name and the one number he is known for.
 *
 * NO RATING IS PRINTED HERE. The bundle's own artwork carries an OVR in the card's head; the app's
 * user mode does not, by his standing ruling — no engine ratings on any card when you are playing
 * blind. What the head carries instead is the position he is filling, which is a fact about where
 * he is standing, and the nameplate carries his real season.
 */

const surname = (n: string) => {
  const bare = n.replace(/ '\d\d( \([a-z]\))?$/, '')
  return (bare.split(' ').pop() ?? bare).toUpperCase()
}
/**
 * The number on the shirt. The pool has no jersey numbers — a card is a man AND a season — so the
 * season is what the shirt wears: Stockton '90 runs out in a 90. It reads as a number the way a
 * jersey does, and it is the one number on this screen that is never a rating.
 */
const shirt = (p: Player) => String(p.peak_season).slice(2)

export interface JerseySpot {
  p: Player | null
  slot: string
  /** What the nameplate says under the name — his season's headline, or his assignment. */
  note?: string
  onTap?: () => void
}

export function JerseyFive({
  spots,
  shooting = false,
  club = null,
}: {
  spots: JerseySpot[]
  shooting?: boolean
  /**
   * YOUR KIT (his ruling: "Allow me to pick my team colors when starting a campaign"). Of every
   * surface in the game this is the literal one — these ARE the shirts — so the two colours picked
   * on the name screen are stated here as the shirt's own tokens and the stylesheet keeps its
   * blues as the fallbacks. Null (a campaign from before the picker, or any screen that has no
   * team) leaves the jerseys exactly the blue they have always been.
   */
  club?: TeamColor | null
}) {
  return (
    <div
      className="jf"
      style={
        club
          ? ({
              '--jp': club.primary,
              '--jd': club.deep,
              /* the trim, put through the ladder's own near-black rule, so a club that trims in
                 black gets cream on the shirt instead of an invisible number */
              '--ja': cardInk(club).edge,
              '--ji': club.ink,
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* THE FLOOR. Hardwood raked back under the eye, with the house lights pooled at centre
          court — the same boards the ladder's blocks are cut from, laid flat instead of upright. */}
      <div className="jf-floor" aria-hidden>
        <span className="jf-glow" />
      </div>
      {/* THE RIG, pinned to the right corner: stanchion, backboard, rim, and a net that swishes
          on its own while nothing is happening. */}
      <div className="jf-rig" aria-hidden>
        <span className="jf-post" />
        <span className="jf-board" />
        <span className="jf-rim" />
        <span className="jf-net" />
      </div>
      {/* THE SHOT. The mark itself is the ball: it comes in over the near corner, arcs the length
          of the floor and drops through the net at the rig — the bundle's `shoot`, which never
          rotates, because the 7 has to stay upright the whole way. Mounted only while the shot is
          in the air, so the animation starts from its own first frame every time. */}
      {shooting ? (
        <div className="jf-shot" aria-hidden>
          <Ball size={26} />
        </div>
      ) : null}
      <div className="jf-row">
        {spots.map((s) => {
          const line = s.p ? (LINES[s.p.name] ?? null) : null
          return (
            <button
              key={s.slot}
              className={`jf-card ${s.p ? '' : 'open'}`}
              onClick={s.onTap}
              disabled={!s.onTap}
              aria-label={s.p ? `${s.p.name} at ${s.slot}` : `${s.slot} open`}
            >
              <span className="jf-head">
                <i>{s.slot}</i>
              </span>
              <span className="jf-shirt">
                <span className="jf-jersey">
                  <b>{s.p ? shirt(s.p) : '—'}</b>
                </span>
              </span>
              <span className="jf-plate">
                <b>{s.p ? surname(s.p.name) : 'OPEN'}</b>
                <i>{s.note ?? (line?.ppg !== undefined ? `${line.ppg.toFixed(1)} pts` : '')}</i>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * LEGS LEFT IN THE FIVE — five durability bars keyed to the shirts above them. Durability is a
 * card attribute, not a verdict on the pick, so it stands in user mode; in the death match it
 * reads the WORN value, which is the number that decides whether he can take the floor at all.
 */
export function LegsLeft({ five, wear }: { five: Player[]; wear?: (name: string) => number }) {
  if (!five.length) return null
  return (
    <div className="um-legs">
      <span className="um-cap">Legs left in the five</span>
      <div className="um-legrow">
        {five.map((p) => {
          const v = wear ? wear(p.name) : p.attrs.durability
          return (
            <span className="um-leg" key={p.name} title={`${p.name} · ${v}`}>
              <i style={{ height: `${Math.max(6, Math.min(100, v))}%` }} className={v <= 25 ? 'low' : ''} />
              <em>{shirt(p)}</em>
            </span>
          )
        })}
      </div>
    </div>
  )
}


/**
 * THE CROWD BAND AND THE SCOREBUG (the design bundle, screen 5) — user mode only.
 *
 * A dotted house in the dark with two cameras going off in it, the night named across the top, and
 * a bug carrying the score. THE SCORE IS THEATRE and nothing else: the engine sims a whole series
 * in one call, so there is no game in progress for it to read, and a bug driven by the projected
 * margin would hand the mode that plays blind the very verdict it exists to withhold. So it is
 * invented — deterministically, from the level, and always inside a possession or two either way,
 * which is the one shape that says nothing about who is better. It is the closing minutes of a
 * game, drawn the way a broadcast draws them; the result comes from the sim, as it always has.
 */
export interface Bug {
  ours: number
  theirs: number
  clock: string
}
/** One hash, four numbers off it — the same night every time this level is played. */
export function bugFor(level: number): Bug {
  const h = Math.imul(level || 1, 2654435761) >>> 0
  const base = 88 + (h % 21)
  // −4 to +4: a one-possession game either way, so the bug can be read for tension and for
  // nothing else. The two-point bucket is skipped so the shot below always changes the lead.
  const edge = (((h >>> 5) % 9) - 4) || 3
  return {
    ours: base + Math.max(0, edge),
    theirs: base - Math.min(0, edge),
    clock: `${3 + ((h >>> 11) % 7)}:${String((h >>> 17) % 60).padStart(2, '0')}`,
  }
}

export function CrowdBar({
  bug,
  us,
  them,
  step,
  bump,
  flash,
}: {
  bug: Bug
  us: string
  them: string
  step: string
  bump: number
  flash: boolean
}) {
  return (
    <div className="jf-crowd">
      <span className="jf-house" aria-hidden />
      <span className="jf-flash one" aria-hidden />
      <span className="jf-flash two" aria-hidden />
      {/* one row, the bundle's order: your score, the two names, their score, then the clock
          behind a rule. You are gold and they are red, here as everywhere else. */}
      <div className="jf-bug">
        <b className="us">{bug.ours + bump}</b>
        <i>{us}</i>
        <em>{them}</em>
        <b className="them">{bug.theirs}</b>
        <span className="jf-clock">4th · {bug.clock}</span>
        {flash ? <span className="jf-plus">+2</span> : null}
      </div>
      <span className="jf-step">{step}</span>
    </div>
  )
}
