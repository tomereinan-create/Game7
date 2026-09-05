/** recal_140 — fine blend scan with full pin margins. */
import { evalB, teamRecv, TEAMSB, type EvalB } from './sweep140b'

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
  return { chi, lal, cr, lr, br, bad }
}
const REFof = (F: number) => {
  const fs = TEAMSB.map((t) => teamRecv(t.five, F, true))
  return Math.round((fs.reduce((a, b) => a + b, 0) / fs.length) * 10000) / 10000
}
console.log(`F · AMP · REF · fit · PHO05 · CHI96(rk) · LAL00(rk) · BOS24rk · above · n99 · breaks`)
for (const F of [0.15, 0.18, 0.2, 0.22, 0.25, 0.28]) {
  const REF = REFof(F)
  for (const AMP of [0.24, 0.26, 0.27, 0.28, 0.30, 0.32]) {
    const E = evalB({ F, AMP, REF, team: false, blend: true })
    const p = PINS(E)
    const [pr, pn] = E.rank(2005, 'PHO')
    console.log(`  F=${F.toFixed(2)} AMP=${AMP.toFixed(2)} REF=${REF.toFixed(4)}  fit ${E.fit.toFixed(4)}  PHO05 ${String(E.dial(2005, 'PHO')).padStart(2)}(${pr}/${pn})  CHI ${p.chi}(${p.cr}) LAL ${p.lal}(${p.lr}) BOSr ${p.br} above ${E.above} n99 ${E.n99}  ${p.bad.length ? 'BREAKS: ' + p.bad.join(', ') : 'OK'}`)
  }
}
