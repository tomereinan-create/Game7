/** recal_94 — re-derive REF_DRTG against recal_60's OWN sample and OWN rule (receipt 60's
 *  "PARITY over 300 random fives": the OFF and DEF display means must land within 0.5). */
import { RATING_SCALE, ratings100 } from '../../src/engine/offense'
import { PLAYERS } from '../../src/engine/pool'
import { makeRng } from '../../src/engine/rng'

const run = (seed: number, n: number) => {
  const rng = makeRng(seed)
  const pool = PLAYERS.filter((q) => q.ovr >= 55)
  const rand5 = () => {
    const out: (typeof PLAYERS)[number][] = []
    const seen = new Set<string>()
    while (out.length < 5) {
      const q = pool[Math.floor(rng.next() * pool.length)]
      if (!seen.has(q.player)) { seen.add(q.player); out.push(q) }
    }
    return out
  }
  let so = 0
  const drtgs: number[] = []
  for (let k = 0; k < n; k++) {
    const r = ratings100(rand5())
    so += r.off
    drtgs.push(r.drtgRef)
  }
  return { mo: so / n, drtgs }
}
for (const [seed, n, tag] of [[6060, 300, 'receipt 60 / 1976'], [6767, 300, 'receipt 67 / 3785']] as const) {
  const { mo, drtgs } = run(seed, n)
  const meanDef = (r: number) => drtgs.reduce((s, d) => s + Math.round(Math.max(1, Math.min(99, 50 + (r - d) * RATING_SCALE.K_DEF))), 0) / drtgs.length
  let best = 0
  let err = Infinity
  for (let r = 105; r <= 116; r += 0.01) {
    const e = Math.abs(meanDef(r) - mo)
    if (e < err) { err = e; best = r }
  }
  console.log(`${tag}: mean OFF ${mo.toFixed(2)}   best REF_DRTG ${best.toFixed(2)} (gap ${err.toFixed(3)})`)
  for (const r of [108.85, 108.96, 109.85, 109.9, 109.95, best]) console.log(`    REF_DRTG ${r.toFixed(2)} -> DEF ${meanDef(r).toFixed(2)}  gap ${Math.abs(meanDef(r) - mo).toFixed(2)}`)
}
