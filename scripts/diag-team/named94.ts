/** recal_94 — exact raw readings for the named summit fives, and the DEF dial they land on. */
import { WHEEL } from '../../src/data/wheel'
import { startingFive } from '../../src/engine/bestfive'
import { ratings100 } from '../../src/engine/offense'
import { seasonGauges } from '../../src/engine/gauges'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const want: [number, RegExp][] = [
  [2004, /Pistons/], [2014, /Pacers/], [2026, /Thunder/], [2017, /Warriors/],
  [1996, /Bulls/], [2026, /76ers/], [2026, /Pistons/],
]
for (const t of WHEEL) {
  if (!want.some(([y, re]) => t.y === y && re.test(t.team))) continue
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const r = ratings100(five)
  const g = seasonGauges(five, t.y)
  console.log(`${t.y} ${t.team.padEnd(24)} offRaw ${r.offRaw.toFixed(6)}  drtgRef ${r.drtgRef.toFixed(6)}   dial OFF ${g.off} DEF ${g.def}`)
  console.log(`     five: ${five.map((p) => p.name).join(' | ')}`)
}
