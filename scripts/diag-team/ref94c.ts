/** recal_94 — re-derive ratings100's REF_DRTG by recal_60's OWN rule: "One dial moves: the display
 *  DRtg reference, until the two means match" — over random drafted fives from the pool. */
import { LINES } from '../../src/ui/Stat'
import { eligible, POSITIONS } from '../../src/engine/positions'
import { defenseVs, RATING_SCALE, REF_FIVE, teamOffense } from '../../src/engine/offense'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

let s = 20260902
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const bySlot = POSITIONS.map((pos) => PLAYERS.filter((p) => eligible(LINES[p.name]?.pos).includes(pos)))
const drtgs: number[] = []
const offs: number[] = []
for (let k = 0; k < 4000; k++) {
  const used = new Set<string>()
  const five: Player[] = []
  for (let i = 0; i < 5; i++) {
    let p: Player | undefined
    for (let t = 0; t < 50 && !p; t++) {
      const c = bySlot[i][Math.floor(rnd() * bySlot[i].length)]
      if (c && !used.has(c.name)) p = c
    }
    if (!p) break
    used.add(p.name)
    five.push(p)
  }
  if (five.length !== 5) continue
  drtgs.push(defenseVs(five, REF_FIVE).drtg)
  offs.push(teamOffense(five).off)
}
const REF_OFF = 124.03
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const o100 = offs.map((o) => Math.round(Math.max(1, Math.min(99, 50 + (o - REF_OFF) * RATING_SCALE.K_OFF))))
const mo = mean(o100)
console.log(`n ${offs.length}  mean OFF dial ${mo.toFixed(2)}`)
let best = 0
let bestErr = Infinity
for (let r = 105; r <= 116; r += 0.01) {
  const md = mean(drtgs.map((d) => Math.round(Math.max(1, Math.min(99, 50 + (r - d) * RATING_SCALE.K_DEF)))))
  const e = Math.abs(md - mo)
  if (e < bestErr) { bestErr = e; best = r }
}
console.log(`REF_DRTG that matches the two means: ${best.toFixed(2)}  (|mean gap| ${bestErr.toFixed(3)})`)
for (const r of [108.85, 113.1, best]) {
  const md = mean(drtgs.map((d) => Math.round(Math.max(1, Math.min(99, 50 + (r - d) * RATING_SCALE.K_DEF)))))
  console.log(`  REF_DRTG ${r.toFixed(2)} -> mean DEF dial ${md.toFixed(2)}`)
}
