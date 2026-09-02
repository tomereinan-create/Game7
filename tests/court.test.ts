import { describe, expect, it } from 'vitest'
import { outsideLine, spotsFor } from '../src/ui/CourtFive'
import type { Player } from '../src/engine/types'
import { PLAYERS } from '../src/engine/pool'

/**
 * THE DRAWN SET, held to the shape he called for.
 *
 * HIS RULING: "Balanced should be 4 out 1 in not 3 out 1 in" — the default formation stood two men
 * inside (the PF on the block beside the C), and must stand exactly one. It is the shape every
 * screen falls back to (the draft, the scout court, the team db, an ungated plan), so this holds
 * the drawn floor and not one screen's copy of it.
 */
const g = (n: string): Player => {
  const p = PLAYERS.find((q) => q.name === n)
  if (!p) throw new Error(`no card: ${n}`)
  return p
}
const FIVE = [
  g("Stephen Curry '16"),
  g("Klay Thompson '15"),
  g("LeBron James '13"),
  g("Draymond Green '16"),
  g("Rudy Gobert '17"),
]
const nulls = [null, null, null, null, null]
const inside = (at: readonly (readonly [number, number])[]) => at.filter((xy) => !outsideLine(xy)).length

describe('the balanced set stands four out and one in', () => {
  it('one man inside the three-point line, four behind it', () => {
    const at = spotsFor('balanced', FIVE)
    expect(at).toHaveLength(5)
    expect(inside(at)).toBe(1)
  })

  it('is the shape drawn with no plan at all (the team db, the scout court, the draft)', () => {
    expect(spotsFor(undefined, FIVE)).toEqual(spotsFor('balanced', FIVE))
    // and while the five is still being filled, so an empty draft floor stands balanced too
    expect(inside(spotsFor(undefined, nulls))).toBe(1)
  })

  it('leaves five-out alone: all five behind the line', () => {
    expect(inside(spotsFor('fiveout', FIVE))).toBe(0)
  })
})
