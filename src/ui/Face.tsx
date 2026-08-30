import type { Player } from '../engine/types'

/**
 * GENERIC FACES. Every card carries a deterministic portrait — a flat-vector
 * bust (head, neck, jersey collar) in the app's editorial voice — derived ONLY
 * from a hash of the bare career name, so every season of one man shares a
 * face and it never changes between sessions.
 *
 * THESE ARE DECLARED GENERIC FACES, NOT LIKENESSES. Skin tone, hair, and every
 * feature are hash bits and nothing else — never inferred from the name, the
 * era, the team, or anything about the real person.
 *
 * Axes: 4 face shapes × 8 skin tones × 8 hair styles × 5 hair colors ×
 * 5 facial-hair cuts × 3 brows × 4 eye spacings × 3 nose widths ≈ 230k faces.
 * Pure SVG, no filters — these render in long lists.
 */

/** FNV-1a with a final avalanche, so short names still spread across the axes. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return h >>> 0
}

const SKIN = ['#f0cfae', '#e6bd96', '#d8a87e', '#c79268', '#ad7a52', '#8f6240', '#734c30', '#583a24']
const HAIR = ['#191411', '#2b211a', '#3d2c1e', '#544233', '#6e675e']
const INK = '#231c15'

interface F {
  skin: string
  hair: string
  style: number
  beard: number
  brow: number
  hw: number
  jw: number
  chin: number
  ed: number
  nw: number
}

const CACHE = new Map<string, F>()
function faceOf(bare: string): F {
  const hit = CACHE.get(bare)
  if (hit) return hit
  let h = hash(bare)
  const take = (n: number) => {
    const v = h % n
    h = Math.floor(h / n)
    return v
  }
  let h2 = hash(bare + '·b')
  const take2 = (n: number) => {
    const v = h2 % n
    h2 = Math.floor(h2 / n)
    return v
  }
  const shape = take(4)
  const f: F = {
    skin: SKIN[take(8)],
    hair: HAIR[take(5)],
    style: take(8),
    beard: take(5),
    brow: take2(3),
    hw: [10.2, 11.2, 11.8, 10.6][shape],
    jw: [0.55, 0.72, 0.62, 0.82][shape],
    chin: [40.5, 40, 41, 39.5][shape],
    ed: 4 + take2(4) * 0.35,
    nw: 0.8 + take2(3) * 0.35,
  }
  CACHE.set(bare, f)
  return f
}

/** The hair cap: outer edge hugs the skull, the inner edge is the hairline. */
const cap = (hw: number, y: number, e = 0.7) =>
  `M ${32 - hw - e} ${y} C ${32 - hw - e} ${14.2 - e} ${32 - hw * 0.55} ${10.8 - e} 32 ${10.8 - e} ` +
  `C ${32 + hw * 0.55} ${10.8 - e} ${32 + hw + e} ${14.2 - e} ${32 + hw + e} ${y} ` +
  `C ${32 + hw * 0.5} ${y - 3.2} ${32 - hw * 0.5} ${y - 3.2} ${32 - hw - e} ${y} Z`

/** A band along the lower face, for stubble and the full beard. */
const jawBand = (hw: number, jw: number, chin: number) =>
  `M ${32 - hw + 0.6} 28.5 C ${32 - hw + 0.6} 33.5 ${32 - jw * hw - 0.4} ${chin - 0.6} 32 ${chin + 0.3} ` +
  `C ${32 + jw * hw + 0.4} ${chin - 0.6} ${32 + hw - 0.6} 33.5 ${32 + hw - 0.6} 28.5 L ${32 + hw - 2.6} 28.5 ` +
  `C ${32 + hw - 2.6} 32.3 ${32 + jw * hw - 1.8} ${chin - 3.6} 32 ${chin - 3.2} ` +
  `C ${32 - jw * hw + 1.8} ${chin - 3.6} ${32 - hw + 2.6} 32.3 ${32 - hw + 2.6} 28.5 Z`

export function Face({ player, size = 40 }: { player: Player | string; size?: number }) {
  const f = faceOf(typeof player === 'string' ? player : player.player)
  const { skin, hair, hw, jw, chin } = f
  const tiny = size < 40
  const head =
    `M ${32 - hw} 25 C ${32 - hw} 15.2 ${32 - hw * 0.55} 11.6 32 11.6 ` +
    `C ${32 + hw * 0.55} 11.6 ${32 + hw} 15.2 ${32 + hw} 25 ` +
    `C ${32 + hw} 32 ${32 + jw * hw} ${chin - 1} 32 ${chin} ` +
    `C ${32 - jw * hw} ${chin - 1} ${32 - hw} 32 ${32 - hw} 25 Z`
  const mustache = `M ${32 - 3.4} 33.8 Q 32 32.7 ${32 + 3.4} 33.8 L ${32 + 2.7} 35 Q 32 34.2 ${32 - 2.7} 35 Z`
  return (
    <svg className="face" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {/* hair that lives behind the head */}
      {f.style === 6 ? (
        <>
          <circle cx="32" cy="15" r="12" fill={hair} />
          <circle cx={32 - hw * 0.75} cy="18" r="7.5" fill={hair} />
          <circle cx={32 + hw * 0.75} cy="18" r="7.5" fill={hair} />
        </>
      ) : null}
      {f.style === 7 ? (
        <path
          d={`M ${32 - hw - 2.4} 16 Q ${32 - hw - 2.4} 10 32 10 Q ${32 + hw + 2.4} 10 ${32 + hw + 2.4} 16 L ${32 + hw + 2.4} 33 Q ${32 + hw + 2.4} 36.5 ${32 + hw - 1} 36.5 L ${32 - hw + 1} 36.5 Q ${32 - hw - 2.4} 36.5 ${32 - hw - 2.4} 33 Z`}
          fill={hair}
        />
      ) : null}
      {/* neck and jersey */}
      <path d="M27.4 32 h9.2 v10.5 h-9.2 Z" fill={skin} />
      <path d="M27.4 32 h9.2 v3.4 h-9.2 Z" fill="#000" opacity="0.14" />
      <path
        d="M7.5 64 C8.5 50 16 45.5 24.5 43.5 L27.5 42.8 L32 47.5 L36.5 42.8 L39.5 43.5 C48 45.5 55.5 50 56.5 64 Z"
        fill="var(--surface)"
        stroke="var(--line-3)"
        strokeWidth="1"
      />
      <path d="M27.5 42.8 L32 47.5 L36.5 42.8" fill="none" stroke="var(--line-2)" strokeWidth="1.2" />
      {/* ears, head */}
      <circle cx={32 - hw} cy="25.5" r="2.1" fill={skin} />
      <circle cx={32 + hw} cy="25.5" r="2.1" fill={skin} />
      <path d={head} fill={skin} />
      {/* hair on top */}
      {f.style === 1 ? <path d={cap(hw, 20, 0.2)} fill={hair} opacity="0.5" /> : null}
      {f.style === 2 || f.style === 4 ? <path d={cap(hw, 20)} fill={hair} /> : null}
      {f.style === 3 ? (
        <>
          <path d={cap(hw, 18.5, 0.9)} fill={hair} />
          <path d={`M ${32 - hw - 0.9} 17.5 h1.8 v8 h-1.8 Z`} fill={hair} />
          <path d={`M ${32 + hw - 0.9} 17.5 h1.8 v8 h-1.8 Z`} fill={hair} />
        </>
      ) : null}
      {f.style === 4 && !tiny ? (
        <>
          <path d={`M ${32 - hw * 0.6} 15 Q 32 12.8 ${32 + hw * 0.6} 15`} fill="none" stroke="#000" strokeWidth="0.8" opacity="0.3" />
          <path d={`M ${32 - hw * 0.7} 17.6 Q 32 15.4 ${32 + hw * 0.7} 17.6`} fill="none" stroke="#000" strokeWidth="0.8" opacity="0.3" />
        </>
      ) : null}
      {f.style === 5 ? (
        <>
          <path d={cap(hw, 19.5, 1)} fill={hair} />
          {[-2, -1, 0, 1, 2].map((k) => (
            <circle key={k} cx={32 + k * (hw / 2.1)} cy={k % 2 ? 18.6 : 19.6} r="1.9" fill={hair} />
          ))}
        </>
      ) : null}
      {f.style === 6 ? <path d={cap(hw, 18, 1.4)} fill={hair} /> : null}
      {f.style === 7 ? <path d={cap(hw, 19.5, 1)} fill={hair} /> : null}
      {/* the face itself */}
      {f.beard === 1 && !tiny ? <path d={jawBand(hw, jw, chin)} fill={hair} opacity="0.22" /> : null}
      {f.beard === 4 ? <path d={jawBand(hw, jw, chin)} fill={hair} /> : null}
      {f.beard === 2 || f.beard === 3 || f.beard === 4 ? <path d={mustache} fill={hair} /> : null}
      {f.beard === 3 ? <ellipse cx="32" cy="38.6" rx="2.4" ry="2.1" fill={hair} /> : null}
      {!tiny ? (
        f.brow === 1 ? (
          <>
            <path d={`M ${32 - f.ed - 2.3} 23.4 L ${32 - f.ed + 2.3} 21.9 L ${32 - f.ed + 2.3} 23 L ${32 - f.ed - 2.3} 24.5 Z`} fill={INK} />
            <path d={`M ${32 + f.ed - 2.3} 21.9 L ${32 + f.ed + 2.3} 23.4 L ${32 + f.ed + 2.3} 24.5 L ${32 + f.ed - 2.3} 23 Z`} fill={INK} />
          </>
        ) : (
          <>
            <rect x={32 - f.ed - 2.3} y={f.brow === 2 ? 21.6 : 22} width="4.6" height={f.brow === 2 ? 1.8 : 1.1} rx="0.5" fill={INK} />
            <rect x={32 + f.ed - 2.3} y={f.brow === 2 ? 21.6 : 22} width="4.6" height={f.brow === 2 ? 1.8 : 1.1} rx="0.5" fill={INK} />
          </>
        )
      ) : null}
      <ellipse cx={32 - f.ed} cy="26" rx="1.4" ry="1.8" fill={INK} />
      <ellipse cx={32 + f.ed} cy="26" rx="1.4" ry="1.8" fill={INK} />
      {!tiny ? (
        <path d={`M 31.9 26 L 31.2 30.6 Q 32 31.8 ${32.9 + f.nw} 30.9`} fill="none" stroke={INK} strokeWidth="0.9" opacity="0.75" />
      ) : null}
      <path d={`M ${32 - 2.7} 35.3 Q 32 36.5 ${32 + 2.7} 35.3`} fill="none" stroke={f.beard === 4 ? skin : INK} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
