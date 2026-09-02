/** recal_94 — the campaign ladder's OFF/DEF dials, so a team round cannot silently reorder it.
 *  Writes scripts/diag-team/opp_<tag>.json; run once on HEAD and once on the round. */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import CAMPAIGNS from '../../src/data/campaigns.json'
import OPP from '../../src/data/opponents.json'
import { fieldGauges } from '../../src/engine/gauges'
import type { Opponent } from '../../src/engine/types'

const tag = process.argv[2] ?? 'after'
const here = dirname(fileURLToPath(import.meta.url))
const opp = OPP as Opponent[]
const levels = (CAMPAIGNS as unknown as { name?: string; levels: Opponent[] }[]).flatMap((t, ti) =>
  t.levels.map((o, li) => ({ camp: ti, lvl: li + 1, o })),
)
const rows = [
  ...opp.map((o, i) => {
    const g = fieldGauges(o.players)
    return { src: 'opponents', i, team: `${o.team} '${String((o.season ?? 0) % 100).padStart(2, '0')}`, off: g.off, def: g.def, drtg: g.drtgRef }
  }),
  ...levels.map(({ camp, lvl, o }) => {
    const g = fieldGauges(o.players)
    return { src: `camp${camp}`, i: lvl, team: `${o.team} '${String((o.season ?? 0) % 100).padStart(2, '0')}`, off: g.off, def: g.def, drtg: g.drtgRef }
  }),
]
writeFileSync(join(here, `opp_${tag}.json`), JSON.stringify(rows))
console.log(`${tag}: ${rows.length} ladder fives`)
console.log('  first 8 opponents.json rounds:')
for (const r of rows.filter((r) => r.src === 'opponents').slice(0, 8))
  console.log(`    round ${String(r.i + 1).padStart(2)}  ${r.team.padEnd(26)} OFF ${String(r.off).padStart(2)}  DEF ${String(r.def).padStart(2)}`)
