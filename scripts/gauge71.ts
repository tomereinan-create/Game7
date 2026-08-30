/** recal_71 probe — the full-wheel best-five offRaw/drtgRef distribution, the GSW '17 summit,
 *  and the frozen constants for the all-time gauge scale. Re-run to re-derive the constants. */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const t0 = Date.now()
const rows: { y: number; team: string; off: number; drtg: number }[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const r = ratings100(five)
  rows.push({ y: t.y, team: t.team, off: r.offRaw, drtg: r.drtgRef })
}
console.log(`${rows.length} wheel best-fives rated in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

const offs = rows.map((r) => r.off).sort((a, b) => a - b)
const drtgs = rows.map((r) => r.drtg).sort((a, b) => a - b)
const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.round(p * (xs.length - 1)))]
console.log(`OFF raw: min ${offs[0].toFixed(2)}  p10 ${q(offs, 0.1).toFixed(2)}  median ${q(offs, 0.5).toFixed(2)}  p90 ${q(offs, 0.9).toFixed(2)}  max ${offs[offs.length - 1].toFixed(2)}`)
console.log(`DRTG raw: best(min) ${drtgs[0].toFixed(2)}  p10 ${q(drtgs, 0.1).toFixed(2)}  median ${q(drtgs, 0.5).toFixed(2)}  p90 ${q(drtgs, 0.9).toFixed(2)}  worst(max) ${drtgs[drtgs.length - 1].toFixed(2)}`)

const top = [...rows].sort((a, b) => b.off - a.off).slice(0, 8)
console.log('\nall-time OFF top-8:')
for (const r of top) console.log(`  ${r.team} '${String(r.y % 100).padStart(2, '0')}  offRaw ${r.off.toFixed(2)}`)
const gsw = rows.find((r) => r.y === 2017 && /Warriors/.test(r.team))!
console.log(`GSW '17: offRaw ${gsw.off.toFixed(2)} (all-time rank ${rows.filter((r) => r.off > gsw.off).length + 1})`)
const dtop = [...rows].sort((a, b) => a.drtg - b.drtg).slice(0, 5)
console.log('\nall-time DEF top-5 (lowest drtgRef):')
for (const r of dtop) console.log(`  ${r.team} '${String(r.y % 100).padStart(2, '0')}  drtgRef ${r.drtg.toFixed(2)}`)

console.log('\nnamed readings (raw):')
for (const [y, nm] of [[2026, 'Nuggets'], [2026, 'Rockets'], [2026, 'Thunder'], [2026, 'Celtics'], [1996, 'Bulls'], [1987, 'Lakers'], [2001, 'Lakers'], [2004, 'Pistons'], [2012, 'Bobcats']] as const) {
  const r = rows.find((x) => x.y === y && x.team.includes(nm))
  console.log(`  ${nm} '${String(y % 100).padStart(2, '0')}: ${r ? `offRaw ${r.off.toFixed(2)} drtg ${r.drtg.toFixed(2)}` : 'cannot field five'}`)
}
// per-era spread (the ruling: no era may pin to a rail)
console.log('\nper-era offRaw:')
for (const [a, b] of [[1980, 1989], [1990, 1999], [2000, 2009], [2010, 2019], [2020, 2026]] as const) {
  const era = rows.filter((r) => r.y >= a && r.y <= b).map((r) => r.off).sort((x, y) => x - y)
  console.log(`  ${a}-${b}: min ${era[0].toFixed(1)}  median ${q(era, 0.5).toFixed(1)}  max ${era[era.length - 1].toFixed(1)}  (n=${era.length})`)
}
