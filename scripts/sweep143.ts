/**
 * recal_143 sweep — CREATE_SHARE x TOV_SIZE, every cell with FEED_REF re-derived on the pool and
 * the OFF gauge re-frozen exactly as scripts/gauge105.ts freezes it, over all fieldable wheel fives.
 *
 *   npx vite-node scripts/sweep143.ts
 */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { KNOBS as K, creation, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

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

/** the usage-weighted RECEIVED feed of a five at a given CREATE_SHARE — mirrors teamOffense */
export function recvFeed(five: Player[], share: number): number {
  const A = five.map((p) => p.attrs)
  const n = A.length
  const u = A.map((a) => a.usg_raw)
  const c = A.map(creation)
  const delta = K.TEAM_USG - u.reduce((s, x) => s + x, 0)
  const w = delta >= 0 ? c.map((ci, i) => Math.max(0.05, ci) * u[i]) : u.map((ui) => Math.max(0, ui - 12))
  const W = w.reduce((s, x) => s + x, 0) || 1
  let u2 = u.map((ui, i) => Math.max(K.FLOOR_USG, ui + (delta * w[i]) / W))
  const s0 = u2.reduce((a, b) => a + b, 0)
  u2 = u2.map((x) => (x * K.TEAM_USG) / s0)
  let acc = 0
  for (let i = 0; i < n; i++) {
    let best = 0
    for (let j = 0; j < n; j++) if (j !== i) best = Math.max(best, c[j])
    acc += u2[i] * ((1 - share) * c[i] + share * best)
  }
  return acc / K.TEAM_USG
}

export const poolRef = (share: number) =>
  Math.round((TEAMS.reduce((s, t) => s + recvFeed(t.five, share), 0) / TEAMS.length) * 10000) / 10000

// ---------- rank / spearman ----------
const rankv = (xs: number[]) => {
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
  const ra = rankv(a), rb = rankv(b), n = a.length
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}

export interface Par { SHARE: number; TOV: number; AMP: number }
export interface Ev {
  fit: number; dec: number[]
  off: Map<string, number>
  dial: (y: number, ab: string) => number
  rank: (y: number, ab: string) => [number, number]
  adjOf: (y: number, ab: string) => number
  order: { y: number; team: string; adj: number; dial: number }[]
  n99: number; above: number
  G: { MIN: number; MID: number; TOP: number; REF: number }
  decDial: number[]
  REFused: number
}

export function evaluate(P: Par): Ev {
  const M = K as { CREATE_SHARE: number; TOV_SIZE: number; AMP_MAX: number; FEED_REF: number }
  const s0 = M.CREATE_SHARE, t0 = M.TOV_SIZE, a0 = M.AMP_MAX, r0 = M.FEED_REF
  M.CREATE_SHARE = P.SHARE; M.TOV_SIZE = P.TOV; M.AMP_MAX = P.AMP
  M.FEED_REF = poolRef(P.SHARE)
  const REFused = M.FEED_REF
  const off = new Map<string, number>()
  for (const t of TEAMS) off.set(`${t.y}|${t.ab}`, teamOffense(t.five).off)
  M.CREATE_SHARE = s0; M.TOV_SIZE = t0; M.AMP_MAX = a0; M.FEED_REF = r0

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
    off,
    dial: (y, ab) => dialT(find(y, ab)),
    rank: (y, ab) => { const o = off.get(`${y}|${ab}`)!; return [TEAMS.filter((x) => x.y === y && off.get(`${x.y}|${x.ab}`)! > o).length + 1, TEAMS.filter((x) => x.y === y).length] },
    adjOf: (y, ab) => adj(find(y, ab)),
    order: [...TEAMS].sort((a, b) => adj(b) - adj(a)).slice(0, 10).map((t) => ({ y: t.y, team: t.team, adj: adj(t), dial: dialT(t) })),
    n99: TEAMS.filter((t) => dialT(t) === 99).length,
    above: TEAMS.filter((t) => adj(t) > adj(gsw)).length,
    G: { MIN, MID, TOP, REF },
    REFused,
  }
}

export const PINS = (E: Ev) => {
  const chi = E.dial(1996, 'CHI'), lal = E.dial(2000, 'LAL'), gs = E.dial(2017, 'GSW')
  const [cr] = E.rank(1996, 'CHI'), [lr] = E.rank(2000, 'LAL'), [br] = E.rank(2024, 'BOS')
  const bad: string[] = []
  if (Math.abs(chi - 68) > 3) bad.push(`CHI96off ${chi}`)
  if (cr > 6) bad.push(`CHI96rank ${cr}`)
  if (Math.abs(lal - 64) > 4) bad.push(`LAL00off ${lal}`)
  if (lr > 5) bad.push(`LAL00rank ${lr}`)
  if (gs !== 99) bad.push(`GSW17 ${gs}`)
  if (br > 10) bad.push(`BOS24rank ${br}`)
  if (E.above > 1) bad.push(`${E.above} above GSW17`)
  return { chi, lal, gs, cr, lr, br, bad }
}
