import type { CSSProperties, ReactNode } from 'react'

/**
 * THE CARD'S BANNER (Claude Design, Player Card Banners 8a — his ruling: "Use 8a for all 30 teams").
 *
 * The box the man's name and badge stand in is lit in smoke, and every club has ONE assigned
 * treatment of six: 6a river, 6b plume, 6d storm, 7a twin, 7b shock, 7d burner. The layers are
 * the artboard's own, ported value for value; the one thing changed is the unit. 8a draws a strip
 * 640 by 88, and the card's banner is whatever its column is — 340 on a phone, ~500 on a desk, and
 * taller than 88 because it carries the name and the badge. So every left/right/width is restated
 * as a share of 640 and every top/bottom/height as a share of 88: the smoke lands where the
 * artboard put it at any size, and the blurs and ring spacings stay in pixels, which is what keeps
 * them reading as smoke rather than as a stretched picture of it.
 *
 * The colours are 8a's too, not the ticket table's: the artboard lifted the clubs whose first
 * colour is near-black (Minnesota, Utah, Denver, New Orleans) so there is something for the smoke
 * to glow with. The clubs that moved or were renamed take their franchise's treatment in their
 * own colours — the '96 Sonics burn green and gold, not Thunder blue.
 */

type RGB = [number, number, number]
type C = string | RGB
type Fx = { layers: CSSProperties[]; w?: string; rGlow?: string; ghost?: CSSProperties }
type T = '6a' | '6b' | '6d' | '7a' | '7b' | '7d'

const hx = (h: string): RGB => {
  h = h.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const arr = (c: C): RGB => (Array.isArray(c) ? c : hx(c))
const A = (c: C, a: number) => {
  const [r, g, b] = arr(c)
  return `rgba(${r},${g},${b},${a})`
}
const MX = (c1: C, c2: C, t: number): RGB => {
  const a = arr(c1)
  const b = arr(c2)
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB
}
const LT = (c: C) => MX(c, '#ffffff', 0.55)
const CSS = (c: C) => `rgb(${arr(c).join(',')})`

/** 8a's px on its 640×88 strip, as a share of whatever box the banner is. */
const W_KEYS = new Set(['left', 'right', 'width'])
const H_KEYS = new Set(['top', 'bottom', 'height'])
const pct = (v: string, of: number) => (/^-?[\d.]+px$/.test(v) ? `${((parseFloat(v) / of) * 100).toFixed(3)}%` : v)
const L = (o: Record<string, string>): CSSProperties => {
  const out: Record<string, string> = { position: 'absolute', mixBlendMode: 'screen', pointerEvents: 'none' }
  for (const [k, v] of Object.entries(o)) out[k] = W_KEYS.has(k) ? pct(v, 640) : H_KEYS.has(k) ? pct(v, 88) : v
  return out as CSSProperties
}

const FX: Record<T, (p: C, s: C) => Fx> = {
  '6a': (p) => ({
    layers: [
      L({ left: '-80px', top: '-30px', width: '560px', height: '150px', background: `radial-gradient(ellipse 58% 40% at 40% 55%, ${A(p, 0.85)} 0%, ${A(p, 0.4)} 45%, transparent 72%)`, filter: 'blur(12px)' }),
      L({ left: '100px', top: '-60px', width: '520px', height: '210px', background: `conic-gradient(from 200deg at 50% 55%, transparent 0deg, ${A(LT(p), 0.65)} 55deg, transparent 120deg, ${A(p, 0.55)} 200deg, transparent 290deg)`, filter: 'blur(13px)', transform: 'rotate(-7deg)' }),
      L({ left: '20px', top: '14px', width: '600px', height: '60px', background: `radial-gradient(ellipse 72% 34% at 50% 50%, rgba(240,248,255,0.8) 0%, ${A(LT(p), 0.28)} 45%, transparent 70%)`, filter: 'blur(6px)', transform: 'rotate(-3deg)' }),
      L({ left: '120px', top: '-14px', width: '500px', height: '120px', background: `repeating-radial-gradient(ellipse 130% 42% at 50% 58%, transparent 0 7px, ${A(LT(p), 0.34)} 8px 10px, transparent 11px 22px)`, filter: 'blur(2.5px)', transform: 'rotate(-5deg)' }),
      L({ left: '260px', top: '-40px', width: '220px', height: '170px', background: `radial-gradient(ellipse 46% 40% at 50% 50%, ${A(LT(p), 0.55)} 0%, transparent 68%)`, filter: 'blur(10px)' }),
    ],
  }),
  '6b': (p, s) => ({
    layers: [
      L({ left: '-40px', bottom: '-90px', width: '400px', height: '190px', background: `radial-gradient(ellipse 50% 55% at 45% 30%, ${A(s, 0.75)} 0%, ${A(s, 0.32)} 48%, transparent 74%)`, filter: 'blur(12px)' }),
      L({ left: '150px', bottom: '-40px', width: '360px', height: '200px', background: `conic-gradient(from 340deg at 45% 80%, transparent 0deg, ${A(p, 0.6)} 50deg, transparent 115deg, ${A(LT(p), 0.5)} 200deg, transparent 285deg)`, filter: 'blur(12px)', transform: 'rotate(10deg)' }),
      L({ left: '300px', bottom: '-20px', width: '300px', height: '180px', background: `radial-gradient(ellipse 42% 60% at 50% 78%, ${A(LT(p), 0.75)} 0%, ${A(p, 0.3)} 46%, transparent 72%)`, filter: 'blur(9px)', transform: 'rotate(-6deg)' }),
      L({ left: '230px', bottom: '-10px', width: '380px', height: '130px', background: `repeating-radial-gradient(ellipse 60% 130% at 50% 100%, transparent 0 8px, ${A(LT(p), 0.3)} 9px 11px, transparent 12px 24px)`, filter: 'blur(2.5px)', transform: 'rotate(6deg)' }),
      L({ left: '0', right: '0', bottom: '0', height: '34px', background: `linear-gradient(0deg, ${A(s, 0.35)} 0%, transparent 100%)`, filter: 'blur(4px)' }),
    ],
    w: `0 0 26px ${A(LT(s), 0.95)},0 2px 10px rgba(0,0,0,0.95)`,
    rGlow: `0 -1px 16px ${A(s, 1)}`,
  }),
  '6d': (p, s) => ({
    layers: [
      L({ left: '-100px', top: '-60px', width: '480px', height: '220px', background: `radial-gradient(ellipse 55% 50% at 40% 50%, ${A(MX(p, '#ffffff', 0.75), 0.75)} 0%, ${A(MX(p, '#ffffff', 0.35), 0.4)} 42%, ${A(p, 0.18)} 62%, transparent 78%)`, filter: 'blur(11px)' }),
      L({ left: '-30px', top: '-50px', width: '420px', height: '200px', background: `conic-gradient(from 120deg at 40% 50%, transparent 0deg, ${A(MX(p, '#ffffff', 0.85), 0.55)} 60deg, transparent 130deg, ${A(MX(p, '#ffffff', 0.4), 0.45)} 220deg, transparent 300deg)`, filter: 'blur(13px)', transform: 'rotate(8deg)' }),
      L({ left: '30px', top: '-16px', width: '420px', height: '130px', background: `repeating-radial-gradient(ellipse 120% 50% at 35% 55%, transparent 0 7px, ${A(MX(p, '#ffffff', 0.7), 0.32)} 8px 10px, transparent 11px 22px)`, filter: 'blur(2.5px)', transform: 'rotate(4deg)' }),
      L({ left: '250px', top: '-30px', width: '260px', height: '160px', background: `radial-gradient(ellipse 48% 45% at 45% 52%, ${A(p, 0.5)} 0%, transparent 70%)`, filter: 'blur(12px)' }),
      L({ top: '-12px', bottom: '-12px', right: '-16px', width: '64px', background: `linear-gradient(180deg, ${CSS(MX(p, '#000000', 0.72))}, ${CSS(MX(p, '#000000', 0.88))})`, borderLeft: `2px solid ${CSS(s)}`, transform: 'skewX(-16deg)', boxShadow: `-8px 0 34px ${A(s, 0.65)}`, mixBlendMode: 'normal' }),
      L({ top: '-12px', bottom: '-12px', right: '58px', width: '9px', background: A(s, 0.9), transform: 'skewX(-16deg)', boxShadow: `0 0 20px ${A(s, 0.9)}`, mixBlendMode: 'normal' }),
    ],
    ghost: { right: '15%' },
  }),
  '7a': (p, s) => ({
    layers: [
      L({ left: '-80px', top: '-56px', width: '560px', height: '160px', background: `radial-gradient(ellipse 56% 38% at 42% 62%, ${A(p, 0.8)} 0%, ${A(p, 0.35)} 46%, transparent 72%)`, filter: 'blur(11px)', transform: 'rotate(5deg)' }),
      L({ left: '-40px', bottom: '-64px', width: '600px', height: '160px', background: `radial-gradient(ellipse 56% 38% at 55% 38%, ${A(s, 0.7)} 0%, ${A(s, 0.3)} 46%, transparent 72%)`, filter: 'blur(11px)', transform: 'rotate(-5deg)' }),
      L({ left: '110px', top: '-40px', width: '480px', height: '170px', background: `conic-gradient(from 195deg at 50% 50%, transparent 0deg, ${A(LT(p), 0.55)} 55deg, transparent 120deg, ${A(LT(s), 0.45)} 210deg, transparent 295deg)`, filter: 'blur(12px)', transform: 'rotate(-4deg)' }),
      L({ left: '80px', top: '0', width: '540px', height: '88px', background: 'repeating-radial-gradient(ellipse 140% 44% at 50% 52%, transparent 0 8px, rgba(225,238,255,0.3) 9px 11px, transparent 12px 23px)', filter: 'blur(2.5px)', transform: 'rotate(-2deg)' }),
      L({ left: '280px', top: '14px', width: '200px', height: '60px', background: `radial-gradient(ellipse 50% 50% at 50% 50%, rgba(248,250,255,0.75) 0%, ${A(MX(p, s, 0.5), 0.25)} 48%, transparent 72%)`, filter: 'blur(6px)' }),
    ],
    w: `0 0 22px ${A(LT(p), 1)},0 0 40px ${A(s, 0.6)},0 2px 10px rgba(0,0,0,0.95)`,
  }),
  '7b': (p, s) => ({
    layers: [
      L({ left: '96px', top: '50%', transform: 'translateY(-50%)', width: '340px', height: '340px', background: `repeating-radial-gradient(circle at 50% 50%, transparent 0 26px, ${A(LT(p), 0.32)} 28px 33px, transparent 35px 60px)`, filter: 'blur(3px)', borderRadius: '50%' }),
      L({ left: '150px', top: '50%', transform: 'translateY(-50%)', width: '230px', height: '230px', background: `radial-gradient(circle at 50% 50%, rgba(240,250,255,0.9) 0%, ${A(LT(p), 0.5)} 30%, ${A(p, 0.2)} 55%, transparent 72%)`, filter: 'blur(9px)', borderRadius: '50%' }),
      L({ left: '-60px', top: '-40px', width: '480px', height: '180px', background: `conic-gradient(from 150deg at 55% 50%, transparent 0deg, ${A(p, 0.55)} 70deg, transparent 150deg, ${A(LT(p), 0.4)} 240deg, transparent 320deg)`, filter: 'blur(13px)' }),
      L({ right: '-70px', top: '-50px', width: '320px', height: '190px', background: `radial-gradient(ellipse 52% 44% at 48% 55%, ${A(s, 0.55)} 0%, ${A(s, 0.22)} 50%, transparent 76%)`, filter: 'blur(13px)' }),
    ],
    ghost: { color: A(LT(s), 0.3) },
  }),
  '7d': (p, s) => ({
    layers: [
      L({ left: '-20px', top: '0', width: '680px', height: '88px', background: `repeating-linear-gradient(178deg, transparent 0 6px, ${A(LT(p), 0.22)} 7px 9px, transparent 10px 19px)`, filter: 'blur(2px)', transform: 'rotate(-2deg)' }),
      L({ right: '60px', top: '50%', transform: 'translateY(-50%)', width: '420px', height: '70px', background: `radial-gradient(ellipse 70% 42% at 78% 50%, rgba(240,248,255,0.9) 0%, ${A(LT(p), 0.42)} 40%, ${A(p, 0.16)} 62%, transparent 78%)`, filter: 'blur(7px)' }),
      L({ left: '-80px', top: '-40px', width: '520px', height: '170px', background: `radial-gradient(ellipse 58% 42% at 42% 55%, ${A(p, 0.5)} 0%, ${A(p, 0.2)} 48%, transparent 74%)`, filter: 'blur(13px)' }),
      L({ left: '60px', top: '8px', width: '480px', height: '76px', background: `repeating-radial-gradient(ellipse 160% 42% at 85% 50%, transparent 0 7px, ${A(LT(p), 0.32)} 8px 10px, transparent 11px 21px)`, filter: 'blur(2.5px)', transform: 'rotate(-1deg)' }),
      L({ right: '150px', top: '50%', transform: 'translateY(-50%)', width: '60px', height: '44px', background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${A(LT(s), 0.85)} 0%, ${A(s, 0.35)} 50%, transparent 74%)`, filter: 'blur(5px)' }),
    ],
    ghost: { color: 'rgba(240,250,255,0.9)', filter: 'none', textShadow: `-14px 0 26px ${A(LT(p), 0.9)},0 0 34px ${A(p, 0.9)}` },
  }),
}

type Club = [city: string, conf: 'EAST' | 'WEST', p: string, s: string, t: T]

/**
 * 8a's thirty, keyed by the abbreviation the pool's stat lines carry (BRK, CHO, PHO — the artboard
 * prints BKN, CHA, PHX), then the old clubs in their own colours on their franchise's treatment.
 */
const CLUBS: Record<string, Club> = {
  ATL: ['ATLANTA', 'EAST', '#E03A3E', '#C1D32F', '6b'],
  BOS: ['BOSTON', 'EAST', '#007A33', '#BA9653', '6a'],
  BRK: ['BROOKLYN', 'EAST', '#cfd6dd', '#6e7a86', '6d'],
  CHO: ['CHARLOTTE', 'EAST', '#00788C', '#5f4bc2', '7a'],
  CHI: ['CHICAGO', 'EAST', '#CE1141', '#d7dde6', '6b'],
  CLE: ['CLEVELAND', 'EAST', '#a01048', '#FDBB30', '7a'],
  DET: ['DETROIT', 'EAST', '#C8102E', '#2f5ae0', '7d'],
  IND: ['INDIANA', 'EAST', '#2456a8', '#FDBB30', '7d'],
  MIA: ['MIAMI', 'EAST', '#b8073c', '#F9A01B', '6b'],
  MIL: ['MILWAUKEE', 'EAST', '#0a6a30', '#EEE1C6', '6a'],
  NYK: ['NEW YORK', 'EAST', '#006BB6', '#F58426', '7a'],
  ORL: ['ORLANDO', 'EAST', '#0077C0', '#C4CED4', '7b'],
  PHI: ['PHILADELPHIA', 'EAST', '#006BB6', '#ED174C', '7a'],
  TOR: ['TORONTO', 'EAST', '#CE1141', '#A1A1A4', '6d'],
  WAS: ['WASHINGTON', 'EAST', '#1a4a8c', '#E31837', '7b'],
  DAL: ['DALLAS', 'WEST', '#00538C', '#B8C4CA', '6a'],
  DEN: ['DENVER', 'WEST', '#1b3a66', '#FEC524', '6b'],
  GSW: ['GOLDEN STATE', 'WEST', '#2a5ac0', '#FFC72C', '7b'],
  HOU: ['HOUSTON', 'WEST', '#CE1141', '#C4CED4', '7d'],
  LAC: ['LOS ANGELES', 'WEST', '#C8102E', '#2f62c8', '7a'],
  LAL: ['LOS ANGELES', 'WEST', '#6a2fa8', '#FDB927', '7a'],
  MEM: ['MEMPHIS', 'WEST', '#5D76A9', '#F5B112', '6d'],
  MIN: ['MINNESOTA', 'WEST', '#2a6cb0', '#78BE20', '6d'],
  NOP: ['NEW ORLEANS', 'WEST', '#28457c', '#d4b56a', '6a'],
  OKC: ['OKLAHOMA CITY', 'WEST', '#007AC1', '#EF3B24', '7b'],
  PHO: ['PHOENIX', 'WEST', '#E56020', '#F9AD1B', '6b'],
  POR: ['PORTLAND', 'WEST', '#9aa6b4', '#E03A3E', '6d'],
  SAC: ['SACRAMENTO', 'WEST', '#7a44b4', '#aab6c0', '6a'],
  SAS: ['SAN ANTONIO', 'WEST', '#C4CED4', '#6e7a86', '7d'],
  UTA: ['UTAH', 'WEST', '#3a5aa8', '#F9A01B', '6a'],

  SEA: ['SEATTLE', 'WEST', '#0a7a45', '#FFC200', '7b'],
  NJN: ['NEW JERSEY', 'EAST', '#2a4f9a', '#C8102E', '6d'],
  WSB: ['WASHINGTON', 'EAST', '#1a4a8c', '#E31837', '7b'],
  CHH: ['CHARLOTTE', 'EAST', '#00788C', '#5f4bc2', '7a'],
  CHA: ['CHARLOTTE', 'EAST', '#2f62a8', '#F26532', '7a'],
  NOH: ['NEW ORLEANS', 'WEST', '#00788C', '#c9a860', '6a'],
  NOK: ['OKLAHOMA CITY', 'WEST', '#00788C', '#c9a860', '6a'],
  KCK: ['KANSAS CITY', 'WEST', '#2a5cb8', '#e6b325', '6a'],
  VAN: ['VANCOUVER', 'WEST', '#00788e', '#bc7844', '6d'],
  SDC: ['SAN DIEGO', 'WEST', '#C8102E', '#f2a900', '7a'],
}

/**
 * A season split between clubs is not one club's banner, the same answer the terminal's skin gives
 * it: the steel river, with every club he wore that year ghosted on the right.
 */
const SPLIT: Club = ['SPLIT SEASON', 'EAST', '#5a6d92', '#a6cbe9', '6a']

export function TeamBanner({ teams, children }: { teams: string[]; children: ReactNode }) {
  const one = teams.length === 1 ? CLUBS[teams[0]] : undefined
  const [city, conf, p, s, t] = one ?? SPLIT
  const fx = FX[t](p, s)
  const code = teams.length ? teams.join('/') : ''
  const top = one ? `NBA ▸ ${conf} · ${city}` : teams.length > 1 ? `NBA ▸ ${city}` : 'NBA'
  return (
    <div
      className="pct-banner"
      data-fx={one ? t : 'split'}
      style={{ background: CSS(MX(p, '#000004', 0.93)), '--ban-glow': fx.w ?? `0 0 24px ${A(LT(p), 1)},0 2px 10px rgba(0,0,0,0.95)`, '--ban-dot': CSS(s) } as CSSProperties}
    >
      {fx.layers.map((l, i) => (
        <i key={i} style={l} />
      ))}
      <i className="pct-ban-shade" />
      <span className="pct-ban-ghost" style={{ color: A(LT(p), 0.3), ...fx.ghost }}>
        {code}
      </span>
      <div className="pct-ban-body">
        <div className="pct-ban-top" style={{ color: CSS(MX(p, '#dfe8f5', 0.72)) }}>
          {top}
        </div>
        {children}
      </div>
      <div className="pct-ban-split" aria-hidden="true">
        <i style={{ background: CSS(p), boxShadow: `0 -1px 14px ${A(p, 1)}` }} />
        <i style={{ background: CSS(s), boxShadow: fx.rGlow ?? 'none' }} />
      </div>
    </div>
  )
}
