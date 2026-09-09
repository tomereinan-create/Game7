import type { Pos } from './positions'

export type Slots = Partial<Record<Pos, string>>

/**
 * Moving a drafted player between positions — by drag or by tap, same rule:
 * he may go to any of his lifetime positions; into a taken slot only if the
 * player there can take the slot he leaves (a swap).
 */
export function canMoveSlot(slots: Slots, posOf: (name: string) => readonly Pos[], from: Pos, to: Pos): boolean {
  const name = slots[from]
  if (!name || from === to || !posOf(name).includes(to)) return false
  const other = slots[to]
  return !other || posOf(other).includes(from)
}

export function moveSlot(slots: Slots, posOf: (name: string) => readonly Pos[], from: Pos, to: Pos): Slots {
  if (!canMoveSlot(slots, posOf, from, to)) return slots
  const next: Slots = { ...slots }
  const name = slots[from]!
  const other = slots[to]
  next[to] = name
  if (other) next[from] = other
  else delete next[from]
  return next
}

/**
 * CAN THESE MEN STILL FILL THESE RINGS? (G10, 2026-09-10)
 *
 * A position constraint is not just "may this man stand here" — it is also "if he stands here, can
 * everyone else still be placed". The campaign never needs to ask: it draws from an unlimited pool
 * and `landOn` simply refuses to settle the wheel on a team with nobody for an open ring. A hot
 * seat is different — two people share ONE board of twelve cards, and a pick that is legal on its
 * own can leave the other drafter with no centre and no way to finish.
 *
 * So: maximum bipartite matching (Kuhn's augmenting path) from `men` to a MULTISET of demanded
 * rings. True iff every demanded ring can be given a distinct man. `demand` is a multiset on
 * purpose — two sides each needing a PG is two demands, not one.
 *
 * `posOf` is called once per man here rather than per edge; pass a memoised one when sweeping a
 * whole board, since `eligible()` allocates on every call.
 */
export function canStillFill(men: readonly string[], posOf: (name: string) => readonly Pos[], demand: readonly Pos[]): boolean {
  if (demand.length === 0) return true
  if (men.length < demand.length) return false
  const can = men.map((n) => new Set(posOf(n)))
  // matchedBy[d] = index into `men` currently assigned to demand d, or -1
  const matchedBy: number[] = demand.map(() => -1)
  const tryAssign = (man: number, seen: boolean[]): boolean => {
    for (let d = 0; d < demand.length; d++) {
      if (seen[d] || !can[man].has(demand[d])) continue
      seen[d] = true
      if (matchedBy[d] === -1 || tryAssign(matchedBy[d], seen)) {
        matchedBy[d] = man
        return true
      }
    }
    return false
  }
  let placed = 0
  for (let m = 0; m < men.length && placed < demand.length; m++) {
    if (tryAssign(m, demand.map(() => false))) placed++
  }
  return placed === demand.length
}
