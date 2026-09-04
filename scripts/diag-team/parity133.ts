/** recal_133 — the parity receipt on THE SUBJECT FIVE and the pinned fives it must not disturb. */
import { execFileSync } from 'node:child_process'
import { PLAYERS } from '../../src/engine/pool'
import { scoreVs, defenseVs, teamOffense, MKNOBS } from '../../src/engine/offense'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const F: Record<string, string[]> = {
  "76ers '85": ["Maurice Cheeks '85", "Julius Erving '85", "Bobby Jones '85", "Charles Barkley '85", "Moses Malone '85"],
  "Bulls '96": ["Steve Kerr '96", "Michael Jordan '96", "Scottie Pippen '96", "Toni Kukoč '96", "Luc Longley '96"],
  "Warriors '17": ["Stephen Curry '17", "Kevin Durant '17", "Klay Thompson '17", "Draymond Green '17", "Zaza Pachulia '17"],
  "Pistons '04": ["Chauncey Billups '04", "Richard Hamilton '04", "Tayshaun Prince '04", "Ben Wallace '04", "Mehmet Okur '04"],
  "Thunder '26": ["Shai Gilgeous-Alexander '26", "Ajay Mitchell '26", "Luguentz Dort '26", "Chet Holmgren '26", "Jaylin Williams '26"],
  "Celtics '24": ["Derrick White '24", "Jaylen Brown '24", "Jayson Tatum '24", "Kristaps Porziņģis '24", "Al Horford '24"],
}
console.log(`MKNOBS.ANCHOR_2ND = ${MKNOBS.ANCHOR_2ND}   MKNOBS.DIDX_HOLD = ${MKNOBS.DIDX_HOLD}`)
const names = Object.keys(F)
const pairs: [string[], string[]][] = []
for (let i = 0; i < names.length; i++) pairs.push([F[names[i]], F[names[(i + 1) % names.length]]])

const out = JSON.parse(
  execFileSync('python', ['data/parity_check.py'], {
    input: JSON.stringify(pairs), encoding: 'utf8', maxBuffer: 1 << 24,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  }),
)
let worst = 0
pairs.forEach((pr, i) => {
  const us = pr[0].map((n) => BY.get(n) as Player)
  const them = pr[1].map((n) => BY.get(n) as Player)
  if (us.some((p) => !p) || them.some((p) => !p)) throw new Error('missing card in ' + names[i])
  const ts = scoreVs(us, them)
  const d = defenseVs(us, them)
  const o = teamOffense(us)
  const py = out[i]
  const diffs = [Math.abs(py.off - o.off), Math.abs(py.drtg - d.drtg), Math.abs(py.steals - d.steals), Math.abs(py.net - ts.net)]
  worst = Math.max(worst, ...diffs)
  console.log(
    `${names[i].padEnd(13)} vs ${names[(i + 1) % names.length].padEnd(13)}  py drtg ${py.drtg.toFixed(6)} net ${py.net.toFixed(6)}  |  ts drtg ${d.drtg.toFixed(6)} net ${ts.net.toFixed(6)}  |  max |d| ${Math.max(...diffs).toExponential(2)}`,
  )
})
console.log(`\nworst py/ts disagreement across the subject five and the five pinned fives: ${worst.toExponential(3)} pts`)
if (worst > 1e-9) { console.error('PARITY BROKEN'); process.exit(1) }
