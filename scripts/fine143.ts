/** recal_143 — fine grid in the gap between the BOS'24-rank wall and the summit-order wall. */
import { evaluate, PINS } from './sweep143'
import { KNOBS as K } from '../src/engine/offense'

const base = evaluate({ SHARE: K.CREATE_SHARE, TOV: K.TOV_SIZE, AMP: K.AMP_MAX })
const floor = base.fit - 0.003
console.log(`baseline fit ${base.fit.toFixed(4)} floor ${floor.toFixed(4)} PHO ${base.dial(2005, 'PHO')}`)

const rows: string[] = []
for (const s of [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.42, 0.44]) {
  for (const t of [0.6, 0.64, 0.68, 0.7, 0.72, 0.76]) {
    for (const a of [0.22, 0.26, 0.3, 0.34]) {
      const E = evaluate({ SHARE: s, TOV: t, AMP: a })
      const p = PINS(E)
      const pho = E.dial(2005, 'PHO')
      if (pho < 69) continue
      rows.push(`  s${s} t${t} a${a}  PHO ${pho} fit ${E.fit.toFixed(4)}${E.fit < floor ? ' FITLOW' : ''}  CHI ${p.chi}(r${p.cr}) LAL ${p.lal}(r${p.lr}) BOSr ${p.br} above ${E.above} n99 ${E.n99}  ${p.bad.length ? 'BREAKS: ' + p.bad.join(', ') : 'OK'}`)
    }
  }
}
console.log(`cells with PHO>=69:`)
for (const r of rows) console.log(r)

// who sits at the top of the adjusted board in the cell that reaches 69 the cheapest
const probe = evaluate({ SHARE: 0.4, TOV: 0.76, AMP: 0.26 })
console.log(`\nprobe s0.40 t0.76 a0.26 — top of the adjusted board:`)
for (const o of probe.order) console.log(`   ${o.y} ${o.team.padEnd(24)} ${o.adj.toFixed(3)} dial ${o.dial}`)
console.log(`  PHO05 ${probe.dial(2005, 'PHO')} adj ${probe.adjOf(2005, 'PHO').toFixed(3)}  fit ${probe.fit.toFixed(4)}`)
