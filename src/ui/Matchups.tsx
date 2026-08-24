import { useRef, useState, type PointerEvent } from 'react'
import { defenseVs, solveBoard } from '../engine/offense'
import type { Player } from '../engine/types'

const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')

/**
 * The matchup board: your five defenders against their five. Drag a defender
 * onto an opponent (or tap one, then the other) to swap assignments; the
 * engine scores the board live and shows the optimal DRtg beside it.
 */
export function Matchups({
  mine,
  theirs,
  map,
  onChange,
  onBack,
  canSolve = false,
}: {
  mine: Player[]
  theirs: Player[]
  /** map[i] = index in `theirs` guarded by mine[i]. */
  map: number[]
  onChange: (map: number[]) => void
  onBack: () => void
  /** Matchup board rank 2: the engine will fill the board for you to tweak. */
  canSolve?: boolean
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ i: number; x: number; y: number; over: number | null } | null>(null)
  const ref = useRef<{ i: number; x0: number; y0: number; moved: boolean } | null>(null)

  const cur = defenseVs(mine, theirs, map)
  const opt = defenseVs(mine, theirs, 'optimal')
  const guardOf = (j: number) => map.indexOf(j)

  /** Move defender i onto opponent j: the man already there takes i's old assignment. */
  const put = (i: number, j: number) => {
    const next = [...map]
    const k = guardOf(j)
    const old = next[i]
    next[i] = j
    if (k >= 0 && k !== i) next[k] = old
    onChange(next)
  }

  const rowAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-opp]')
    return el ? Number(el.dataset.opp) : null
  }
  const down = (i: number) => (e: PointerEvent) => {
    ref.current = { i, x0: e.clientX, y0: e.clientY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    const d = ref.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return
    d.moved = true
    setDrag({ i: d.i, x: e.clientX, y: e.clientY, over: rowAt(e.clientX, e.clientY) })
  }
  const up = (e: PointerEvent) => {
    const d = ref.current
    ref.current = null
    if (!d) return
    if (d.moved) {
      const j = rowAt(e.clientX, e.clientY)
      if (j !== null) put(d.i, j)
      setPicked(null)
    } else setPicked(picked === d.i ? null : d.i)
    setDrag(null)
  }

  return (
    <div className="sheet sheet2" onClick={(e) => e.stopPropagation()}>
      <div className="topbar">
        <span>Matchup board</span>
        <button onClick={onBack}>← Done</button>
      </div>
      <div className="rule2" />
      <div className="map-head">
        <div>
          <div className="map-kicker">Your board</div>
          <div className="map-total">
            {cur.drtg.toFixed(1)}
            <i> DRtg</i>
          </div>
        </div>
        <div className="map-side">
          <div className="map-kicker">Engine’s optimal</div>
          <div className="map-total small">{opt.drtg.toFixed(1)}</div>
        </div>
      </div>
      <div className="lede">Drag a defender onto the man you want him on, or tap a defender then an opponent. Lower is better.</div>
      {canSolve ? (
        <div className="solvebar">
          <button className="sortb on" onClick={() => onChange(solveBoard(mine, theirs))}>
            Solve the board
          </button>
          <i>the best of the 120 boards — then change what you like</i>
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <span className="label">Their five · who guards whom</span>
        </div>
        {theirs.map((t, j) => {
          const g = guardOf(j)
          const d = g >= 0 ? mine[g] : null
          const isAnchor = g === cur.anchorIdx
          return (
            <div
              key={t.name}
              className={`mrow ${drag && drag.over === j ? 'drop-ok' : ''} ${picked !== null ? 'target' : ''}`}
              data-opp={j}
              onClick={() => {
                if (picked !== null) {
                  put(picked, j)
                  setPicked(null)
                }
              }}
            >
              <div className="mo">
                <b>{short(t.name)}</b>
                <i>
                  usage {t.attrs.usg_raw.toFixed(1)} · 3pt {t.attrs['3pt']} · rim {t.attrs.rim}
                  {j === cur.star ? ' · their star' : ''}
                  {j === opt.worstShooter ? ' · worst shooter' : ''}
                </i>
              </div>
              <span className="arrow">←</span>
              {d ? (
                <button
                  className={`mdef ${picked === g ? 'on' : ''} ${drag && drag.i === g ? 'lifted' : ''}`}
                  onPointerDown={down(g)}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={() => {
                    ref.current = null
                    setDrag(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <b>{short(d.name)}</b>
                  <i>
                    D {d.attrs.perdef} · rim {d.attrs.rimprot}
                    {isAnchor ? ' · anchor' : ''}
                  </i>
                </button>
              ) : (
                <span className="mdef empty">—</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="label">What the board does</span>
        </div>
        <div className="an-kv">
          <span>Anchor value (hidden on out {cur.minOppOut})</span>
          <b>{cur.anchor.toFixed(1)}</b>
        </div>
        <div className="an-kv">
          <span>Protection cover</span>
          <b>{cur.cover.toFixed(1)}</b>
        </div>
        <div className="an-kv">
          <span>Hunted man penalty</span>
          <b>{cur.huntPen.toFixed(2)}</b>
        </div>
        <div className="an-sub">
          The optimal board hides the anchor on their worst shooter ({short(theirs[opt.worstShooter].name)}); the star hunts your weakest defender through switches whatever you do.
        </div>
      </div>

      {drag ? (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {short(mine[drag.i].name)}
        </div>
      ) : null}
    </div>
  )
}
