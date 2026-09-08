import type { Player } from '../engine/types'
import { POSITIONS } from '../engine/positions'
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
 * THE CROWD BAND AND THE SCOREBUG (the design bundle, screen 5).
 *
 * A dotted house in the dark with two cameras going off in it, the night named across the top, and
 * a bug carrying the score.
 *
 * IT READS 0–0, 12:00, 1ST (his ruling, 2026-09-08: "Instead of a fake score 104 GA IND 101 4th ·
 * 5:55, put 0:0 with 12:00 1st"). It used to invent a closing-minutes score — deterministically,
 * from the level, always inside a possession either way — on the reasoning that a bug driven by
 * the real margin would hand the mode that plays blind the verdict it exists to withhold. His
 * ruling settles it the honest way instead: a scoreboard before the tip is not a fake result, it
 * is the true one. Nothing has been played yet, so nothing is on the board yet.
 */
export interface Bug {
  ours: number
  theirs: number
  clock: string
  /** Which quarter the clock is in. Tip-off is the 1st, with a full twelve on it. */
  period: string
}
/** The board before the tip: nothing scored, a full quarter to play. The same for every level. */
export const TIPOFF: Bug = { ours: 0, theirs: 0, clock: '12:00', period: '1st' }

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
        <span className="jf-clock">{bug.period} · {bug.clock}</span>
        {flash ? <span className="jf-plus">+2</span> : null}
      </div>
      <span className="jf-step">{step}</span>
    </div>
  )
}

/**
 * THE TIP-OFF — BOTH FIVES, FACING (his ruling, 2026-09-08: "only show both teams one next to the
 * other (with the matchups) … both 5s at that design and the clock as specified. Do the same in
 * scout mode").
 *
 * WHAT IT REPLACES. Once the five was full, each mode showed half of this: user mode stood YOUR
 * five as jerseys under the rig with an invented fourth-quarter bug over them, and scout mode kept
 * the working half-court with rings and OVRs. Neither showed the two teams together, which is the
 * one thing a team sheet is for — a five is only good or bad against the five across from it. So
 * both modes get this instead, and the mode difference on this panel is nil.
 *
 * THE MATCHUPS ARE ON THE NAMEPLATES rather than in a list beside the floor. `JerseySpot` has
 * carried a `note` for exactly this since it was written ("his season's headline, or his
 * assignment"); the assignment is what a team sheet says at the tip, and putting it on the shirt
 * means the pairing is read off the man rather than off a table you have to cross-reference.
 * Yours says who he is on; theirs says who is on him, so the same five pairings read both ways.
 *
 * STACKED, NOT SIDE BY SIDE, at every width — and that is the layout answering the room rather
 * than the wording. This panel lives in the draft's right-hand column, a third of the window: ten
 * jersey cards across it come to 44px each on a 1440 desk, which is narrower than the surnames.
 * One five over the other, each under its own club band, is the same "both teams together" read at
 * a size the names survive.
 */
export function TipOff({
  bug,
  us,
  them,
  usName,
  themName,
  step,
  bump = 0,
  flash = false,
  shooting = false,
  mine,
  theirs,
  myClub = null,
  theirClub = null,
  map,
  onTap,
}: {
  bug: Bug
  /** The two abbreviations on the scorebug. */
  us: string
  them: string
  /** The two names on the club bands — the franchise you named, and the team you are playing. */
  usName: string
  themName: string
  step: string
  bump?: number
  flash?: boolean
  shooting?: boolean
  mine: Player[]
  theirs: Player[]
  myClub?: TeamColor | null
  theirClub?: TeamColor | null
  /**
   * The board, resolved: `map[i]` is the index of the man in `theirs` that `mine[i]` guards. Null
   * while there is no board to draw — then the nameplates fall back to the season headline they
   * carry everywhere else, rather than printing a pairing that is not the one being played.
   */
  map?: number[] | null
  onTap?: (p: Player) => void
}) {
  /** The same five pairings read the other way: who is on their man `j`. */
  const guard: (number | undefined)[] = []
  if (map) map.forEach((j, i) => (guard[j] = i))
  return (
    <div className="tipoff">
      <CrowdBar bug={bug} us={us} them={them} step={step} bump={bump} flash={flash} />
      <div className="tip-band you">
        <b>{usName}</b>
        <i>Your five</i>
      </div>
      <JerseyFive
        club={myClub}
        shooting={shooting}
        spots={mine.map((p, i) => ({
          p,
          slot: POSITIONS[i] ?? String(i + 1),
          note: map && theirs[map[i]] ? `on ${surname(theirs[map[i]].name)}` : undefined,
          onTap: onTap ? () => onTap(p) : undefined,
        }))}
      />
      <div className="tip-band them">
        <b>{themName}</b>
        <i>Who guards whom</i>
      </div>
      <JerseyFive
        club={theirClub}
        spots={theirs.map((p, j) => ({
          p,
          slot: POSITIONS[j] ?? String(j + 1),
          note: guard[j] !== undefined && mine[guard[j]!] ? `${surname(mine[guard[j]!].name)} on him` : undefined,
          onTap: onTap ? () => onTap(p) : undefined,
        }))}
      />
    </div>
  )
}
