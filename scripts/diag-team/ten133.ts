/** recal_133 — the ten teams and the all-time DEF top 15, through the APP's own functions. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WHEEL } from '../../src/data/wheel'
import { PLAYERS } from '../../src/engine/pool'
import { startingFive } from '../../src/engine/bestfive'
import { seasonGauges } from '../../src/engine/gauges'
import { ratings100 } from '../../src/engine/offense'
import type { Player } from '../../src/engine/types'

const here = dirname(fileURLToPath(import.meta.url))
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const before = JSON.parse(readFileSync(join(here, 'sweep_before.json'), 'utf8')).rows as any[]
const B = new Map(before.map((x) => [`${x.y}|${x.ab}`, x]))

// real DRtg
const csv = readFileSync(join(here, '..', '..', 'data', 'bref', 'Team Summaries.csv'), 'utf8').split('\n')
const head = csv[0].split(',')
const iSeason = head.indexOf('season'), iLg = head.indexOf('lg'), iAb = head.indexOf('abbreviation'), iD = head.indexOf('d_rtg')
const REAL = new Map<string, number>()
for (const line of csv.slice(1)) {
  const c = line.split(',')
  if (c[iLg] !== 'NBA') continue
  REAL.set(`${c[iSeason]}|${c[iAb]}`, parseFloat(c[iD]))
}

const rows: any[] = []
for (const t of WHEEL) {
  const five = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const sf = startingFive(five)
  const f = sf.five.filter((p): p is Player => !!p)
  if (f.length !== 5) continue
  const g = seasonGauges(f, t.y)
  const r = ratings100(f)
  rows.push({ y: t.y, ab: t.ab, team: t.team, off: g.off, def: g.def, ovr: Math.round((g.off + g.def) / 2), drtgRef: g.drtgRef, offRaw: g.offRaw, r })
}

const seasonRank = (y: number, key: (x: any) => number, ab: string) => {
  const g = rows.filter((x) => x.y === y).sort((a, b) => key(b) - key(a))
  return [g.findIndex((x) => x.ab === ab) + 1, g.length]
}
const realRank = (y: number, ab: string) => {
  const g = rows.filter((x) => x.y === y && REAL.has(`${x.y}|${x.ab}`)).sort((a, b) => REAL.get(`${a.y}|${a.ab}`)! - REAL.get(`${b.y}|${b.ab}`)!)
  return [g.findIndex((x) => x.ab === ab) + 1, g.length]
}

const TEN: [string, number][] = [['PHI', 1985], ['PHI', 1984], ['BOS', 2010], ['MIL', 1985], ['CHI', 1996],
['CHI', 1998], ['SAS', 2005], ['DET', 2004], ['GSW', 2017], ['OKC', 2026], ['UTA', 1998]]
console.log('| team | DEF before → after | OFF | OVR | season DEF rank (dial) | season rank (real DRtg) | real DRtg |')
console.log('| --- | --- | --- | --- | --- | --- | --- |')
for (const [ab, y] of TEN) {
  const x = rows.find((r) => r.y === y && r.ab === ab)
  if (!x) { console.log(`| ${ab} '${y} | MISSING |`); continue }
  const b = B.get(`${y}|${ab}`)
  const [dr, dn] = seasonRank(y, (z) => z.def, ab)
  const [rr, rn] = realRank(y, ab)
  console.log(`| ${x.team} '${String(y).slice(2)} | ${b?.def ?? '?'} → ${x.def} | ${x.off} | ${Math.round((x.off + x.def) / 2)} | ${dr}/${dn} | ${rr}/${rn} | ${REAL.get(`${y}|${ab}`)?.toFixed(1)} |`)
}

const top = (list: any[], k: (x: any) => number, raw: (x: any) => number) =>
  list.slice().sort((a, b) => k(b) - k(a) || raw(a) - raw(b)).slice(0, 15)
console.log('\nALL-TIME DEF TOP 15 — before → after')
const tb = top(before, (x) => x.def, (x) => x.drtgRef)
const ta = top(rows, (x) => x.def, (x) => x.drtgRef)
for (let i = 0; i < 15; i++) {
  const l = tb[i], r = ta[i]
  console.log(`  ${String(i + 1).padStart(2)}. ${(l.team + " '" + String(l.y).slice(2)).padEnd(28)} ${String(l.def).padStart(2)}    |    ${(r.team + " '" + String(r.y).slice(2)).padEnd(28)} ${String(r.def).padStart(2)}`)
}
const rank = (list: any[], ab: string, y: number) =>
  list.slice().sort((a, b) => b.def - a.def || a.drtgRef - b.drtgRef).findIndex((x) => x.ab === ab && x.y === y) + 1
for (const [ab, y] of [['PHI', 1985], ['PHI', 1984], ['DET', 2004], ['GSW', 2017]] as [string, number][])
  console.log(`  all-time DEF rank ${ab} '${String(y).slice(2)}: ${rank(before, ab, y)} → ${rank(rows, ab, y)}`)

let offMoved = 0, defMoved = 0, mx = 0
for (const x of rows) {
  const b = B.get(`${x.y}|${x.ab}`)
  if (!b) continue
  if (b.off !== x.off) offMoved++
  if (b.def !== x.def) { defMoved++; mx = Math.max(mx, Math.abs(b.def - x.def)) }
}
console.log(`\nOFF dials moved: ${offMoved} of ${rows.length}   DEF dials moved: ${defMoved}, max |move| ${mx}`)
