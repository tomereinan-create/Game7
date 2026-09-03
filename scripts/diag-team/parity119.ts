/**
 * recal_119 — THE PARITY READING ON THE SUBJECT FIVE. tests/parity.test.ts samples 50 random
 * pairs; this pins the round's own five: the Celtics '24 best legal five is fed through
 * data/parity_check.py (which exec's data/team_rating.py, the source of truth) and through
 * src/engine/offense.ts, and the two are printed side by side.
 *
 *   npx vite-node scripts/diag-team/parity119.ts
 */
import { execFileSync } from 'node:child_process'
import { defenseVs, matchupMargin, ratings100, scoreVs, teamOffense } from '../../src/engine/offense'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const SUBJECT = ["Derrick White '24", "Jaylen Brown '24", "Jayson Tatum '24", "Kristaps Porziņģis '24", "Al Horford '24"]
const OPP = ["Jamal Murray '24", "Kentavious Caldwell-Pope '24", "Michael Porter Jr. '24", "Aaron Gordon '24", "Nikola Jokić '24"]
const five = (n: string[]) => n.map((x) => BY.get(x)!) as Player[]
const A = five(SUBJECT)
const B = five(OPP)

const py = JSON.parse(
  execFileSync('python', ['data/parity_check.py'], { input: JSON.stringify([[SUBJECT, OPP], [OPP, SUBJECT]]), encoding: 'utf8' }),
) as { off: number; drtg: number; steals: number; net: number; margin: number }[]

const ts = [
  { off: teamOffense(A).off, drtg: defenseVs(A, B).drtg, steals: defenseVs(A, B).steals, net: scoreVs(A, B).net, margin: matchupMargin(A, B) },
  { off: teamOffense(B).off, drtg: defenseVs(B, A).drtg, steals: defenseVs(B, A).steals, net: scoreVs(B, A).net, margin: matchupMargin(B, A) },
]
const labels = ['Celtics \'24 vs Nuggets \'24', 'Nuggets \'24 vs Celtics \'24']
let worst = 0
for (const [i, l] of labels.entries()) {
  console.log(l)
  for (const k of ['off', 'drtg', 'steals', 'net', 'margin'] as const) {
    const d = Math.abs((py[i] as never as Record<string, number>)[k] - (ts[i] as never as Record<string, number>)[k])
    worst = Math.max(worst, d)
    console.log(`  ${k.padEnd(7)} python ${(py[i] as never as Record<string, number>)[k].toFixed(6).padStart(12)}   port ${(ts[i] as never as Record<string, number>)[k].toFixed(6).padStart(12)}   |diff| ${d.toExponential(2)}`)
  }
}
const o = teamOffense(A)
console.log(`\nCeltics '24 decomposition: base ${o.base.toFixed(2)}  +ft ${o.ftPts.toFixed(2)}  x tov ${o.tovMult.toFixed(4)}  x orb ${o.orbMult.toFixed(4)}  = offRaw ${o.off.toFixed(2)}   team:off ${ratings100(A).off}`)
console.log(`worst |python - port| across the subject five: ${worst.toExponential(2)}`)
