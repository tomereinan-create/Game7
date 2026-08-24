import { describe, expect, it } from 'vitest'
import type { Pos } from '../src/engine/positions'
import { canMoveSlot, moveSlot } from '../src/engine/slots'

const POS: Record<string, Pos[]> = {
  Brandon: ['PG'],
  Johnson: ['SG', 'SF'],
  Jones: ['SF', 'PF'],
  Smith: ['PF', 'SF'],
  Shaq: ['C'],
}
const posOf = (n: string) => POS[n] ?? []

describe('moving a drafted player (drag or tap)', () => {
  const slots = { PG: 'Brandon', SG: 'Johnson', SF: 'Jones' }

  it('moves into an open slot he is eligible for', () => {
    expect(canMoveSlot(slots, posOf, 'SF', 'PF')).toBe(true)
    expect(moveSlot(slots, posOf, 'SF', 'PF')).toEqual({ PG: 'Brandon', SG: 'Johnson', PF: 'Jones' })
  })

  it('refuses a slot he cannot play, and his own slot', () => {
    expect(canMoveSlot(slots, posOf, 'PG', 'SG')).toBe(false) // Brandon is PG only
    expect(canMoveSlot(slots, posOf, 'SG', 'C')).toBe(false)
    expect(canMoveSlot(slots, posOf, 'SG', 'SG')).toBe(false)
    expect(moveSlot(slots, posOf, 'PG', 'SG')).toBe(slots) // untouched, same object
  })

  it('swaps into a taken slot only when the other player can take the vacated one', () => {
    // Johnson SG -> SF would send Jones to SG, which Jones cannot play.
    expect(canMoveSlot(slots, posOf, 'SG', 'SF')).toBe(false)
    // Jones SF -> PF sends Smith to SF, which Smith can play.
    const four = { ...slots, PF: 'Smith' }
    expect(canMoveSlot(four, posOf, 'SF', 'PF')).toBe(true)
    expect(moveSlot(four, posOf, 'SF', 'PF')).toEqual({ PG: 'Brandon', SG: 'Johnson', SF: 'Smith', PF: 'Jones' })
  })

  it('an empty source slot never moves', () => {
    expect(canMoveSlot(slots, posOf, 'C', 'PF')).toBe(false)
  })
})
