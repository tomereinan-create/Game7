/**
 * o_score term decomposition, side by side (recal_26 item 4).
 *
 * Mirrors data/compute_ovr.py's o_score exactly, term for term, so a calibration pair can be argued
 * about in terms of WHICH TERM carries the gap rather than the gap itself.
 *
 *     npm run pair -- "Chauncey Billups '06" "Derrick White '25"
 */
import { PLAYERS } from '../src/engine/pool'

type Card = (typeof PLAYERS)[number]
const KNEE = 93.0
const OFF_TOP = 101.56
const MULT = 0.93
const band = (raw: number) => (raw <= KNEE ? raw : KNEE + ((raw - KNEE) * (99.0 - KNEE)) / (OFF_TOP - KNEE))

interface Term {
  label: string
  value: (a: Card['attrs']) => number
}
const TERMS: Term[] = [
  { label: '0.25 x best zone', value: (a) => 0.25 * Math.max(a['3pt'], a.rim, a.mid) },
  { label: '0.09 x second zone', value: (a) => 0.09 * [a['3pt'], a.rim, a.mid].sort((x, y) => y - x)[1] },
  { label: '0.06 x third zone', value: (a) => 0.06 * [a['3pt'], a.rim, a.mid].sort((x, y) => y - x)[2] },
  { label: '0.10 x efficiency', value: (a) => 0.1 * a.efficiency },
  { label: '0.24 x volume', value: (a) => 0.24 * a.volume },
  { label: '0.17 x playvol', value: (a) => 0.17 * a.playvol },
  { label: '0.10 x ballsec', value: (a) => 0.1 * a.ballsec },
  { label: '0.11 x fouldraw*ft', value: (a) => 0.11 * ((a.fouldraw * a.ft) / 100) },
  { label: '0.03 x orb', value: (a) => 0.03 * a.orb },
  { label: '0.08 x max(volume,50)*eff', value: (a) => 0.08 * ((Math.max(a.volume, 50) * a.efficiency) / 100) },
]

const names = process.argv.slice(2).filter((s) => !s.startsWith('-'))
const cards = names.map((n) => {
  const p = PLAYERS.find((x) => x.name === n)
  if (!p) throw new Error(`no card named ${n}`)
  return p
})

const col = (s: string | number, w = 14) => String(s).padStart(w)
console.log(`\n${'term'.padEnd(26)}${cards.map((c) => col(c.name.replace(/ '\d\d$/, ''))).join('')}${col('gap')}`)
console.log('-'.repeat(26 + 14 * (cards.length + 1)))
let sums = cards.map(() => 0)
for (const t of TERMS) {
  const vs = cards.map((c) => t.value(c.attrs))
  sums = sums.map((s, i) => s + vs[i])
  console.log(`${t.label.padEnd(26)}${vs.map((v) => col(v.toFixed(2))).join('')}${col((vs[0] - vs[1]).toFixed(2))}`)
}
console.log(`${'= std (sum of terms)'.padEnd(26)}${sums.map((v) => col(v.toFixed(2))).join('')}${col((sums[0] - sums[1]).toFixed(2))}`)

// the floors are MAX branches: whichever is highest replaces the sum
console.log('')
const floors = cards.map((c) => {
  const a = c.attrs
  const z = [a['3pt'], a.rim, a.mid].sort((x, y) => y - x)
  const out: [string, number][] = []
  if (z[0] >= 80) out.push(['specialist', 0.42 * z[0] + 0.24 * a.efficiency + 0.05 * a.ballsec])
  if (z[0] >= 82 && a.volume >= 90 && a.efficiency >= 45)
    out.push(['maestro', 0.4 * z[0] + 0.12 * a.volume + 0.1 * a.ballsec + 0.08 * ((a.fouldraw * a.ft) / 100) + 0.05 * a.playvol + 0.2 * a.efficiency])
  if (a.playvol >= 85 && a.volume >= 90)
    out.push(['creator', 0.42 * a.playvol + 0.14 * a.volume + 0.05 * a.ballsec + 0.18 * z[0] + 0.05 * a.efficiency + 0.05 * ((a.fouldraw * a.ft) / 100)])
  return out
})
cards.forEach((c, i) => {
  const fired = floors[i]
  console.log(`${c.name}: floors ${fired.length ? fired.map(([n, v]) => `${n} ${v.toFixed(2)}`).join(', ') : 'none fire'}`)
})

const finals = cards.map((c, i) => {
  // r34 DELETED the three conditional bonuses. The winner is the plain max of the sum and the floors.
  const std = Math.max(sums[i], ...floors[i].map(([, v]) => v))
  console.log(`${c.name}: winner ${std.toFixed(2)} (no conditional bonuses exist in r34)`)
  return std
})
console.log('')
cards.forEach((c, i) => {
  const raw = finals[i] * MULT
  console.log(`${c.name.padEnd(26)} std ${finals[i].toFixed(2)} x${MULT} = ${raw.toFixed(2)} -> band ${band(raw).toFixed(2)} -> OFF ${Math.min(99, Math.round(band(raw)))} (card says ${c.o_ovr})`)
})
console.log(`\nGAP ${cards[0].o_ovr - cards[1].o_ovr} OFF points`)
