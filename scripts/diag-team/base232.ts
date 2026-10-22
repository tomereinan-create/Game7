/** recal_232 baseline: every team-season's strict five and its Team DB dials, written to a JSON file. */
import { writeFileSync } from 'node:fs'
import { WHEEL } from '../../src/data/wheel'
import { PLAYERS } from '../../src/engine/pool'
import { startingFive } from '../../src/engine/bestfive'
import { seasonGauges, dialOvrRaw } from '../../src/engine/gauges'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const out: Record<string, unknown> = {}
let n5 = 0, short = 0, holed = 0
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const key = `${t.y} ${t.ab}`
  const sf = startingFive(roster).five
  const full = sf.every(Boolean)
  if (roster.length < 5) short++
  else if (!full) holed++
  else n5++
  const men = sf.filter((p): p is Player => !!p)
  const g = full ? seasonGauges(men, t.y) : null
  out[key] = {
    team: t.team, n: roster.length,
    five: sf.map((p) => (p ? p.name : null)),
    gauge: g ? { off: g.off, def: g.def, ovr: Math.round((g.off + g.def) / 2), offRaw: g.offRaw, drtgRef: g.drtgRef, dial: dialOvrRaw(men, t.y) } : null,
  }
}
console.log({ total: WHEEL.length, strictFull: n5, short, holed })
writeFileSync(process.argv[2], JSON.stringify(out))
