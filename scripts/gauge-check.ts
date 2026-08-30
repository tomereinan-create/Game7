import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { PLAYERS } from '../src/engine/pool'
import { seasonGauges } from '../src/engine/gauges'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
for (const key of ['Rockets', 'Thunder', 'Nuggets']) {
  const t = WHEEL.find((x) => x.y === 2026 && x.team.includes(key))
  if (!t) {
    console.log(key, 'not found')
    continue
  }
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter(
    (p): p is Player => !!p,
  )
  const g = seasonGauges(five, 2026)
  console.log(t.team, 'OFF', g.off, 'DEF', g.def, 'raw', g.offRaw.toFixed(2))
}
