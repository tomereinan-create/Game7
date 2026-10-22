/** recal_232: for each holed roster, the fewest seats that must be played one step out of position, and the best such board. */
import { WHEEL } from '../../src/data/wheel'
import { PLAYERS } from '../../src/engine/pool'
import { startingFive } from '../../src/engine/bestfive'
import { eligible, POSITIONS } from '../../src/engine/positions'
import { LINES } from '../../src/ui/Stat'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const el = (p: Player) => eligible(LINES[p.name]?.pos)
const near = (p: Player, s: number) => el(p).some((x) => Math.abs(POSITIONS.indexOf(x) - s) === 1)
const hist: Record<string, number> = {}
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  if (roster.length < 5) continue
  const sf = startingFive(roster).five
  if (sf.every(Boolean)) continue
  let best: { oop: number; sum: number; board: string[] } | null = null
  const used = new Set<string>()
  const board: string[] = []
  const walk = (i: number, oop: number, sum: number) => {
    if (i === 5) {
      if (!best || oop < best.oop || (oop === best.oop && sum > best.sum)) best = { oop, sum, board: [...board] }
      return
    }
    for (const p of roster) {
      if (used.has(p.name)) continue
      const ok = el(p).includes(POSITIONS[i])
      const nb = !ok && near(p, i)
      if (!ok && !nb) continue
      used.add(p.name)
      board.push(`${p.name}${nb ? `[${el(p).join('/')}@${POSITIONS[i]}]` : ''}`)
      walk(i + 1, oop + (nb ? 1 : 0), sum + p.ovr)
      board.pop()
      used.delete(p.name)
    }
  }
  walk(0, 0, 0)
  const b = best as { oop: number; sum: number; board: string[] } | null
  const k = b ? String(b.oop) : 'none'
  hist[k] = (hist[k] ?? 0) + 1
  console.log(`${t.team} '${String(t.y).slice(2)}: minOOP ${k}  ${b ? b.board.join(' · ') : ''}`)
}
console.log(hist)
