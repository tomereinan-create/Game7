/** recal_142: which slot the seven no-strict-five rosters cannot cover. */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startingFive } from '../../src/engine/bestfive'
import { eligible, POSITIONS } from '../../src/engine/positions'
import type { Player } from '../../src/engine/types'

const here = dirname(fileURLToPath(import.meta.url))
const R = (f: string) => JSON.parse(readFileSync(join(here, '..', '..', f), 'utf8'))
const players = R('src/data/players_stats.json') as Player[]
const BY = new Map(players.map((p) => [p.name, p]))
const stats = R('src/data/stats.json') as Record<string, { pos?: string[] } | null>
const wheel = R('src/data/teamseasons.json') as { y: number; team: string; ab: string; p: string[] }[]

const want: [string, number][] = [
  ['MEM', 2026], ['DAL', 2026], ['NOP', 2026], ['GSW', 2026], ['MIN', 2026], ['CLE', 2026], ['GSW', 2018],
]
for (const [ab, y] of want) {
  const t = wheel.find((x) => x.ab === ab && x.y === y)!
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const sf = startingFive(roster).five
  const filled = sf.map((p, i) => (p ? '' : POSITIONS[i])).filter(Boolean)
  const counts = POSITIONS.map((s) => `${s}:${roster.filter((p) => eligible(stats[p.name]?.pos).includes(s)).length}`)
  console.log(`${t.team} ${y}  roster ${roster.length}  hole ${filled.join(',')}  [${counts.join(' ')}]`)
  console.log(`   ${roster.map((p) => `${p.name}(${eligible(stats[p.name]?.pos).join('/')})`).join(', ')}`)
}
