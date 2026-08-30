/** recal_68 item-0 DIAGNOSTIC — the five-term decomposition of team_offense() for OKC '26 and
 *  Houston '26, printed BEFORE any tuning (the round's own order). Read-only. */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { creation, KNOBS, teamOffense, usageSurplus } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const K = KNOBS
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

function fiveOf(year: number, name: string): { team: string; five: Player[] } {
  const t = WHEEL.find((x) => x.y === year && x.team.includes(name))!
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  return { team: t.team, five: startingFive(roster).five.filter((p): p is Player => !!p) }
}

/** Re-derives teamOffense's internals step by step (mirror of offense.ts, display only). */
function decompose(team: string, five: Player[], year: number) {
  const A = five.map((p) => p.attrs)
  const n = A.length
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
    if (d >= 0) {
      const slope = K.SLOPE_UP_MAX - (K.SLOPE_UP_MAX - K.SLOPE_UP_MIN) * c[i]
      return e[i] * (1 - (slope * d) / 100)
    }
    const gate = clamp((e[i] - 0.545) / 0.1, 0, 1)
    return e[i] * (1 + (K.SLOPE_DOWN * gate * -d) / 100)
  })
  const feed = c.reduce((acc, ci, i) => acc + ci * u2[i], 0) / K.TEAM_USG
  const e3 = e2.map((x, i) => x * (1 + K.AMP_MAX * feed * Math.max(0, 1 - u2[i] / 30)))
  const outs = A.map((a) => a['3pt'])
  let capped = 0
  const chans: string[] = []
  const e4 = A.map((a, i) => {
    const ei = e3[i]
    let x = ei
    const tags: string[] = []
    if (u2[i] < K.USG_LOW) {
      x *= 1 - K.USG_LOW_PEN * (K.USG_LOW - u2[i])
      tags.push('starved<13')
    }
    if (u2[i] > K.USG_HIGH) {
      x *= 1 - K.USG_HIGH_PEN * (u2[i] - K.USG_HIGH)
      tags.push('overload>32')
    }
    if (a['3pt'] < K.PAINT_OUT && a.mid < K.PAINT_MID) {
      let spc = 0
      for (let j = 0; j < n; j++) if (j !== i) spc += Math.max(0, outs[j] - 55)
      spc /= 4 * 44
      x *= 1 - K.CLOG_MAX * (1 - Math.min(1, spc / K.SPACING_FULL))
      tags.push(`clog(spc ${spc.toFixed(2)})`)
      if (a.usg_raw < K.FINISHER_USG) {
        let best = -Infinity
        for (let j = 0; j < n; j++) if (j !== i) best = Math.max(best, (c[j] * outs[j]) / 99)
        x *= 1 + K.FINISHER_BONUS * best
        tags.push('finisher')
      } else if (a.usg_raw >= K.HUB_USG) {
        x *= 1 + K.HUB_BONUS * Math.min(1, spc / K.SPACING_FULL)
        tags.push('hub')
      }
    }
    const m = x / ei
    if (m < K.STACK_MIN || m > K.STACK_MAX) {
      capped++
      tags.push(`STACK-CAPPED(${m.toFixed(3)})`)
    }
    chans.push(tags.join(' ') || '-')
    return ei * clamp(m, K.STACK_MIN, K.STACK_MAX)
  })
  const baseCard = u2.reduce((acc, ui, i) => acc + ui * e[i], 0) * 2
  const baseN = u2.reduce((acc, ui, i) => acc + ui * e2[i], 0) * 2
  const baseF = u2.reduce((acc, ui, i) => acc + ui * e4[i], 0) * 2
  const fit = clamp(K.FIT_WIDEN * (baseF - baseN), -K.FIT_CAP, K.FIT_CAP)
  const o = teamOffense(five)
  const g = seasonGauges(five, year)

  console.log(`\n=== ${team} '${String(year % 100)} — five-term decomposition ===`)
  console.log('  player                          vol  usg->rec   TS(card)->repriced  delta(TSpts)  channels')
  for (let i = 0; i < n; i++)
    console.log(
      `  ${five[i].name.padEnd(28)} ${String(A[i].volume).padStart(4)}  ${u[i].toFixed(1).padStart(4)}->${u2[i].toFixed(1).padEnd(5)} ` +
        ` ${(100 * e[i]).toFixed(1)} -> ${(100 * e2[i]).toFixed(1)}      ${(100 * (e2[i] - e[i])).toFixed(2).padStart(6)}      ${chans[i]}`,
    )
  console.log(`  team: surplus/starvation delta ${delta.toFixed(1)} (usageSurplus ${usageSurplus(five).toFixed(1)})`)
  console.log(`  baseCard (u2 x card TS)  ${baseCard.toFixed(2)}`)
  console.log(`  baseN (repriced, no chan) ${baseN.toFixed(2)}   RECONCILIATION MOVE ${(baseN - baseCard).toFixed(2)}`)
  console.log(`  baseF (channels on)       ${baseF.toFixed(2)}   raw gap ${(baseF - baseN).toFixed(2)} -> FIT term ${fit.toFixed(2)} (widen ${K.FIT_WIDEN}, cap ${K.FIT_CAP})`)
  console.log(`  stack cap active on ${capped} players`)
  console.log(`  + ftPts ${o.ftPts.toFixed(2)}  x orbMult ${o.orbMult.toFixed(4)}  => OFF INDEX ${o.off.toFixed(2)}  · gauge OFF ${g.off} (basis ${g.basis}, n=${g.n})  DEF ${g.def}`)
  return { off: o.off, gauge: g.off }
}

const okc = fiveOf(2026, 'Thunder')
const hou = fiveOf(2026, 'Rockets')
decompose(okc.team, okc.five, 2026)
decompose(hou.team, hou.five, 2026)
console.log('\ncurrent card OFF values (post-r67 display, for the design side):')
for (const p of [...okc.five, ...hou.five]) console.log(`  ${p.name.padEnd(28)} O ${p.o_ovr}  usg_raw ${p.attrs.usg_raw}  vol ${p.attrs.volume}  eff ${p.attrs.efficiency}  ts_rel ${p.attrs.ts_rel}`)
