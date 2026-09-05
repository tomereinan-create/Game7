/** recal_140 — the Team DB row (OFF/DEF/OVR) after, plus the subject's term-by-term decomposition. */
import { seasonGauges } from '../src/engine/gauges'
import { creation, teamOffense } from '../src/engine/offense'
import { TEAMSB } from './sweep140b'

const NAMED: [number, string, string][] = [
  [2005, 'PHO', "Suns '05"], [2006, 'PHO', "Suns '06"], [2007, 'PHO', "Suns '07"], [2000, 'IND', "Pacers '00"],
  [2005, 'MIA', "Heat '05"], [1997, 'UTA', "Jazz '97"], [2018, 'HOU', "Rockets '18"], [2023, 'DEN', "Nuggets '23"],
  [2017, 'GSW', "Warriors '17"], [1996, 'CHI', "Bulls '96"], [2000, 'LAL', "Lakers '00"], [2024, 'BOS', "Celtics '24"],
]
console.log(`team                 OFF  DEF  OVR   (Team DB row, after)`)
for (const [y, ab, lbl] of NAMED) {
  const t = TEAMSB.find((x) => x.y === y && x.ab === ab)!
  const g = seasonGauges(t.five, y)
  console.log(`  ${lbl.padEnd(16)} ${String(g.off).padStart(4)} ${String(g.def).padStart(4)} ${String(Math.round((g.off + g.def) / 2)).padStart(4)}`)
}
const s = TEAMSB.find((x) => x.y === 2005 && x.ab === 'PHO')!
const o = teamOffense(s.five)
console.log(`\nSUBJECT DECOMPOSITION after: base ${o.base.toFixed(2)} + ft ${o.ftPts.toFixed(2)} × tov ${o.tovMult.toFixed(4)} × orb ${o.orbMult.toFixed(4)} = offRaw ${o.off.toFixed(2)}`)
const c = s.five.map((p) => creation(p.attrs))
s.five.forEach((p, i) => {
  let best = 0
  for (let j = 0; j < 5; j++) if (j !== i) best = Math.max(best, c[j])
  console.log(`  ${p.name.padEnd(24)} c ${c[i].toFixed(3)}  bestOther ${best.toFixed(3)}  recv ${(0.8 * c[i] + 0.2 * best).toFixed(3)}  (FEED_REF 0.5502)  usg ${o.lines[i].usg}  ts ${o.lines[i].ts}`)
})
