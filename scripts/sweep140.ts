/**
 * recal_140 sweep — alternative CREATION FEED aggregates, each with the OFF gauge re-frozen
 * exactly as scripts/gauge105.ts freezes it, measured on all 1,255 fieldable wheel fives.
 *
 * The engine's feed is the USAGE-weighted mean of creation: Σ c·u2 / 100. The parameterised form
 * here is Σ c^(1+G)·u2 / Σ c^G·u2 — the creation-SHARE weighted mean. G = 0 reproduces the engine
 * exactly (asserted below); G → ∞ tends to the top creator's own rate.
 *
 *   npx vite-node scripts/sweep140.ts
 */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { KNOBS as K, creation, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const stackClamp = (m: number) => clamp(m, K.STACK_MIN, K.STACK_MAX)

export interface Par { G: number; AMP: number; REF: number }

/** teamOffense with a parameterised feed. G=0, AMP=KNOBS.AMP_MAX, REF=KNOBS.FEED_REF ≡ the engine. */
export function offP(five: Player[], P: Par): number {
  const A = five.map((p) => p.attrs)
  const n = A.length
  const u = A.map((a) => a.usg_raw)
  const e = A.map((a) => a.ts_rel ?? a.ts_raw)
  const c = A.map(creation)
  const delta = K.TEAM_USG - u.reduce((s, x) => s + x, 0)
  const w = delta >= 0 ? c.map((ci, i) => Math.max(0.05, ci) * u[i]) : u.map((ui) => Math.max(0, ui - 12))
  const W = w.reduce((s, x) => s + x, 0) || 1
  let u2 = u.map((ui, i) => Math.max(K.FLOOR_USG, ui + (delta * w[i]) / W))
  const s0 = u2.reduce((a, b) => a + b, 0)
  u2 = u2.map((x) => (x * K.TEAM_USG) / s0)
  const e2 = u.map((ui, i) => {
    const d = u2[i] - ui
    if (d >= 0) {
      const slope = K.SLOPE_UP_MAX - (K.SLOPE_UP_MAX - K.SLOPE_UP_MIN) * c[i]
      return e[i] * (1 - (slope * d) / 100)
    }
    const gate = clamp((e[i] - 0.545) / 0.1, 0, 1)
    return e[i] * (1 + (K.SLOPE_DOWN * gate * -d) / 100)
  })
  const wt = c.map((ci, i) => Math.pow(ci, P.G) * u2[i])
  const feed = c.reduce((acc, ci, i) => acc + ci * wt[i], 0) / (wt.reduce((a, b) => a + b, 0) || 1)
  const e3 = e2.map((x) => x * (1 + P.AMP * (feed - P.REF)))
  const outs = A.map((a) => a['3pt'])
  const e4 = A.map((a, i) => {
    const ei = e3[i]
    let x = ei
    if (u2[i] < K.USG_LOW) x *= 1 - K.USG_LOW_PEN * (K.USG_LOW - u2[i])
    if (u2[i] > K.USG_HIGH) x *= 1 - K.USG_HIGH_PEN * (u2[i] - K.USG_HIGH)
    if (a['3pt'] < K.PAINT_OUT && a.mid < K.PAINT_MID) {
      let spc = 0
      for (let j = 0; j < n; j++) if (j !== i) spc += Math.max(0, outs[j] - 55)
      spc /= 4 * 44
      const free = Math.max(0, 1 - c[i] / K.CLOG_FREE)
      x *= 1 - K.CLOG_MAX * free * (1 - Math.min(1, spc / K.SPACING_FULL))
      if (a.usg_raw < K.FINISHER_USG) {
        let best = -Infinity
        for (let j = 0; j < n; j++) if (j !== i) best = Math.max(best, (c[j] * outs[j]) / 99)
        x *= 1 + K.FINISHER_BONUS * best
      } else if (a.usg_raw >= K.HUB_USG) {
        x *= 1 + K.HUB_BONUS * Math.min(1, spc / K.SPACING_FULL)
      }
    }
    return ei * stackClamp(x / ei)
  })
  const baseN = u2.reduce((acc, ui, i) => acc + ui * e3[i], 0) * 2
  const baseF = u2.reduce((acc, ui, i) => acc + ui * e4[i], 0) * 2
  const base = baseN + clamp(K.FIT_WIDEN * (baseF - baseN), -K.FIT_CAP, K.FIT_CAP)
  const ftPts = u2.reduce((acc, ui, i) => acc + ui * (A[i].fouldraw / 99) * (A[i].ft / 100), 0) * K.FT_POINTS
  let off = base + ftPts
  const wball = u2.reduce((acc, ui, i) => acc + ui * A[i].ballsec, 0) / K.TEAM_USG
  const tov = clamp(K.TOV_REF + K.TOV_SIZE * (K.TOV_INT - K.TOV_SLOPE * wball - K.TOV_REF), K.TOV_LO, K.TOV_HI)
  off *= (1 - tov / 100) / (1 - K.TOV_REF / 100)
  const wTS = u2.reduce((acc, ui, i) => acc + ui * e4[i], 0) / K.TEAM_USG
  const miss = clamp((1 - wTS) / (1 - K.MISS_TS), K.MISS_LO, K.MISS_HI)
  off *= 1 + K.ORB_PER_PT * A.reduce((acc, a) => acc + Math.max(0, a.orb - K.ORB_PIVOT), 0) * miss
  return off
}

export const feedP = (five: Player[], G: number) => {
  const A = five.map((p) => p.attrs)
  const u = A.map((a) => a.usg_raw)
  const c = A.map(creation)
  const delta = K.TEAM_USG - u.reduce((s, x) => s + x, 0)
  const w = delta >= 0 ? c.map((ci, i) => Math.max(0.05, ci) * u[i]) : u.map((ui) => Math.max(0, ui - 12))
  const W = w.reduce((s, x) => s + x, 0) || 1
  let u2 = u.map((ui, i) => Math.max(K.FLOOR_USG, ui + (delta * w[i]) / W))
  const s0 = u2.reduce((a, b) => a + b, 0)
  u2 = u2.map((x) => (x * K.TEAM_USG) / s0)
  const wt = c.map((ci, i) => Math.pow(ci, G) * u2[i])
  return c.reduce((acc, ci, i) => acc + ci * wt[i], 0) / (wt.reduce((a, b) => a + b, 0) || 1)
}

// ---------- the pool ----------
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const csv = readFileSync('data/bref/Team Summaries.csv', 'utf8').split(/\r?\n/)
const hdr = csv[0].split(',')
const iS = hdr.indexOf('season'), iAb = hdr.indexOf('abbreviation'), iO = hdr.indexOf('o_rtg'), iLg = hdr.indexOf('lg')
const ORTG = new Map<string, number>()
for (let i = 1; i < csv.length; i++) {
  const f = csv[i].split(',')
  if (f.length < 5 || f[iLg] !== 'NBA') continue
  const v = parseFloat(f[iO]); if (!isNaN(v)) ORTG.set(`${f[iS]}|${f[iAb]}`, v)
}
export interface T { y: number; team: string; ab: string; five: Player[]; ortg?: number }
export const TEAMS: T[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  TEAMS.push({ y: t.y, team: t.team, ab: t.ab, five, ortg: ORTG.get(`${t.y}|${t.ab}`) })
}

const rank = (xs: number[]) => {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const r = new Array(xs.length).fill(0)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}
const spearman = (a: number[], b: number[]) => {
  const ra = rank(a), rb = rank(b), n = a.length
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}

export interface Eval {
  fit: number; dec: number[]
  dial: (y: number, ab: string) => number
  rank: (y: number, ab: string) => [number, number]
  adjOf: (y: number, ab: string) => number
  order: { y: number; team: string; adj: number; dial: number }[]
  n99: number
  G: { MIN: number; MID: number; TOP: number; REF: number }
  decDial: number[]
}
export function evaluate(P: Par): Eval {
  const off = new Map<string, number>()
  for (const t of TEAMS) off.set(`${t.y}|${t.ab}`, offP(t.five, P))
  const seasons = [...new Set(TEAMS.map((t) => t.y))].sort((a, b) => a - b)
  const LEVEL = new Map<number, number>()
  for (const y of seasons) {
    const g = TEAMS.filter((t) => t.y === y)
    LEVEL.set(y, Math.round((g.reduce((s, t) => s + off.get(`${t.y}|${t.ab}`)!, 0) / g.length) * 1000) / 1000)
  }
  const REF = Math.round(([...LEVEL.values()].reduce((s, v) => s + v, 0) / LEVEL.size) * 10000) / 10000
  const adj = (t: T) => off.get(`${t.y}|${t.ab}`)! - LEVEL.get(t.y)! + REF
  const vals = TEAMS.map(adj).sort((a, b) => a - b)
  const f2 = (v: number) => Math.round(v * 100) / 100
  const gsw = TEAMS.find((t) => t.y === 2017 && t.ab === 'GSW')!
  const MIN = f2(vals[0]), MID = f2(vals[Math.round(0.5 * (vals.length - 1))]), TOP = f2(adj(gsw))
  const s71 = (v: number) => Math.round(Math.max(1, Math.min(99, v <= MID ? 1 + (49 * (v - MIN)) / (MID - MIN) : 50 + (49 * (v - MID)) / (TOP - MID))))
  const dialT = (t: T) => s71(adj(t))
  const per: { y: number; rho: number }[] = []
  for (const y of seasons) {
    const g = TEAMS.filter((t) => t.y === y && t.ortg !== undefined)
    if (g.length < 4) continue
    per.push({ y, rho: spearman(g.map((t) => off.get(`${t.y}|${t.ab}`)!), g.map((t) => t.ortg!)) })
  }
  const dm = (lo: number, hi: number) => { const g = per.filter((p) => p.y >= lo && p.y <= hi); return g.reduce((s, p) => s + p.rho, 0) / g.length }
  const dd = (lo: number, hi: number) => { const g = TEAMS.filter((t) => t.y >= lo && t.y <= hi); return g.reduce((s, t) => s + dialT(t), 0) / g.length }
  const find = (y: number, ab: string) => TEAMS.find((t) => t.y === y && t.ab === ab)!
  return {
    fit: per.reduce((s, p) => s + p.rho, 0) / per.length,
    dec: [dm(1980, 1989), dm(1990, 1999), dm(2000, 2009), dm(2010, 2019), dm(2020, 2029)],
    decDial: [dd(1980, 1989), dd(1990, 1999), dd(2000, 2009), dd(2010, 2019), dd(2020, 2029)],
    dial: (y, ab) => dialT(find(y, ab)),
    rank: (y, ab) => { const o = off.get(`${y}|${ab}`)!; return [TEAMS.filter((x) => x.y === y && off.get(`${x.y}|${x.ab}`)! > o).length + 1, TEAMS.filter((x) => x.y === y).length] },
    adjOf: (y, ab) => adj(find(y, ab)),
    order: [...TEAMS].sort((a, b) => adj(b) - adj(a)).slice(0, 8).map((t) => ({ y: t.y, team: t.team, adj: adj(t), dial: dialT(t) })),
    n99: TEAMS.filter((t) => dialT(t) === 99).length,
    G: { MIN, MID, TOP, REF },
  }
}

// ---------- parity of the reimplementation with the engine ----------
let worst = 0
for (const t of TEAMS) worst = Math.max(worst, Math.abs(offP(t.five, { G: 0, AMP: K.AMP_MAX, REF: K.FEED_REF }) - teamOffense(t.five).off))
console.log(`reimplementation vs engine at G=0: worst |Δ| = ${worst.toExponential(2)} over ${TEAMS.length} fives`)

// ---------- feed distribution at each G ----------
console.log(`\nFEED DISTRIBUTION over ${TEAMS.length} fives (mean / sd / min / max), and the named fives:`)
const NAMED: [number, string, string][] = [[2005, 'PHO', "Suns '05"], [1996, 'CHI', "Bulls '96"], [2017, 'GSW', "GSW '17"], [2018, 'HOU', "HOU '18"], [2005, 'MIA', "Heat '05"], [2000, 'IND', "Pacers '00"]]
for (const G of [0, 1, 2, 3, 4, 6, 8, 12, 20]) {
  const fs = TEAMS.map((t) => feedP(t.five, G))
  const m = fs.reduce((a, b) => a + b, 0) / fs.length
  const sd = Math.sqrt(fs.reduce((a, b) => a + (b - m) ** 2, 0) / fs.length)
  const nm = NAMED.map(([y, ab, lbl]) => `${lbl} ${feedP(TEAMS.find((t) => t.y === y && t.ab === ab)!.five, G).toFixed(3)}`).join(' · ')
  console.log(`  G=${String(G).padStart(2)}  mean ${m.toFixed(4)} sd ${sd.toFixed(4)} [${Math.min(...fs).toFixed(3)}, ${Math.max(...fs).toFixed(3)}]   ${nm}`)
}
