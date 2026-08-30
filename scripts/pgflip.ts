/** His PG ruling — the named case, the wheel-wide flip sweep (old board vs new), and the
 *  numeric-invariance proof (slot order moves no number on the optimal path). */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { ratings100 } from '../src/engine/offense'
import { eligible, POSITIONS } from '../src/engine/positions'
import { PLAYERS } from '../src/engine/pool'
import { LINES } from '../src/ui/Stat'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))

/** The pre-ruling board: phase-1 walk only (max-OVR, first-found ties), no PG reassignment. */
function oldFive(roster: Player[]): (Player | null)[] {
  const cands = roster.map((p) => ({ p, pos: eligible(LINES[p.name]?.pos) }))
  let best: (Player | null)[] = POSITIONS.map(() => null)
  let bestSum = -1
  const slots: (Player | null)[] = POSITIONS.map(() => null)
  const used = new Set<string>()
  const walk = (i: number, sum: number) => {
    if (i === POSITIONS.length) {
      if (sum > bestSum) {
        bestSum = sum
        best = [...slots]
      }
      return
    }
    for (const c of cands) {
      if (used.has(c.p.name) || !c.pos.includes(POSITIONS[i])) continue
      used.add(c.p.name)
      slots[i] = c.p
      walk(i + 1, sum + c.p.ovr)
      used.delete(c.p.name)
      slots[i] = null
    }
    walk(i + 1, sum)
  }
  walk(0, 0)
  return best
}

const apg = (p: Player | null) => (p ? (LINES[p.name]?.apg ?? 0) : -1)

// the named case
const bos17 = WHEEL.find((t) => t.y === 2017 && /Celtics/.test(t.team))!
const r17 = bos17.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
const oldB = oldFive(r17)
const newB = startingFive(r17).five
console.log(`Boston '17 OLD: PG ${oldB[0]?.name} (apg ${apg(oldB[0])}) · SG ${oldB[1]?.name} (apg ${apg(oldB[1])})`)
console.log(`Boston '17 NEW: PG ${newB[0]?.name} (apg ${apg(newB[0])}) · SG ${newB[1]?.name} (apg ${apg(newB[1])})`)

// the sweep
let flips = 0
let setChanges = 0
let numChanges = 0
const samples: string[] = []
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const a = oldFive(roster)
  const b = startingFive(roster).five
  const setA = new Set(a.filter(Boolean).map((p) => p!.name))
  const setB = new Set(b.filter(Boolean).map((p) => p!.name))
  if (setA.size !== setB.size || [...setA].some((n) => !setB.has(n))) setChanges++
  if (a[0]?.name !== b[0]?.name) {
    flips++
    if (samples.length < 12) samples.push(`${t.team} '${String(t.y % 100).padStart(2, '0')}: PG ${a[0]?.name} (${apg(a[0])}) -> ${b[0]?.name} (${apg(b[0])})`)
  }
  const real = b.filter((p): p is Player => !!p)
  if (real.length === 5) {
    const x = ratings100(real)
    const y = ratings100([...real].reverse())
    if (Math.abs(x.offRaw - y.offRaw) > 1e-9 || Math.abs(x.drtgRef - y.drtgRef) > 1e-9) numChanges++
  }
}
console.log(`\nPG flips across the wheel: ${flips} of ${WHEEL.length} boards`)
console.log(`chosen-set changes (must be 0): ${setChanges}`)
console.log(`fives where slot order moves offRaw/drtgRef (must be 0): ${numChanges}`)
for (const s of samples) console.log('  ' + s)

// THE GATE: does the ACTUAL reassignment (old board -> new board) move any number?
let gateMoves = 0
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const a = oldFive(roster).filter((p): p is Player => !!p)
  const b = startingFive(roster).five.filter((p): p is Player => !!p)
  if (a.length !== 5 || b.length !== 5) continue
  const x = ratings100(a)
  const y = ratings100(b)
  if (Math.abs(x.offRaw - y.offRaw) > 1e-9 || Math.abs(x.drtgRef - y.drtgRef) > 1e-9) {
    gateMoves++
    console.log(`  NUMBER MOVED: ${t.team} '${String(t.y % 100).padStart(2, '0')}  off ${x.offRaw.toFixed(4)} -> ${y.offRaw.toFixed(4)}  drtg ${x.drtgRef.toFixed(4)} -> ${y.drtgRef.toFixed(4)}`)
  }
}
console.log(`GATE: fives whose off/drtg move under the reassignment itself: ${gateMoves}`)
