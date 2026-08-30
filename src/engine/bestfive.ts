import { eligible, POSITIONS } from './positions'
import { LINES } from '../ui/Stat'
import type { Player } from './types'

/** "62–20" -> 62; no record reads as 0 wins. */
export const winsOf = (rec: string | null) => (rec ? parseInt(rec, 10) || 0 : 0)

/**
 * The starting five: one man per slot, the legal PG-to-C board that maximizes
 * total OVR — the same position rules the draft plays by.
 */
export function startingFive(roster: Player[]): { five: (Player | null)[]; bench: Player[] } {
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
    // a roster hole (nobody left for the slot) still counts as a board
    walk(i + 1, sum)
  }
  walk(0, 0)
  const picked = new Set(best.filter(Boolean).map((p) => p!.name))
  return { five: best, bench: roster.filter((p) => !picked.has(p.name)).sort((a, b) => b.ovr - a.ovr) }
}
