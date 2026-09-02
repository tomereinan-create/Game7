/** recal_94 — re-freeze the DEF gauge anchors from the wheel sweep, per recal_71's law.
 *  DEF 99 = the 1996 Bulls' best legal five (his ruling, at the recal_94 integration: "Move the summit
 *  to Bulls '96"), superseding recal_71's "Do the same for DEF, 99 is 2004 pistons".
 *  OFF is NOT re-frozen: teamOffense is untouched this round, so its constants stay exactly as shipped. */
import { WHEEL } from '../../src/data/wheel'
import { startingFive } from '../../src/engine/bestfive'
import { ratings100 } from '../../src/engine/offense'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const rows: { y: number; team: string; ab: string; off: number; drtg: number }[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const r = ratings100(five)
  rows.push({ y: t.y, team: t.team, ab: t.ab, off: r.offRaw, drtg: r.drtgRef })
}
const yy = (y: number) => `'${String(y % 100).padStart(2, '0')}`
const drtgs = rows.map((r) => r.drtg).sort((a, b) => a - b)
const offs = rows.map((r) => r.off).sort((a, b) => a - b)
const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.round(p * (xs.length - 1)))]
console.log(`n = ${rows.length}`)
console.log(`OFF raw (NOT re-frozen): min ${offs[0].toFixed(2)}  median ${q(offs, 0.5).toFixed(2)}  max ${offs[offs.length - 1].toFixed(2)}`)
console.log(`DEF raw: best ${drtgs[0].toFixed(2)}  median ${q(drtgs, 0.5).toFixed(2)}  worst ${drtgs[drtgs.length - 1].toFixed(2)}`)

const pist = rows.find((r) => r.y === 1996 && /Bulls/.test(r.team))!
const det04 = rows.find((r) => r.y === 2004 && /Pistons/.test(r.team))!
const better = rows.filter((r) => r.drtg < pist.drtg).sort((a, b) => a.drtg - b.drtg)
console.log(`\nBulls '96 (the summit) drtgRef ${pist.drtg.toFixed(6)} — all-time DEF rank ${better.length + 1} of ${rows.length}`)
console.log(`Pistons '04 (recal_71's old summit) drtgRef ${det04.drtg.toFixed(6)} — all-time DEF rank ${rows.filter((r) => r.drtg < det04.drtg).length + 1}`)
console.log(`  DEF_WORST = ${drtgs[drtgs.length - 1].toFixed(2)}   DEF_MID = ${q(drtgs, 0.5).toFixed(2)}   DEF_TOP = ${pist.drtg.toFixed(2)} (the ruling's summit: Bulls '96)`)
console.log(`  ${better.length} fives clamp to 99:`)
for (const r of better) console.log(`    ${r.team} ${yy(r.y)}  drtgRef ${r.drtg.toFixed(3)}`)

console.log('\nall-time DEF top 10 (lowest drtgRef):')
for (const [i, r] of [...rows].sort((a, b) => a.drtg - b.drtg).slice(0, 10).entries())
  console.log(`  ${String(i + 1).padStart(2)}. ${(r.team + ' ' + yy(r.y)).padEnd(30)} drtgRef ${r.drtg.toFixed(3)}`)
