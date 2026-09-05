/** recal_142 scan: minutes-five vs startingFive on tiers 1-2, and the ordering keys. */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startingFive } from '../../src/engine/bestfive'
import { seasonGauges } from '../../src/engine/gauges'
import { ratings100 } from '../../src/engine/offense'
import { eligible } from '../../src/engine/positions'
import type { Player } from '../../src/engine/types'

const here = dirname(fileURLToPath(import.meta.url))
const R = (f: string) => JSON.parse(readFileSync(join(here, '..', '..', f), 'utf8'))
const players = R('src/data/players_stats.json') as Player[]
const BY = new Map(players.map((p) => [p.name, p]))
const stats = R('src/data/stats.json') as Record<string, { gp?: number; mpg?: number; apg?: number; pos?: string[] } | null>
const wheel = R('src/data/teamseasons.json') as { y: number; c: string; team: string; ab: string; p: string[] }[]
const camp = R('src/data/campaigns.json') as { id: string; levels: { team: string; ab: string; season?: number; record?: string; players: Player[] }[] }[]

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
type P5 = (typeof POS)[number]
const minutes = (n: string) => { const s = stats[n]; return s && s.gp && s.mpg ? s.gp * s.mpg : 0 }
const strict = (n: string): P5[] => eligible(stats[n]?.pos)
const loose = (n: string): P5[] => { const o = new Set<P5>(); for (const p of strict(n)) { const i = POS.indexOf(p); o.add(p); if (i > 0) o.add(POS[i - 1]); if (i < 4) o.add(POS[i + 1]) } return [...o] }
const anyp = (): P5[] => [...POS]
function lineupWith(ranked: string[], can: (n: string) => P5[]): string[] | null {
  const assign = (names: string[]): string[] | null => {
    const order = new Array<string>(5); const used = new Set<string>()
    const go = (i: number): boolean => { if (i === 5) return true
      for (const n of names) { if (used.has(n) || !can(n).includes(POS[i])) continue; used.add(n); order[i] = n; if (go(i + 1)) return true; used.delete(n) } return false }
    return go(0) ? order : null }
  for (let k = 5; k <= ranked.length; k++) {
    const head = ranked.slice(0, k); const subsets: string[][] = []
    const pick = (s: number, acc: string[]) => { if (acc.length === 5) { subsets.push(acc); return } for (let j = s; j < head.length; j++) pick(j + 1, [...acc, head[j]]) }
    pick(0, [])
    subsets.sort((a, b) => b.reduce((s, n) => s + minutes(n), 0) - a.reduce((s, n) => s + minutes(n), 0))
    for (const s of subsets) { const a = assign(s); if (a) return a }
  }
  return null
}
const lineup = (r: string[]) => lineupWith(r, strict) ?? lineupWith(r, loose) ?? lineupWith(r, anyp)
const sfive = (names: string[]): Player[] | null => {
  const f = startingFive(names.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  return f.length === 5 ? f : null
}
const net = (f: Player[]) => { const r = ratings100(f); return r.offRaw - r.drtgRef }
const dovr = (f: Player[], y: number) => { const g = seasonGauges(f, y); return { ovr: Math.round((g.off + g.def) / 2), off: g.off, def: g.def } }

// ---- how many tier1/2 team-seasons change men, and how many can't field a strict five
const ladder: { tier: number; team: string; ab: string; y: number; old: Player[]; nu: Player[] | null }[] = []
for (const ti of [0, 1]) for (const l of camp[ti].levels) {
  const ts = wheel.find((t) => t.y === l.season && t.ab === l.ab)!
  const ranked = [...ts.p].filter((n) => BY.has(n)).sort((a, b) => minutes(b) - minutes(a))
  const old = lineup(ranked)!.map((n) => BY.get(n)!)
  ladder.push({ tier: ti + 1, team: l.team, ab: l.ab, y: l.season!, old, nu: sfive(ts.p) })
}
const setOf = (f: Player[]) => f.map((p) => p.name).sort().join('|')
const changed = ladder.filter((x) => x.nu && setOf(x.old) !== setOf(x.nu))
const nofive = ladder.filter((x) => !x.nu)
console.log(`tier1+2 levels: ${ladder.length}; men changed: ${changed.length}; cannot field a STRICT five: ${nofive.length}`)
for (const x of nofive) console.log(`  NO STRICT FIVE: ${x.team} ${x.y}`)

console.log('\n--- every changed five (tier, team, dial before -> after)')
for (const x of changed) {
  const a = dovr(x.old, x.y), b = dovr(x.nu!, x.y)
  const inn = x.nu!.filter((p) => !x.old.some((q) => q.name === p.name)).map((p) => p.name)
  const out = x.old.filter((p) => !x.nu!.some((q) => q.name === p.name)).map((p) => p.name)
  console.log(`T${x.tier} ${x.team.padEnd(30)} OVR ${String(a.ovr).padStart(2)}->${String(b.ovr).padStart(2)} (${a.off}/${a.def} -> ${b.off}/${b.def})  +[${inn.join(', ')}]  -[${out.join(', ')}]`)
}

// ---- tier 2 ordering: current key (net on minutes five) vs new key (dial ovr on startingFive)
const t2 = ladder.filter((x) => x.tier === 2)
const rows = t2.map((x) => { const f = x.nu ?? x.old; const d = dovr(f, x.y); return { team: x.team, y: x.y, five: f, key: d.ovr, off: d.off, def: d.def, net: net(f) } })
const asc = [...rows].sort((a, b) => a.key - b.key || a.net - b.net)
console.log('\n--- NEW tier 2 order (first 10 / last 10)')
asc.forEach((r, i) => { if (i < 10 || i >= 50) console.log(`  L${String(i + 1).padStart(2)} ${r.team.padEnd(30)} OVR ${String(r.key).padStart(2)} (${r.off}/${r.def}) net ${r.net.toFixed(2)}`) })
const ties = new Map<number, number>()
for (const r of rows) ties.set(r.key, (ties.get(r.key) ?? 0) + 1)
console.log(`\n  distinct dial-OVR values on tier 2: ${ties.size} of 60; largest tie group ${Math.max(...ties.values())}`)
