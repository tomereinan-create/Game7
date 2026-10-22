/**
 * recal_232 proof: every team-season's five through bestfive.ts `teamFive` against the baseline
 * base232.ts wrote BEFORE the round (strict `startingFive`, same JSON shape).
 *   1. the 1,255 strictly fieldable fives: same men in the same slots, and offRaw / drtgRef / the
 *      unrounded dial / OFF / DEF / OVR all EXACTLY equal (===, no tolerance);
 *   2. the 15 short rosters still read "needs five";
 *   3. the 44 re-solved: the five with its stand-ins, the dials without and with the penalty, and
 *      the season rank (seasonRank.ts, which now pools through teamFive);
 *   4. collateral of the display-only season rank: strict teams whose "#n in YYYY" label moved
 *      because a re-solved club joined their season's pool.
 *    npx vite-node scripts/diag-team/after232.ts <before.json> [after.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { WHEEL } from '../../src/data/wheel'
import { PLAYERS } from '../../src/engine/pool'
import { startingFive, teamFive } from '../../src/engine/bestfive'
import { seasonGauges, dialOvrRaw } from '../../src/engine/gauges'
import { ratings100 } from '../../src/engine/offense'
import { eligible, oneStepFrom, POSITIONS } from '../../src/engine/positions'
import { seasonRank } from '../../src/engine/seasonRank'
import { LINES } from '../../src/ui/Stat'
import type { Player } from '../../src/engine/types'

type G = { off: number; def: number; ovr: number; offRaw: number; drtgRef: number; dial: number }
type Rec = { team: string; n: number; five: (string | null)[]; gauge: G | null }
const before = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Record<string, Rec>
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const gaugeOf = (men: Player[], y: number): G => {
  const g = seasonGauges(men, y)
  return { off: g.off, def: g.def, ovr: Math.round((g.off + g.def) / 2), offRaw: g.offRaw, drtgRef: g.drtgRef, dial: dialOvrRaw(men, y) }
}
const short = (n: string) => n.replace(/ '\d\d$/, '')
const strip = (p: Player): Player => BY.get(p.name)!

const out: Record<string, Rec & { oop?: (string | null)[] }> = {}
let strictSame = 0
let strictChanged = 0
let shortStill = 0
const changed: string[] = []
const rows: string[] = []
const resolved: { key: string; y: number; ab: string; men: Player[] }[] = []
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const key = `${t.y} ${t.ab}`
  const b = before[key]
  const { five } = teamFive(roster)
  const full = five.every(Boolean)
  const men = five.filter((p): p is Player => !!p)
  const g = full ? gaugeOf(men, t.y) : null
  out[key] = { team: t.team, n: roster.length, five: five.map((p) => (p ? p.name : null)), oop: five.map((p) => p?.oop ?? null), gauge: g }
  if (b.gauge) {
    // strict before: everything must be identical, bit for bit
    const same =
      JSON.stringify(b.five) === JSON.stringify(out[key].five) &&
      men.every((p) => !p.oop) &&
      !!g &&
      (['off', 'def', 'ovr', 'offRaw', 'drtgRef', 'dial'] as const).every((k) => Object.is(b.gauge![k], g[k]))
    if (same) strictSame++
    else {
      strictChanged++
      changed.push(key)
    }
    continue
  }
  if (roster.length < 5) {
    if (!full) shortStill++
    continue
  }
  // a re-solved club
  resolved.push({ key, y: t.y, ab: t.ab, men })
}

// the 44 table
console.log('| team | out of position | five (stand-in: listed position at seat) | OFF / DEF / OVR, no penalty | OFF / DEF / OVR, with 0.13 per man | drtgRef no pen -> pen | season rank OFF / DEF / OVR |')
console.log('|---|---|---|---|---|---|---|')
const tableRows: unknown[] = []
for (const r of resolved) {
  const t = WHEEL.find((x) => `${x.y} ${x.ab}` === r.key)!
  const k = r.men.filter((p) => p.oop).length
  const g0 = gaugeOf(r.men.map(strip), r.y)
  const g1 = gaugeOf(r.men, r.y)
  const sr = seasonRank(r.men, r.y, r.ab)!
  const tag = r.men
    .map((p, i) => (p.oop ? `*${short(p.name)} (${oneStepFrom(eligible(LINES[p.name]?.pos), POSITIONS[i])} at ${p.oop})` : short(p.name)))
    .join(' · ')
  const line = `| ${t.team} '${String(t.y).slice(2)} | ${k} | ${tag} | ${g0.off} / ${g0.def} / ${g0.ovr} | ${g1.off} / ${g1.def} / ${g1.ovr} | ${g0.drtgRef.toFixed(3)} -> ${g1.drtgRef.toFixed(3)} | #${sr.off} / #${sr.def} / #${sr.ovr} of ${sr.of} |`
  rows.push(line)
  console.log(line)
  tableRows.push({ team: `${t.team} '${String(t.y).slice(2)}`, key: r.key, oop: k, five: r.men.map((p) => (p.oop ? `${p.name}@${p.oop}` : p.name)), noPen: g0, pen: g1, rank: sr })
  // the penalty is exactly 0.13 per marked man on drtgRef and nothing on offRaw
  const d = g1.drtgRef - g0.drtgRef
  if (Math.abs(d - 0.13 * k) > 1e-9 || g1.offRaw !== g0.offRaw) console.log(`   !! penalty mismatch on ${r.key}: drtgRef +${d} offRaw ${g0.offRaw} -> ${g1.offRaw}`)
}

// season-rank collateral: strict teams whose label moved because their season's pool grew
const strictPool = (y: number) =>
  WHEEL.filter((t) => t.y === y)
    .map((t) => ({ t, f: startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five }))
    .filter((x) => x.f.every(Boolean))
    .map((x) => {
      const r = ratings100(x.f as Player[])
      return { ab: x.t.ab, off: r.offRaw, def: r.drtgRef, ovr: dialOvrRaw(x.f as Player[], y) }
    })
let labelMoves = 0
const moved: string[] = []
const seasons = [...new Set(resolved.map((r) => r.y))].sort()
for (const y of seasons) {
  const pool = strictPool(y)
  for (const t of WHEEL.filter((x) => x.y === y)) {
    const k = `${t.y} ${t.ab}`
    if (!before[k].gauge) continue
    const men = before[k].five.map((n) => BY.get(n!)!) as Player[]
    const me = pool.find((e) => e.ab === t.ab)!
    const rest = pool.filter((e) => e.ab !== t.ab)
    const old = {
      off: 1 + rest.filter((e) => e.off > me.off).length,
      def: 1 + rest.filter((e) => e.def < me.def).length,
      ovr: 1 + rest.filter((e) => e.ovr > me.ovr).length,
    }
    const now = seasonRank(men, y, t.ab)!
    if (now.off !== old.off || now.def !== old.def || now.ovr !== old.ovr) {
      labelMoves++
      moved.push(`${t.team} '${String(y).slice(2)}: OFF #${old.off}->#${now.off} DEF #${old.def}->#${now.def} OVR #${old.ovr}->#${now.ovr} (of ${rest.length + 1}->${now.of})`)
    }
  }
}

console.log('')
console.log(`team-seasons ${WHEEL.length}`)
console.log(`strict fives identical (men, slots, offRaw, drtgRef, dial, OFF, DEF, OVR — exact): ${strictSame}; changed: ${strictChanged}${changed.length ? ` -> ${changed.join(', ')}` : ''}`)
console.log(`short rosters still "needs five": ${shortStill}`)
console.log(`re-solved and fielded: ${resolved.length} (one out of position: ${resolved.filter((r) => r.men.filter((p) => p.oop).length === 1).length}, two: ${resolved.filter((r) => r.men.filter((p) => p.oop).length === 2).length})`)
console.log(`seasons whose rank pool grew: ${seasons.length}; strict teams whose season-rank label moved (display only): ${labelMoves}`)
if (process.argv.includes('-v')) for (const m of moved) console.log(`   ${m}`)
if (process.argv[3] && !process.argv[3].startsWith('-')) writeFileSync(process.argv[3], JSON.stringify({ out, table: tableRows, moved }, null, 1))
