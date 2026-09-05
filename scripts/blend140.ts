/** recal_140 — the BLEND form: recv_i = (1-F)·c_i + F·(best creation among the other four). */
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
const stats = (F: number) => {
  const fs = TEAMSB.map((t) => teamRecv(t.five, F, true))
  const m = fs.reduce((a, b) => a + b, 0) / fs.length
  const sd = Math.sqrt(fs.reduce((a, b) => a + (b - m) ** 2, 0) / fs.length)
  return { REF: Math.round(m * 10000) / 10000, sd }
}
console.log(`BLEND — per-player recv, then per-player amplification`)
console.log(`F · mean · sd · PHO05 CHI96 GSW17 HOU18 MIA05 IND00 (team-level recv)`)
for (const F of [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0]) {
  const { REF, sd } = stats(F)
  const g = (y: number, ab: string) => teamRecv(TEAMSB.find((t) => t.y === y && t.ab === ab)!.five, F, true).toFixed(3)
  console.log(`  F=${F.toFixed(2)} ${REF.toFixed(4)} ${sd.toFixed(4)}  ${g(2005, 'PHO')} ${g(1996, 'CHI')} ${g(2017, 'GSW')} ${g(2018, 'HOU')} ${g(2005, 'MIA')} ${g(2000, 'IND')}`)
}
console.log(`\nF · AMP · fit · PHO05 dial(rank) · CHI96(rk) · LAL00(rk) · BOS24rk · above · breaks`)
let best = { fit: 0, s: '' }, bestP = { pho: 0, fit: 0, s: '' }
for (const F of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1.0]) {
  const { REF, sd } = stats(F)
  for (const mult of [0.8, 1.0, 1.2, 1.5, 2.0, 2.6]) {
    const AMP = Math.round(0.22 * (0.0497 / sd) * mult * 1000) / 1000
    const E = evalB({ F, AMP, REF, team: false, blend: true })
    const p = PINS(E)
    const [pr, pn] = E.rank(2005, 'PHO')
    const pho = E.dial(2005, 'PHO')
    const line = `  F=${F.toFixed(2)} AMP=${AMP.toFixed(3)} REF=${REF.toFixed(4)}  fit ${E.fit.toFixed(4)}  PHO05 ${String(pho).padStart(2)}(${pr}/${pn})  CHI ${p.chi}(${p.cr}) LAL ${p.lal}(${p.lr}) BOSr ${p.br} above ${E.above} n99 ${E.n99}  ${p.bad.length ? 'BREAKS: ' + p.bad.join(', ') : 'OK'}`
    console.log(line)
    if (!p.bad.length) {
      if (E.fit > best.fit) best = { fit: E.fit, s: line }
      if (pho > bestP.pho || (pho === bestP.pho && E.fit > bestP.fit)) bestP = { pho, fit: E.fit, s: line }
    }
  }
}
console.log(`\nMAX FIT, every pin held:\n${best.s}`)
console.log(`MAX SUNS '05, every pin held:\n${bestP.s}`)
