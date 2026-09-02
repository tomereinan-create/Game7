/**
 * recal_105 probe — re-derives the FROZEN OFF block of src/engine/gauges.ts.
 *
 * His ruling: "Teams rating is still off. Bulls 96 only 75 OVR"
 *
 * The Team DB's OVR is the plain mean of the two all-time dials. recal_100 gave the DEF dial an
 * era-relative index and left OFF alone because he had ruled on DEF only; the Bulls '96 therefore
 * read DEF 99 and OFF 51 — the 1996 league's BEST offence sitting on the all-time median — and the
 * composite came out at 75. This applies exactly the same subtraction to the offensive index: the
 * league's own offensive level for a season comes out of offRaw before the gauge, and the summit
 * stays where recal_71's ruling put it ("99 should be one of the greatest offense ever (2017
 * warriors)").
 *
 * Emits the exact TypeScript block. The table is rounded to 3dp FIRST and the three anchors are
 * derived from the rounded table, so the shipped constants are self-consistent.
 *
 *   npx vite-node scripts/gauge105.ts
 */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const rows: { y: number; team: string; off: number }[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  rows.push({ y: t.y, team: t.team, off: ratings100(five).offRaw })
}
const seasons = [...new Set(rows.map((r) => r.y))].sort((a, b) => a - b)
const LEVEL = new Map<number, number>()
for (const y of seasons) {
  const g = rows.filter((r) => r.y === y)
  LEVEL.set(y, Math.round((g.reduce((s, r) => s + r.off, 0) / g.length) * 1000) / 1000)
}
const REF = Math.round(([...LEVEL.values()].reduce((s, v) => s + v, 0) / LEVEL.size) * 10000) / 10000
const adj = (r: { y: number; off: number }) => r.off - LEVEL.get(r.y)! + REF

const vals = rows.map(adj).sort((a, b) => a - b)
const worst = vals[0]
const mid = vals[Math.round(0.5 * (vals.length - 1))]
const gsw = rows.find((r) => r.y === 2017 && /Warriors/.test(r.team))!
const top = adj(gsw)
const f2 = (v: number) => Math.round(v * 100) / 100

console.log(`${rows.length} wheel best-fives · ${seasons.length} seasons`)
console.log(`OFF_LEVEL_REF ${REF}`)
console.log(`adjusted: worst ${worst.toFixed(3)}  median ${mid.toFixed(3)}  best ${vals[vals.length - 1].toFixed(3)}`)
console.log(`Warriors '17 adjusted ${top.toFixed(4)} — all-time rank ${rows.filter((r) => adj(r) > top).length + 1} of ${rows.length}`)
console.log(`\n  const OFF_MIN = ${f2(worst)}\n  const OFF_MID = ${f2(mid)}\n  const OFF_TOP = ${f2(top)}\n`)
console.log('const OFF_LEVEL: Record<number, number> = {')
for (let i = 0; i < seasons.length; i += 6) {
  console.log(`  ${seasons.slice(i, i + 6).map((y) => `${y}: ${LEVEL.get(y)!.toFixed(3)}`).join(', ')},`)
}
console.log('}')

const s71 = (v: number, mn: number, md: number, tp: number) =>
  Math.round(Math.max(1, Math.min(99, v <= md ? 1 + (49 * (v - mn)) / (md - mn) : 50 + (49 * (v - md)) / (tp - md))))
const dial = (r: { y: number; off: number }) => s71(adj(r), f2(worst), f2(mid), f2(top))
console.log(`\nsanity on the ROUNDED constants:`)
console.log(`  Warriors '17 ${dial(gsw)}   fives reading 99: ${rows.filter((r) => dial(r) === 99).length}`)
for (const [y, nm] of [[1996, 'Bulls'], [1997, 'Bulls'], [1987, 'Lakers'], [1986, 'Celtics'], [2014, 'Spurs'], [2005, 'Suns'], [2026, 'Thunder'], [2024, 'Celtics'], [2013, 'Heat'], [2007, 'Suns']] as const) {
  const r = rows.find((x) => x.y === y && x.team.includes(nm))!
  console.log(`  ${nm} '${String(y % 100).padStart(2, '0')}: ${dial(r)}`)
}
