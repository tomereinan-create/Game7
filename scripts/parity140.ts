/** recal_140 — parity on THE SUBJECT FIVE, read rather than claimed: python vs the port. */
import { execFileSync } from 'node:child_process'
import { defenseVs, matchupMargin, scoreVs, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const A = ["Steve Nash '05", "Joe Johnson '05", "Quentin Richardson '05", "Shawn Marion '05", "Amar'e Stoudemire '05"]
const B = ["Dwyane Wade '05", "Damon Jones '05", "Eddie Jones '05", "Udonis Haslem '05", "Shaquille O'Neal '05"]
const five = (ns: string[]) => ns.map((n) => BY.get(n)!) as Player[]

const py = JSON.parse(
  execFileSync('python', ['data/parity_check.py'], { input: JSON.stringify([[A, B]]), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }),
)[0]
const ts = {
  off: teamOffense(five(A)).off,
  drtg: defenseVs(five(A), five(B)).drtg,
  steals: defenseVs(five(A), five(B)).steals,
  net: scoreVs(five(A), five(B)).net,
  margin: matchupMargin(five(A), five(B)),
}
let worst = 0
for (const k of ['off', 'drtg', 'steals', 'net', 'margin'] as const) {
  const d = Math.abs((py as any)[k] - (ts as any)[k])
  worst = Math.max(worst, d)
  console.log(`  ${k.padEnd(8)} python ${(py as any)[k].toFixed(6)}   port ${(ts as any)[k].toFixed(6)}   |Δ| ${d.toExponential(2)}`)
}
console.log(`worst |python - port| across the subject five's figures: ${worst.toExponential(2)}`)
