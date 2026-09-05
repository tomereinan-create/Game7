/** recal_143 — footprint: fit before/after, per-decade, and the 1,255-five dial movers. */
import { evaluate } from './sweep143'
import { KNOBS as K } from '../src/engine/offense'
import { TEAMS } from './sweep143'

const A = evaluate({ SHARE: 0.2, TOV: 0.45, AMP: 0.26 }) // origin/main
const B = evaluate({ SHARE: K.CREATE_SHARE, TOV: K.TOV_SIZE, AMP: K.AMP_MAX }) // shipped
const nm = ['80s', '90s', '00s', '10s', '20s']
console.log(`FIT (within-season Spearman of offRaw vs real ORtg, 47 seasons): ${A.fit.toFixed(4)} -> ${B.fit.toFixed(4)}  (${(B.fit - A.fit >= 0 ? '+' : '') + (B.fit - A.fit).toFixed(4)})`)
console.log(`  per era: ${nm.map((n, i) => `${n} ${A.dec[i].toFixed(3)} -> ${B.dec[i].toFixed(3)}`).join(' · ')}`)
console.log(`DECADE MEAN OFF DIAL: ${nm.map((n, i) => `${n} ${A.decDial[i].toFixed(1)} -> ${B.decDial[i].toFixed(1)}`).join(' · ')}`)
console.log(`gauge: MIN ${A.G.MIN} -> ${B.G.MIN} · MID ${A.G.MID} -> ${B.G.MID} · TOP ${A.G.TOP} -> ${B.G.TOP} · LEVEL_REF ${A.G.REF} -> ${B.G.REF}`)

let moved = 0, maxUp = 0, maxDn = 0
const rows: { lbl: string; a: number; b: number }[] = []
for (const t of TEAMS) {
  const a = A.dial(t.y, t.ab), b = B.dial(t.y, t.ab)
  if (a !== b) moved++
  maxUp = Math.max(maxUp, b - a); maxDn = Math.min(maxDn, b - a)
  rows.push({ lbl: `${t.team} '${String(t.y % 100).padStart(2, '0')}`, a, b })
}
console.log(`\nOFF DIAL moved on ${moved} of ${TEAMS.length} fives; max +${maxUp} / ${maxDn}`)
rows.sort((x, y) => (y.b - y.a) - (x.b - x.a))
console.log(`biggest RISERS: ${rows.slice(0, 6).map((r) => `${r.lbl} ${r.a}->${r.b}`).join(' · ')}`)
console.log(`biggest FALLERS: ${rows.slice(-6).reverse().map((r) => `${r.lbl} ${r.a}->${r.b}`).join(' · ')}`)
console.log(`offRaw moved on ${TEAMS.filter((t) => A.off.get(`${t.y}|${t.ab}`) !== B.off.get(`${t.y}|${t.ab}`)).length} of ${TEAMS.length}`)
console.log(`fives reading 99: ${A.n99} -> ${B.n99}   fives above GSW '17: ${A.above} -> ${B.above}`)
