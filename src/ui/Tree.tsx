import { useEffect, useState } from 'react'
import { Ask } from './Ask'
import {
  balance,
  canBuy,
  earned,
  maxed,
  NODE,
  NODES,
  owned,
  rank,
  treeCost,
  unlocked,
  type Branch,
  type Node,
  type NodeId,
  type Wallet,
} from '../engine/tree'

const BRANCHES: { key: Branch; blurb: string }[] = [
  { key: 'Scout', blurb: 'Know more before you draft.' },
  { key: 'Front office', blurb: 'More chances on the wheel.' },
  { key: 'Coach', blurb: 'Assignments and the night’s noise.' },
  { key: 'Salary', blurb: 'Payroll room. Salary Cap campaign only.' },
  { key: 'Survival', blurb: 'Lives, checkpoints and substitutions. Death match only.' },
]

/** Hex geometry, in the SVG's own units. One cell per node, columns per branch. */
const CELL_W = 116
const CELL_H = 104
const HEX_R = 40
const PAD_X = 24
const PAD_TOP = 18

/** A pointy-top hexagon centred on (cx, cy). */
const hexPath = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90)
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')

/**
 * The staff tree, between levels only. Stars earned on the map are the balance;
 * every rank widens what you can do, none adds a point of rating.
 *
 * Drawn as a hex trellis: one column per branch, one hexagon per node, connectors
 * running down each chain. A node shows its filled rank pips (x/N) and its state —
 * locked, open, part-ranked or maxed — and tapping it opens the rank sheet.
 */
export function Tree({
  wallet,
  salary = false,
  death = false,
  onBuy,
  onRespec,
  onBack,
}: {
  wallet: Wallet
  salary?: boolean
  /** Death match: the Survival branch replaces the Salary one. */
  death?: boolean
  onBuy: (id: NodeId) => void
  onRespec: () => void
  onBack: () => void
}) {
  const bal = balance(wallet)
  const [open, setOpen] = useState<NodeId | null>(null)
  // the in-game ask instead of a browser popup (which never renders on his phone)
  const [askRespec, setAskRespec] = useState(false)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const branches = BRANCHES.filter((b) => (b.key === 'Salary' ? salary : b.key === 'Survival' ? death : true))
  const cols = branches.map((b) => NODES.filter((n) => n.branch === b.key).sort((a, c) => a.depth - c.depth))
  const rows = Math.max(...cols.map((c) => c.length))
  const W = PAD_X * 2 + CELL_W * branches.length
  const H = PAD_TOP + CELL_H * rows + 26

  const cx = (col: number) => PAD_X + CELL_W * col + CELL_W / 2
  const cy = (depth: number) => PAD_TOP + CELL_H * depth + HEX_R + 6

  const spentIn = (n: Node) => rank(wallet, n.id)
  const stateOf = (n: Node) => (maxed(wallet, n.id) ? 'max' : owned(wallet, n.id) ? 'part' : unlocked(wallet, n.id) ? (canBuy(wallet, n.id) ? 'open' : 'shut') : 'locked')

  const node = open ? NODE[open] : null

  return (
    <>
      <div className="topbar">
        <span>Staff</span>
        <button onClick={onBack}>← Map</button>
      </div>
      <div className="rule2" />
      <div className="map-head">
        <div>
          <div className="map-kicker">Stars to spend</div>
          <div className="map-total">
            <span className="star">★</span> {bal}
            <i> of {earned(wallet)} earned</i>
          </div>
        </div>
        <div className="map-side">
          <div className="map-kicker">
            {wallet.spent} spent of {treeCost()}
          </div>
          {wallet.spent > 0 ? (
            <button className="map-link danger" onClick={() => setAskRespec(true)}>
              Reset spending · refund {wallet.spent}★
            </button>
          ) : null}
        </div>
      </div>
      <div className="lede">
        Stars come from the map — three for a sweep, two for a shorter win, one for going the distance. No skill is a one-time skill: every node holds
        several ranks, one star each, and every rank widens it further.
      </div>

      <div className="treewrap">
        <svg className="treesvg" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} role="group" aria-label="Staff tree">
          {/* connectors first, so the hexes sit on top of them */}
          {cols.map((list, c) =>
            list.map((n) => {
              if (!n.requires) return null
              const from = list.find((x) => x.id === n.requires)
              if (!from) return null
              const lit = owned(wallet, n.id)
              return (
                <line
                  key={`l-${n.id}`}
                  className={`treeline ${lit ? 'lit' : owned(wallet, from.id) ? 'half' : ''}`}
                  x1={cx(c)}
                  y1={cy(from.depth) + HEX_R}
                  x2={cx(c)}
                  y2={cy(n.depth) - HEX_R}
                />
              )
            }),
          )}
          {cols.map((list, c) =>
            list.map((n) => {
              const st = stateOf(n)
              const r = spentIn(n)
              const x = cx(c)
              const y = cy(n.depth)
              return (
                <g
                  key={n.id}
                  className={`treenode ${st}`}
                  onClick={() => setOpen(n.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(n.id)}
                  aria-label={`${n.name}, ${r} of ${n.ranks} ranks`}
                >
                  <polygon className="hex-shadow" points={hexPath(x, y + 3, HEX_R)} />
                  <polygon className="hex" points={hexPath(x, y, HEX_R)} />
                  <polygon className="hex-in" points={hexPath(x, y, HEX_R - 7)} />
                  <text className="hex-name" x={x} y={y - 4} textAnchor="middle">
                    {n.name.split(' ')[0]}
                  </text>
                  <text className="hex-name2" x={x} y={y + 9} textAnchor="middle">
                    {n.name.split(' ').slice(1).join(' ')}
                  </text>
                  <rect className="hex-pill" x={x - 20} y={y + HEX_R - 15} width={40} height={19} rx={5} />
                  <text className="hex-rank" x={x} y={y + HEX_R - 1} textAnchor="middle">
                    {r}/{n.ranks}
                  </text>
                </g>
              )
            }),
          )}
          {branches.map((b, c) => (
            <text key={b.key} className="treecol" x={cx(c)} y={H - 8} textAnchor="middle">
              {b.key.toUpperCase()}
            </text>
          ))}
        </svg>
      </div>

      {node ? (
        <div className="ranksheet" onClick={() => setOpen(null)}>
          <div className="card ranks" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="label">{node.name}</span>
              <span className="cap">
                {node.branch} · {rank(wallet, node.id)}/{node.ranks} ranks
              </span>
            </div>
            <div className="lede tight">{node.blurb}</div>
            {!unlocked(wallet, node.id) ? <div className="ranklock">Needs {NODE[node.requires!].name} first.</div> : null}
            <ol className="ranklist">
              {node.rankBlurbs.map((t, i) => {
                const have = rank(wallet, node.id) > i
                const next = rank(wallet, node.id) === i
                return (
                  <li key={t} className={have ? 'have' : next ? 'next' : 'far'}>
                    <span className="pip">{have ? '★' : i + 1}</span>
                    <i>{t}</i>
                  </li>
                )
              })}
            </ol>
            <div className="rankfoot">
              <button
                className={`sortb buy ${canBuy(wallet, node.id) ? 'on' : 'no'}`}
                disabled={!canBuy(wallet, node.id)}
                onClick={() => onBuy(node.id)}
              >
                {maxed(wallet, node.id) ? 'MAXED' : !unlocked(wallet, node.id) ? 'LOCKED' : bal < 1 ? 'NO STARS' : `★ 1 — buy rank ${rank(wallet, node.id) + 1}`}
              </button>
              <button className="sortb" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {askRespec ? (
        <Ask
          label="The staff tree"
          text={`All ${wallet.spent} stars come back and every node is unlearned. Reset your staff?`}
          yes="Reset spending"
          onYes={() => {
            setAskRespec(false)
            onRespec()
          }}
          onClose={() => setAskRespec(false)}
        />
      ) : null}
    </>
  )
}
