/** recal_143 — parity of data/team_rating.py and src/engine/offense.ts on the SUBJECT FIVE. */
import { execFileSync } from 'node:child_process'
import { PLAYERS } from '../src/engine/pool'
import { defenseVs, matchupMargin, scoreVs, teamOffense } from '../src/engine/offense'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const PHO = ["Steve Nash '05", "Joe Johnson '05", "Quentin Richardson '05", "Shawn Marion '05", "Amar'e Stoudemire '05"]
const MIA = ["Damon Jones '05", "Dwyane Wade '05", "Eddie Jones '05", "Udonis Haslem '05", "Shaquille O'Neal '05"]
const CHI = ["Steve Kerr '96", "Michael Jordan '96", "Scottie Pippen '96", "Toni Kukoč '96", "Luc Longley '96"]
const GSW = ["Stephen Curry '17", "Kevin Durant '17", "Klay Thompson '17", "Draymond Green '17", "Zaza Pachulia '17"]
const pairs = [[PHO, MIA], [PHO, CHI], [CHI, GSW], [GSW, PHO], [MIA, PHO]]
const five = (ns: string[]) => ns.map((n) => BY.get(n)!) as Player[]

const py = JSON.parse(
  execFileSync('python', ['data/parity_check.py'], { input: JSON.stringify(pairs), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }),
) as { off: number; drtg: number; steals: number; net: number; margin: number }[]

let worst = 0
console.log(`pair                       field        python            port          |Δ|`)
pairs.forEach(([a, b], i) => {
  const A = five(a), B = five(b)
  const ts = { off: teamOffense(A).off, drtg: defenseVs(A, B).drtg, steals: defenseVs(A, B).steals, net: scoreVs(A, B).net, margin: matchupMargin(A, B) }
  for (const k of ['off', 'drtg', 'steals', 'net', 'margin'] as const) {
    const d = Math.abs((py[i] as any)[k] - (ts as any)[k])
    worst = Math.max(worst, d)
    console.log(`  ${String(i).padEnd(2)} ${k.padEnd(8)} ${(py[i] as any)[k].toFixed(6).padStart(16)} ${(ts as any)[k].toFixed(6).padStart(16)}  ${d.toExponential(1)}`)
  }
})
console.log(`\nworst |python - port| over ${pairs.length} pairs x 5 figures: ${worst.toExponential(2)}`)
