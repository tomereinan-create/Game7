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
  // HIS RULING (post-recal_74): "If 2 players can play pg/sg, the one with more ast gets the pg
  // position." Slot assignment is a TIE-BREAK among legal boards of the SAME chosen five — the
  // max-OVR set never changes; of every legal arrangement of the chosen men, the board whose PG has
  // the most assists wins, remaining ties keep the first stable arrangement. Slot order feeds no
  // number on the optimal path (team math is order-invariant; receipts verified identical) — the
  // naive matchup board follows the displayed slots by design, which is the point of the ruling.
  const chosen = best.filter((p): p is Player => !!p)
  if (chosen.length > 1) {
    const apg = (p: Player | null) => (p ? (LINES[p.name]?.apg ?? 0) : -1)
    const slots2: (Player | null)[] = POSITIONS.map(() => null)
    let board2: (Player | null)[] = best
    let bestKey = -Infinity
    const place = (idx: number) => {
      if (idx === chosen.length) {
        const key = apg(slots2[0])
        if (key > bestKey) {
          bestKey = key
          board2 = [...slots2]
        }
        return
      }
      const pos = eligible(LINES[chosen[idx].name]?.pos)
      for (let s = 0; s < POSITIONS.length; s++) {
        if (slots2[s] || !pos.includes(POSITIONS[s])) continue
        slots2[s] = chosen[idx]
        place(idx + 1)
        slots2[s] = null
      }
    }
    place(0)
    best = board2
  }
  const picked = new Set(best.filter(Boolean).map((p) => p!.name))
  return { five: best, bench: roster.filter((p) => !picked.has(p.name)).sort((a, b) => b.ovr - a.ovr) }
}
