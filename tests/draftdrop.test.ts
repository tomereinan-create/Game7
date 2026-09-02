import { describe, expect, it } from 'vitest'
import type { Pos } from '../src/engine/positions'
import { canDropAt, dropDraft } from '../src/ui/Draft'

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
