/**
 * recal_140 probe — the creation FEED, and whether a five's offence is carried by its creator.
 *
 * Computes, for every fieldable wheel best-five: offRaw, the re-frozen OFF gauge (exactly as
 * scripts/gauge105.ts freezes it), the dial, the season rank, and the within-season Spearman of
 * offRaw against real ORtg over the 47 seasons. Prints the named fives and every team anchor.
 *
 *   npx vite-node scripts/feed140.ts
 */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))

// ---- real team offensive ratings ----
const csv = readFileSync('data/bref/Team Summaries.csv', 'utf8').split(/\r?\n/)
const hdr = csv[0].split(',')
const iS = hdr.indexOf('season'), iAb = hdr.indexOf('abbreviation'), iO = hdr.indexOf('o_rtg'), iLg = hdr.indexOf('lg')
const ORTG = new Map<string, number>()
for (let i = 1; i < csv.length; i++) {
  const f = csv[i].split(',')
  if (f.length < 5 || f[iLg] !== 'NBA') continue
  const v = parseFloat(f[iO])
  if (!isNaN(v)) ORTG.set(`${f[iS]}|${f[iAb]}`, v)
}

export interface Row { y: number; team: string; ab: string; off: number; ortg: number | undefined; five: Player[] }
export const ROWS: Row[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  ROWS.push({ y: t.y, team: t.team, ab: t.ab, off: ratings100(five).offRaw, ortg: ORTG.get(`${t.y}|${t.ab}`), five })
}

// ---- the OFF gauge, re-frozen exactly as gauge105.ts does ----
const seasons = [...new Set(ROWS.map((r) => r.y))].sort((a, b) => a - b)
const LEVEL = new Map<number, number>()
for (const y of seasons) {
  const g = ROWS.filter((r) => r.y === y)
  LEVEL.set(y, Math.round((g.reduce((s, r) => s + r.off, 0) / g.length) * 1000) / 1000)
}
const REF = Math.round(([...LEVEL.values()].reduce((s, v) => s + v, 0) / LEVEL.size) * 10000) / 10000
const adj = (r: Row) => r.off - LEVEL.get(r.y)! + REF
const vals = ROWS.map(adj).sort((a, b) => a - b)
const f2 = (v: number) => Math.round(v * 100) / 100
const gsw = ROWS.find((r) => r.y === 2017 && r.ab === 'GSW')!
const OFF_MIN = f2(vals[0])
const OFF_MID = f2(vals[Math.round(0.5 * (vals.length - 1))])
const OFF_TOP = f2(adj(gsw))
const s71 = (v: number, mn: number, md: number, tp: number) =>
  Math.round(Math.max(1, Math.min(99, v <= md ? 1 + (49 * (v - mn)) / (md - mn) : 50 + (49 * (v - md)) / (tp - md))))
export const dial = (r: Row) => s71(adj(r), OFF_MIN, OFF_MID, OFF_TOP)

// ---- within-season Spearman of offRaw vs real ORtg ----
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
const perSeason: { y: number; rho: number; n: number }[] = []
for (const y of seasons) {
  const g = ROWS.filter((r) => r.y === y && r.ortg !== undefined)
  if (g.length < 4) continue
  perSeason.push({ y, rho: spearman(g.map((r) => r.off), g.map((r) => r.ortg!)), n: g.length })
}
export const FIT = perSeason.reduce((s, p) => s + p.rho, 0) / perSeason.length
const dec = (lo: number, hi: number) => {
  const g = perSeason.filter((p) => p.y >= lo && p.y <= hi)
  return g.reduce((s, p) => s + p.rho, 0) / g.length
}

console.log(`${ROWS.length} fieldable fives · ${seasons.length} seasons · ${perSeason.length} with real ORtg`)
console.log(`FIT (within-season Spearman offRaw vs real ORtg) = ${FIT.toFixed(4)}`)
console.log(`  80s ${dec(1980, 1989).toFixed(3)} · 90s ${dec(1990, 1999).toFixed(3)} · 00s ${dec(2000, 2009).toFixed(3)} · 10s ${dec(2010, 2019).toFixed(3)} · 20s ${dec(2020, 2029).toFixed(3)}`)
console.log(`gauge (re-frozen): OFF_MIN ${OFF_MIN}  OFF_MID ${OFF_MID}  OFF_TOP ${OFF_TOP}  OFF_LEVEL_REF ${REF}`)

// ---- adjusted all-time order at the summit ----
const byAdj = [...ROWS].sort((a, b) => adj(b) - adj(a))
console.log(`\nADJUSTED ALL-TIME TOP 6:`)
for (let i = 0; i < 6; i++) {
  const r = byAdj[i]
  console.log(`  ${i + 1}. ${r.y} ${r.team.padEnd(24)} adj ${adj(r).toFixed(3)}  dial ${dial(r)}  real ORtg ${r.ortg}`)
}
console.log(`  fives reading 99: ${ROWS.filter((r) => dial(r) === 99).length}`)

// ---- named teams ----
const seasonRank = (r: Row) => ROWS.filter((x) => x.y === r.y && x.off > r.off).length + 1
const seasonN = (r: Row) => ROWS.filter((x) => x.y === r.y).length
const realRank = (r: Row) => {
  const g = ROWS.filter((x) => x.y === r.y && x.ortg !== undefined)
  return r.ortg === undefined ? '-' : `${g.filter((x) => x.ortg! > r.ortg!).length + 1}/${g.length}`
}
const NAMED: [number, string][] = [
  [2005, 'PHO'], [2006, 'PHO'], [2007, 'PHO'], [2000, 'IND'], [2005, 'MIA'], [1997, 'UTA'],
  [2018, 'HOU'], [2023, 'DEN'], [2017, 'GSW'], [1996, 'CHI'], [2000, 'LAL'], [2024, 'BOS'],
]
console.log(`\nNAMED FIVES:`)
for (const [y, ab] of NAMED) {
  const r = ROWS.find((x) => x.y === y && x.ab === ab)
  if (!r) { console.log(`  ${y} ${ab}: not fieldable`); continue }
  console.log(`  ${y} ${ab.padEnd(4)} ${r.team.padEnd(24)} offRaw ${r.off.toFixed(2)}  dial ${String(dial(r)).padStart(2)}  rank ${seasonRank(r)}/${seasonN(r)}  (real ORtg ${r.ortg} = ${realRank(r)})  [${r.five.map((p) => p.name.split(' ').slice(0, -1).join(' ')).join(', ')}]`)
}

// ---- decade means of the dial ----
console.log(`\nDECADE MEAN OFF DIAL:`)
for (const [lo, hi, lbl] of [[1980, 1989, '80s'], [1990, 1999, '90s'], [2000, 2009, '00s'], [2010, 2019, '10s'], [2020, 2029, '20s']] as const) {
  const g = ROWS.filter((r) => r.y >= lo && r.y <= hi)
  console.log(`  ${lbl} ${(g.reduce((s, r) => s + dial(r), 0) / g.length).toFixed(1)}`)
}
