/** recal_68 item-3 MEASUREMENT (read-only): monotonicity of the team indexes under
 *  strictly-better card swaps. 500 seeded swaps; violations printed with the pair.
 *  Run as evidence for the design-side ruling — the permanent test ships only with items 2-3. */
import { ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import { makeRng } from '../src/engine/rng'
import type { Player } from '../src/engine/types'

const rng = makeRng(6868)
const pool = PLAYERS.filter((q) => q.ovr >= 55)
const NUM_KEYS = Object.keys(pool[0].attrs).filter((k) => typeof (pool[0].attrs as never)[k] === 'number')

const dominates = (a: Player, b: Player) => {
  // a strictly better than b: >= on every numeric attrs key, > on at least one
  let strict = false
  for (const k of NUM_KEYS) {
    const av = (a.attrs as never)[k] as number
    const bv = (b.attrs as never)[k] as number
    if (av < bv) return false
    if (av > bv) strict = true
  }
  return strict
}

const pick = () => pool[Math.floor(rng.next() * pool.length)]
const randFive = (): Player[] => {
  const out: Player[] = []
  const seen = new Set<string>()
  while (out.length < 5) {
    const q = pick()
    if (!seen.has(q.player)) {
      seen.add(q.player)
      out.push(q)
    }
  }
  return out
}

let done = 0
let offViol = 0
let defViol = 0
let attempts = 0
const t0 = Date.now()
while (done < 500 && attempts < 2_000_000) {
  attempts++
  const five = randFive()
  const i = Math.floor(rng.next() * 5)
  // scan from a random start for a dominator of five[i] not already in the five
  const start = Math.floor(rng.next() * pool.length)
  let better: Player | null = null
  for (let k = 0; k < pool.length; k++) {
    const cand = pool[(start + k) % pool.length]
    if (cand.name === five[i].name) continue
    if (five.some((p) => p.player === cand.player)) continue
    if (dominates(cand, five[i])) {
      better = cand
      break
    }
  }
  if (!better) continue
  const before = ratings100(five)
  const after5 = five.slice()
  after5[i] = better
  const after = ratings100(after5)
  const offBad = after.offRaw < before.offRaw - 1e-9
  const defBad = after.drtgRef > before.drtgRef + 1e-9
  if (offBad || defBad) {
    if (offBad) offViol++
    if (defBad) defViol++
    console.log(`VIOLATION ${offBad ? '[OFF]' : ''}${defBad ? '[DEF]' : ''}  ${five[i].name} -> ${better.name}`)
    console.log(`  five: ${five.map((p) => p.name).join(' · ')}`)
    console.log(`  offRaw ${before.offRaw.toFixed(3)} -> ${after.offRaw.toFixed(3)}   drtgRef ${before.drtgRef.toFixed(3)} -> ${after.drtgRef.toFixed(3)}`)
  }
  done++
}
console.log(`\n${done} strictly-better swaps measured (${attempts} fives sampled, ${((Date.now() - t0) / 1000).toFixed(1)}s)`)
console.log(`OFF violations: ${offViol}   DEF violations: ${defViol}`)
