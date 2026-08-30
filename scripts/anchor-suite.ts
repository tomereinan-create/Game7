/**
 * ANCHOR SUITE — recal 66 (design-side round "64"; our 63/64/65 are taken).
 * Read-only measurement tooling, prepped by the scout, to be RUN by the engine
 * agent AFTER recal 65 (DFG floor re-key) merges. Run: npx tsx scripts/anchor-suite.ts
 *
 * (a) Within-season gauges (src/engine/gauges.ts seasonGauges) for the five
 *     anchor teams, judged against the round's bands, PASS/FAIL per side.
 *     A failing anchor prints its five-man engine decomposition — the round
 *     says to STOP for a ruling on a failure, not tune.
 * (b) All 30 teams of 2025: engine offRaw / drtgRef vs real wins, with
 *     Pearson r per side and the round's r >= 0.6 gate.
 *
 * COMMITTED per the recal_66 execution ruling: the round STOPPED on its own
 * protocol (bands failed -> decomposition printed, no tuning), and this tool
 * is the standing re-measurement for whichever ruling the design side returns.
 */
import { WHEEL } from '../src/data/wheel'
import { startingFive, winsOf } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { ratings100 } from '../src/engine/offense'
import { archetype, PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))

function fiveOf(year: number, name: string): { team: string; five: Player[] } {
  const t = WHEEL.find((x) => x.y === year && x.team.includes(name))
  if (!t) throw new Error(`no ${name} in ${year} on the wheel`)
  const roster = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)
  const five = startingFive(roster).five.filter((p): p is Player => !!p)
  if (five.length !== 5) throw new Error(`${t.team} ${year}: only ${five.length} men fieldable`)
  return { team: t.team, five }
}

interface Band {
  year: number
  name: string
  /** [min, max] inclusive-min, inclusive-max; null = unbounded on that end. */
  off: [number | null, number | null]
  def: [number | null, number | null]
}

const BANDS: Band[] = [
  { year: 2026, name: 'Thunder', off: [88, null], def: [95, null] },
  { year: 2025, name: 'Knicks', off: [65, 80], def: [35, 55] },
  { year: 2024, name: 'Celtics', off: [90, null], def: [85, null] },
  { year: 2025, name: 'Wizards', off: [null, 24], def: [null, 24] },
  { year: 2013, name: 'Grizzlies', off: [40, 60], def: [85, null] },
]

const inBand = (v: number, [lo, hi]: [number | null, number | null]) => (lo === null || v >= lo) && (hi === null || v <= hi)
const bandText = ([lo, hi]: [number | null, number | null]) => (lo !== null && hi !== null ? `${lo}-${hi}` : lo !== null ? `${lo}+` : `<${(hi ?? 0) + 1}`)

console.log('\n=== (a) ANCHOR GAUGES, within season ===')
let anyFail = false
for (const b of BANDS) {
  const { team, five } = fiveOf(b.year, b.name)
  const g = seasonGauges(five, b.year)
  const offOk = inBand(g.off, b.off)
  const defOk = inBand(g.def, b.def)
  if (!offOk || !defOk) anyFail = true
  console.log(
    `${team} '${String(b.year % 100).padStart(2, '0')}  OFF ${String(g.off).padStart(2)} (band ${bandText(b.off)}) ${offOk ? 'PASS' : 'FAIL'}` +
      `  ·  DEF ${String(g.def).padStart(2)} (band ${bandText(b.def)}) ${defOk ? 'PASS' : 'FAIL'}` +
      `  ·  offRaw ${g.offRaw.toFixed(1)} drtgRef ${g.drtgRef.toFixed(1)} · ${g.basis} · n=${g.n}`,
  )
  if (!offOk || !defOk) {
    console.log('  DECOMPOSITION (the round says: print this and STOP for a ruling, do not tune):')
    for (const p of five)
      console.log(
        `    ${p.name.padEnd(26)} OVR ${p.ovr}  O ${String(p.o_ovr).padStart(2)}  D ${String(p.d_ovr).padStart(2)}  ${archetype(p).padEnd(18)}` +
          ` eff ${p.attrs.efficiency} vol ${p.attrs.volume} playvol ${p.attrs.playvol} 3pt ${p.attrs['3pt']} perdef ${p.attrs.perdef} rimprot ${p.attrs.rimprot} disc ${p.attrs.discipline}`,
      )
  }
}

console.log('\n=== (b) 2025: engine vs real wins, all 30 ===')
const rows: { team: string; wins: number; offRaw: number; drtgRef: number }[] = []
for (const t of WHEEL.filter((x) => x.y === 2025)) {
  const roster = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)
  const five = startingFive(roster).five.filter((p): p is Player => !!p)
  if (five.length !== 5) {
    console.log(`  ${t.team}: cannot field five — EXCLUDED`)
    continue
  }
  const r = ratings100(five)
  rows.push({ team: t.team, wins: winsOf(t.rec), offRaw: r.offRaw, drtgRef: r.drtgRef })
}
rows.sort((a, b) => b.wins - a.wins)
for (const r of rows) console.log(`  ${r.team.padEnd(26)} W ${String(r.wins).padStart(2)}  offRaw ${r.offRaw.toFixed(1).padStart(6)}  drtgRef ${r.drtgRef.toFixed(1).padStart(6)}`)

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  return num / Math.sqrt(dx * dy)
}

const wins = rows.map((r) => r.wins)
const rOff = pearson(rows.map((r) => r.offRaw), wins)
// drtgRef is lower-better: the side passes on the correlation of -drtgRef with wins.
const rDef = pearson(rows.map((r) => -r.drtgRef), wins)
console.log(`\n  Pearson r vs wins (n=${rows.length}):  offRaw ${rOff.toFixed(3)} ${rOff >= 0.6 ? 'PASS' : 'FAIL'} (gate 0.6)  ·  -drtgRef ${rDef.toFixed(3)} ${rDef >= 0.6 ? 'PASS' : 'FAIL'} (gate 0.6)`)
if (anyFail) console.log('\n  AT LEAST ONE ANCHOR FAILED ITS BAND — the round rules: report the decomposition above and stop for a ruling.')
