/**
 * recal_119 — THE TEN TEAMS, read through the app's own functions (teamOffense / defenseVs /
 * ratings100 via fieldGauges, exactly as src/ui/TeamDb.tsx reads them), with the season rank the
 * engine gives each five and the rank the real ORtg gives it.
 *
 *   npx vite-node scripts/diag-team/ten119.ts
 */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../../src/data/wheel'
import { startingFive } from '../../src/engine/bestfive'
import { seasonGauges } from '../../src/engine/gauges'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
type Row = { y: number; ab: string; team: string; five: Player[]; off: number; def: number; offRaw: number }
const rows: Row[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const g = seasonGauges(five, t.y)
  rows.push({ y: t.y, ab: t.ab, team: t.team, five, off: g.off, def: g.def, offRaw: g.offRaw })
}

const TRUTH = new Map<string, { ortg: number; tov: number; mov: number }>()
{
  const csv = readFileSync('data/bref/Team Summaries.csv', 'utf8').split(/\r?\n/)
  const head = csv[0].split(',')
  const ix = (n: string) => head.indexOf(n)
  for (const line of csv.slice(1)) {
    const c = line.split(',')
    if (c[ix('lg')] !== 'NBA') continue
    const o = Number(c[ix('o_rtg')])
    if (!Number.isFinite(o)) continue
    TRUTH.set(`${c[ix('season')]}|${c[ix('abbreviation')]}`, { ortg: o, tov: Number(c[ix('tov_percent')]), mov: Number(c[ix('mov')]) })
  }
}

const TEN: [number, string][] = [
  [2024, 'BOS'], [2023, 'BOS'], [2025, 'BOS'], [2023, 'NYK'], [2005, 'SAC'], [2008, 'BOS'],
  [1996, 'CHI'], [2017, 'GSW'], [2000, 'LAL'], [2018, 'HOU'], [2024, 'DEN'],
]
console.log('team          OFF  DEF  OVR | engine rank (real ORtg rank) | offRaw   realORtg  realTOV%')
for (const [y, ab] of TEN) {
  const r = rows.find((x) => x.y === y && x.ab === ab)
  if (!r) { console.log(`${ab} '${y} — cannot field`); continue }
  const season = rows.filter((x) => x.y === y)
  const withT = season.filter((x) => TRUTH.has(`${x.y}|${x.ab}`))
  const eng = [...withT].sort((a, b) => b.offRaw - a.offRaw)
  const tru = [...withT].sort((a, b) => TRUTH.get(`${b.y}|${b.ab}`)!.ortg - TRUTH.get(`${a.y}|${a.ab}`)!.ortg)
  const t = TRUTH.get(`${y}|${ab}`)!
  console.log(
    `${(ab + " '" + String(y % 100).padStart(2, '0')).padEnd(10)} ${String(r.off).padStart(4)} ${String(r.def).padStart(4)} ${String(Math.round((r.off + r.def) / 2)).padStart(4)} | ` +
      `${String(eng.findIndex((x) => x.ab === ab) + 1).padStart(3)} of ${String(withT.length).padEnd(3)} (real ${String(tru.findIndex((x) => x.ab === ab) + 1).padStart(2)}) | ` +
      `${r.offRaw.toFixed(2).padStart(7)}  ${t.ortg.toFixed(1).padStart(7)}  ${t.tov.toFixed(1).padStart(6)}`,
  )
}

console.log('\nALL-TIME TOP 10 BY OFF DIAL')
for (const [i, r] of [...rows].sort((a, b) => b.off - a.off || b.offRaw - a.offRaw).slice(0, 10).entries()) {
  const withT = rows.filter((x) => x.y === r.y && TRUTH.has(`${x.y}|${x.ab}`))
  const tru = [...withT].sort((a, b) => TRUTH.get(`${b.y}|${b.ab}`)!.ortg - TRUTH.get(`${a.y}|${a.ab}`)!.ortg)
  console.log(`  ${String(i + 1).padStart(2)}. ${r.team.padEnd(24)} '${String(r.y % 100).padStart(2, '0')}  OFF ${String(r.off).padStart(2)}  real ORtg rank ${tru.findIndex((x) => x.ab === r.ab) + 1}/${withT.length}`)
}
console.log('\nALL-TIME TOP 10 BY TEAM OVR')
for (const [i, r] of [...rows].sort((a, b) => (b.off + b.def) - (a.off + a.def) || b.off - a.off).slice(0, 10).entries())
  console.log(`  ${String(i + 1).padStart(2)}. ${r.team.padEnd(24)} '${String(r.y % 100).padStart(2, '0')}  OFF ${String(r.off).padStart(2)} DEF ${String(r.def).padStart(2)} OVR ${Math.round((r.off + r.def) / 2)}  real MOV ${TRUTH.get(`${r.y}|${r.ab}`)?.mov.toFixed(1) ?? '-'}`)

console.log('\nDECADE MEANS (OFF / DEF / OVR dials)')
for (const dec of [1980, 1990, 2000, 2010, 2020]) {
  const g = rows.filter((x) => x.y >= dec && x.y < dec + 10)
  const m = (f: (r: Row) => number) => (g.reduce((s, r) => s + f(r), 0) / g.length).toFixed(1)
  console.log(`  ${dec}s  n ${String(g.length).padStart(4)}   OFF ${m((r) => r.off)}  DEF ${m((r) => r.def)}  OVR ${m((r) => (r.off + r.def) / 2)}`)
}
console.log(`\nfives reading OFF 99: ${rows.filter((r) => r.off === 99).map((r) => `${r.ab} '${String(r.y % 100).padStart(2, '0')}`).join(', ')}`)
console.log(`fives reading DEF 99: ${rows.filter((r) => r.def === 99).map((r) => `${r.ab} '${String(r.y % 100).padStart(2, '0')}`).join(', ')}`)

console.log('\n2026 BY TEAM OVR')
for (const [i, r] of rows.filter((x) => x.y === 2026).sort((a, b) => (b.off + b.def) - (a.off + a.def)).slice(0, 8).entries())
  console.log(`  ${i + 1}. ${r.team.padEnd(24)} OFF ${String(r.off).padStart(2)} DEF ${String(r.def).padStart(2)} OVR ${Math.round((r.off + r.def) / 2)}`)
