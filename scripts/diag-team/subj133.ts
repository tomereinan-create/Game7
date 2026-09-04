/** recal_133 — the subject five, term by term, and the all-time DEF top 20. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const sw = JSON.parse(readFileSync(join(here, process.argv[2] ?? 'sweep.json'), 'utf8'))
const rows: any[] = sw.rows

const label = (x: any) => `${x.team} '${String(x.y).slice(2)}`
const find = (team: string, y: number) => rows.find((x) => x.y === y && x.team.includes(team))

const NAMED: [string, number][] = [
  ['76ers', 1985], ['76ers', 1984], ['76ers', 1980], ['Celtics', 2010], ['Bucks', 1985],
  ['Bulls', 1996], ['Bulls', 1998], ['Spurs', 2005], ['Pistons', 2004], ['Warriors', 2017],
  ['Thunder', 2026], ['Jazz', 1998], ['Lakers', 1987], ['76ers', 2026], ['Pistons', 2026],
  ['Celtics', 2024],
]

console.log('=== SUBJECT: 76ers 1985 ===')
const s = find('76ers', 1985)!
console.log(JSON.stringify({ def: s.def, off: s.off, drtgRef: s.drtgRef, rec: s.rec }))
for (const p of s.five) console.log(`  ${p.name.padEnd(26)} perdef ${String(p.perdef).padStart(3)} rimprot ${String(p.rimprot).padStart(3)} pd ${String(p.perimdisrupt).padStart(3)} drb ${String(p.drb).padStart(3)} usg ${p.usg}`)
console.log('  bench:', s.bench.map((b: any) => `${b.name} (pd ${b.perdef}/rp ${b.rimprot})`).join(', '))
console.log('  dec:', JSON.stringify(s.dec))

const byDef = rows.slice().sort((a, b) => b.def - a.def || a.drtgRef - b.drtgRef)
console.log('\n=== ALL-TIME DEF TOP 20 ===')
byDef.slice(0, 20).forEach((x, i) => console.log(`${String(i + 1).padStart(3)}. ${label(x).padEnd(28)} DEF ${String(x.def).padStart(2)} OFF ${String(x.off).padStart(2)} drtgRef ${x.drtgRef.toFixed(3)} didx ${x.dec.didx.toFixed(2)}`))
console.log('\n76ers 85 all-time DEF rank:', byDef.findIndex((x) => x === s) + 1, 'of', rows.length)

console.log('\n=== NAMED ===')
for (const [t, y] of NAMED) {
  const x = find(t, y)
  if (!x) { console.log(`${t} ${y}: MISSING`); continue }
  const rk = byDef.findIndex((r) => r === x) + 1
  const season = rows.filter((r) => r.y === y).sort((a, b) => b.def - a.def)
  const sRk = season.findIndex((r) => r === x) + 1
  console.log(`${label(x).padEnd(28)} DEF ${String(x.def).padStart(2)} OFF ${String(x.off).padStart(2)} alltime#${String(rk).padStart(4)} season ${sRk}/${season.length} drtgRef ${x.drtgRef.toFixed(3)} | effDi ${x.dec.effDi.toFixed(2)} anc ${x.dec.anchor.toFixed(2)} st ${x.dec.steals.toFixed(2)} gl ${x.dec.glass.toFixed(2)} didx ${x.dec.didx.toFixed(2)}`)
}

console.log('\n=== 1985 BOARD (by DEF) ===')
rows.filter((r) => r.y === 1985).sort((a, b) => b.def - a.def).forEach((x, i) => console.log(`${String(i + 1).padStart(2)}. ${label(x).padEnd(28)} DEF ${String(x.def).padStart(2)} drtgRef ${x.drtgRef.toFixed(3)}`))
