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
