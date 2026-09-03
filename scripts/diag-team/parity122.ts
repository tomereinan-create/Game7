/** recal_122 — the parity receipt on THE SUBJECT FIVE and its five reference opponents. */
import { execFileSync } from 'node:child_process'
import { PLAYERS } from '../../src/engine/pool'
import { scoreVs, defenseVs, teamOffense } from '../../src/engine/offense'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const F: Record<string, string[]> = {
  "Warriors '17": ["Stephen Curry '17", "Kevin Durant '17", "Klay Thompson '17", "Draymond Green '17", "Zaza Pachulia '17"],
  "Bulls '96": ["Steve Kerr '96", "Michael Jordan '96", "Scottie Pippen '96", "Toni Kukoč '96", "Luc Longley '96"],
  "Pistons '04": ["Chauncey Billups '04", "Richard Hamilton '04", "Tayshaun Prince '04", "Ben Wallace '04", "Mehmet Okur '04"],
  "Celtics '10": ["Rajon Rondo '10", "Paul Pierce '10", "Kevin Garnett '10", "Rasheed Wallace '10", "Kendrick Perkins '10"],
  "Jazz '98": ["John Stockton '98", "Jeff Hornacek '98", "Bryon Russell '98", "Karl Malone '98", "Greg Ostertag '98"],
  "Thunder '26": ["Shai Gilgeous-Alexander '26", "Ajay Mitchell '26", "Luguentz Dort '26", "Chet Holmgren '26", "Jaylin Williams '26"],
}
const names = Object.keys(F)
const pairs: [string[], string[]][] = []
for (let i = 0; i < names.length; i++) pairs.push([F[names[i]], F[names[(i + 1) % names.length]]])

const out = JSON.parse(
  execFileSync('python', ['data/parity_check.py'], { input: JSON.stringify(pairs), encoding: 'utf8', maxBuffer: 1 << 24 }),
)
let worst = 0
pairs.forEach((pr, i) => {
  const us = pr[0].map((n) => BY.get(n) as Player)
  const them = pr[1].map((n) => BY.get(n) as Player)
  const ts = scoreVs(us, them)
  const d = defenseVs(us, them)
  const o = teamOffense(us)
  const py = out[i]
  const diffs = [Math.abs(py.off - o.off), Math.abs(py.drtg - d.drtg), Math.abs(py.steals - d.steals), Math.abs(py.net - ts.net)]
  worst = Math.max(worst, ...diffs)
  console.log(
    `${names[i].padEnd(13)} vs ${names[(i + 1) % names.length].padEnd(13)}  py off ${py.off.toFixed(4)} drtg ${py.drtg.toFixed(4)} net ${py.net.toFixed(4)}  |  ts off ${o.off.toFixed(4)} drtg ${d.drtg.toFixed(4)} net ${ts.net.toFixed(4)}  |  max |d| ${Math.max(...diffs).toExponential(2)}`,
  )
})
console.log(`\nworst disagreement across the subject five and its five opponents: ${worst.toExponential(3)} pts`)
