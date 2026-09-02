/** r66 ADDENDUM 3 diagnostic — does an opponent-aware OFF gauge (vs a fixed reference five
 *  with a REAL anchor) engage hide/spacing as claimed? Read-only measurement; nothing ships
 *  from this file. Candidate: offCand = teamOffense(five).off + defenseVs(REFG, five).drtg - 110
 *  (intrinsic production + the reference defense's response to our SHAPE; constants drop out
 *  in the percentile). REFG = REF_FIVE with its C given a real anchor (rimprot 68 -> 88),
 *  gauge-layer only — REF_FIVE itself anchors the OVR pipeline and r60 calibration, untouched. */
import { WHEEL } from '../src/data/wheel'
import { startingFive, winsOf } from '../src/engine/bestfive'
import { defenseVs, KNOBS, REF_FIVE, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const K = KNOBS

// gauge-only reference: same avg five, its C upgraded to a real anchor (rimprot >= 85)
const REFG: Player[] = REF_FIVE.map((p) => (p.name === 'Avg C' ? { ...p, attrs: { ...p.attrs, rimprot: 88 } } : p))

const fiveOf = (y: number, nm: string) => {
  const t = WHEEL.find((x) => x.y === y && x.team.includes(nm))!
  return { team: t.team, five: startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p) }
}

const offCand = (five: Player[]) => teamOffense(five).off + defenseVs(REFG, five).drtg - 110

function spacingTable(team: string, five: Player[]) {
  const A = five.map((p) => p.attrs)
  const outs = A.map((a) => a['3pt'])
  console.log(`\n=== ${team} — the spacing table (addendum-3 item 2) ===`)
  for (let i = 0; i < 5; i++) {
    const a = A[i]
    // own-side channels, factors SEPARATE (rule b visibility)
    let clogF = 1
    let hubF = 1
    let finF = 1
    let spc = 0
    if (a['3pt'] < K.PAINT_OUT && a.mid < K.PAINT_MID) {
      for (let j = 0; j < 5; j++) if (j !== i) spc += Math.max(0, outs[j] - 55)
      spc /= 4 * 44
      clogF = 1 - K.CLOG_MAX * (1 - Math.min(1, spc / K.SPACING_FULL))
      if (a.usg_raw < K.FINISHER_USG) finF = 1 + K.FINISHER_BONUS * Math.max(...five.map((q, j) => (j === i ? -Infinity : (((0.45 * q.attrs.playvol + 0.2 * q.attrs.ballsec) / (0.65 * 99)) * q.attrs['3pt']) / 99)))
      else if (a.usg_raw >= K.HUB_USG) hubF = 1 + K.HUB_BONUS * Math.min(1, spc / K.SPACING_FULL)
    }
    console.log(
      `  ${five[i].name.padEnd(28)} 3pt ${String(a['3pt']).padStart(2)}  hide-eligible(<45) ${a['3pt'] < 45 ? 'YES' : 'no '}  clog-gated(<40&mid<45) ${a['3pt'] < K.PAINT_OUT && a.mid < K.PAINT_MID ? `YES clogF ${clogF.toFixed(4)}` : 'no'}` +
        `${finF !== 1 ? `  finisherF ${finF.toFixed(4)}` : ''}${hubF !== 1 ? `  hubF ${hubF.toFixed(4)} (SEPARATE from clogF ${clogF.toFixed(4)})` : ''}`,
    )
  }
  const d = defenseVs(REFG, five)
  const o = teamOffense(five)
  console.log(`  REFG response: anchor ${d.anchor.toFixed(1)} hides on ${five[d.worstShooter]?.name ?? '?'} (his 3pt ${d.minOppOut}, hide ${d.hide.toFixed(2)}) · paintOrient ${d.paintOrient.toFixed(2)} · steals ${d.steals.toFixed(1)} · allows ${d.drtg.toFixed(2)}`)
  console.log(`  intrinsic OFF ${o.off.toFixed(2)}  ->  candidate (off + allows - 110) ${offCand(five).toFixed(2)}`)
}

for (const [y, nm] of [[2026, 'Rockets'], [2026, 'Thunder'], [2026, 'Celtics']] as const) {
  const { team, five } = fiveOf(y, nm)
  spacingTable(`${team} '${String(y % 100)}`, five)
}

// ---- the 2026 league under both conventions ----
const rows: { team: string; off: number; cand: number; hides: number }[] = []
for (const t of WHEEL.filter((x) => x.y === 2026)) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  rows.push({ team: t.team, off: teamOffense(five).off, cand: offCand(five), hides: five.filter((p) => p.attrs['3pt'] < 45).length })
}
const pctOf = (xs: number[], v: number) => Math.round((100 * xs.filter((y) => y < v).length) / Math.max(1, xs.length - 1))
const offs = rows.map((r) => r.off)
const cands = rows.map((r) => r.cand)
console.log('\n=== 2026, both conventions (pct = percentile in season pool) ===')
for (const r of [...rows].sort((a, b) => b.cand - a.cand))
  console.log(`  ${r.team.padEnd(24)} hide-eligible ${r.hides}  intrinsic ${r.off.toFixed(2)} (pct ${String(pctOf(offs, r.off)).padStart(2)})  candidate ${r.cand.toFixed(2)} (pct ${String(pctOf(cands, r.cand)).padStart(2)})`)
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const pear = (xs: number[], ys: number[]) => {
  const mx = mean(xs)
  const my = mean(ys)
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
const hides = rows.map((r) => r.hides)
console.log(`\n  hide-count correlation: vs intrinsic ${pear(hides, offs).toFixed(3)} · vs candidate ${pear(hides, cands).toFixed(3)} (addendum wants clearly NEGATIVE)`)
const hou = rows.find((r) => /Rockets/.test(r.team))!
console.log(`  Houston: intrinsic pct ${pctOf(offs, hou.off)} -> candidate pct ${pctOf(cands, hou.cand)} (target: out of the top decile)`)

// ---- the named bands under the candidate convention (each vs its own season pool) ----
console.log('\n=== named bands under the candidate ===')
for (const [y, nm, lo, hi] of [[2026, 'Thunder', 88, 100], [2026, 'Celtics', 70, 85], [2025, 'Knicks', 65, 80], [2024, 'Celtics', 90, 100], [2013, 'Grizzlies', 40, 60]] as const) {
  const pool: number[] = []
  let mine = 0
  for (const t of WHEEL.filter((x) => x.y === y)) {
    const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
    if (five.length !== 5) continue
    const v = offCand(five)
    pool.push(v)
    if (t.team.includes(nm)) mine = v
  }
  const pc = pctOf(pool, mine)
  console.log(`  ${nm} '${String(y % 100).padStart(2, '0')}  candidate OFF pct ${pc}  (band ${lo}-${hi === 100 ? '+' : hi}) ${pc >= lo && pc <= hi ? 'PASS' : 'FAIL'}`)
}

// ---- 2025 wins correlation, both conventions ----
const r25: { w: number; off: number; cand: number }[] = []
for (const t of WHEEL.filter((x) => x.y === 2025)) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  r25.push({ w: winsOf(t.rec), off: teamOffense(five).off, cand: offCand(five) })
}
console.log(`\n  2025 Pearson vs wins (n=${r25.length}): intrinsic ${pear(r25.map((r) => r.off), r25.map((r) => r.w)).toFixed(3)} · candidate ${pear(r25.map((r) => r.cand), r25.map((r) => r.w)).toFixed(3)} (gate 0.6)`)

// ---- rule (a): does a SECOND hide-eligible man cost more than the first? (structural + measured) ----
console.log('\n=== rule (a) compounding check ===')
console.log('  STRUCTURAL: defenseVs hides the anchor on ONE man (the worst shooter); minOppOut is a MIN —')
console.log('  a second sub-45 shooter cannot change hide at all. Compounding does NOT hold today.')
const by = (n: number) => rows.filter((r) => r.hides === n)
for (const n of [0, 1, 2]) if (by(n).length) console.log(`  2026 fives with ${n} hide-eligible: n=${by(n).length}  mean candidate ${mean(by(n).map((r) => r.cand)).toFixed(2)}  mean intrinsic ${mean(by(n).map((r) => r.off)).toFixed(2)}`)
