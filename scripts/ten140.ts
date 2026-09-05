/** recal_140 — TEN TEAMS before -> after, the movers, the decade means, and the summit order. */
import { teamOffense } from '../src/engine/offense'
import { evalB, offB, TEAMSB, type ParB } from './sweep140b'

const OLD: ParB = { F: 0, AMP: 0.22, REF: 0.515, team: true, blend: false }
const NEW: ParB = { F: 0.2, AMP: 0.26, REF: 0.5502, team: false, blend: true }

let worst = 0
for (const t of TEAMSB) worst = Math.max(worst, Math.abs(offB(t.five, NEW) - teamOffense(t.five).off))
console.log(`NEW params vs the SHIPPED engine: worst |Δ| = ${worst.toExponential(2)} over ${TEAMSB.length} fives`)

const A = evalB(OLD), B = evalB(NEW)
console.log(`\nFIT ${A.fit.toFixed(4)} -> ${B.fit.toFixed(4)}`)
console.log(`  80s ${A.dec[0].toFixed(3)} -> ${B.dec[0].toFixed(3)} · 90s ${A.dec[1].toFixed(3)} -> ${B.dec[1].toFixed(3)} · 00s ${A.dec[2].toFixed(3)} -> ${B.dec[2].toFixed(3)} · 10s ${A.dec[3].toFixed(3)} -> ${B.dec[3].toFixed(3)} · 20s ${A.dec[4].toFixed(3)} -> ${B.dec[4].toFixed(3)}`)
console.log(`DECADE MEAN DIAL  ${A.decDial.map((v, i) => `${['80s', '90s', '00s', '10s', '20s'][i]} ${v.toFixed(1)}->${B.decDial[i].toFixed(1)}`).join(' · ')}`)
console.log(`gauge OLD ${JSON.stringify(A.G)}\ngauge NEW ${JSON.stringify(B.G)}`)

const NAMED: [number, string, string][] = [
  [2005, 'PHO', "Suns '05 (SUBJECT)"], [2006, 'PHO', "Suns '06"], [2007, 'PHO', "Suns '07"],
  [2000, 'IND', "Pacers '00"], [2005, 'MIA', "Heat '05"], [1997, 'UTA', "Jazz '97"],
  [2018, 'HOU', "Rockets '18"], [2023, 'DEN', "Nuggets '23"], [2017, 'GSW', "Warriors '17"],
  [1996, 'CHI', "Bulls '96"], [2000, 'LAL', "Lakers '00"], [2024, 'BOS', "Celtics '24"],
]
console.log(`\nTEN TEAMS — OFF dial before -> after, season rank before -> after (real ORtg rank)`)
for (const [y, ab, lbl] of NAMED) {
  const t = TEAMSB.find((x) => x.y === y && x.ab === ab)!
  const g = TEAMSB.filter((x) => x.y === y && x.ortg !== undefined)
  const rr = t.ortg === undefined ? '-' : `${g.filter((x) => x.ortg! > t.ortg!).length + 1}/${g.length}`
  const [a1, an] = A.rank(y, ab), [b1] = B.rank(y, ab)
  console.log(`  ${lbl.padEnd(20)} ${String(A.dial(y, ab)).padStart(2)} -> ${String(B.dial(y, ab)).padStart(2)}   rank ${a1}/${an} -> ${b1}/${an}   (real ${rr}, ORtg ${t.ortg})   offRaw ${offB(t.five, OLD).toFixed(2)} -> ${offB(t.five, NEW).toFixed(2)}`)
}

console.log(`\nADJUSTED ALL-TIME ORDER, after — the summit:`)
B.order.forEach((o, i) => console.log(`  ${i + 1}. ${o.y} ${o.team.padEnd(24)} adj ${o.adj.toFixed(3)}  dial ${o.dial}`))
console.log(`  fives above the Warriors '17 on the adjusted index: ${B.above} (before: ${A.above}) · fives reading 99: ${B.n99} (before: ${A.n99})`)

const moved = TEAMSB.map((t) => ({ t, d: B.dial(t.y, t.ab) - A.dial(t.y, t.ab) }))
const nz = moved.filter((m) => m.d !== 0)
nz.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
console.log(`\nFOOTPRINT: the OFF dial moved on ${nz.length} of ${TEAMSB.length} fives, max +${Math.max(...nz.map((m) => m.d))} / ${Math.min(...nz.map((m) => m.d))}`)
console.log(`  biggest risers: ${nz.filter((m) => m.d > 0).slice(0, 6).map((m) => `${m.t.y} ${m.t.ab} ${A.dial(m.t.y, m.t.ab)}->${B.dial(m.t.y, m.t.ab)}`).join(' · ')}`)
console.log(`  biggest fallers: ${nz.filter((m) => m.d < 0).slice(0, 6).map((m) => `${m.t.y} ${m.t.ab} ${A.dial(m.t.y, m.t.ab)}->${B.dial(m.t.y, m.t.ab)}`).join(' · ')}`)
