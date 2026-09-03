/** recal_113 — candidate sort keys for the All-Time tier, and where each puts the Lakers. */
import CAMPAIGNS from '../../src/data/campaigns.json'
import { ratings100 } from '../../src/engine/offense'
import { fieldGauges } from '../../src/engine/gauges'
import type { Opponent, Player } from '../../src/engine/types'

// the frozen gauge constants, read the way gauges.ts holds them
const OFF_MIN = 102.39, OFF_MID = 121.67, OFF_TOP = 138.52, OFF_REF = 121.7822
const DEF_WORST = 113, DEF_MID = 110.04, DEF_TOP = 107.58, DEF_REF = 110.0319
const OFF_FIELD = 122.973, DEF_FIELD = 110.254
/** scale71 WITHOUT the 1..99 clamp: the dial's own units, extended past the rail. */
const raw71 = (v: number, mn: number, mid: number, top: number) =>
  v <= mid ? 1 + (49 * (v - mn)) / (mid - mn) : 50 + (49 * (v - mid)) / (top - mid)

const tiers = CAMPAIGNS as unknown as { id: string; name: string; levels: Opponent[] }[]
const t3 = tiers.find((t) => t.id === 'alltime')!

const k = (o: Opponent) => {
  const five = o.players as Player[]
  const r = ratings100(five)
  const g = fieldGauges(five)
  const offAdj = r.offRaw - OFF_FIELD + OFF_REF
  const defAdj = r.drtgRef - DEF_FIELD + DEF_REF
  const offU = raw71(offAdj, OFF_MIN, OFF_MID, OFF_TOP)
  const defU = raw71(-defAdj, -DEF_WORST, -DEF_MID, -DEF_TOP)
  return {
    ab: o.ab,
    team: o.team,
    sumOvr: five.reduce((s, p) => s + p.ovr, 0),
    net: r.offRaw - r.drtgRef,
    dialSum: g.off + g.def,
    uncapped: offU + defU,
    offU,
    defU,
    off: g.off,
    def: g.def,
  }
}
const rows = t3.levels.map(k)
const show = (name: string, key: (x: (typeof rows)[number]) => number) => {
  const ord = [...rows].sort((a, b) => key(a) - key(b))
  const lal = ord.findIndex((x) => x.ab === 'LAL') + 1
  const ties = new Set(ord.map((x) => key(x).toFixed(4))).size
  console.log(
    `${name.padEnd(22)} LAL at L${String(lal).padStart(2)}/30   last5 ${ord.slice(-5).map((x) => x.ab).join(' ')}   distinct values ${ties}/30`,
  )
}
show('sum-OVR', (x) => x.sumOvr)
show('raw net (shipped)', (x) => x.net)
show('dial off+def', (x) => x.dialSum)
show('UNCAPPED dial off+def', (x) => x.uncapped)
show('uncapped def only', (x) => x.defU)
show('uncapped off only', (x) => x.offU)

console.log('\nthe tier under the UNCAPPED dial sum:')
console.log('  side                       sumOVR     net   OFF  DEF   offU   defU  uncapped')
for (const x of [...rows].sort((a, b) => a.uncapped - b.uncapped)) {
  console.log(
    `  ${x.team.padEnd(26)} ${String(x.sumOvr).padStart(4)} ${x.net.toFixed(2).padStart(7)}  ${String(x.off).padStart(3)} ${String(x.def).padStart(4)}` +
      ` ${x.offU.toFixed(1).padStart(6)} ${x.defU.toFixed(1).padStart(6)} ${x.uncapped.toFixed(1).padStart(9)}`,
  )
}
