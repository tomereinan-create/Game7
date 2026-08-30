/** recal_71: who clamps at the DEF summit? */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const rows: { y: number; team: string; drtg: number }[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length === 5) rows.push({ y: t.y, team: t.team, drtg: ratings100(five).drtgRef })
}
const at99 = rows.filter((r) => r.drtg <= 106.85 + (0.5 * (109.18 - 106.85)) / 49).sort((a, b) => a.drtg - b.drtg)
console.log(`fives reading DEF 99 (drtg <= ~106.874): ${at99.length}`)
for (const r of at99) console.log(`  ${r.team} '${String(r.y % 100).padStart(2, '0')}  ${r.drtg.toFixed(2)}`)
