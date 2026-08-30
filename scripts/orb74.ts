/** recal_74 measurement: the halved ORB scale — channel spread, named teams, the r60 dial level,
 *  and the campaign-median REF_OFF re-derivation (its own definition: the median campaign five reads 50). */
import CAMPAIGNS from '../src/data/campaigns.json'
import { WHEEL } from '../src/data/wheel'
import { startingFive, winsOf } from '../src/engine/bestfive'
import { ratings100, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import { makeRng } from '../src/engine/rng'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))

// (a) channel spread across the full wheel
const orbEffs: number[] = []
for (const t of WHEEL) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const o = teamOffense(five)
  orbEffs.push(o.off - o.off / o.orbMult)
}
console.log(`ORB channel spread (full wheel): min +${Math.min(...orbEffs).toFixed(2)}  max +${Math.max(...orbEffs).toFixed(2)}  span ${(Math.max(...orbEffs) - Math.min(...orbEffs)).toFixed(2)} (target ~6, was ~12-13)`)

// (b) named teams
for (const [y, nm] of [[1988, '76ers'], [2026, 'Rockets'], [2026, 'Thunder'], [2026, 'Nuggets'], [2026, 'Celtics'], [2025, 'Knicks'], [2024, 'Celtics'], [2013, 'Grizzlies'], [2017, 'Warriors'], [2004, 'Pistons']] as const) {
  const t = WHEEL.find((x) => x.y === y && x.team.includes(nm))!
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length !== 5) continue
  const o = teamOffense(five)
  console.log(`  ${nm.padEnd(10)} '${String(y % 100).padStart(2, '0')}  off ${o.off.toFixed(2)}  orbMult ${o.orbMult.toFixed(4)} (+${(o.off - o.off / o.orbMult).toFixed(1)})`)
}

// (c) the campaign-median REF_OFF (its own definition) + the r60 300-five dial means
const campOffs: number[] = []
for (const tier of CAMPAIGNS as { levels: { players: Player[] }[] }[]) for (const lvl of tier.levels) campOffs.push(teamOffense(lvl.players).off)
campOffs.sort((a, b) => a - b)
console.log(`\ncampaign levels: n=${campOffs.length}, median offRaw ${campOffs[Math.floor(campOffs.length / 2)].toFixed(2)} (REF_OFF is defined as this; shipped constant 128.3)`)
const rng = makeRng(6060)
const pool = PLAYERS.filter((q) => q.ovr >= 55)
const r5 = () => {
  const out: Player[] = []
  const seen = new Set<string>()
  while (out.length < 5) {
    const q = pool[Math.floor(rng.next() * pool.length)]
    if (!seen.has(q.player)) {
      seen.add(q.player)
      out.push(q)
    }
  }
  return out
}
let so = 0
let sd = 0
for (let k = 0; k < 300; k++) {
  const r = ratings100(r5())
  so += r.off
  sd += r.def
}
console.log(`r60 dial means over 300 fives: OFF ${(so / 300).toFixed(2)}  DEF ${(sd / 300).toFixed(2)}  gap ${(Math.abs(so - sd) / 300).toFixed(2)}`)

// (d) 2025 wins gate
const rows25: { w: number; off: number }[] = []
for (const t of WHEEL.filter((x) => x.y === 2025)) {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  if (five.length === 5) rows25.push({ w: winsOf(t.rec), off: teamOffense(five).off })
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const pear = (xs: number[], ys: number[]) => {
  const mx = mean(xs)
  const my = mean(ys)
  let n = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    n += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  return n / Math.sqrt(dx * dy)
}
console.log(`2025 wins gate: r_off ${pear(rows25.map((r) => r.off), rows25.map((r) => r.w)).toFixed(3)} (was 0.478; n=${rows25.length})`)
