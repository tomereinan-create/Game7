/**
 * recal_140 — what is the engine MISSING? Within-season residual of offRaw against real ORtg,
 * regressed on candidate five-level aggregates. The same method recal_119 used to find the
 * possession-loss channel.
 */
import { KNOBS as K, creation } from '../src/engine/offense'
import { TEAMS, offP } from './sweep140'
import type { Player } from '../src/engine/types'

const P0 = { G: 0, AMP: K.AMP_MAX, REF: K.FEED_REF }

const u2of = (five: Player[]) => {
  const A = five.map((p) => p.attrs)
  const u = A.map((a) => a.usg_raw)
  const c = A.map(creation)
  const delta = K.TEAM_USG - u.reduce((s, x) => s + x, 0)
  const w = delta >= 0 ? c.map((ci, i) => Math.max(0.05, ci) * u[i]) : u.map((ui) => Math.max(0, ui - 12))
  const W = w.reduce((s, x) => s + x, 0) || 1
  let u2 = u.map((ui, i) => Math.max(K.FLOOR_USG, ui + (delta * w[i]) / W))
  const s0 = u2.reduce((a, b) => a + b, 0)
  return u2.map((x) => (x * K.TEAM_USG) / s0)
}

const AGG: Record<string, (five: Player[]) => number> = {
  'feed (usage-wtd creation)': (f) => { const u2 = u2of(f); return f.reduce((s, p, i) => s + creation(p.attrs) * u2[i], 0) / 100 },
  'topCreation (max c)': (f) => Math.max(...f.map((p) => creation(p.attrs))),
  '2nd creation': (f) => f.map((p) => creation(p.attrs)).sort((a, b) => b - a)[1],
  'mean c': (f) => f.reduce((s, p) => s + creation(p.attrs), 0) / 5,
  'min c': (f) => Math.min(...f.map((p) => creation(p.attrs))),
  'max playvol': (f) => Math.max(...f.map((p) => p.attrs.playvol)),
  'mean playvol': (f) => f.reduce((s, p) => s + p.attrs.playvol, 0) / 5,
  'usage-wtd playvol': (f) => { const u2 = u2of(f); return f.reduce((s, p, i) => s + p.attrs.playvol * u2[i], 0) / 100 },
  'mean 3pt': (f) => f.reduce((s, p) => s + p.attrs['3pt'], 0) / 5,
  'min 3pt': (f) => Math.min(...f.map((p) => p.attrs['3pt'])),
  'n spacers (3pt>=70)': (f) => f.filter((p) => p.attrs['3pt'] >= 70).length,
  'usage surplus (Σusg-100)': (f) => f.reduce((s, p) => s + p.attrs.usg_raw, 0) - 100,
  'max usg_raw': (f) => Math.max(...f.map((p) => p.attrs.usg_raw)),
  'usg sd': (f) => { const u = f.map((p) => p.attrs.usg_raw); const m = u.reduce((a, b) => a + b) / 5; return Math.sqrt(u.reduce((a, b) => a + (b - m) ** 2, 0) / 5) },
  'ts_rel sd': (f) => { const u = f.map((p) => p.attrs.ts_rel ?? p.attrs.ts_raw); const m = u.reduce((a, b) => a + b) / 5; return Math.sqrt(u.reduce((a, b) => a + (b - m) ** 2, 0) / 5) },
  'max ts_rel': (f) => Math.max(...f.map((p) => p.attrs.ts_rel ?? p.attrs.ts_raw)),
  'mean fouldraw': (f) => f.reduce((s, p) => s + p.attrs.fouldraw, 0) / 5,
  'mean orb': (f) => f.reduce((s, p) => s + p.attrs.orb, 0) / 5,
  'mean ballsec': (f) => f.reduce((s, p) => s + p.attrs.ballsec, 0) / 5,
  'mean rim': (f) => f.reduce((s, p) => s + (p.attrs as any).rim, 0) / 5,
  'mean mid': (f) => f.reduce((s, p) => s + p.attrs.mid, 0) / 5,
  'top c x top usg (creator load)': (f) => { const u2 = u2of(f); let b = 0; f.forEach((p, i) => { b = Math.max(b, creation(p.attrs) * u2[i]) }); return b },
  'creator share of usg': (f) => { const u2 = u2of(f); const c = f.map((p) => creation(p.attrs)); const k = c.indexOf(Math.max(...c)); return u2[k] },
  'finisher usg (Σ u2 of c<0.45)': (f) => { const u2 = u2of(f); return f.reduce((s, p, i) => s + (creation(p.attrs) < 0.45 ? u2[i] : 0), 0) },
}

const rank = (xs: number[]) => {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const r = new Array(xs.length).fill(0)
  let i = 0
  while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1 }
  return r
}
const pearson = (a: number[], b: number[]) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}

// within-season rank residual: rank(offRaw) - rank(real ORtg), and the value residual
const G = TEAMS.filter((t) => t.ortg !== undefined)
const seasons = [...new Set(G.map((t) => t.y))]
const rows: { t: (typeof G)[number]; rres: number; vres: number }[] = []
for (const y of seasons) {
  const g = G.filter((t) => t.y === y)
  if (g.length < 4) continue
  const o = g.map((t) => offP(t.five, P0))
  const ro = rank(o), rr = rank(g.map((t) => t.ortg!))
  // value residual: offRaw centred in season, ORtg centred in season, both z-scored
  const zo = (xs: number[]) => { const m = xs.reduce((a, b) => a + b) / xs.length; const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); return xs.map((x) => (x - m) / s) }
  const za = zo(o), zb = zo(g.map((t) => t.ortg!))
  g.forEach((t, i) => rows.push({ t, rres: (ro[i] - rr[i]) / g.length, vres: za[i] - zb[i] }))
}
console.log(`${rows.length} fives with real ORtg · residual = engine minus reality (positive = engine over-rates)\n`)
// SEASON-CENTRE every predictor: the residual is within-season, so the predictor must be too,
// or a league-level trend (3pt volume, pace) masquerades as a team effect.
const out: [string, number, number][] = []
for (const [name, fn] of Object.entries(AGG)) {
  const raw = rows.map((r) => fn(r.t.five))
  const x = raw.slice()
  for (const y of seasons) {
    const ix = rows.map((r, i) => (r.t.y === y ? i : -1)).filter((i) => i >= 0)
    if (!ix.length) continue
    const m = ix.reduce((s, i) => s + raw[i], 0) / ix.length
    const sd = Math.sqrt(ix.reduce((s, i) => s + (raw[i] - m) ** 2, 0) / ix.length) || 1
    for (const i of ix) x[i] = (raw[i] - m) / sd
  }
  out.push([name, pearson(x, rows.map((r) => r.rres)), pearson(x, rows.map((r) => r.vres))])
}
out.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]))
console.log(`${'aggregate'.padEnd(34)} r(rank resid)  r(value resid)`)
for (const [n, a, b] of out) console.log(`  ${n.padEnd(32)} ${a >= 0 ? '+' : ''}${a.toFixed(3)}         ${b >= 0 ? '+' : ''}${b.toFixed(3)}`)
