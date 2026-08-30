import type { Player } from '../engine/types'
import { useUserMode } from '../state/viewmode'

/**
 * THE HEAT HEXAGON (his ruling: the fuller a corner, the better the man).
 * Six axes on the card's own numbers — playmaking, rebounding, and the four
 * lineup axes the app already prints as IN·OUT│ID·PD:
 *
 *   PLAY = attrs.playvol (pure — ballsec is security, not creation, so no blend)
 *   REB  = (attrs.orb + attrs.drb) / 2
 *   IN   = p.in    (inside scoring)     OUT = p.out  (outside scoring)
 *   ID   = p.id    (inside defense)     PD  = p.pd   (perimeter defense)
 *
 * Offense fills the right side, defense the left, creation up, glass down.
 * An evaluation, so it hides in USER MODE by default; the auction lot passes
 * `ungated` to match its Versus-style open-book dials. Up to three men overlay
 * on one grid: gold, ice, then neutral.
 */

const AXES: { label: string; v: (p: Player) => number }[] = [
  { label: 'PLAY', v: (p) => p.attrs.playvol },
  { label: 'IN', v: (p) => p.in },
  { label: 'OUT', v: (p) => p.out },
  { label: 'REB', v: (p) => (p.attrs.orb + p.attrs.drb) / 2 },
  { label: 'PD', v: (p) => p.pd },
  { label: 'ID', v: (p) => p.id },
]
const TONES = ['var(--you)', 'var(--them)', 'var(--ink-2)']
const R = 42

const pt = (i: number, r: number): [number, number] => {
  const a = (Math.PI / 180) * (-90 + i * 60)
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)]
}
const ring = (r: number) =>
  AXES.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ')

export function HeatHex({ men, size = 180, labels = true, ungated = false }: { men: Player[]; size?: number; labels?: boolean; ungated?: boolean }) {
  const user = useUserMode()
  if (user && !ungated) return null
  const drawn = men.slice(0, TONES.length)
  return (
    <svg className="heathex" viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      {[R / 3, (2 * R) / 3, R].map((r) => (
        <polygon key={r} points={ring(r)} fill="none" stroke="var(--line-2)" strokeWidth="0.7" />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, R)
        return <line key={i} x1="60" y1="60" x2={x} y2={y} stroke="var(--line)" strokeWidth="0.5" />
      })}
      {drawn.map((p, k) => (
        <polygon
          key={p.name}
          points={AXES.map((a, i) => pt(i, (R * Math.max(2, Math.min(99, a.v(p)))) / 99).map((v) => v.toFixed(1)).join(',')).join(' ')}
          fill={TONES[k]}
          fillOpacity="0.32"
          stroke={TONES[k]}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      ))}
      {labels
        ? AXES.map((a, i) => {
            const [x, y] = pt(i, R + 9)
            return (
              <text
                key={a.label}
                x={x}
                y={y + 2.5}
                textAnchor="middle"
                fontFamily="var(--mono)"
                fontSize="7.4"
                letterSpacing="0.08em"
                fill="var(--muted)"
              >
                {a.label}
              </text>
            )
          })
        : null}
    </svg>
  )
}
