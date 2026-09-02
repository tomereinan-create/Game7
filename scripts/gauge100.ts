/**
 * recal_100 probe — re-derives the FROZEN DEF block of src/engine/gauges.ts.
 *
 * His ruling: "OKC at 59 DEF is wayyy to low. Should be low 80's or very high 70's. In general, no
 * 2026 team having more than 61 DEF is insane."
 *
 * The all-time DEF dial reads each era at its own level: the league's own defensive level for a
 * season (the mean drtgRef of that season's fieldable best-fives) is subtracted before the gauge,
 * and DEF_LEVEL_REF put back, so the median five of ANY season reads ~50. The summit stays where
 * recal_94's ruling put it ("Move the summit to Bulls '96").
 *
 * Emits the exact TypeScript block. The table is rounded to 3dp FIRST and the three anchors are then
 * derived from the rounded table, so the shipped constants are self-consistent.
 *
 *   npx vite-node scripts/gauge100.ts
 */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const rows: { y: number; team: string; drtg: number; off: number }[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const r = ratings100(five)
  rows.push({ y: t.y, team: t.team, drtg: r.drtgRef, off: r.offRaw })
}
const seasons = [...new Set(rows.map((r) => r.y))].sort((a, b) => a - b)
const LEVEL = new Map<number, number>()
for (const y of seasons) {
  const g = rows.filter((r) => r.y === y)
  LEVEL.set(y, Math.round((g.reduce((s, r) => s + r.drtg, 0) / g.length) * 1000) / 1000)
}
const REF = Math.round(([...LEVEL.values()].reduce((s, v) => s + v, 0) / LEVEL.size) * 10000) / 10000
const adj = (r: { y: number; drtg: number }) => r.drtg - LEVEL.get(r.y)! + REF

const vals = rows.map(adj).sort((a, b) => a - b)
const worst = vals[vals.length - 1]
const mid = vals[Math.round(0.5 * (vals.length - 1))]
const bulls = rows.find((r) => r.y === 1996 && /Bulls/.test(r.team))!
const top = adj(bulls)
const f2 = (v: number) => Math.round(v * 100) / 100

console.log(`${rows.length} wheel best-fives · ${seasons.length} seasons`)
console.log(`DEF_LEVEL_REF ${REF}`)
console.log(`raw    : best ${vals[0].toFixed(3)}  median ${mid.toFixed(3)}  worst ${worst.toFixed(3)}`)
console.log(`Bulls '96 adjusted ${top.toFixed(4)} — all-time rank ${rows.filter((r) => adj(r) < top).length + 1} of ${rows.length}`)
console.log(`\n  const DEF_WORST = ${f2(worst)}\n  const DEF_MID = ${f2(mid)}\n  const DEF_TOP = ${f2(top)}\n`)
console.log('const DEF_LEVEL: Record<number, number> = {')
for (let i = 0; i < seasons.length; i += 6) {
  const chunk = seasons.slice(i, i + 6).map((y) => `${y}: ${LEVEL.get(y)!.toFixed(3)}`)
  console.log(`  ${chunk.join(', ')},`)
}
console.log('}')

// what the shipped constants then produce
const s71 = (v: number, mn: number, md: number, tp: number) =>
  Math.round(Math.max(1, Math.min(99, v <= md ? 1 + (49 * (v - mn)) / (md - mn) : 50 + (49 * (v - md)) / (tp - md))))
const dial = (r: { y: number; drtg: number }) => s71(-adj(r), -f2(worst), -f2(mid), -f2(top))
console.log(`\nsanity on the ROUNDED constants:`)
console.log(`  Bulls '96 ${dial(bulls)}   fives reading 99: ${rows.filter((r) => dial(r) === 99).length}`)
for (const [y, nm] of [[2026, 'Thunder'], [2026, 'Pistons'], [2026, '76ers'], [2004, 'Pistons'], [2005, 'Spurs']] as const) {
  const r = rows.find((x) => x.y === y && x.team.includes(nm))!
  console.log(`  ${nm} '${String(y % 100).padStart(2, '0')}: ${dial(r)}`)
}
