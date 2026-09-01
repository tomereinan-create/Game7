/** recal_85 — teams whose OVR-max starting five changed when the band, breadth and tax were killed.
 *  Old OVRs come from the pre-round snapshot data/_b85.json; the shipped pool carries the new. */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const OLD = new Map<string, number>(
  (JSON.parse(readFileSync('data/_b85.json', 'utf8')) as { name: string; ovr: number }[]).map((p) => [p.name, p.ovr]),
)
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const aged = new Map(PLAYERS.map((p) => [p.name, { ...p, ovr: OLD.get(p.name) ?? p.ovr } as Player]))

const setOf = (five: (Player | null)[]) => new Set(five.filter((p): p is Player => !!p).map((p) => p.name))
let changed = 0
let total = 0
const rows: string[] = []
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  if (roster.length < 5) continue
  total++
  const a = setOf(startingFive(t.p.map((n) => aged.get(n)).filter((p): p is Player => !!p)).five)
  const b = setOf(startingFive(roster).five)
  if (a.size !== b.size || [...a].some((n) => !b.has(n))) {
    changed++
    const out = [...a].filter((n) => !b.has(n))
    const inn = [...b].filter((n) => !a.has(n))
    const d = (n: string) => `${n} (${OLD.get(n)}->${BY.get(n)?.ovr})`
    rows.push(`  ${t.y} ${t.team.padEnd(24)} IN  ${inn.map(d).join(', ')}   OUT ${out.map(d).join(', ')}`)
  }
}
console.log(`starting fives changed: ${changed} of ${total} teams (${((100 * changed) / total).toFixed(1)}%)`)
for (const r of rows) console.log(r)
