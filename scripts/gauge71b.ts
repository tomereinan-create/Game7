/** recal_71 after-measurement: named readings and per-era spread on the all-time scale. */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const g = (y: number, nm: string) => {
  const t = WHEEL.find((x) => x.y === y && x.team.includes(nm))!
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  return five.length === 5 ? seasonGauges(five, y) : null
}
for (const [y, nm] of [[2017, 'Warriors'], [2004, 'Pistons'], [2006, 'Pistons'], [2005, 'Pistons'], [2026, 'Nuggets'], [2026, 'Rockets'], [2026, 'Thunder'], [2026, 'Celtics'], [2026, '76ers'], [1996, 'Bulls'], [1987, 'Lakers'], [2001, 'Lakers'], [2012, 'Bobcats'], [2025, 'Knicks'], [2024, 'Celtics'], [2013, 'Grizzlies']] as const) {
  const r = g(y, nm)
  console.log(`${nm.padEnd(10)} '${String(y % 100).padStart(2, '0')}: ${r ? `OFF ${String(r.off).padStart(2)}  DEF ${String(r.def).padStart(2)}  (raw ${r.offRaw.toFixed(1)} / ${r.drtgRef.toFixed(1)})` : 'cannot field five'}`)
}
// full-wheel distribution on the new scale
const offs: number[] = []
const defs: number[] = []
const byEra = new Map<string, number[]>()
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const r = seasonGauges(five, t.y)
  offs.push(r.off)
  defs.push(r.def)
  const era = `${Math.floor(t.y / 10) * 10}s`
  if (!byEra.has(era)) byEra.set(era, [])
  byEra.get(era)!.push(r.off)
}
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.round(p * (xs.length - 1)))]
console.log(`\nOFF gauge: min ${Math.min(...offs)} p25 ${q(offs, 0.25)} median ${q(offs, 0.5)} p75 ${q(offs, 0.75)} max ${Math.max(...offs)} · at 99: ${offs.filter((v) => v === 99).length} · at 1: ${offs.filter((v) => v === 1).length}`)
console.log(`DEF gauge: min ${Math.min(...defs)} p25 ${q(defs, 0.25)} median ${q(defs, 0.5)} p75 ${q(defs, 0.75)} max ${Math.max(...defs)} · at 99: ${defs.filter((v) => v === 99).length} · at 1: ${defs.filter((v) => v === 1).length}`)
for (const [era, xs] of [...byEra].sort()) console.log(`  ${era}: OFF min ${Math.min(...xs)} median ${q(xs, 0.5)} max ${Math.max(...xs)} (n=${xs.length})`)
