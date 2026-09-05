/** recal_140 — the RECEIVED-feed grid (per-player and team forms), gauge re-frozen in every cell. */
import { KNOBS as K, teamOffense } from '../src/engine/offense'
import { evalB, offB, teamRecv, TEAMSB, type EvalB } from './sweep140b'

let worst = 0
for (const t of TEAMSB) worst = Math.max(worst, Math.abs(offB(t.five, { F: 0, AMP: K.AMP_MAX, REF: K.FEED_REF, team: true }) - teamOffense(t.five).off))
console.log(`reimplementation vs engine at F=0/team: worst |Δ| = ${worst.toExponential(2)} over ${TEAMSB.length} fives`)

console.log(`\nTEAM RECEIVED FEED — F · mean · sd · PHO05 CHI96 GSW17 HOU18 MIA05 IND00`)
const ST = new Map<number, { REF: number; sd: number }>()
for (const F of [0, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const fs = TEAMSB.map((t) => teamRecv(t.five, F))
  const m = fs.reduce((a, b) => a + b, 0) / fs.length
  const sd = Math.sqrt(fs.reduce((a, b) => a + (b - m) ** 2, 0) / fs.length)
  ST.set(F, { REF: Math.round(m * 10000) / 10000, sd })
  const g = (y: number, ab: string) => teamRecv(TEAMSB.find((t) => t.y === y && t.ab === ab)!.five, F).toFixed(3)
  console.log(`  F=${F.toFixed(1)} mean ${m.toFixed(4)} sd ${sd.toFixed(4)}   ${g(2005, 'PHO')} ${g(1996, 'CHI')} ${g(2017, 'GSW')} ${g(2018, 'HOU')} ${g(2005, 'MIA')} ${g(2000, 'IND')}`)
}

const PINS = (E: EvalB) => {
  const chi = E.dial(1996, 'CHI'), lal = E.dial(2000, 'LAL'), gs = E.dial(2017, 'GSW')
  const [cr] = E.rank(1996, 'CHI'), [lr] = E.rank(2000, 'LAL'), [br] = E.rank(2024, 'BOS')
  const bad: string[] = []
  if (Math.abs(chi - 68) > 3) bad.push(`CHI96off ${chi}`)
  if (cr > 6) bad.push(`CHI96rank ${cr}`)
  if (Math.abs(lal - 64) > 4) bad.push(`LAL00off ${lal}`)
  if (lr > 5) bad.push(`LAL00rank ${lr}`)
  if (gs !== 99) bad.push(`GSW17 ${gs}`)
  if (br > 10) bad.push(`BOS24rank ${br}`)
  if (E.above > 1) bad.push(`${E.above} above GSW17`)
  return { chi, lal, br, bad }
}

for (const team of [false, true]) {
  console.log(`\n${team ? 'TEAM' : 'PER-PLAYER'} received feed — F · AMP · fit · PHO05 dial(rank) · CHI96 · LAL00 · BOS24rk · n99 · breaks`)
  for (const F of [0, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
    const { REF, sd } = ST.get(F)!
    for (const mult of [1.0, 1.5, 2.0, 3.0, 4.0]) {
      const AMP = Math.round(0.22 * (0.0497 / sd) * mult * 1000) / 1000
      const E = evalB({ F, AMP, REF, team })
      const p = PINS(E)
      const [pr, pn] = E.rank(2005, 'PHO')
      console.log(`  F=${F.toFixed(1)} AMP=${AMP.toFixed(3)}  fit ${E.fit.toFixed(4)}  PHO05 ${String(E.dial(2005, 'PHO')).padStart(2)}(${pr}/${pn})  CHI ${p.chi} LAL ${p.lal} BOSr ${p.br} n99 ${E.n99}  ${p.bad.length ? 'BREAKS: ' + p.bad.join(', ') : 'ok'}`)
    }
  }
}
