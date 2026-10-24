import { useRef, useState, type PointerEvent } from 'react'
import { defenseVs, naiveAssignment, pairingTable, PAIR_SCALE, solveBoard, type Assignment } from '../engine/offense'
import { DRAFT_SIZE, K_MATCH } from '../config'
import { useUserMode } from '../state/viewmode'
import { archetype } from '../engine/pool'
import type { Player } from '../engine/types'

const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')

/** A real board: every one of their n men has exactly one of ours on him. */
const isBoard = (map: readonly number[], n: number) =>
  map.length === n && new Set(map).size === n && map.every((j) => Number.isInteger(j) && j >= 0 && j < n)

/** Two boards are one board: every defender on the same man. */
export const sameBoard = (a: readonly number[] | null | undefined, b: readonly number[] | null | undefined) =>
  !!a && !!b && a.length === b.length && a.every((j, i) => j === b[i])

/** Move defender i onto their man j: the defender already on j takes i's old man. Nobody else moves. */
export function moveDefender(map: readonly number[], i: number, j: number): number[] {
  const next = [...map]
  const k = next.indexOf(j)
  const old = next[i]
  next[i] = j
  if (k >= 0 && k !== i) next[k] = old
  return next
}

/**
 * THE ONE BOARD (his report, 2026-10-23: "The Matchup board can only make your defense worse, and
 * the app gives three different answers to who guards whom").
 *
 * The draft read the night's matchups three ways: the sim and the cards were handed the word
 * 'optimal', the jumbotron's ticker resolved that word to the solved board (4ec350d), and the board
 * sheet and the coaching tips fell back to the NAIVE board — so the sheet opened on matchups nobody
 * was going to play, and the first touch replaced the staff's whole board with the naive one plus
 * that touch. This is the one place the active board is decided, and every reader takes `map`:
 *
 *   · `assignment` is what the sim and every card are handed. The staff's own board stays the WORD
 *     ('optimal' with Matchup coaching, 'naive' without), so it is scored exactly as an untouched
 *     night always was. A hand-set board that is the staff's own board — left alone, solved, or
 *     put back after a change — IS that word, so it costs exactly nothing; only a board that
 *     differs is handed over as a map.
 *   · `map` is the same board as five pairings, for whatever names them: the sheet opens on it, the
 *     ticker prints it, the tips read it. 'optimal' is shown as `solveBoard`, the best of the 120
 *     real boards — what the ticker has shown since 4ec350d and what Solve fills in.
 *   · `staff` is the staff's own board whatever is being played, so a change that puts the board
 *     back can be kept as NO board of his own — and a five that changes later is then guarded the
 *     way the staff guards the new five, not by a copy of the old five's solution.
 *
 * Null `map` and `staff` until both fives are five: there is no board to name before then.
 */
export function activeBoard(
  mine: Player[],
  theirs: Player[],
  o: { optimal: boolean; manual: boolean; board: readonly number[] | null },
): { assignment: Assignment; map: number[] | null; staff: number[] | null } {
  const word: Assignment = o.optimal ? 'optimal' : 'naive'
  if (mine.length !== DRAFT_SIZE || !theirs.length) return { assignment: word, map: null, staff: null }
  const staff = o.optimal ? solveBoard(mine, theirs) : naiveAssignment(mine, theirs)
  const own = o.manual && o.board && isBoard(o.board, theirs.length) && theirs.length === mine.length && !sameBoard(o.board, staff) ? [...o.board] : null
  return own ? { assignment: own, map: own, staff } : { assignment: word, map: staff, staff }
}

/**
 * The matchup board: your five defenders against their five. Drag a defender
 * onto an opponent (or tap one, then the other) to swap assignments; the
 * engine scores the board live and shows the optimal DRtg beside it.
 */
export function Matchups({
  mine,
  theirs,
  map,
  playing,
  onChange,
  onBack,
  canSolve = false,
  inline = false,
}: {
  /** no sheet, no top bar: a section of the playbook (his ruling, 2026-10-01) */
  inline?: boolean
  mine: Player[]
  theirs: Player[]
  /** map[i] = index in `theirs` guarded by mine[i]. */
  map: number[]
  /**
   * What the night plays off this board — `activeBoard`'s `assignment`. The staff's own board is
   * played as the word 'optimal', so the sheet scores it as that and not as the map it is drawn as;
   * without it the sheet scores the map.
   */
  playing?: Assignment
  onChange: (map: number[]) => void
  onBack: () => void
  /** Matchup board rank 2: the engine will fill the board for you to tweak. */
  canSolve?: boolean
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const user = useUserMode()
  const [drag, setDrag] = useState<{ i: number; x: number; y: number; over: number | null } | null>(null)
  const ref = useRef<{ i: number; x0: number; y0: number; moved: boolean } | null>(null)

  const cur = defenseVs(mine, theirs, playing ?? map)
  const opt = defenseVs(mine, theirs, 'optimal')
  const guardOf = (j: number) => map.indexOf(j)
  // EVERY PAIRING GENERATES EDGE (recal_60): each row prices what THIS defender on THIS attacker is
  // worth against an average assignment, in margin points, live as the board changes.
  const bUsg = theirs.map((q) => q.attrs.usg_raw)
  const E = pairingTable(mine, theirs, bUsg)
  const totU = bUsg.reduce((a2, x) => a2 + x, 0) || 1
  const edgeOf = (i: number, j: number) => {
    let col = 0
    for (let r = 0; r < E.length; r++) col += E[r][j]
    return -K_MATCH * PAIR_SCALE * ((bUsg[j] ?? 20) / totU) * (E[i][j] - col / E.length)
  }

  /** Move defender i onto opponent j: the man already there takes i's old assignment. */
  const put = (i: number, j: number) => onChange(moveDefender(map, i, j))

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

  /* INLINE — his ruling, 2026-10-01: "Make the matchup inside the playbook." On a desk the board
     stands as a section of the playbook card beside the jumbotron, with no sheet and no top bar
     of its own; on a phone it is still the full sheet a door opens. Same rows, same drag. */
  const Wrap = inline ? 'div' : 'div'
  return (
    <Wrap className={inline ? 'mboard-inline' : 'sheet sheet2 boardsheet'} onClick={(e) => e.stopPropagation()}>
      {inline ? (
        <div className="card-head">
          <span className="label">Matchup board</span>
        </div>
      ) : (
        <>
          <div className="topbar">
            <span>Matchup board</span>
            <button onClick={onBack}>← Done</button>
          </div>
          <div className="rule2" />
        </>
      )}
      {user ? (
        <div className="lede">Drag a defender onto the man you want him on, or tap a defender then an opponent.</div>
      ) : (
        <>
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
        </>
      )}
      {canSolve && !user ? (
        <div className="solvebar">
          <button className="sortb on" onClick={() => onChange(solveBoard(mine, theirs))}>
            Solve the board
          </button>
          <i>the best of the 120 boards — then change what you like</i>
        </div>
      ) : null}

      {/* `mboard` - his ruling, 2026-09-29: "Make matchup board way bigger". This is the card the
          board itself is in, and it is the one thing on the sheet that should take whatever height
          the sheet has left: five rows he DRAGS men between, drawn at a 10.5px surname inside a
          57px target on a desk two thousand pixels wide. Named so the stylesheet can tell it from
          the analysis card under it, which is a read and not a control. */}
      <div className="card mboard">
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
                  {user ? '' : `usage ${t.attrs.usg_raw.toFixed(1)} · 3pt ${t.attrs['3pt']} · rim ${t.attrs.rim}`}
                  {j === cur.star ? `${user ? '' : ' · '}their star` : ''}
                  {j === opt.worstShooter ? `${user ? '' : ' · '}worst shooter` : ''}
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
                    {user ? '' : `D ${d.attrs.perdef} · rim ${d.attrs.rimprot}`}
                    {isAnchor ? `${user ? '' : ' · '}anchor` : ''}
                  </i>
                  {user ? null : (
                  <i>
                    on their {archetype(t)}: {edgeOf(g, j) >= 0 ? '+' : '−'}
                    {Math.abs(edgeOf(g, j)).toFixed(1)}
                  </i>
                  )}
                </button>
              ) : (
                <span className="mdef empty">—</span>
              )}
            </div>
          )
        })}
      </div>

      {user ? null : (
      <div className="card">
        <div className="card-head">
          <span className="label">What the board does</span>
        </div>
        <div className="an-kv">
          <span>Anchor value (hidden on out {cur.minOppOut})</span>
          <b>{cur.anchor.toFixed(1)}</b>
        </div>
        <div className="an-kv">
          <span>Hunted man penalty</span>
          <b>{cur.huntPen.toFixed(2)}</b>
        </div>
        <div className="an-sub">
          The optimal board hides the anchor on their worst shooter ({short(theirs[opt.worstShooter].name)}); the star hunts your weakest defender through switches whatever you do.
        </div>
      </div>
      )}

      {drag ? (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {short(mine[drag.i].name)}
        </div>
      ) : null}
    </Wrap>
  )
}
