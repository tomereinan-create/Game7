/** recal_143 — the feasible ridge between the BOS'24-rank wall and the summit-order wall. */
import { evaluate, PINS } from './sweep143'
import { KNOBS as K } from '../src/engine/offense'

const base = evaluate({ SHARE: K.CREATE_SHARE, TOV: K.TOV_SIZE, AMP: K.AMP_MAX })
const floor = base.fit - 0.003
console.log(`baseline fit ${base.fit.toFixed(4)} floor ${floor.toFixed(4)} PHO ${base.dial(2005, 'PHO')}`)

interface C { s: number; t: number; a: number; pho: number; raw: number; fit: number; bad: string[]; chi: number; lal: number; bos: number; above: number }
const all: C[] = []
for (const s of [0.28, 0.3, 0.32, 0.34, 0.36, 0.38, 0.4]) {
  for (const t of [0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74]) {
    for (const a of [0.24, 0.26, 0.28, 0.3, 0.32, 0.34]) {
      const E = evaluate({ SHARE: s, TOV: t, AMP: a })
      const p = PINS(E)
      // unrounded dial position of the subject
      const MID = E.G.MID, TOP = E.G.TOP, MIN = E.G.MIN
      const v = E.adjOf(2005, 'PHO')
      const raw = v <= MID ? 1 + (49 * (v - MIN)) / (MID - MIN) : 50 + (49 * (v - MID)) / (TOP - MID)
      all.push({ s, t, a, pho: E.dial(2005, 'PHO'), raw, fit: E.fit, bad: p.bad, chi: p.chi, lal: p.lal, bos: p.br, above: E.above })
    }
  }
}
const ok = all.filter((c) => c.bad.length === 0 && c.fit >= floor)
ok.sort((x, y) => y.raw - x.raw)
console.log(`\nfeasible: ${ok.length} of ${all.length} — best 15 by unrounded subject dial:`)
for (const c of ok.slice(0, 15)) console.log(`  s${c.s} t${c.t} a${c.a}  PHO ${c.pho} (raw ${c.raw.toFixed(2)})  fit ${c.fit.toFixed(4)}  CHI ${c.chi} LAL ${c.lal} BOSr ${c.bos} above ${c.above}`)

const ok2 = all.filter((c) => c.fit >= floor && c.bad.every((b) => /BOS24rank 11/.test(b)))
ok2.sort((x, y) => y.raw - x.raw)
console.log(`\nif the Celtics '24 rank bound were 11 instead of 10 — best 8:`)
for (const c of ok2.slice(0, 8)) console.log(`  s${c.s} t${c.t} a${c.a}  PHO ${c.pho} (raw ${c.raw.toFixed(2)})  fit ${c.fit.toFixed(4)}  CHI ${c.chi} LAL ${c.lal} BOSr ${c.bos} above ${c.above}`)
