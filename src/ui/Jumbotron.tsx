import type { Player } from '../engine/types'
import { surnameCaps } from '../engine/names'
import type { Bug } from './JerseyFive'

/**
 * THE JUMBOTRON — his ruling, 2026-09-30, choosing 2e off the "Game7 Tipoff Redesigns" board:
 * "Use the Jumbotron E2."
 *
 * WHAT IT REPLACES AND WHY. The tip-off panel drew the same five twice — your jerseys on a floor
 * and theirs on a second floor under it — with the pairing printed on the nameplates and half the
 * panel empty beside them. The board's own note names that: "two duplicate courts with tiny cards
 * and a half-empty panel". This says the same four things — the series, the board before the tip,
 * who guards whom, and what the five costs — as ONE readout, the way an arena says them: an LED
 * scoreboard, a ticker of the night's matchups, and the two fives in a single lit table.
 *
 * NOT ONE NUMBER IS NEW. The scores and the clock are `TIPOFF`, the same nothing-all with a full
 * quarter to play the crowd bar showed; the rows are `map`, the board the matchup panel resolves;
 * the payroll is the draft's own `capUsed` against `capMax`. Only the drawing changed.
 *
 * THE CTA IS NOT HERE. 2e ends in a TAKE THE FLOOR button, and the app already stands one — the
 * dock's, which is the thing that actually starts the night and carries the worn-out and
 * spins-left gates. A second one inside the panel would be a second door to the same room.
 *
 * MOTION IS CSS, NOT A TIMER. The board's own preview drives its ticker and its lit row off a
 * React interval at 80ms; here the ticker is one keyframe and the row cycle is five staggered
 * ones, so the panel costs nothing to render and a machine that has asked for less motion simply
 * gets a still board with every row lit.
 */
const surname = surnameCaps
/** The number on the shirt — the man's season, which is what every shirt in this game wears. */
const shirt = (p: Player) => String(p.peak_season).slice(2)

export function Jumbotron({
  bug,
  us,
  them,
  step,
  bump = 0,
  flash = false,
  mine,
  theirs,
  map,
  onTap,
  cap = null,
}: {
  bug: Bug
  /** The two abbreviations on the board. */
  us: string
  them: string
  /** The line over the scores — "Level 1 · best of 7". */
  step: string
  bump?: number
  flash?: boolean
  mine: Player[]
  theirs: Player[]
  /** `map[i]` is the man in `theirs` that `mine[i]` guards; null while there is no board. */
  map?: number[] | null
  onTap?: (p: Player) => void
  /** The salary cap's two figures, when the mode has them. */
  cap?: { used: number; max: number } | null
}) {
  /**
   * The night's matchups, in the order your five stand. WITHOUT A BOARD the right-hand column is
   * still their five, in their own order — the panel it replaced drew both fives whether or not a
   * board had been resolved, and the two clubs head the two columns, so a row says "these ten men"
   * rather than "this man is on that one". The PAIRING claim is the ticker's, and the ticker is
   * only drawn when there is a board to claim.
   */
  const board = !!map
  const pairs = mine.map((p, i) => ({ p, foe: (map ? theirs[map[i]] : theirs[i]) ?? null }))
  const room = cap ? Math.max(0, cap.max - cap.used) : 0
  return (
    <div className="jumbo">
      <div className="jumbo-head">
        <span className="jumbo-kick">{step}</span>
        <div className="jumbo-board">
          <span className="jumbo-side us">
            <b>{String(bug.ours + bump).padStart(2, '0')}</b>
            <i>{us}</i>
          </span>
          <span className="jumbo-clock">
            <b>{bug.clock}</b>
            <i>{bug.period}</i>
            {flash ? <em className="jumbo-plus">+2</em> : null}
          </span>
          <span className="jumbo-side them">
            <b>{String(bug.theirs).padStart(2, '0')}</b>
            <i>{them}</i>
          </span>
        </div>
      </div>

      {/* THE TICKER. The list is written twice and slid half its own width, which is what makes a
          marquee loop without a seam. `aria-hidden` on the copy: a screen reader reads the table
          below, and the same five names twice is not a reading. */}
      {board && pairs.some((x) => x.foe) ? (
        <div className="jumbo-tick">
          <div className="jumbo-tickrun">
            {[0, 1].map((copy) => (
              <span className="jumbo-tickrow" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {pairs.map(({ p, foe }) => (foe ? <i key={p.name}>◆ {surname(p.name)} ON {surname(foe.name)}</i> : null))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="jumbo-grid">
        <div className="jumbo-gh">
          <span>#</span>
          <span>{us}</span>
          <span>#</span>
          <span>{them}</span>
        </div>
        {pairs.map(({ p, foe }, i) => (
          <div className="jumbo-row" key={p.name} style={{ ['--i' as string]: i }}>
            <span className="jumbo-no">{shirt(p)}</span>
            <button type="button" className="jumbo-man" onClick={onTap ? () => onTap(p) : undefined} disabled={!onTap}>
              {surname(p.name)}
            </button>
            <span className="jumbo-no">{foe ? shirt(foe) : '—'}</span>
            <button
              type="button"
              className="jumbo-man foe"
              onClick={onTap && foe ? () => onTap(foe) : undefined}
              disabled={!onTap || !foe}
            >
              {foe ? surname(foe.name) : '—'}
            </button>
          </div>
        ))}
      </div>

      {cap ? (
        <div className="jumbo-foot">
          <span>
            PAYROLL {cap.used.toFixed(1)}/{cap.max}
          </span>
          <span>ROOM {room.toFixed(1)}</span>
        </div>
      ) : null}
    </div>
  )
}
