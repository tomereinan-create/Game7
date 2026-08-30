/** recal_69: fieldability sweep after the one-team-per-season data law. Read-only. */
import { readFileSync } from 'node:fs'
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const fieldable = (p: string[]) => startingFive(p.map((n) => BY.get(n)).filter((x): x is Player => !!x)).five.filter((x) => !!x).length

const oldTs = JSON.parse(readFileSync(process.env.TEMP + '\\ts_before69.json', 'utf8')) as typeof WHEEL
let oldBad = 0
let newBad = 0
const newlyBad: string[] = []
const oldBadSet = new Set<string>()
for (const t of oldTs) if (fieldable(t.p) < 5) { oldBad++; oldBadSet.add(`${t.y}|${t.ab}`) }
for (const t of WHEEL) if (fieldable(t.p) < 5) {
  newBad++
  if (!oldBadSet.has(`${t.y}|${t.ab}`)) newlyBad.push(`${t.team} '${String(t.y % 100).padStart(2, '0')} (${fieldable(t.p)})`)
}
console.log(`wheel teams that cannot field five: ${oldBad} -> ${newBad} of ${WHEEL.length}`)
console.log('newly unfieldable:', newlyBad.join(' · ') || 'none')
const g13 = WHEEL.find((t) => t.y === 2013 && t.ab === 'MEM')!
console.log("Grizzlies '13 roster now:", g13.p.join(' · '))
const f13 = startingFive(g13.p.map((n) => BY.get(n)).filter((x): x is Player => !!x)).five.filter((x): x is Player => !!x)
console.log("Grizzlies '13 best five now:", f13.map((p) => p.name).join(' · '))
const o13 = oldTs.find((t) => t.y === 2013 && t.ab === 'MEM')!
console.log("Grizzlies '13 roster before:", o13.p.join(' · '))
