/** recal_140 — the G x AMP grid, every cell with the OFF gauge re-frozen and every pin checked. */
import { evaluate, feedP, TEAMS, type Eval } from './sweep140'

const PINS = (E: Eval) => {
  const chi = E.dial(1996, 'CHI'), lal = E.dial(2000, 'LAL'), gs = E.dial(2017, 'GSW')
  const [cr] = E.rank(1996, 'CHI'), [lr] = E.rank(2000, 'LAL'), [br] = E.rank(2024, 'BOS')
  const above = E.order.filter((o) => o.adj > E.adjOf(2017, 'GSW')).length
  const bad: string[] = []
  if (Math.abs(chi - 68) > 3) bad.push(`CHI96off ${chi}`)
  if (cr > 6) bad.push(`CHI96rank ${cr}`)
  if (Math.abs(lal - 64) > 4) bad.push(`LAL00off ${lal}`)
  if (lr > 5) bad.push(`LAL00rank ${lr}`)
  if (gs !== 99) bad.push(`GSW17 ${gs}`)
  if (br > 10) bad.push(`BOS24rank ${br}`)
  if (above > 1) bad.push(`${above} fives above GSW17`)
  return { chi, lal, gs, cr, lr, br, above, bad }
}

const stats = (G: number) => {
  const fs = TEAMS.map((t) => feedP(t.five, G))
  const m = fs.reduce((a, b) => a + b, 0) / fs.length
  const sd = Math.sqrt(fs.reduce((a, b) => a + (b - m) ** 2, 0) / fs.length)
  return { REF: Math.round(m * 10000) / 10000, sd }
}

console.log(`G · AMP · REF · fit · PHO05 dial(rank) · CHI96 · LAL00 · BOS24rank · n99 · aboveGSW · breaks`)
for (const G of [0, 1, 2, 3, 4, 5, 6, 8, 10, 12]) {
  const { REF, sd } = stats(G)
  for (const mult of [0.6, 0.8, 1.0, 1.3, 1.6, 2.0, 2.5]) {
    const AMP = Math.round(0.22 * (0.0497 / sd) * mult * 1000) / 1000
    const E = evaluate({ G, AMP, REF })
    const p = PINS(E)
    const [pr, pn] = E.rank(2005, 'PHO')
    console.log(`  G=${String(G).padStart(2)} AMP=${AMP.toFixed(3)} REF=${REF.toFixed(4)}  fit ${E.fit.toFixed(4)}  PHO05 ${String(E.dial(2005, 'PHO')).padStart(2)}(${pr}/${pn})  CHI ${p.chi} LAL ${p.lal} BOSr ${p.br} n99 ${E.n99} above ${p.above}  ${p.bad.length ? 'BREAKS: ' + p.bad.join(', ') : 'ok'}`)
  }
}
