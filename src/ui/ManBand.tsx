import { archetype } from '../engine/pool'
import type { Player } from '../engine/types'
import { RULE } from './Archetypes'
import { BOX, LINES, leagueTS, seasonWho } from './Stat'

/**
 * THE MAN BAND (his ruling: "When pressing on a player show in the black space the description of
 * his archetype and next to it his statline").
 *
 * It fills the empty floor the three boxes leave above the dock — space the layout already has, so
 * it never pushes a box or the dock and never lengthens the page. The screen measures the gap and
 * only mounts this when there is genuinely room for it; with nothing selected the band stays black.
 *
 * Both halves are FACTS — the tag's own sentence and the season a man actually played — so both
 * stand in user mode. Nothing evaluative is printed here: no OVR, no fit, no rating.
 *
 * It lives in its own module because Archetypes already imports Stat, so the prose cannot be
 * reached from inside Stat without a cycle.
 */
/**
 * Where the black rectangle actually is, in pixels relative to the grid.
 *
 * The two screens are not the same shape: on the swap screen the wheel's box is the tall one and
 * the floor lies under the first two columns, while at the draft the scout card is tallest and the
 * free column is the last. So this reads the columns rather than assuming, and returns the
 * rectangle under the run of columns that have real clearance.
 *
 * It returns geometry, not grid placement, because the band is positioned ABSOLUTELY into that
 * rectangle: laid out that way it cannot displace a column, lengthen the row, or push the dock, no
 * matter what it contains. Null when no column has room — which is what a phone always reports.
 */
export function bandSlot(grid: HTMLElement, cols: HTMLElement[], floorY: number, min = 120) {
  const g = grid.getBoundingClientRect()
  const free = cols.filter((c) => floorY - c.getBoundingClientRect().bottom - 14 >= min)
  if (!free.length) return null
  const tops = free.map((c) => c.getBoundingClientRect().bottom)
  const top = Math.max(...tops) + 14
  const left = Math.min(...free.map((c) => c.getBoundingClientRect().left))
  const right = Math.max(...free.map((c) => c.getBoundingClientRect().right))
  return {
    top: Math.round(top - g.top),
    left: Math.round(left - g.left),
    width: Math.round(right - left),
    // a band, not a cavern: it takes what it needs from the rectangle and leaves the rest black
    height: Math.round(Math.min(floorY - top, 260)),
  }
}

export function ManBand({
  p,
  at,
  inline,
}: {
  p: Player | null
  at?: { top: number; left: number; width: number; height: number }
  /**
   * No rectangle to lay him in — a phone, a short window, or a screen whose columns are all tall.
   * He asked for the BEHAVIOUR, not for a particular rectangle, so the panel drops in under the
   * man he tapped instead of silently not appearing.
   */
  inline?: boolean
}) {
  const box = inline || !at ? undefined : { position: 'absolute' as const, ...at }
  if (!p) return inline ? null : <div className="manband" style={box} aria-hidden />
  const tag = archetype(p)
  const line = LINES[p.name] ?? null
  const lgTS = leagueTS(p)
  return (
    <div className={`manband on ${inline ? 'inline' : ''}`} style={box}>
      <div className="mb-who">
        <span className="label">{tag}</span>
        <p>{RULE[tag] ?? 'A tag from the tree.'}</p>
        <i>{p.name}</i>
      </div>
      {/* HIS RULING: "Remove what Ive marked, no need for duplicates" — the tap-open stat grid no
          longer repeats this panel under the card, so everything that grid said has to be said
          here: who he was that season, and the league he shot against. */}
      <div className="mb-line">
        <span className="label">Season {p.peak_season}</span>
        <span className="mb-when">{seasonWho(p)}</span>
        {line ? (
          <div className="mb-grid">
            {BOX.map((b) => (
              <span className="bcell" key={b.label}>
                <i>{b.label}</i>
                <b>{line[b.k] === undefined ? '—' : String(line[b.k])}</b>
                {b.k === 'ts' && lgTS ? <span className="bvs">vs league {lgTS}</span> : null}
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-none">No stat line on file.</p>
        )}
      </div>
    </div>
  )
}
