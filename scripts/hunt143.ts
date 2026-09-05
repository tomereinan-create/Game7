/** recal_143 — joint search over CREATE_SHARE x TOV_SIZE x AMP_MAX; print every feasible cell. */
import { evaluate, PINS } from './sweep143'
import { KNOBS as K } from '../src/engine/offense'

const base = evaluate({ SHARE: K.CREATE_SHARE, TOV: K.TOV_SIZE, AMP: K.AMP_MAX })
console.log(`baseline fit ${base.fit.toFixed(4)}  PHO ${base.dial(2005, 'PHO')}  floor ${(base.fit - 0.003).toFixed(4)}`)
console.log(`top of the adjusted board, baseline:`)
for (const o of base.order) console.log(`   ${o.y} ${o.team.padEnd(24)} ${o.adj.toFixed(3)} dial ${o.dial}`)

interface Cell { s: number; t: number; a: number; pho: number; fit: number; bad: string[]; chi: number; lal: number; bos: number; above: number; cr: number }
const cells: Cell[] = []
for (const s of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) {
  for (const t of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1.0]) {
    for (const a of [0.14, 0.18, 0.22, 0.26, 0.3]) {
      const E = evaluate({ SHARE: s, TOV: t, AMP: a })
      const p = PINS(E)
      cells.push({ s, t, a, pho: E.dial(2005, 'PHO'), fit: E.fit, bad: p.bad, chi: p.chi, lal: p.lal, bos: p.br, above: E.above, cr: p.cr })
    }
  }
}
const ok = cells.filter((c) => c.bad.length === 0 && c.fit >= base.fit - 0.003)
ok.sort((x, y) => y.pho - x.pho || y.fit - x.fit)
console.log(`\nFEASIBLE cells (all pins hold, fit >= baseline-0.003): ${ok.length} of ${cells.length}`)
for (const c of ok.slice(0, 40)) console.log(`  share ${c.s} tov ${c.t} amp ${c.a}  PHO ${c.pho}  fit ${c.fit.toFixed(4)}  CHI ${c.chi}(r${c.cr}) LAL ${c.lal} BOSr ${c.bos} above ${c.above}`)
console.log(`\nBEST PHO among feasible: ${Math.max(...ok.map((c) => c.pho))}`)
const near = cells.filter((c) => c.pho >= 69 && c.fit >= base.fit - 0.003)
near.sort((x, y) => x.bad.length - y.bad.length || y.fit - x.fit)
console.log(`\ncells at PHO>=69 with fit ok, fewest breaks first:`)
for (const c of near.slice(0, 25)) console.log(`  share ${c.s} tov ${c.t} amp ${c.a}  PHO ${c.pho} fit ${c.fit.toFixed(4)}  CHI ${c.chi}(r${c.cr}) LAL ${c.lal} BOSr ${c.bos} above ${c.above}  ${c.bad.join(', ')}`)
