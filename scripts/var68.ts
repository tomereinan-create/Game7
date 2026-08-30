/** recal_68 addenda 1+2 — the 2026 VARIANCE TABLES (item 3 OFF / item 4 DEF) and the DEF
 *  decomposition for Philadelphia/OKC/Boston vs the FIXED reference five. Read-only. */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { creation, defenseVs, KNOBS, MKNOBS, REF_FIVE, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const K = KNOBS
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** OFF terms, additive: off = core + recon + fit + ftPts + orbEff. */
function offTerms(five: Player[]) {
  const A = five.map((p) => p.attrs)
  const u = A.map((a) => a.usg_raw)
  const e = A.map((a) => a.ts_rel ?? a.ts_raw)
  const c = A.map(creation)
  const delta = K.TEAM_USG - u.reduce((s, x) => s + x, 0)
  const w = delta >= 0 ? c.map((ci, i) => Math.max(0.05, ci) * u[i]) : u.map((ui) => Math.max(0, ui - 12))
  const W = w.reduce((s, x) => s + x, 0) || 1
  let u2 = u.map((ui, i) => Math.max(K.FLOOR_USG, ui + (delta * w[i]) / W))
  const sum = u2.reduce((a, b) => a + b, 0)
  u2 = u2.map((x) => (x * K.TEAM_USG) / sum)
  const e2 = u.map((ui, i) => {
    const d = u2[i] - ui
    if (d >= 0) return e[i] * (1 - ((K.SLOPE_UP_MAX - (K.SLOPE_UP_MAX - K.SLOPE_UP_MIN) * c[i]) * d) / 100)
    const gate = clamp((e[i] - 0.545) / 0.1, 0, 1)
    return e[i] * (1 + (K.SLOPE_DOWN * gate * -d) / 100)
  })
  const o = teamOffense(five)
  const core = u2.reduce((acc, ui, i) => acc + ui * e[i], 0) * 2
  const baseN = u2.reduce((acc, ui, i) => acc + ui * e2[i], 0) * 2
  const recon = baseN - core
  const fit = o.base - baseN
  const orbEff = o.off - o.off / o.orbMult
  // star repriced down? (measurable star tier: usg_raw >= 27 OR volume >= 90)
  let starDown = 0
  for (let i = 0; i < 5; i++) if ((u[i] >= 27 || A[i].volume >= 90) && e2[i] < e[i]) starDown = Math.max(starDown, 100 * (e[i] - e2[i]))
  return { off: o.off, core, recon, fit, ftPts: o.ftPts, orbEff, combined: recon + fit, delta, starDown }
}

/** DEF terms in DRtg points (negative = better defense): drtg = 110 + perdefT + coverT + anchorT + stealsT + glassT + discPts (+huntPen 0 vs REF). */
function defTerms(five: Player[]) {
  const d = defenseVs(five, REF_FIVE)
  const C = MKNOBS.DRTG_COEF
  const A = five.map((p) => p.attrs)
  const perdefCore = A.reduce((s, a) => s + a.perdef, 0) / 5
  const coverT = -C * 0.42 * (d.cover / 5)
  const perdefT = -C * (0.42 * perdefCore - 0.42 * 55) // centered on the 55 rebase with the rest folded into constants
  const anchorT = -C * 0.26 * d.anchor * 0.9
  const stealsT = -C * 0.2 * Math.min(99, d.steals) * 0.9
  const glassT = -C * 0.12 * Math.max(0, 60 + d.glass / 4)
  return { drtg: d.drtg, perdefCore, perdefT, coverT, anchorT, stealsT, glassT, discPts: d.discPts, huntPen: d.huntPen, anchor: d.anchor, cover: d.cover, steals: d.steals, glass: d.glass, hide: d.hide }
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const cov = (xs: number[], ys: number[]) => {
  const mx = mean(xs)
  const my = mean(ys)
  return mean(xs.map((x, i) => (x - mx) * (ys[i] - my)))
}

const fives: { team: string; five: Player[] }[] = []
for (const t of WHEEL.filter((x) => x.y === 2026)) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length === 5) fives.push({ team: t.team, five })
}
console.log(`2026 fieldable fives: ${fives.length}`)

// ---- OFF variance table ----
const O = fives.map((f) => ({ team: f.team, ...offTerms(f.five) }))
const total = O.map((x) => x.off)
console.log('\n=== OFF raw indexes, 2026 (pre-percentile) ===')
for (const x of [...O].sort((a, b) => b.off - a.off))
  console.log(
    `  ${x.team.padEnd(24)} OFF ${x.off.toFixed(2)}  core ${x.core.toFixed(2)}  recon ${x.recon >= 0 ? '+' : ''}${x.recon.toFixed(2)}  fit ${x.fit >= 0 ? '+' : ''}${x.fit.toFixed(2)}  ft ${x.ftPts.toFixed(2)}  orb +${x.orbEff.toFixed(2)}  (recon+fit ${x.combined.toFixed(2)}${Math.abs(x.combined) > 4 ? ' *WOULD CLAMP*' : ''}${x.starDown > 3 ? ` *STAR -${x.starDown.toFixed(1)}TS*` : ''}  usgΔ ${x.delta.toFixed(1)})`,
  )
console.log(`\n  OFF total: mean ${mean(total).toFixed(2)}  sd ${sd(total).toFixed(2)}  span ${Math.min(...total).toFixed(1)}-${Math.max(...total).toFixed(1)}`)
const vT = cov(total, total)
for (const k of ['core', 'recon', 'fit', 'ftPts', 'orbEff'] as const) {
  const xs = O.map((x) => x[k])
  console.log(`  ${k.padEnd(6)} sd ${sd(xs).toFixed(3)}  variance share (cov/varTotal) ${((100 * cov(xs, total)) / vT).toFixed(1)}%`)
}
console.log(`  fives where |recon+fit| > 4 (item-2 clamp would bind): ${O.filter((x) => Math.abs(x.combined) > 4).length}`)
console.log(`  fives where a star (usg>=27 or vol>=90) is repriced down >3 TS pts: ${O.filter((x) => x.starDown > 3).length}`)
console.log(`  max |recon| ${Math.max(...O.map((x) => Math.abs(x.recon))).toFixed(2)}  max starDown ${Math.max(...O.map((x) => x.starDown)).toFixed(2)} TS pts`)

// ---- DEF variance table ----
const D = fives.map((f) => ({ team: f.team, ...defTerms(f.five) }))
const dtot = D.map((x) => x.drtg)
console.log('\n=== DEF raw drtgRef, 2026 (vs the FIXED reference five; lower = better) ===')
for (const x of [...D].sort((a, b) => a.drtg - b.drtg))
  console.log(
    `  ${x.team.padEnd(24)} drtg ${x.drtg.toFixed(2)}  perdefCore ${x.perdefCore.toFixed(1)}  anchor ${x.anchor.toFixed(1)} (t ${x.anchorT.toFixed(2)})  cover ${x.cover.toFixed(1)}  steals ${x.steals.toFixed(1)} (t ${x.stealsT.toFixed(2)})  glass ${x.glass.toFixed(0)} (t ${x.glassT.toFixed(2)})  disc +${x.discPts.toFixed(2)}  hunt ${x.huntPen.toFixed(2)}`,
  )
console.log(`\n  DEF total: mean ${mean(dtot).toFixed(2)}  sd ${sd(dtot).toFixed(2)}  span ${Math.min(...dtot).toFixed(1)}-${Math.max(...dtot).toFixed(1)}`)
const vD = cov(dtot, dtot)
for (const k of ['perdefT', 'coverT', 'anchorT', 'stealsT', 'glassT', 'discPts'] as const) {
  const xs = D.map((x) => x[k])
  console.log(`  ${k.padEnd(8)} sd ${sd(xs).toFixed(3)}  variance share ${((100 * cov(xs, dtot)) / vD).toFixed(1)}%`)
}
console.log(`  huntPen vs REF: all ${D.every((x) => Math.abs(x.huntPen) < 1e-9) ? 'ZERO (optimal board vs fixed reference — no assignment term in the gauge)' : 'NONZERO?!'}`)
console.log(`  hide vs REF: ${D.every((x) => x.hide === 1) ? 'always 1 (REF Avg C 3pt 25 < HIDE_OUT 45 — a fixed credible hiding spot for every anchor)' : 'varies?!'}`)

// ---- ITEM-2 COUNTERFACTUAL: off' = (core + clamp(recon+fit, ±4) + ftPts) x orbMult ----
const cf = O.map((x) => ({ team: x.team, off: (x.core + clamp(x.combined, -4, 4) + x.ftPts) * (1 + x.orbEff / (x.off - x.orbEff + 1e-9) * ((x.off - x.orbEff) / (x.core + x.recon + x.fit + x.ftPts))) }))
// exact: orbMult = off / (core+recon+fit+ftPts); reuse it directly
const cf2 = O.map((x) => {
  const orbMult = x.off / (x.core + x.recon + x.fit + x.ftPts)
  return { team: x.team, off: (x.core + clamp(x.combined, -4, 4) + x.ftPts) * orbMult, core: x.core, ftPts: x.ftPts, orbMult, clamped: clamp(x.combined, -4, 4) }
})
void cf
const rank = (xs: number[], v: number) => xs.filter((y) => y < v).length / Math.max(1, xs.length - 1)
const cfTot = cf2.map((x) => x.off)
console.log('\n=== ITEM-2 COUNTERFACTUAL (the ±4 combined clamp applied) ===')
for (const nm of ['Celtics', 'Thunder', 'Rockets']) {
  const before = O.find((x) => x.team.includes(nm))!
  const after = cf2.find((x) => x.team.includes(nm))!
  console.log(`  ${before.team.padEnd(24)} OFF ${before.off.toFixed(2)} -> ${after.off.toFixed(2)}  gauge pct ${Math.round(100 * rank(total, before.off))} -> ${Math.round(100 * rank(cfTot, after.off))}`)
}
console.log(`  OFF' total: sd ${sd(cfTot).toFixed(2)} (was ${sd(total).toFixed(2)})`)
const vT2 = cov(cfTot, cfTot)
const coreShare2 = (100 * cov(cf2.map((x) => x.core), cfTot)) / vT2
console.log(`  core variance share after the clamp: ${coreShare2.toFixed(1)}% (was 71.7%)`)
// the 2025 correlation gate, before vs after the clamp
import { winsOf } from '../src/engine/bestfive'
const rows25: { w: number; off: number; offC: number }[] = []
for (const t of WHEEL.filter((x) => x.y === 2025)) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const x = offTerms(five)
  const orbMult = x.off / (x.core + x.recon + x.fit + x.ftPts)
  rows25.push({ w: winsOf(t.rec), off: x.off, offC: (x.core + clamp(x.combined, -4, 4) + x.ftPts) * orbMult })
}
const pear = (xs: number[], ys: number[]) => cov(xs, ys) / Math.sqrt(cov(xs, xs) * cov(ys, ys))
console.log(`  2025 Pearson offRaw vs wins (n=${rows25.length}): before ${pear(rows25.map((r) => r.off), rows25.map((r) => r.w)).toFixed(3)}  after clamp ${pear(rows25.map((r) => r.offC), rows25.map((r) => r.w)).toFixed(3)}  (gate 0.6)`)

// ---- the three named DEF teams, per-player ----
for (const nm of ['76ers', 'Thunder', 'Celtics']) {
  const f = fives.find((x) => x.team.includes(nm))!
  const x = defTerms(f.five)
  const g = D.map((y) => y.drtg).filter((v) => v < x.drtg).length
  console.log(`\n=== ${f.team} '26 — defense vs the fixed reference ===`)
  for (const p of f.five)
    console.log(`    ${p.name.padEnd(28)} D ${String(p.d_ovr).padStart(2)}  perdef ${p.attrs.perdef}  rimprot ${p.attrs.rimprot}  perimdisrupt ${p.attrs.perimdisrupt}  drb ${p.attrs.drb}  disc ${p.attrs.discipline}`)
  console.log(`    perdefCore ${x.perdefCore.toFixed(1)} · anchor ${x.anchor.toFixed(1)} (hide ${x.hide}) · cover ${x.cover.toFixed(1)} · steals ${x.steals.toFixed(1)} · glass ${x.glass.toFixed(0)} · disc +${x.discPts.toFixed(2)} => drtgRef ${x.drtg.toFixed(2)} (${g} teams better)`)
}
