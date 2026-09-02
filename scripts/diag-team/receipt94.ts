/** recal_94 — the exact numbers the round file records, read the way scripts/receipts.ts reads them. */
import { ratings100 } from '../../src/engine/offense'
import { seasonGauges } from '../../src/engine/gauges'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const F = (...n: string[]) => n.map((x) => BY.get(x)!).filter(Boolean) as Player[]
const FIVES: [string, string[]][] = [
  ['PHI 26', ["Tyrese Maxey '26", "Quentin Grimes '26", "Kelly Oubre Jr. '26", "Dominick Barlow '26", "Joel Embiid '26"]],
  ['OKC 26', ["Shai Gilgeous-Alexander '26", "Isaiah Joe '26", "Luguentz Dort '26", "Chet Holmgren '26", "Jaylin Williams '26"]],
  ['DET 26', ["Cade Cunningham '26", "Duncan Robinson '26", "Ausar Thompson '26", "Tobias Harris '26", "Jalen Duren '26"]],
  ['SAS 26', ["De'Aaron Fox '26", "Dylan Harper '26", "Keldon Johnson '26", "Harrison Barnes '26", "Victor Wembanyama '26"]],
  ['DET 04', ["Chauncey Billups '04", "Richard Hamilton '04", "Tayshaun Prince '04", "Ben Wallace '04", "Mehmet Okur '04"]],
  ['GSW 17', ["Stephen Curry '17", "Kevin Durant '17", "Klay Thompson '17", "Draymond Green '17", "Zaza Pachulia '17"]],
  ['CHI 96', ["Ron Harper '96", "Michael Jordan '96", "Scottie Pippen '96", "Toni Kukoč '96", "Luc Longley '96"]],
  ['CHI 05', ["Kirk Hinrich '05", "Ben Gordon '05", "Luol Deng '05", "Eddy Curry '05", "Othella Harrington '05"]],
  ['SAS 20', ["Dejounte Murray '20", "Patty Mills '20", "DeMar DeRozan '20", "Rudy Gay '20", "LaMarcus Aldridge '20"]],
]
for (const [tag, names] of FIVES) {
  const five = F(...names)
  if (five.length !== 5) { console.log(`${tag}: MISSING ${names.filter((n) => !BY.get(n)).join(', ')}`); continue }
  const r = ratings100(five)
  const g = seasonGauges(five, 0)
  console.log(`${tag}  team:off ${String(r.off).padStart(2)}  team:def ${String(r.def).padStart(2)}   dial OFF ${g.off} DEF ${g.def}   offRaw ${r.offRaw.toFixed(2)} drtgRef ${r.drtgRef.toFixed(3)}`)
}
const top = (k: 'd_ovr' | 'o_ovr' | 'ovr') =>
  [...PLAYERS].sort((a, b) => (b[k] as number) - (a[k] as number) || a.name.localeCompare(b.name)).slice(0, 12).map((p) => p.name)
console.log('\ntop12 def :', JSON.stringify(top('d_ovr')))
console.log('top12 off :', JSON.stringify(top('o_ovr')))
