/** r64: the 2026 leaderboard by each team's OFF-MAXIMAL legal five. */
import { PLAYERS } from '../src/engine/pool'
import { ratings100 } from '../src/engine/offense'
import { eligible, POSITIONS } from '../src/engine/positions'
import { LINES } from '../src/ui/Stat'
import { WHEEL } from '../src/ui/Draft'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
function bestOffFive(roster: Player[]): { five: Player[]; off: number } {
  const cands = roster.map((p) => ({ p, pos: eligible(LINES[p.name]?.pos) }))
  let best: Player[] = []
  let bestOff = -1
  const slots: (Player | null)[] = POSITIONS.map(() => null)
  const used = new Set<string>()
  const walk = (i: number) => {
    if (i === POSITIONS.length) {
      const five = slots.filter((x): x is Player => !!x)
      if (five.length === 5) {
        const off = ratings100(five).offRaw
        if (off > bestOff) {
          bestOff = off
          best = [...five]
        }
      }
      return
    }
    for (const c of cands) {
      if (used.has(c.p.name) || !c.pos.includes(POSITIONS[i])) continue
      used.add(c.p.name)
      slots[i] = c.p
      walk(i + 1)
      used.delete(c.p.name)
      slots[i] = null
    }
  }
  walk(0)
  return { five: best, off: bestOff }
}
const rows = WHEEL.filter((t) => t.y === 2026).map((t) => {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  const b = bestOffFive(roster)
  return { team: t.team, rec: t.rec, off: b.off, five: b.five.map((p) => p.name.replace(/ '\d\d$/, '')) }
})
rows.sort((a, b) => b.off - a.off)
rows.forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${r.team.padEnd(26)} ${(r.rec ?? '').padEnd(6)} offRaw ${r.off.toFixed(2)}  ${i < 12 ? r.five.join(', ') : ''}`))
