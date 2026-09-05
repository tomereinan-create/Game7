/** recal_143 — shortlist with WALL MARGINS: how much room is left at each binding pin. */
import { evaluate, PINS, TEAMS } from './sweep143'
import { KNOBS as K } from '../src/engine/offense'

const base = evaluate({ SHARE: K.CREATE_SHARE, TOV: K.TOV_SIZE, AMP: K.AMP_MAX })
console.log(`baseline fit ${base.fit.toFixed(4)}  PHO ${base.dial(2005, 'PHO')}  floor ${(base.fit - 0.003).toFixed(4)}`)

const CANDS: [number, number, number][] = [
  [0.2, 0.45, 0.26], // shipped
  [0.2, 0.6, 0.26], [0.25, 0.6, 0.26], [0.3, 0.6, 0.26],
  [0.3, 0.66, 0.26], [0.3, 0.68, 0.26], [0.3, 0.7, 0.26], [0.3, 0.72, 0.26],
  [0.32, 0.7, 0.26], [0.34, 0.68, 0.26], [0.34, 0.7, 0.26], [0.35, 0.7, 0.26],
  [0.36, 0.66, 0.26], [0.36, 0.68, 0.26], [0.36, 0.7, 0.26], [0.38, 0.66, 0.26],
  [0.38, 0.68, 0.26], [0.4, 0.64, 0.26], [0.4, 0.66, 0.26],
]
for (const [s, t, a] of CANDS) {
  const E = evaluate({ SHARE: s, TOV: t, AMP: a })
  const p = PINS(E)
  const v = E.adjOf(2005, 'PHO')
  const raw = v <= E.G.MID ? 1 + (49 * (v - E.G.MIN)) / (E.G.MID - E.G.MIN) : 50 + (49 * (v - E.G.MID)) / (E.G.TOP - E.G.MID)
  const gsw = E.adjOf(2017, 'GSW')
  const third = [...TEAMS].map((x) => E.adjOf(x.y, x.ab)).sort((x, y) => y - x)[2]
  console.log(
    `s${s.toFixed(2)} t${t.toFixed(2)} a${a.toFixed(2)} REF ${E.REFused.toFixed(4)} | PHO ${E.dial(2005, 'PHO')} raw ${raw.toFixed(2)} r${E.rank(2005, 'PHO')[0]} | fit ${E.fit.toFixed(4)} | CHI ${p.chi} r${p.cr} | LAL ${p.lal} r${p.lr} | BOSr ${p.br} | above ${E.above} margin ${(gsw - third).toFixed(3)} | n99 ${E.n99} | ${p.bad.length ? 'BREAK ' + p.bad.join(',') : 'OK'}`,
  )
}
