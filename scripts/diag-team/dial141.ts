/** recal_141 probe — DEF dial + raw drtgRef for the three fives the round must report. */
import { WHEEL } from '../../src/data/wheel'
import { startingFive } from '../../src/engine/bestfive'
import { seasonGauges } from '../../src/engine/gauges'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const WANT: [number, RegExp][] = [[1996, /Bulls/], [1998, /Jazz/], [2011, /Spurs/]]
for (const [y, re] of WANT) {
  const t = WHEEL.find((t) => t.y === y && re.test(t.team))
  if (!t) { console.log(`${y} ${re} NOT ON WHEEL`); continue }
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  const g = seasonGauges(five, y)
  console.log(`${t.team} '${String(y).slice(2)}  DEFdial ${g.def}  OFFdial ${g.off}  drtgRef ${g.drtgRef.toFixed(4)}  | ${five.map((p) => p.name).join(', ')}`)
}
