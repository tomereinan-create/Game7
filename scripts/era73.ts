/** recal_73 (design-side "68") diagnostics:
 *  (a) Philly '88 five-term decomposition — why does a 36-46 team read OFF 97 all-time?
 *  (b) 30-team OFF/DEF raw-index correlation, 1988 and 2026 (the mirrored-split check).
 *  (c) addendum-3's reference-defense response re-measured ACROSS ERAS (was flat within 2026).
 *  Read-only. */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { creation, defenseVs, KNOBS, ratings100, REF_FIVE, teamOffense } from '../src/engine/offense'
import { seasonGauges } from '../src/engine/gauges'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const K = KNOBS
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

const fiveOf = (y: number, nm: string) => {
  const t = WHEEL.find((x) => x.y === y && x.team.includes(nm))!
  return { team: t.team, five: startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p) }
}

function decompose(team: string, five: Player[], y: number) {
  const A = five.map((p) => p.attrs)
  const u = A.map((a) => a.usg_raw)
  const e = A.map((a) => a.ts_rel ?? a.ts_raw)
  const c = A.map(creation)
  const delta = K.TEAM_USG - u.reduce((s, x) => s + x, 0)
  const w = delta >= 0 ? c.map((ci, i) => Math.max(0.05, ci) * u[i]) : u.map((ui) => Math.max(0, ui - 12))
  const W = w.reduce((s, x) => s + x, 0) || 1
  let u2 = u.map((ui, i) => Math.max(K.FLOOR_USG, ui + (delta * w[i]) / W))
  const s = u2.reduce((a, b) => a + b, 0)
  u2 = u2.map((x) => (x * K.TEAM_USG) / s)
  const e2 = u.map((ui, i) => {
    const d = u2[i] - ui
    if (d >= 0) return e[i] * (1 - ((K.SLOPE_UP_MAX - (K.SLOPE_UP_MAX - K.SLOPE_UP_MIN) * c[i]) * d) / 100)
    return e[i] * (1 + (K.SLOPE_DOWN * clamp((e[i] - 0.545) / 0.1, 0, 1) * -d) / 100)
  })
  const o = teamOffense(five)
  const core = u2.reduce((acc, ui, i) => acc + ui * e[i], 0) * 2
  const baseN = u2.reduce((acc, ui, i) => acc + ui * e2[i], 0) * 2
  const orbPts = A.reduce((acc, a) => acc + Math.max(0, a.orb - 50), 0)
  const g = seasonGauges(five, y)
  console.log(`\n=== ${team} '${String(y % 100).padStart(2, '0')} ===`)
  for (let i = 0; i < 5; i++)
    console.log(`  ${five[i].name.padEnd(26)} O ${String(five[i].o_ovr).padStart(2)}  usg ${u[i].toFixed(1)}  TS ${(100 * e[i]).toFixed(1)}  3pt ${String(A[i]['3pt']).padStart(2)}  orb ${String(A[i].orb).padStart(2)}  fouldraw ${A[i].fouldraw}  ft ${A[i].ft}`)
  console.log(`  core ${core.toFixed(2)} · recon ${(baseN - core).toFixed(2)} · fit ${(o.base - baseN).toFixed(2)} · ftPts ${o.ftPts.toFixed(2)} · orbPts ${orbPts} -> orbMult ${o.orbMult.toFixed(4)} (+${(o.off - o.off / o.orbMult).toFixed(1)}) => OFF ${o.off.toFixed(2)} · gauge ${g.off} (${g.basis}) · DEF gauge ${g.def}`)
  return o.off
}

const phi = fiveOf(1988, '76ers')
decompose(phi.team, phi.five, 1988)

// (b) the mirrored-split correlations
const pear = (xs: number[], ys: number[]) => {
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length
  const my = ys.reduce((s, x) => s + x, 0) / ys.length
  let n = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    n += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  return n / Math.sqrt(dx * dy)
}
for (const y of [1988, 2026]) {
  const rows: { team: string; off: number; drtg: number }[] = []
  for (const t of WHEEL.filter((x) => x.y === y)) {
    const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
    if (five.length !== 5) continue
    const r = ratings100(five)
    rows.push({ team: t.team, off: r.offRaw, drtg: r.drtgRef })
  }
  // OFF index vs DEF index: use -drtg so "good defense" is positive; the round's mirrored-split
  // suspicion = strong NEGATIVE corr(OFF, DEF-goodness).
  const c1 = pear(rows.map((r) => r.off), rows.map((r) => -r.drtg))
  console.log(`\n${y}: corr(OFF index, DEF goodness) over ${rows.length} fives = ${c1.toFixed(3)}`)
  for (const r of [...rows].sort((a, b) => b.off - a.off).slice(0, 4)) console.log(`  ${r.team.padEnd(24)} off ${r.off.toFixed(1)} drtg ${r.drtg.toFixed(2)}`)
}

// (c) addendum-3 cross-era: the reference-defense response over the FULL wheel
const REFG = REF_FIVE.map((p) => (p.name === 'Avg C' ? { ...p, attrs: { ...p.attrs, rimprot: 88 } } : p))
const allows: { y: number; team: string; allow: number; hides: number; off: number }[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  allows.push({ y: t.y, team: t.team, allow: defenseVs(REFG, five).drtg, hides: five.filter((p) => p.attrs['3pt'] < 45).length, off: teamOffense(five).off })
}
const av = allows.map((r) => r.allow)
console.log(`\naddendum-3 cross-era: REFG response over ${allows.length} fives spans ${(Math.max(...av) - Math.min(...av)).toFixed(2)} pts (min ${Math.min(...av).toFixed(2)} max ${Math.max(...av).toFixed(2)})`)
const byEra = (a: number, b: number) => allows.filter((r) => r.y >= a && r.y <= b)
for (const [a, b] of [[1980, 1989], [1990, 1999], [2000, 2009], [2010, 2019], [2020, 2026]] as const) {
  const rs = byEra(a, b)
  const m = rs.reduce((s, r) => s + r.allow, 0) / rs.length
  const hm = rs.reduce((s, r) => s + r.hides, 0) / rs.length
  console.log(`  ${a}-${b}: mean allow ${m.toFixed(2)} · mean hide-eligible ${hm.toFixed(2)}`)
}
const phiA = allows.find((r) => r.y === 1988 && /76ers/.test(r.team))!
console.log(`  Philly '88: allow ${phiA.allow.toFixed(2)}, hide-eligible ${phiA.hides} — candidate (off+allow-110) would read ${(phiA.off + phiA.allow - 110).toFixed(2)} vs off ${phiA.off.toFixed(2)}`)

// (d) item-4 diagnostic: Philly '88 on BOTH scales
const p88rows: { team: string; off: number; drtg: number }[] = []
for (const t of WHEEL.filter((x) => x.y === 1988)) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length === 5) p88rows.push({ team: t.team, off: teamOffense(five).off, drtg: defenseVs(five, REF_FIVE).drtg })
}
const me = p88rows.find((r) => /76ers/.test(r.team))!
const pctOf = (xs: number[], v: number, lower = false) => Math.round((100 * xs.filter((x) => (lower ? x > v : x < v)).length) / Math.max(1, xs.length - 1))
console.log(`\nPhilly '88 within-season DIAGNOSTIC (n=${p88rows.length}): OFF pctl ${pctOf(p88rows.map((r) => r.off), me.off)} (band 35-60) · DEF pctl ${pctOf(p88rows.map((r) => r.drtg), me.drtg, true)} (band 30-55)`)
