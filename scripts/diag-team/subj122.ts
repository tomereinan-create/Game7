/** ROUND 122 — the subject five and the reference fives, DEF decomposition term by term. */
import { WHEEL } from '../../src/data/wheel'
import { PLAYERS } from '../../src/engine/pool'
import { startingFive } from '../../src/engine/bestfive'
import { seasonGauges } from '../../src/engine/gauges'
import { ratings100, defenseVs, teamOffense, REF_FIVE, MKNOBS } from '../../src/engine/offense'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))

const WANT: [string, number, string][] = [
  ['Golden State Warriors', 2017, 'GSW'],
  ['Golden State Warriors', 2016, 'GSW'],
  ['Golden State Warriors', 2015, 'GSW'],
  ['Chicago Bulls', 1996, 'CHI'],
  ['Detroit Pistons', 2004, 'DET'],
  ['Boston Celtics', 2010, 'BOS'],
  ['Utah Jazz', 1998, 'UTA'],
  ['San Antonio Spurs', 2014, 'SAS'],
  ['Oklahoma City Thunder', 2026, 'OKC'],
  ['Cleveland Cavaliers', 2016, 'CLE'],
  ['Los Angeles Lakers', 1987, 'LAL'],
]

for (const [team, y] of WANT) {
  const t = WHEEL.find((w) => w.team === team && w.y === y)
  if (!t) { console.log('NO WHEEL ROW', team, y); continue }
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const five = startingFive(roster).five.filter((p): p is Player => !!p)
  if (five.length !== 5) { console.log('UNFIELDABLE', team, y); continue }
  const g = seasonGauges(five, y)
  const r = ratings100(five)
  const d = defenseVs(five, REF_FIVE)
  const o = teamOffense(five)
  console.log(`\n=== ${team} '${String(y).slice(2)} — dial OFF ${g.off} DEF ${g.def} | r100 off ${r.off} def ${r.def} | offRaw ${o.off.toFixed(2)} drtgRef ${d.drtg.toFixed(3)}`)
  console.log('  five:', five.map((p) => `${p.name} pd=${p.attrs.perdef} rp=${p.attrs.rimprot} pdis=${p.attrs.perimdisrupt} drb=${p.attrs.drb}`).join('\n        '))
  console.log('  perdef mean', (five.reduce((s, p) => s + p.attrs.perdef, 0) / 5).toFixed(2),
    ' sorted', five.map((p) => p.attrs.perdef).sort((a, b) => b - a).join(','))
  const anc = d.anchor <= MKNOBS.ANCHOR_KNEE ? d.anchor : MKNOBS.ANCHOR_KNEE + (d.anchor - MKNOBS.ANCHOR_KNEE) * MKNOBS.ANCHOR_SOFT
  console.log(`  didx ${d.didx.toFixed(3)} = 0.55*effDi ${(0.55 * d.effDi).toFixed(3)} + anchor ${(0.13 * anc * 0.9).toFixed(3)} (raw ${d.anchor.toFixed(2)}, knee ${anc.toFixed(2)}) + steals ${(0.12 * Math.min(99, d.steals) * 0.9).toFixed(3)} + glass ${(0.12 * Math.max(0, 60 + d.glass / 4)).toFixed(3)} (glass ${d.glass.toFixed(2)}) - hold ${MKNOBS.DIDX_HOLD}`)
}
