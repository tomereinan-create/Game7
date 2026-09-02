/** recal_94 — the population recal_60's _REF_DRTG names: "plausible drafted fives, sampled from the
 *  pool". 4,000 random legal PG..C fives, fixed seed, so before/after are the SAME fives. */
import { LINES } from '../../src/ui/Stat'
import { eligible, POSITIONS } from '../../src/engine/positions'
import { defenseVs, REF_FIVE, teamOffense } from '../../src/engine/offense'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

let s = 20260902
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const bySlot = POSITIONS.map((pos) => PLAYERS.filter((p) => eligible(LINES[p.name]?.pos).includes(pos)))
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
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
console.log(`random drafted fives: ${drtgs.length}`)
console.log(`  drtgRef median ${med(drtgs).toFixed(3)}   offRaw median ${med(offs).toFixed(3)}`)
