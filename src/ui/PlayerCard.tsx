import { archetype } from '../engine/pool'
import { CardName } from './CardSheet'
import type { Player } from '../engine/types'
import { DetailGrid, Glyph, Mini } from './Stat'

/**
 * The one row component. Grid minmax(0,1fr) 58 40 28, h 46. Tap anywhere =
 * draft; the chevron is its own 28px column behind a hairline, so detail can
 * never mis-draft. Selected = tint + inset owner rule + numbered pick badge.
 */
export function PlayerCard({
  p,
  pick,
  dimmed,
  expanded,
  onClick,
  onInfo,
  owner,
  ownerLabel,
  stats = false,
}: {
  p: Player
  pick: number | null
  dimmed: boolean
  expanded: boolean
  onClick: () => void
  onInfo: () => void
  /** Versus: which side owns this row. Campaign uses `pick` alone. */
  owner?: 0 | 1 | null
  ownerLabel?: string
  /**
   * THE SEASON LINE IN PLACE OF THE RATING — his ruling, 2026-10-19, on the hot-seat screens (1v1
   * bid, Player vs Friend): "Dont show the player OVR." The row prints PTS · REB · AST where the OVR
   * and the shape glyph stood, the same three tracks the draft's rows print.
   */
  stats?: boolean
}) {
  const on = owner === 0 || (owner === undefined && !!pick)
  const on2 = owner === 1
  return (
    <>
      <div
        className={`row${stats ? ' st' : ''} ${on ? 'on' : ''} ${on2 ? 'on2' : ''} ${dimmed ? 'off' : ''} ${expanded && !on && !on2 ? 'exp' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={on || on2}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
      >
        <span className="pname">
          {pick && owner === undefined ? <span className="badge">{pick}</span> : null}
          <span className="who">
            <CardName p={p} />
            <i>{ownerLabel ?? archetype(p)}</i>
          </span>
        </span>
        {stats ? (
          <Mini name={p.name} />
        ) : (
          <>
            <span className="ovr">
              {p.ovr}
              <small>
                O{p.o_ovr} D{p.d_ovr}
              </small>
            </span>
            <Glyph p={p} />
          </>
        )}
        <button
          className={`pinfo ${expanded ? 'open' : ''}`}
          aria-label={`${p.name} ratings`}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation()
            onInfo()
          }}
        >
          ▾
        </button>
      </div>
      {expanded ? <DetailGrid p={p} /> : null}
    </>
  )
}
