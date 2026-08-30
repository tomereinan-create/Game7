import { STYLES, type Style, type Tactics } from '../engine/tactics'
import type { Player } from '../engine/types'

/**
 * THE COURT LINEUP (his ruling: a five stands on a floor, not in a list). An
 * inline half court in the house voice — wash floor, hairline markings, the
 * rim at the baseline — with the five at their spots. A signed sixth man
 * stands off-court on the out-of-bounds strip above the half-court line.
 *
 * A gated plan moves the formation (his ruling: call five-out and the team
 * SHOWS five-out): the style arranges the spots, the named scorer/playmaker
 * wear microtags, and a quiet mono caption names the non-default calls. No
 * plan — the team db, an ungated call — stands balanced. Pure layout beyond
 * that: every spot's tag, tone and tap come from the caller.
 */

export interface CourtSpot {
  p: Player | null
  /** The mono line under the name: "PG · 84", "PG · 3 left", "SF · open". */
  tag: string
  danger?: boolean
  on?: boolean
  dim?: boolean
  onTap?: () => void
}

type XY = readonly [number, number]

/**
 * THE COURT'S OWN GEOMETRY (his report: formation spots ignored the drawn 3pt
 * line). These constants mirror the floor SVG exactly — the arc is
 * `M8 98 L8 82 A49 49 0 0 1 92 82`, so its circle centers at (50, 82+√(49²−42²))
 * — and every perimeter spot is derived FROM that circle: `peri(deg, m)` stands
 * a man m units BEHIND the line at the given angle (0° = straight atop the
 * arc, ±59° are the corner breaks; beyond ±47° would leave the floor, so the
 * corner three hugs the vertical corner lane instead). Interior spots (block,
 * roller, elbow, dunker) are named landmarks well inside the arc. Proportional
 * at every render size, since everything is viewBox units.
 */
const ARC_R = 49
const ARC_CX = 50
const ARC_CY = 82 + Math.sqrt(ARC_R * ARC_R - 42 * 42)
const peri = (deg: number, m = 8): XY => {
  const a = (deg * Math.PI) / 180
  return [ARC_CX + (ARC_R + m) * Math.sin(a), ARC_CY - (ARC_R + m) * Math.cos(a)]
}
/** The corner three: on the corner lane, hugging the sideline below the break. */
const CORNER_L: XY = [7, 88]
const CORNER_R: XY = [93, 88]
/** Interior landmarks — all comfortably inside the arc. */
const BLOCK_L: XY = [28, 81]
const PAINT_C: XY = [60, 80]
const ROLL: XY = [57, 63]
const ELBOW_R: XY = [66, 72]
const DUNK_L: XY = [32, 88]
const DUNK_R: XY = [68, 88]

/** Balanced — PG above the arc, the wings behind it, PF at the block, C in the paint. */
const AT: XY[] = [peri(0, 12), peri(-38), peri(38), BLOCK_L, PAINT_C]
const BENCH_AT: XY = [14, 9]

/** The man an index-picking formation leans on; `not` keeps the screen off the PG himself. */
const best = (five: Player[], score: (p: Player) => number, not = -1) => {
  let k = -1
  for (let i = 0; i < five.length; i++) if (i !== not && (k < 0 || score(five[i]) > score(five[k]))) k = i
  return k
}

/**
 * Formations by style, index-aligned to the five's slot order (PG..C). Readable
 * spacings, not X-and-O diagrams; the special men use the same proxies the fit
 * formulas key on (post = min(rim, volume), helio engine = min(volume, playvol),
 * the pnr screen = the dive big, min(rim, efficiency)).
 */
function spotsFor(style: Style | undefined, five: (Player | null)[]): XY[] {
  const men = five.filter((p): p is Player => !!p)
  if (!style || style === 'balanced' || men.length < 5) return [...AT]
  const fill = (picked: Record<number, XY>, rest: XY[]): XY[] => {
    const out: XY[] = []
    let r = 0
    for (let i = 0; i < 5; i++) out[i] = picked[i] ?? rest[r++]
    return out
  }
  switch (style) {
    case 'fiveout':
      // five behind the line, following the arc: top, both wings, both corners
      return [peri(0), peri(-32), peri(32), CORNER_L, CORNER_R]
    case 'motion':
      // staggered perimeter with one elbow man cutting
      return [peri(-14), peri(-45), peri(45), peri(14), ELBOW_R]
    case 'transition':
      // two men high on the half-court line, a trailer, two lane runners
      return [
        [30, 26],
        [70, 26],
        peri(0, 3),
        peri(-43),
        peri(43),
      ]
    case 'pnr': {
      // the PG behind the arc, the screener rolling inside it; shooters spot the corners and the weak wing
      const s = best(men, (p) => (p.attrs.height >= 80 ? Math.min(p.attrs.rim, p.attrs.efficiency) : p.attrs.height), 0)
      return fill({ 0: peri(-6, 10), [s]: ROLL }, [CORNER_L, CORNER_R, peri(38)])
    }
    case 'postup': {
      // the post man on the block, four spaced behind the line away from his side
      const s = best(men, (p) => (p.attrs.height >= 81 ? Math.min(p.attrs.rim, p.attrs.volume) : 0))
      return fill({ [s]: BLOCK_L }, [peri(0), peri(-38), peri(38), CORNER_R])
    }
    case 'helio': {
      // the engine alone above the arc; the four low — corners and the dunker spots
      const s = best(men, (p) => Math.min(p.attrs.volume, p.attrs.playvol))
      return fill({ [s]: peri(0, 12) }, [CORNER_L, DUNK_L, DUNK_R, CORNER_R])
    }
  }
}

/** The caption: every non-default call, mono caps, quiet. */
function callLine(plan: Tactics): string {
  const bits: string[] = []
  if (plan.style !== 'balanced') bits.push(STYLES.find((s) => s.key === plan.style)?.label ?? plan.style)
  if (plan.tempo !== 'normal') bits.push(`${plan.tempo} night`)
  if (plan.scheme !== 'matchup') bits.push(plan.scheme)
  if (plan.hunt) bits.push('hunt on')
  if (plan.crashOff) bits.push('crash O')
  if (plan.crashDef) bits.push('crash D')
  return bits.join(' · ')
}

/** Card name -> the words of his real name: season tag off, and generational suffixes
 *  dropped so a Bagley III reads "Bagley/MB", not "III/MI". */
const words = (n: string) =>
  n
    .replace(/ '\d\d( \([a-z]\))?$/, '')
    .split(' ')
    .filter((w) => w && !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(w))

const surname = (n: string) => words(n).pop()

/** The ring holds initials now — the faces are gone by his ruling, the spot survives them. */
const initials = (n: string) =>
  words(n)
    .map((w) => w[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')

function Spot({ s, at, size, sc, pm }: { s: CourtSpot; at: XY; size: number; sc?: boolean; pm?: boolean }) {
  return (
    <button
      className={`ct-spot ${s.danger ? 'danger' : ''} ${s.on ? 'on' : ''} ${s.dim ? 'dim' : ''} ${s.p ? '' : 'ct-open'}`}
      style={{ left: `${at[0]}%`, top: `${at[1]}%` }}
      onClick={s.onTap}
      disabled={!s.onTap}
    >
      <span className="ct-bust" style={{ width: size, height: size }}>
        {s.p ? <em className="ct-init">{initials(s.p.name)}</em> : null}
        {sc ? <u className="ct-mark sc">SC</u> : null}
        {pm ? <u className={`ct-mark pm ${sc ? 'lo' : ''}`}>PM</u> : null}
      </span>
      <b>{s.p ? surname(s.p.name) : 'open'}</b>
      <i>{s.tag}</i>
    </button>
  )
}

export function CourtFive({ spots, bench, plan }: { spots: CourtSpot[]; bench?: CourtSpot | null; plan?: Tactics | null }) {
  const at = spotsFor(plan?.style, spots.map((s) => s.p))
  const call = plan ? callLine(plan) : ''
  return (
    <div className="court">
      <svg className="ct-floor" viewBox="0 0 100 100" aria-hidden="true">
        {/* the floor: boundary, half-court circle, the paint, the arc, the rim */}
        <rect x="2" y="20" width="96" height="78" fill="var(--wash)" stroke="var(--line)" strokeWidth="0.8" />
        <path d="M39 20 A 11 11 0 0 0 61 20" fill="none" stroke="var(--line-2)" strokeWidth="0.7" />
        <rect x="34" y="64" width="32" height="34" fill="var(--surface)" stroke="var(--line-2)" strokeWidth="0.7" />
        <circle cx="50" cy="64" r="9" fill="none" stroke="var(--line-2)" strokeWidth="0.7" />
        <path d="M8 98 L8 82 A 49 49 0 0 1 92 82 L92 98" fill="none" stroke="var(--line-2)" strokeWidth="0.7" />
        <path d="M43.5 95.6 h13" stroke="var(--line-3)" strokeWidth="1" />
        <circle cx="50" cy="92.6" r="2.3" fill="none" stroke="var(--line-3)" strokeWidth="0.8" />
        {bench ? <path d="M5 16.5 h17" stroke="var(--line-2)" strokeWidth="0.7" /> : null}
      </svg>
      {call ? <span className="ct-call">{call}</span> : null}
      {spots.slice(0, AT.length).map((s, i) => (
        <Spot
          key={s.p ? s.p.name : `open-${i}`}
          s={s}
          at={at[i]}
          size={58}
          sc={!!plan?.scorer && s.p?.name === plan.scorer}
          pm={!!plan?.playmaker && s.p?.name === plan.playmaker}
        />
      ))}
      {bench ? <Spot s={bench} at={BENCH_AT} size={46} /> : null}
    </div>
  )
}
