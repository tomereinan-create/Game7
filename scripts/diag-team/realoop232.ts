/**
 * recal_232 measurement: do REAL starting fives that needed a man one step out of position play
 * worse than the engine reads them? Real five = the five who started most games (starters.json),
 * only seasons where all five real starters have cards. Engine = ratings100 (offRaw, drtgRef).
 * Truth = Team Summaries o_rtg / d_rtg. Everything is centred within its own season.
 */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../../src/data/wheel'
import { ratings100 } from '../../src/engine/offense'
import { missingStarters, realStarters } from '../../src/engine/starters'
import { eligible, POSITIONS } from '../../src/engine/positions'
import { LINES } from '../../src/ui/Stat'
import type { Player } from '../../src/engine/types'

const csv = readFileSync('data/bref/Team Summaries.csv', 'utf8').split(/\r?\n/)
const h = csv[0].split(',')
const iS = h.indexOf('season'), iAb = h.indexOf('abbreviation'), iO = h.indexOf('o_rtg'), iD = h.indexOf('d_rtg'), iLg = h.indexOf('lg')
const REAL = new Map<string, { o: number; d: number }>()
for (let i = 1; i < csv.length; i++) {
  const f = csv[i].split(',')
  if (f.length < 5 || f[iLg] !== 'NBA') continue
  const o = parseFloat(f[iO]), d = parseFloat(f[iD])
  if (!isNaN(o) && !isNaN(d)) REAL.set(`${f[iS]}|${f[iAb]}`, { o, d })
}
const el = (p: Player) => eligible(LINES[p.name]?.pos)
/** fewest seats one step from a listed position needed to seat these five PG..C; 99 = cannot with one-step seats */
function minOop(men: Player[]): number {
  let best = 99
  const used = new Array(men.length).fill(false)
  const walk = (s: number, k: number) => {
    if (k >= best) return
    if (s === 5) { best = k; return }
    for (let i = 0; i < men.length; i++) {
      if (used[i]) continue
      const ok = el(men[i]).includes(POSITIONS[s])
      const nb = !ok && el(men[i]).some((x) => Math.abs(POSITIONS.indexOf(x) - s) === 1)
      if (!ok && !nb) continue
      used[i] = true
      walk(s + 1, k + (nb ? 1 : 0))
      used[i] = false
    }
  }
  walk(0, 0)
  return best
}
interface Row { y: number; key: string; k: number; off: number; drtg: number; ro: number; rd: number }
const rows: Row[] = []
for (const t of WHEEL) {
  if (missingStarters(t.y, t.ab).length) continue
  const five = realStarters(t.y, t.ab)
  if (five.length !== 5) continue
  const real = REAL.get(`${t.y}|${t.ab}`)
  if (!real) continue
  const r = ratings100(five)
  rows.push({ y: t.y, key: `${t.team} '${String(t.y).slice(2)}`, k: minOop(five), off: r.offRaw, drtg: r.drtgRef, ro: real.o, rd: real.d })
}
// centre within season
const bySeason = new Map<number, Row[]>()
for (const r of rows) bySeason.set(r.y, [...(bySeason.get(r.y) ?? []), r])
for (const rs of bySeason.values()) {
  const m = (f: (r: Row) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length
  const mo = m((r) => r.off), md = m((r) => r.drtg), mro = m((r) => r.ro), mrd = m((r) => r.rd)
  for (const r of rs) { r.off -= mo; r.drtg -= md; r.ro -= mro; r.rd -= mrd }
}
const ols = (xs: number[], ys: number[]) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2 }
  const b = sxy / sxx
  return { a: my - b * mx, b }
}
const legal = rows.filter((r) => r.k === 0)
const fo = ols(legal.map((r) => r.off), legal.map((r) => r.ro))
const fd = ols(legal.map((r) => r.drtg), legal.map((r) => r.rd))
const sd = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) }
const resO = (r: Row) => r.ro - (fo.a + fo.b * r.off)
const resD = (r: Row) => r.rd - (fd.a + fd.b * r.drtg)
console.log(`complete real fives ${rows.length}; legal ${legal.length}`)
console.log(`OFF fit real = ${fo.a.toFixed(3)} + ${fo.b.toFixed(3)} x offRaw   resid sd ${sd(legal.map(resO)).toFixed(2)}`)
console.log(`DEF fit real = ${fd.a.toFixed(3)} + ${fd.b.toFixed(3)} x drtgRef  resid sd ${sd(legal.map(resD)).toFixed(2)}`)
for (const k of [1, 2, 99]) {
  const g = rows.filter((r) => r.k === k)
  if (!g.length) { console.log(`k=${k}: none`); continue }
  const o = g.map(resO), d = g.map(resD)
  const mo = o.reduce((a, b) => a + b, 0) / g.length, md = d.reduce((a, b) => a + b, 0) / g.length
  const seo = g.length > 1 ? sd(o) / Math.sqrt(g.length) : NaN, sed = g.length > 1 ? sd(d) / Math.sqrt(g.length) : NaN
  console.log(`k=${k}: n=${g.length}  real-minus-engine ORtg ${mo.toFixed(2)} (se ${seo.toFixed(2)}) -> offRaw units ${(mo / fo.b).toFixed(2)};  DRtg ${md.toFixed(2)} (se ${sed.toFixed(2)}) -> drtgRef units ${(md / fd.b).toFixed(2)}`)
  if (process.argv[2] === '-v') for (const r of g) console.log(`    ${r.key.padEnd(34)} resO ${resO(r).toFixed(2).padStart(6)}  resD ${resD(r).toFixed(2).padStart(6)}`)
}

// ---- robustness: per OOP seat (k as a count), by covered seat, by era, trimmed, bootstrap ----
{
  const all = rows.filter((r) => r.k <= 2)
  const xs = all.map((r) => r.k), ysD = all.map(resD), ysO = all.map(resO)
  const fk = ols(xs, ysD), fko = ols(xs, ysO)
  console.log(`per OOP seat (OLS of residual on k over ${all.length}): DRtg ${fk.b.toFixed(3)} real -> ${(fk.b / fd.b).toFixed(3)} drtgRef;  ORtg ${fko.b.toFixed(3)} real -> ${(fko.b / fo.b).toFixed(3)} offRaw`)
  const g1 = rows.filter((r) => r.k === 1).map(resD).sort((a, b) => a - b)
  const trim = g1.slice(Math.floor(g1.length * 0.1), Math.ceil(g1.length * 0.9))
  console.log(`k=1 DRtg resid: median ${g1[Math.floor(g1.length / 2)].toFixed(2)}  10%-trimmed mean ${(trim.reduce((a, b) => a + b, 0) / trim.length).toFixed(2)}`)
  // bootstrap the k=1 mean (seeded LCG)
  let s = 12345
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const means: number[] = []
  for (let b = 0; b < 4000; b++) { let m = 0; for (let i = 0; i < g1.length; i++) m += g1[Math.floor(rnd() * g1.length)]; means.push(m / g1.length) }
  means.sort((a, b) => a - b)
  console.log(`k=1 DRtg resid bootstrap 95%: ${means[100].toFixed(2)} .. ${means[3899].toFixed(2)} real  ->  ${(means[100] / fd.b).toFixed(3)} .. ${(means[3899] / fd.b).toFixed(3)} drtgRef`)
  for (const [lo, hi] of [[1980, 1999], [2000, 2013], [2014, 2026]]) {
    const g = rows.filter((r) => r.k === 1 && r.y >= lo && r.y <= hi).map(resD)
    console.log(`  ${lo}-${hi}: n=${g.length} DRtg resid ${(g.reduce((a, b) => a + b, 0) / g.length).toFixed(2)}`)
  }
}

// ---- control: is the k effect just lineup SIZE (or rim protection) the engine under-prices? ----
{
  const all = rows.filter((r) => r.k <= 2)
  // rebuild the per-row covariates (mean height, best rimprot), centred within season
  const cov = new Map<Row, { ht: number; rp: number }>()
  for (const t of WHEEL) {
    if (missingStarters(t.y, t.ab).length) continue
    const five = realStarters(t.y, t.ab)
    if (five.length !== 5) continue
    const key = `${t.team} '${String(t.y).slice(2)}`
    const r = rows.find((x) => x.key === key)
    if (r) cov.set(r, { ht: five.reduce((s, p) => s + p.attrs.height, 0) / 5, rp: Math.max(...five.map((p) => p.attrs.rimprot)) })
  }
  const bySeason2 = new Map<number, Row[]>()
  for (const r of all) bySeason2.set(r.y, [...(bySeason2.get(r.y) ?? []), r])
  const htc = new Map<Row, number>(), rpc = new Map<Row, number>()
  for (const rs of bySeason2.values()) {
    const mh = rs.reduce((s, r) => s + cov.get(r)!.ht, 0) / rs.length
    const mr = rs.reduce((s, r) => s + cov.get(r)!.rp, 0) / rs.length
    for (const r of rs) { htc.set(r, cov.get(r)!.ht - mh); rpc.set(r, cov.get(r)!.rp - mr) }
  }
  // multiple OLS via normal equations: rd ~ 1 + drtg + ht + rp + k
  const X = all.map((r) => [1, r.drtg, htc.get(r)!, rpc.get(r)!, r.k])
  const y = all.map((r) => r.rd)
  const p = X[0].length
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0))
  const Xty = new Array(p).fill(0)
  for (let i = 0; i < X.length; i++) for (let a = 0; a < p; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b] }
  // solve by Gauss-Jordan
  const M = XtX.map((row, i) => [...row, Xty[i]])
  for (let c = 0; c < p; c++) {
    let piv = c
    for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < p; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= p; k++) M[r][k] -= f * M[c][k] }
  }
  const beta = M.map((row, i) => row[p] / row[i])
  const res = all.map((_, i) => y[i] - X[i].reduce((s, x, j) => s + x * beta[j], 0))
  const s2 = res.reduce((s, e) => s + e * e, 0) / (all.length - p)
  // se of k via the inverse diagonal: re-solve for the unit vector
  const inv = (() => {
    const A = XtX.map((row, i) => [...row, ...Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))])
    for (let c = 0; c < p; c++) {
      let piv = c
      for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
      ;[A[c], A[piv]] = [A[piv], A[c]]
      const d = A[c][c]
      for (let k = 0; k < 2 * p; k++) A[c][k] /= d
      for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c]; for (let k = 0; k < 2 * p; k++) A[r][k] -= f * A[c][k] }
    }
    return A.map((row) => row.slice(p))
  })()
  const se = (j: number) => Math.sqrt(s2 * inv[j][j])
  console.log(`controlled DEF: rd = b·drtgRef ${beta[1].toFixed(3)} + ht ${beta[2].toFixed(3)}/in (se ${se(2).toFixed(3)}) + rp ${beta[3].toFixed(4)} (se ${se(3).toFixed(4)}) + k ${beta[4].toFixed(3)} (se ${se(4).toFixed(3)})  -> k in drtgRef ${(beta[4] / beta[1]).toFixed(3)}`)
  const kOnly = all.filter((r) => r.k === 1)
  console.log(`  k=1 mean height (centred) ${(kOnly.reduce((s, r) => s + htc.get(r)!, 0) / kOnly.length).toFixed(2)} in;  k=2 ${(all.filter((r) => r.k === 2).reduce((s, r) => s + htc.get(r)!, 0) / all.filter((r) => r.k === 2).length).toFixed(2)} in`)
}
