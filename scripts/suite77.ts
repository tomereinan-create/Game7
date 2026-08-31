/** recal_77 item 2 — the full eight-team anchor suite on BOTH bases.
 *
 *  The round states its bands on WITHIN-SEASON gauges, but recal_71 retired that basis on Tomer's
 *  own order ("Instead of scale 1-99 make it more balanced. 99 Should be one of the greatests
 *  offense ever(2017 warriors)" + "Do the same for DEF, 99 is 2004 pistons"). So both readings are
 *  printed side by side: the within-season percentile is DIAGNOSTIC ONLY, the all-time scale is the
 *  shipped dial and carries the verdict. Same resolution as recal 73. */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const fiveOf = (y: number, key: string) => {
  const t = WHEEL.find((x) => x.y === y && x.team.includes(key))
  if (!t) return null
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  return five.length === 5 ? { team: t.team, five } : { team: t.team, five: null }
}
/** Within-season percentile, the retired basis, recomputed here for the diagnostic column. */
function withinSeason(y: number, offRaw: number, drtg: number) {
  const offs: number[] = []
  const drtgs: number[] = []
  for (const t of WHEEL.filter((x) => x.y === y)) {
    const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
    if (five.length !== 5) continue
    const r = ratings100(five)
    offs.push(r.offRaw)
    drtgs.push(r.drtgRef)
  }
  const pct = (arr: number[], v: number, lowerBetter = false) => {
    if (arr.length < 2) return 50
    const worse = arr.filter((x) => (lowerBetter ? x > v : x < v)).length
    const ties = arr.filter((x) => x === v).length
    return Math.round(1 + (98 * (worse + Math.max(0, ties - 1) / 2)) / (arr.length - 1))
  }
  return { off: pct(offs, offRaw), def: pct(drtgs, drtg, true), n: offs.length }
}

type B = [number | null, number | null]
const SUITE: { y: number; key: string; label: string; off: B; def: B }[] = [
  { y: 2026, key: 'Thunder', label: "OKC '26", off: [88, null], def: [95, null] },
  { y: 2025, key: 'Thunder', label: "OKC '25", off: [85, null], def: [95, null] },
  { y: 2025, key: 'Knicks', label: "Knicks '25", off: [65, 80], def: [35, 55] },
  { y: 2024, key: 'Celtics', label: "Celtics '24", off: [90, null], def: [85, null] },
  { y: 2025, key: 'Wizards', label: "Wizards '25", off: [null, 24], def: [null, 24] },
  { y: 2013, key: 'Grizzlies', label: "Grizzlies '13", off: [40, 60], def: [85, null] },
  { y: 1988, key: '76ers', label: "Philly '88", off: [35, 60], def: [30, 55] },
  { y: 2026, key: 'Celtics', label: "Boston '26", off: [70, 85], def: [null, null] },
]
const inB = (v: number, [lo, hi]: B) => (lo === null || v >= lo) && (hi === null || v <= hi)
const txt = ([lo, hi]: B) => (lo === null && hi === null ? 'any' : lo !== null && hi !== null ? `${lo}-${hi}` : lo !== null ? `${lo}+` : `<${(hi ?? 0) + 1}`)

console.log('team           band OFF   band DEF |  ALL-TIME (shipped)   |  WITHIN-SEASON (diagnostic)')
let allTime = 0
let within = 0
let measurable = 0
for (const s of SUITE) {
  const f = fiveOf(s.y, s.key)
  if (!f || !f.five) {
    console.log(`${s.label.padEnd(14)} ${txt(s.off).padEnd(10)} ${txt(s.def).padEnd(9)}|  cannot field five — UNMEASURABLE`)
    continue
  }
  measurable++
  const g = seasonGauges(f.five, s.y)
  const w = withinSeason(s.y, g.offRaw, g.drtgRef)
  const aOk = inB(g.off, s.off) && inB(g.def, s.def)
  const wOk = inB(w.off, s.off) && inB(w.def, s.def)
  if (aOk) allTime++
  if (wOk) within++
  console.log(
    `${s.label.padEnd(14)} ${txt(s.off).padEnd(10)} ${txt(s.def).padEnd(9)}|  OFF ${String(g.off).padStart(2)} ${inB(g.off, s.off) ? 'PASS' : 'FAIL'}  DEF ${String(g.def).padStart(2)} ${inB(g.def, s.def) ? 'PASS' : 'FAIL'} |  OFF ${String(w.off).padStart(3)} ${inB(w.off, s.off) ? 'PASS' : 'FAIL'}  DEF ${String(w.def).padStart(3)} ${inB(w.def, s.def) ? 'PASS' : 'FAIL'}  (n=${w.n})`,
  )
}
console.log(`\nteams holding BOTH bands simultaneously — all-time (shipped): ${allTime}/${measurable} · within-season (diagnostic): ${within}/${measurable}`)
