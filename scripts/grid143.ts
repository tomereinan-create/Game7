/** recal_143 — the CREATE_SHARE x TOV_SIZE grid, every cell gauge-re-frozen and pin-graded. */
import { evaluate, PINS, TEAMS } from './sweep143'
import { KNOBS as K } from '../src/engine/offense'

const base = evaluate({ SHARE: K.CREATE_SHARE, TOV: K.TOV_SIZE, AMP: K.AMP_MAX })
console.log(`BASELINE share=${K.CREATE_SHARE} tov=${K.TOV_SIZE} amp=${K.AMP_MAX} REF=${base.REFused}`)
const bp = PINS(base)
const [pr, pn] = base.rank(2005, 'PHO')
console.log(`  fit ${base.fit.toFixed(4)}  PHO05 ${base.dial(2005, 'PHO')} (${pr}/${pn})  CHI ${bp.chi}(r${bp.cr})  LAL ${bp.lal}(r${bp.lr})  GSW ${bp.gs}  BOSr ${bp.br}  n99 ${base.n99}  above ${base.above}  ${bp.bad.length ? 'BREAKS: ' + bp.bad.join(', ') : 'ok'}`)
console.log(`  gauge MIN ${base.G.MIN} MID ${base.G.MID} TOP ${base.G.TOP} REF ${base.G.REF}`)
console.log(`  ${TEAMS.length} fives`)

const row = (label: string, P: { SHARE: number; TOV: number; AMP: number }) => {
  const E = evaluate(P)
  const p = PINS(E)
  const [r, n] = E.rank(2005, 'PHO')
  console.log(
    `${label.padEnd(30)} REF ${E.REFused.toFixed(4)} fit ${E.fit.toFixed(4)} (${(E.fit - base.fit >= 0 ? '+' : '') + (E.fit - base.fit).toFixed(4)})  PHO ${String(E.dial(2005, 'PHO')).padStart(2)}(${r}/${n})  CHI ${p.chi}(r${p.cr}) LAL ${p.lal}(r${p.lr}) GSW ${p.gs} BOSr ${p.br} n99 ${E.n99} above ${E.above}  ${p.bad.length ? 'BREAKS: ' + p.bad.join(', ') : 'ok'}`,
  )
}

console.log(`\n--- (a) CREATE_SHARE alone (TOV 0.45, AMP 0.26) ---`)
for (const s of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) row(`  share ${s}`, { SHARE: s, TOV: 0.45, AMP: 0.26 })

console.log(`\n--- (b) TOV_SIZE alone (share 0.20, AMP 0.26) ---`)
for (const t of [0.45, 0.55, 0.65, 0.75, 0.85, 1.0, 1.2, 1.5, 2.0]) row(`  tov ${t}`, { SHARE: 0.2, TOV: t, AMP: 0.26 })

console.log(`\n--- (c) both, smaller sizes ---`)
for (const s of [0.3, 0.35, 0.4, 0.45, 0.5]) for (const t of [0.55, 0.65, 0.75, 0.9]) row(`  share ${s} tov ${t}`, { SHARE: s, TOV: t, AMP: 0.26 })
