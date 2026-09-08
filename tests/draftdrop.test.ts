import { describe, expect, it } from 'vitest'
import type { Pos } from '../src/engine/positions'
import { canDropAt, dropDraft, wheelOrder } from '../src/ui/Draft'

/**
 * HIS RULING: "Add the ability to draft a player by dragging him to the court". Dropping a man on
 * an open ring must leave exactly the five the "Draft X at Y" button leaves — and refuse exactly
 * what the button refuses. Derived state only, the way tests/slots.test.ts reads the tap-move.
 */
const POS: Record<string, Pos[]> = {
  Brandon: ['PG'],
  Johnson: ['SG', 'SF'],
  Jones: ['SF', 'PF'],
  Shaq: ['C'],
}
const posOf = (n: string) => POS[n] ?? []

describe('drafting by dropping a man on the court', () => {
  const slots: Partial<Record<Pos, string>> = { PG: 'Brandon', SG: 'Johnson' }

  it('drafts him onto an open ring he can play', () => {
    expect(canDropAt(slots, posOf, 'Jones', 'SF')).toBe(true)
    expect(dropDraft(slots, posOf, 'Jones', 'SF')).toEqual({ PG: 'Brandon', SG: 'Johnson', SF: 'Jones' })
    // both of his positions are targets while both are open
    expect(canDropAt(slots, posOf, 'Jones', 'PF')).toBe(true)
    expect(dropDraft(slots, posOf, 'Jones', 'PF')).toEqual({ PG: 'Brandon', SG: 'Johnson', PF: 'Jones' })
  })

  it('refuses a ring he cannot play, and leaves the five untouched', () => {
    expect(canDropAt(slots, posOf, 'Shaq', 'PF')).toBe(false)
    expect(dropDraft(slots, posOf, 'Shaq', 'PF')).toBe(slots) // same object: no draft happened
    expect(canDropAt(slots, posOf, 'Jones', 'C')).toBe(false)
  })

  it('refuses an occupied ring — this is drafting, not swapping', () => {
    expect(canDropAt(slots, posOf, 'Johnson', 'SG')).toBe(false)
    expect(canDropAt(slots, posOf, 'Jones', 'SG')).toBe(false)
    expect(dropDraft(slots, posOf, 'Jones', 'SG')).toBe(slots)
  })

  it('refuses a man with no lifetime positions on file', () => {
    expect(canDropAt(slots, posOf, 'Nobody', 'C')).toBe(false)
  })

  it('never mutates the five it was given', () => {
    const before = { ...slots }
    dropDraft(slots, posOf, 'Jones', 'SF')
    expect(slots).toEqual(before)
  })
})

/**
 * HIS RULING: "Have the eligible players first then the ineligible." The wheel's roster used to be
 * one box-score list — points per game first — and a fifteen-man team could open with four men who
 * play no open ring, so the top of the list was rows he could not press. The dimming stays; the
 * order now says the same thing before he reads a word.
 *
 * The men below carry no stat line (they are not in the pool), so PPG is undefined for all of them
 * and the box-score key falls through to OVR — which is exactly what makes the eligibility key
 * visible on its own here.
 */
describe("the wheel's roster puts the men he can take first", () => {
  const men = [
    { name: 'Star', ovr: 95 },
    { name: 'Wrong position', ovr: 92 },
    { name: 'Role man', ovr: 70 },
    { name: 'Over the cap', ovr: 88 },
  ]
  const canTake = (n: string) => n === 'Star' || n === 'Role man'

  it('every eligible man stands above every ineligible one, however good the ineligible are', () => {
    expect(wheelOrder(men, canTake).map((m) => m.name)).toEqual(['Star', 'Role man', 'Wrong position', 'Over the cap'])
  })

  it('within each half the old order survives — the better man first', () => {
    const all = () => true
    expect(wheelOrder(men, all).map((m) => m.name)).toEqual(['Star', 'Wrong position', 'Over the cap', 'Role man'])
  })

  it('does not mutate the list it was handed', () => {
    const before = men.map((m) => m.name)
    wheelOrder(men, canTake)
    expect(men.map((m) => m.name)).toEqual(before)
  })

  it('a roster nobody can be taken from keeps its own order rather than shuffling', () => {
    const none = () => false
    expect(wheelOrder(men, none).map((m) => m.name)).toEqual(['Star', 'Wrong position', 'Over the cap', 'Role man'])
  })
})
