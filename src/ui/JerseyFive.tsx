import type { Player } from '../engine/types'
import { LINES } from './Stat'

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

export function JerseyFive({ spots }: { spots: JerseySpot[] }) {
  return (
    <div className="jf">
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
