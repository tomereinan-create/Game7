import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { PLAYERS } from '../src/engine/pool'
import { seasonGauges } from '../src/engine/gauges'
import type { Player } from '../src/engine/types'
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const picks: [number, string][] = [[2017, 'Warriors'], [2004, 'Pistons'], [1996, 'Bulls'], [2012, 'Bobcats']]
for (const [y, key] of picks) {
  const t = WHEEL.find((x) => x.y === y && x.team.includes(key))
  if (!t) { console.log(y, key, 'not found'); continue }
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  const g = seasonGauges(five, y)
  console.log(y, t.team, 'OFF', g.off, 'DEF', g.def, '·', g.basis)
}
