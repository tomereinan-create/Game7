/** recal_113 — the All-Time and Customs tiers under each candidate sort key. */
import CAMPAIGNS from '../../src/data/campaigns.json'
import { ratings100 } from '../../src/engine/offense'
import { fieldGauges } from '../../src/engine/gauges'
import type { Opponent, Player } from '../../src/engine/types'

const tiers = CAMPAIGNS as unknown as { id: string; name: string; levels: Opponent[] }[]
const t3 = tiers.find((t) => t.id === 'alltime')!
const t4 = tiers.find((t) => t.id === 'customs')!
const keys = (o: Opponent) => {
  const five = o.players as Player[]
  const r = ratings100(five)
  const g = fieldGauges(five)
  return {
    sumOvr: five.reduce((s, p) => s + p.ovr, 0),
    net: r.offRaw - r.drtgRef,
    off: g.off,
    def: g.def,
    dialSum: g.off + g.def,
    dialOvr: Math.round((g.off + g.def) / 2),
  }
}
for (const [tag, t] of [['ALL-TIME', t3], ['CUSTOMS', t4]] as const) {
  console.log(`\n=== ${tag} (${t.levels.length} levels), as shipped ===`)
  console.log('  L   side                          sumOVR      net   OFF  DEF  dialSum dialOVR')
  for (const o of t.levels) {
    const k = keys(o)
    console.log(
      `${String(o.round).padStart(3)}  ${o.team.padEnd(28)} ${String(k.sumOvr).padStart(5)}  ${k.net.toFixed(2).padStart(7)}` +
        `  ${String(k.off).padStart(3)} ${String(k.def).padStart(4)} ${String(k.dialSum).padStart(7)} ${String(k.dialOvr).padStart(7)}`,
    )
  }
  for (const kk of ['net', 'dialSum'] as const) {
    const ord = [...t.levels].sort((a, b) => keys(a)[kk] - keys(b)[kk])
    console.log(`  order by ${kk}: last five = ${ord.slice(-5).map((o) => o.ab).join(' -> ')}`)
  }
}
