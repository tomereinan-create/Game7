/** recal_70 measurement: the corrected ORB second-chance law, named teams before/after. */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const fiveOf = (y: number, nm: string) => {
  const t = WHEEL.find((x) => x.y === y && x.team.includes(nm))!
  return { team: t.team, five: startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p) }
}
for (const [y, nm] of [[2026, 'Rockets'], [2026, 'Thunder'], [2026, 'Celtics'], [2025, 'Knicks'], [2024, 'Celtics'], [2013, 'Grizzlies']] as const) {
  const { team, five } = fiveOf(y, nm)
  if (five.length !== 5) {
    console.log(`${team} '${y % 100}: cannot field five`)
    continue
  }
  const o = teamOffense(five)
  const g = seasonGauges(five, y)
  const orbPts = five.reduce((s, p) => s + Math.max(0, p.attrs.orb - 50), 0)
  console.log(`${team.padEnd(24)} '${String(y % 100).padStart(2, '0')}  orbPts ${String(orbPts).padStart(3)}  orbMult ${o.orbMult.toFixed(4)}  OFF ${o.off.toFixed(2)}  gauge OFF ${g.off} DEF ${g.def} (n=${g.n})`)
}
