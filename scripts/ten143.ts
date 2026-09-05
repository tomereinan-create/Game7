/** recal_143 — the twelve named fives, the decomposition of the subject, the summit order. */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { creation, KNOBS as K, teamOffense } from '../src/engine/offense'
import { seasonGauges } from '../src/engine/gauges'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

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
interface R { y: number; team: string; ab: string; five: Player[]; off: number; dial: number; def: number; ortg?: number }
const rows: R[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const r = seasonGauges(five, t.y)
  rows.push({ y: t.y, team: t.team, ab: t.ab, five, off: r.offRaw, dial: r.off, def: r.def, ortg: ORTG.get(`${t.y}|${t.ab}`) })
}
const rk = (y: number, ab: string) => {
  const o = rows.find((r) => r.y === y && r.ab === ab)!.off
  const g = rows.filter((r) => r.y === y)
  return [g.filter((r) => r.off > o).length + 1, g.length]
}
const rrk = (y: number, ab: string) => {
  const g = rows.filter((r) => r.y === y && r.ortg !== undefined)
  const o = rows.find((r) => r.y === y && r.ab === ab)!.ortg
  return o === undefined ? '-' : `${g.filter((r) => r.ortg! > o).length + 1}`
}
const NAMED: [number, string][] = [
  [2005, 'PHO'], [2006, 'PHO'], [2007, 'PHO'], [2005, 'MIA'], [2000, 'IND'], [1997, 'UTA'],
  [2018, 'HOU'], [2023, 'DEN'], [2017, 'GSW'], [1996, 'CHI'], [2000, 'LAL'], [2024, 'BOS'],
]
console.log(`team          OFF  DEF  OVR   rank(of)  realORtgRank`)
for (const [y, ab] of NAMED) {
  const r = rows.find((x) => x.y === y && x.ab === ab)!
  const [a, b] = rk(y, ab)
  console.log(`${(r.team + " '" + String(y % 100).padStart(2, '0')).padEnd(28)} ${String(r.dial).padStart(3)}  ${String(r.def).padStart(3)}  ${String(Math.round((r.dial + r.def) / 2)).padStart(3)}   ${a}/${b}   real ${rrk(y, ab)}  offRaw ${r.off.toFixed(2)}`)
}

// decade means
const dd = (lo: number, hi: number) => { const g = rows.filter((r) => r.y >= lo && r.y <= hi); return (g.reduce((s, r) => s + r.dial, 0) / g.length).toFixed(1) }
console.log(`\nDECADE MEAN OFF DIAL: 80s ${dd(1980, 1989)} · 90s ${dd(1990, 1999)} · 00s ${dd(2000, 2009)} · 10s ${dd(2010, 2019)} · 20s ${dd(2020, 2029)}`)
const ddf = (lo: number, hi: number) => { const g = rows.filter((r) => r.y >= lo && r.y <= hi); return (g.reduce((s, r) => s + r.def, 0) / g.length).toFixed(1) }
console.log(`DECADE MEAN DEF DIAL: 80s ${ddf(1980, 1989)} · 90s ${ddf(1990, 1999)} · 00s ${ddf(2000, 2009)} · 10s ${ddf(2010, 2019)} · 20s ${ddf(2020, 2029)}`)

// the all-time adjusted order
const OFF_LEVEL = new Map<number, number>()
const seasons = [...new Set(rows.map((r) => r.y))].sort((a, b) => a - b)
for (const y of seasons) { const g = rows.filter((r) => r.y === y); OFF_LEVEL.set(y, Math.round((g.reduce((s, r) => s + r.off, 0) / g.length) * 1000) / 1000) }
const REF = Math.round(([...OFF_LEVEL.values()].reduce((s, v) => s + v, 0) / OFF_LEVEL.size) * 10000) / 10000
const adj = (r: R) => r.off - OFF_LEVEL.get(r.y)! + REF
console.log(`\nALL-TIME ADJUSTED OFF ORDER (top 10):`)
for (const r of [...rows].sort((a, b) => adj(b) - adj(a)).slice(0, 10)) console.log(`  ${(r.team + " '" + String(r.y % 100).padStart(2, '0')).padEnd(28)} ${adj(r).toFixed(3)}  dial ${r.dial}`)
console.log(`fives reading 99: ${rows.filter((r) => r.dial === 99).length}   above GSW '17: ${rows.filter((r) => adj(r) > adj(rows.find((x) => x.y === 2017 && x.ab === 'GSW')!)).length}`)

// the subject's decomposition
const pho = rows.find((r) => r.y === 2005 && r.ab === 'PHO')!
const o = teamOffense(pho.five)
console.log(`\nSUBJECT — ${pho.five.map((p) => p.name).join(' / ')}`)
console.log(`  offRaw ${o.off.toFixed(2)}  dial ${pho.dial}  def ${pho.def}  ovr ${Math.round((pho.dial + pho.def) / 2)}`)
const A = pho.five.map((p) => p.attrs)
const c = A.map(creation)
console.log(`  own creation: ${pho.five.map((p, i) => `${p.name.split(' ').slice(-2).join(' ')} ${c[i].toFixed(3)}`).join(' · ')}`)
const recv = c.map((ci, i) => { let b = 0; for (let j = 0; j < 5; j++) if (j !== i) b = Math.max(b, c[j]); return (1 - K.CREATE_SHARE) * ci + K.CREATE_SHARE * b })
console.log(`  received feed: ${recv.map((x) => x.toFixed(3)).join(' · ')}   FEED_REF ${K.FEED_REF}`)
console.log(`  full decomposition:`, JSON.stringify({ ...o, u2: undefined, e4: undefined }, (_k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v)))
