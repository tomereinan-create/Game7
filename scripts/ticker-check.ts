/** Sanity-check Game 7 pacing: how many ticks, how long the feed actually runs. */
import OPPONENTS from '../src/data/opponents.json'
import { makeRng } from '../src/engine/rng'
import { buildTicker } from '../src/engine/ticker'
import type { Opponent } from '../src/engine/types'

const FAST = 75
const SLOW = 240

const opps = OPPONENTS as Opponent[]
const us = opps[5].players
const them = opps[7].players

console.log('margin  ticks  slow  Q1-Q3      total    final')
for (const margin of [1, 3, 5, 8, 14, 25, -2, -6, -20]) {
  let ticks = 0
  let slow = 0
  let pre = 0
  let total = 0
  let sample = ''
  const N = 200
  for (let i = 0; i < N; i++) {
    const t = buildTicker(margin, us, them, makeRng(9000 + i))
    ticks += t.ticks.length
    slow += t.ticks.filter((x) => x.slow).length
    const q4 = t.ticks.findIndex((x) => x.q === 4)
    pre += q4 * FAST
    total += t.ticks.reduce((a, x) => a + (x.slow ? SLOW : FAST), 0)
    if (i === 0) sample = `${t.us}-${t.them}`
  }
  console.log(
    `${String(margin).padStart(5)}  ${(ticks / N).toFixed(0).padStart(5)}  ${(slow / N).toFixed(0).padStart(4)}  ` +
      `${(pre / N / 1000).toFixed(1).padStart(6)}s  ${(total / N / 1000).toFixed(1).padStart(6)}s   ${sample}`,
  )
}

// Does every tape land exactly on the reported final score?
let bad = 0
for (let i = 0; i < 3000; i++) {
  const m = (i % 61) - 30
  const t = buildTicker(m, us, them, makeRng(i * 31 + 5))
  const last = t.ticks[t.ticks.length - 1]
  if (last.us !== t.us || last.them !== t.them) bad++
  if (t.ticks.some((x, k) => k > 0 && (x.us < t.ticks[k - 1].us || x.them < t.ticks[k - 1].them))) bad++
  if (m > 0 !== t.us > t.them) bad++
}
console.log(`\npath integrity failures: ${bad} / 3000`)
