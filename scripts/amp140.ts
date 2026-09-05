/**
 * recal_140 — THE AMPLIFICATION TERM'S OWN TRUTH COLUMN.
 *
 * The term claims: a five's creation raises the quality of every shot on the floor. Its truth
 * column is therefore bref's ts_percent — how much the real team OUT-shot the usage-weighted mean
 * of its own starters' true shooting. Everything else in team_offense is held out of it.
 *
 * lift = real team TS%  −  Σ u_raw·ts_raw / Σ u_raw   (season-centred, then z-scored)
 * and every candidate aggregate is season-centred too.
 */
import { readFileSync } from 'node:fs'
import { creation } from '../src/engine/offense'
import { TEAMSB as TEAMS, u2of } from './sweep140b'
import type { Player } from '../src/engine/types'

const csv = readFileSync('data/bref/Team Summaries.csv', 'utf8').split(/\r?\n/)
const hdr = csv[0].split(',')
const ix = (n: string) => hdr.indexOf(n)
const TS = new Map<string, number>(), EFG = new Map<string, number>(), PACE = new Map<string, number>()
for (let i = 1; i < csv.length; i++) {
  const f = csv[i].split(',')
  if (f.length < 5 || f[ix('lg')] !== 'NBA') continue
  const k = `${f[ix('season')]}|${f[ix('abbreviation')]}`
  const t = parseFloat(f[ix('ts_percent')]); if (!isNaN(t)) TS.set(k, t)
  const e = parseFloat(f[ix('e_fg_percent')]); if (!isNaN(e)) EFG.set(k, e)
  const p = parseFloat(f[ix('pace')]); if (!isNaN(p)) PACE.set(k, p)
}

const AGG: Record<string, (f: Player[]) => number> = {
  'feed = Σ c·u2/100 (SHIPPED)': (f) => { const u2 = u2of(f); return f.reduce((s, p, i) => s + creation(p.attrs) * u2[i], 0) / 100 },
  'top creation (max c)': (f) => Math.max(...f.map((p) => creation(p.attrs))),
  'mean creation': (f) => f.reduce((s, p) => s + creation(p.attrs), 0) / 5,
  'received feed F=0.7': (f) => { const c = f.map((p) => creation(p.attrs)); const u2 = u2of(f); return c.reduce((s, ci, i) => { let b = 0; for (let j = 0; j < 5; j++) if (j !== i) b = Math.max(b, c[j]); return s + Math.max(ci, 0.7 * b) * u2[i] }, 0) / 100 },
  'max playvol': (f) => Math.max(...f.map((p) => p.attrs.playvol)),
  'mean playvol': (f) => f.reduce((s, p) => s + p.attrs.playvol, 0) / 5,
  'usage-wtd playvol': (f) => { const u2 = u2of(f); return f.reduce((s, p, i) => s + p.attrs.playvol * u2[i], 0) / 100 },
  '2nd playvol': (f) => f.map((p) => p.attrs.playvol).sort((a, b) => b - a)[1],
  'mean 3pt': (f) => f.reduce((s, p) => s + p.attrs['3pt'], 0) / 5,
  'min 3pt': (f) => Math.min(...f.map((p) => p.attrs['3pt'])),
  'n spacers 3pt>=70': (f) => f.filter((p) => p.attrs['3pt'] >= 70).length,
  'mean ballsec': (f) => f.reduce((s, p) => s + p.attrs.ballsec, 0) / 5,
  'Σ usg_raw': (f) => f.reduce((s, p) => s + p.attrs.usg_raw, 0),
  'usg sd': (f) => { const u = f.map((p) => p.attrs.usg_raw); const m = u.reduce((a, b) => a + b) / 5; return Math.sqrt(u.reduce((a, b) => a + (b - m) ** 2, 0) / 5) },
  'max usg_raw': (f) => Math.max(...f.map((p) => p.attrs.usg_raw)),
  'mean rim': (f) => f.reduce((s, p) => s + (p.attrs as any).rim, 0) / 5,
  'mean fouldraw': (f) => f.reduce((s, p) => s + p.attrs.fouldraw, 0) / 5,
  'top playvol x his usg share': (f) => { const u2 = u2of(f); const pv = f.map((p) => p.attrs.playvol); const k = pv.indexOf(Math.max(...pv)); return (pv[k] * u2[k]) / 100 },
}

const pearson = (a: number[], b: number[]) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}
const G = TEAMS.filter((t) => TS.has(`${t.y}|${t.ab}`))
const seasons = [...new Set(G.map((t) => t.y))]
const lift = G.map((t) => {
  const u = t.five.map((p) => p.attrs.usg_raw)
  const w = t.five.reduce((s, p, i) => s + (p.attrs.ts_raw ?? 0) * u[i], 0) / u.reduce((a, b) => a + b, 0)
  return TS.get(`${t.y}|${t.ab}`)! - w
})
const centre = (raw: number[]) => {
  const x = raw.slice()
  for (const y of seasons) {
    const idx = G.map((t, i) => (t.y === y ? i : -1)).filter((i) => i >= 0)
    const m = idx.reduce((s, i) => s + raw[i], 0) / idx.length
    const sd = Math.sqrt(idx.reduce((s, i) => s + (raw[i] - m) ** 2, 0) / idx.length) || 1
    for (const i of idx) x[i] = (raw[i] - m) / sd
  }
  return x
}
const L = centre(lift)
console.log(`${G.length} fives with real team TS%. TRUTH COLUMN: team TS% − the five's usage-weighted ts_raw, season-centred.`)
console.log(`raw lift: mean ${(lift.reduce((a, b) => a + b, 0) / lift.length).toFixed(4)}  sd ${Math.sqrt(lift.reduce((a, b) => a + (b - lift.reduce((x, y) => x + y, 0) / lift.length) ** 2, 0) / lift.length).toFixed(4)}\n`)
const out: [string, number][] = []
for (const [n, fn] of Object.entries(AGG)) out.push([n, pearson(centre(G.map((t) => fn(t.five))), L)])
out.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
for (const [n, r] of out) console.log(`  ${n.padEnd(30)} r = ${r >= 0 ? '+' : ''}${r.toFixed(4)}`)

console.log(`\nthe named fives — lift (season-centred z), and the shipped feed's z:`)
const fz = centre(G.map((t) => { const u2 = u2of(t.five); return t.five.reduce((s, p, i) => s + creation(p.attrs) * u2[i], 0) / 100 }))
for (const [y, ab] of [[2005, 'PHO'], [2005, 'MIA'], [2007, 'PHO'], [2000, 'IND'], [1996, 'CHI'], [2017, 'GSW'], [2018, 'HOU'], [1997, 'UTA'], [2023, 'DEN'], [2000, 'LAL'], [2024, 'BOS']] as const) {
  const i = G.findIndex((t) => t.y === y && t.ab === ab)
  if (i < 0) continue
  console.log(`  ${y} ${ab}  lift ${lift[i] >= 0 ? '+' : ''}${lift[i].toFixed(4)} (z ${L[i].toFixed(2)})   feed z ${fz[i].toFixed(2)}`)
}
