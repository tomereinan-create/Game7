import { useEffect, useState } from 'react'
import { Ask } from './Ask'
import { useLayout } from './useLayout'
import type { Skin } from './LevelMap'
import { useUserMode } from '../state/viewmode'
import CAMPAIGNS from '../data/campaigns.json'
import {
  balance,
  canBuy,
  earned,
  maxed,
  NODE,
  NODES,
  owned,
  price,
  rank,
  tierOpen,
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
  { key: 'Coach', blurb: 'Assignments, the playbook and its pace.' },
  { key: 'Salary', blurb: 'Payroll room. Salary Cap campaign only.' },
  { key: 'Survival', blurb: 'Lives, checkpoints and substitutions. Death match only.' },
  { key: 'Dynasty', blurb: 'One node a tier: it opens when the ladder reaches it. Campaign and Salary Cap.' },
]

/** The tier a level opens, by name — "The Champions" for 31 — for the Dynasty branch's lock line. */
const TIER_AT = new Map<number, string>()
;(CAMPAIGNS as unknown as { name: string; levels: unknown[] }[]).reduce((n, t) => (TIER_AT.set(n + 1, t.name), n + t.levels.length), 0)

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
  skin = 'arena',
  onBuy,
  onRespec,
  respecKeeps = 0,
  onBack,
}: {
  wallet: Wallet
  salary?: boolean
  /** Death match: the Survival branch replaces the Salary one. */
  death?: boolean
  /**
   * HIS RULING: "Make the skill tree and the drafting (spin) the same design as your current
   * stage." The staff room is not a separate building any more — it wears the skin of the block
   * the campaign is standing in, so walking off the map into it is the same room, not a new one.
   */
  skin?: Skin
  onBuy: (id: NodeId) => void
  onRespec: () => void
  /**
   * Stars a reset will NOT hand back — the death match's used Extra lives (his ruling, 2026-10-22:
   * "make used lives non-refundable"). Zero everywhere else.
   */
  respecKeeps?: number
  onBack: () => void
}) {
  const refund = wallet.spent - respecKeeps
  const user = useUserMode()
  const bal = balance(wallet)
  const [open, setOpen] = useState<NodeId | null>(null)
  // the in-game ask instead of a browser popup (which never renders on his phone)
  const [askRespec, setAskRespec] = useState(false)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  /**
   * The skin reaches the page's own ground, which sits outside anything this screen renders, so it
   * is stated as a body class the way the map, the draft and the tunnel state theirs — and `wide`
   * comes with it, so the trellis gets the same full window the map does.
   */
  useLayout(() => {
    document.body.classList.add('wide', `sk-${skin}`)
    return () => document.body.classList.remove('wide', `sk-${skin}`)
  }, [skin])

  const branches = BRANCHES.filter((b) => (b.key === 'Salary' ? salary : b.key === 'Survival' ? death : b.key === 'Dynasty' ? !death : true))
  const cols = branches.map((b) => NODES.filter((n) => n.branch === b.key).sort((a, c) => a.depth - c.depth))
  /** What a rank costs HERE: the node's own price, or the death match's flat star (engine/tree.ts `price`). */
  const cost = (id: NodeId) => price(id, death)
  const buyable = (id: NodeId) => canBuy(wallet, id, death)
  /** A Dynasty node whose tier the ladder has not reached yet. */
  const waiting = (n: Node) => !tierOpen(wallet, n.id)
  const rows = Math.max(...cols.map((c) => c.length))
  const W = PAD_X * 2 + CELL_W * branches.length
  const H = PAD_TOP + CELL_H * rows + 26

  const cx = (col: number) => PAD_X + CELL_W * col + CELL_W / 2
  const cy = (depth: number) => PAD_TOP + CELL_H * depth + HEX_R + 6

  const spentIn = (n: Node) => rank(wallet, n.id)
  const stateOf = (n: Node) => (maxed(wallet, n.id) ? 'max' : owned(wallet, n.id) ? 'part' : unlocked(wallet, n.id) ? (buyable(n.id) ? 'open' : 'shut') : 'locked')

  const node = open ? NODE[open] : null

  return (
    <>
      {/* HIS RULING (Campaign Map.dc.html, scout mode): "pressing on skill tree, returning to the
          map should be a map icon, not map text." The draft already leaves by a pinned map fab —
          the folded-map glyph, beside the home button — and the staff room is the same room by his
          earlier ruling, so it leaves the same way. It is pinned to the window rather than sitting
          in the topbar, which is where the icon lives on every other screen that has one. */}
      {user ? null : (
        <button className={`map-fab ${skin}`} onClick={onBack} aria-label="Level map" title="Back to the level map">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 5 3 7.5v12L9 17l6 2.5 6-2.5v-12L15 7 9 5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9 5v12M15 7v12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <div className={`map-top staff ${skin}`}>
        <div className="topbar">
          <span>Staff</span>
          {user ? <button onClick={onBack}>← Map</button> : null}
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
              {wallet.spent} spent of {treeCost(branches.map((b) => b.key), death)}
            </div>
            {refund > 0 ? (
              <button className="map-link danger" onClick={() => setAskRespec(true)}>
                Reset spending · refund {refund}★
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="lede tree-lede">
        {/* HIS RULING, 2026-10-23 ("Yes, the milder pricing"): a rank costs its row in the branch.
            The death match pays the same (his ruling: "No, same prices as the other modes"); its Survival
            branch stays one star a rank — see engine/tree.ts `price`. */}
        {death
          ? 'Stars come from the map — three for a sweep, two for a shorter win, one for going the distance. No skill is a one-time skill: every node holds several ranks and every rank widens it further; a rank costs its row in the branch — one star on the top row, two on the next, and so on. Survival ranks are one star each.'
          : 'Stars come from the map — three for a sweep, two for a shorter win, one for going the distance. Every node holds ranks and every rank widens it further; a rank costs its row in the branch — one star on the top row, two on the next, and so on. The Dynasty branch opens a node at each new tier of the ladder.'}
      </div>

      <div className="treewrap">
        {/* HIS RULING: "Make staff skill tree zoomed out." The svg used to carry a minWidth of its
            own 512-unit drawing, which is what stopped it shrinking to fit — the trellis was always
            at least full size and the screen scrolled around it. It is a plain scalable drawing
            now, and the CSS sizes it to the window it is in. */}
        <svg className="treesvg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Staff tree">
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
                  aria-label={`${n.name}, ${r} of ${n.ranks} ${n.ranks === 1 ? 'rank' : 'ranks'}, ${cost(n.id)} ${cost(n.id) === 1 ? 'star' : 'stars'} a rank${waiting(n) ? `, opens at level ${n.opensAt}` : ''}`}
                >
                  <polygon className="hex-shadow" points={hexPath(x, y + 3, HEX_R)} />
                  <polygon className="hex" points={hexPath(x, y, HEX_R)} />
                  <polygon className="hex-in" points={hexPath(x, y, HEX_R - 7)} />
                  {/* WHAT A RANK COSTS, on the node itself (his ruling, 2026-10-23: the prices differ now) */}
                  <text className="hex-price" x={x} y={y - 19} textAnchor="middle">
                    ★{cost(n.id)}
                  </text>
                  <text className="hex-name" x={x} y={y - 4} textAnchor="middle">
                    {n.name.split(' ')[0]}
                  </text>
                  <text className="hex-name2" x={x} y={y + 9} textAnchor="middle">
                    {n.name.split(' ').slice(1).join(' ')}
                  </text>
                  <rect className="hex-pill" x={x - 20} y={y + HEX_R - 15} width={40} height={19} rx={5} />
                  {/* a Dynasty node still waiting for its tier says WHERE it opens instead of 0/N */}
                  <text className="hex-rank" x={x} y={y + HEX_R - 1} textAnchor="middle">
                    {waiting(n) && !r ? `L${n.opensAt}` : `${r}/${n.ranks}`}
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
                {node.branch} · {rank(wallet, node.id)}/{node.ranks} {node.ranks === 1 ? 'rank' : 'ranks'} · ★{cost(node.id)} a rank
              </span>
            </div>
            <div className="lede tight">{node.blurb}</div>
            {waiting(node) ? (
              <div className="ranklock">
                Opens at level {node.opensAt}
                {TIER_AT.get(node.opensAt!) ? ` — when the ladder reaches ${TIER_AT.get(node.opensAt!)}` : ''}.
              </div>
            ) : !unlocked(wallet, node.id) ? (
              <div className="ranklock">Needs {NODE[node.requires!].name} first.</div>
            ) : null}
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
                className={`sortb buy ${buyable(node.id) ? 'on' : 'no'}`}
                disabled={!buyable(node.id)}
                onClick={() => onBuy(node.id)}
              >
                {maxed(wallet, node.id)
                  ? 'MAXED'
                  : waiting(node)
                    ? `OPENS AT LEVEL ${node.opensAt}`
                    : !unlocked(wallet, node.id)
                      ? 'LOCKED'
                      : bal < 1
                        ? 'NO STARS'
                        : bal < cost(node.id)
                          ? `NEEDS ★ ${cost(node.id)}`
                          : `★ ${cost(node.id)} — buy rank ${rank(wallet, node.id) + 1}`}
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
          text={
            respecKeeps > 0
              ? `${refund} of your ${wallet.spent} stars come back and every node is unlearned, except ${respecKeeps === 1 ? 'the Extra life you already used — it stays bought' : `the ${respecKeeps} Extra lives you already used — they stay bought`}. Reset your staff?`
              : `All ${wallet.spent} stars come back and every node is unlearned${(wallet.boosted ?? 0) > 0 ? ` (the ${wallet.boosted} spent on boosts were used up, and stay spent)` : ''}. Reset your staff?`
          }
          yes="Reset spending"
          danger
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
