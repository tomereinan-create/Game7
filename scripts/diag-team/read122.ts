/** recal_122 — the dials the round file will quote, read through the app's own functions. */
import { PLAYERS } from '../../src/engine/pool'
import { seasonGauges } from '../../src/engine/gauges'
import { ratings100 } from '../../src/engine/offense'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const F: [string, number, string[]][] = [
  ["Warriors '17", 2017, ["Stephen Curry '17", "Kevin Durant '17", "Klay Thompson '17", "Draymond Green '17", "Zaza Pachulia '17"]],
  ["Warriors '16", 2016, ["Stephen Curry '16", "Andre Iguodala '16", "Klay Thompson '16", "Draymond Green '16", "Andrew Bogut '16"]],
  ["Warriors '15", 2015, ["Stephen Curry '15", "Andre Iguodala '15", "Klay Thompson '15", "Draymond Green '15", "Andrew Bogut '15"]],
  ["Bulls '96", 1996, ["Steve Kerr '96", "Michael Jordan '96", "Scottie Pippen '96", "Toni Kukoč '96", "Luc Longley '96"]],
  ["Pistons '04", 2004, ["Chauncey Billups '04", "Richard Hamilton '04", "Tayshaun Prince '04", "Ben Wallace '04", "Mehmet Okur '04"]],
  ["Celtics '10", 2010, ["Rajon Rondo '10", "Paul Pierce '10", "Kevin Garnett '10", "Rasheed Wallace '10", "Kendrick Perkins '10"]],
  ["Jazz '98", 1998, ["John Stockton '98", "Jeff Hornacek '98", "Bryon Russell '98", "Karl Malone '98", "Greg Ostertag '98"]],
  ["Spurs '14", 2014, ["Tony Parker '14", "Danny Green '14", "Kawhi Leonard '14", "Tiago Splitter '14", "Tim Duncan '14"]],
  ["Thunder '26", 2026, ["Shai Gilgeous-Alexander '26", "Ajay Mitchell '26", "Luguentz Dort '26", "Chet Holmgren '26", "Jaylin Williams '26"]],
  ["Cavaliers '16", 2016, ["LeBron James '16", "Kyrie Irving '16", "J.R. Smith '16", "Kevin Love '16", "Tristan Thompson '16"]],
  ["Lakers '87", 1987, ["Byron Scott '87", "Michael Cooper '87", "James Worthy '87", "Magic Johnson '87", "Kareem Abdul-Jabbar '87"]],
  ["76ers '26", 2026, ["Tyrese Maxey '26", "Quentin Grimes '26", "Kelly Oubre Jr. '26", "Dominick Barlow '26", "Joel Embiid '26"]],
  ["Pistons '26", 2026, ["Cade Cunningham '26", "Duncan Robinson '26", "Ausar Thompson '26", "Tobias Harris '26", "Jalen Duren '26"]],
  ["Celtics '24", 2024, ["Derrick White '24", "Jaylen Brown '24", "Jayson Tatum '24", "Kristaps Porziņģis '24", "Al Horford '24"]],
  ["Lakers '00", 2000, ["Ron Harper '00", "Kobe Bryant '00", "Glen Rice '00", "Robert Horry '00", "Shaquille O'Neal '00"]],
]
for (const [label, y, names] of F) {
  const ps = names.map((n) => BY.get(n))
  if (ps.some((p) => !p)) { console.log(label, 'MISSING', names.filter((n) => !BY.get(n))); continue }
  const five = ps as Player[]
  const g = seasonGauges(five, y)
  const r = ratings100(five)
  console.log(
    `${label.padEnd(14)} offdial ${g.off} defdial ${g.def} ovrdial ${Math.round((g.off + g.def) / 2)}  |  team:off ${r.off} team:def ${r.def}  |  offRaw ${r.offRaw.toFixed(2)} drtgRef ${r.drtgRef.toFixed(3)}`,
  )
}
