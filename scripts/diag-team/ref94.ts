/** recal_94 — re-derive ratings100's _REF_DRTG intercept (recal_60/74's "50 = the campaign median"). */
import CAMPAIGNS from '../../src/data/campaigns.json'
import OPP from '../../src/data/opponents.json'
import { defenseVs, ratings100, REF_FIVE, teamOffense } from '../../src/engine/offense'
import type { Opponent } from '../../src/engine/types'

const all = (CAMPAIGNS as unknown as { levels: Opponent[] }[]).flatMap((t) => t.levels)
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const drtgs = all.map((o) => defenseVs(o.players, REF_FIVE).drtg)
const offs = all.map((o) => teamOffense(o.players).off)
console.log(`campaign levels: ${all.length}`)
console.log(`  drtgRef  min ${Math.min(...drtgs).toFixed(2)}  median ${med(drtgs).toFixed(3)}  max ${Math.max(...drtgs).toFixed(2)}`)
console.log(`  offRaw   min ${Math.min(...offs).toFixed(2)}  median ${med(offs).toFixed(3)}  max ${Math.max(...offs).toFixed(2)}`)
const opp = OPP as Opponent[]
const od = opp.map((o) => defenseVs(o.players, REF_FIVE).drtg)
console.log(`  opponents.json (${opp.length}): drtgRef median ${med(od).toFixed(3)}`)
const sample = Array.from({ length: 10 }, (_, i) => all[Math.floor((i * (all.length - 1)) / 9)]).map((o) => ratings100(o.players))
console.log(`  the box.test 10-level sample: median OFF ${med(sample.map((s) => s.off))} DEF ${med(sample.map((s) => s.def))}`)
console.log(`  REF_FIVE itself: ${JSON.stringify(ratings100(REF_FIVE))}`)
