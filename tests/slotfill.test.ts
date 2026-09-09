import { describe, expect, it } from 'vitest'
import { canStillFill } from '../src/engine/slots'
import { POSITIONS, type Pos } from '../src/engine/positions'

/** G10: the feasibility guard that lets a hot seat enforce positions without dead-ending. */
describe('can these men still fill these rings', () => {
  const at = (m: Record<string, Pos[]>) => (n: string) => m[n] ?? []

  it('nothing demanded is always satisfiable', () => {
    expect(canStillFill([], at({}), [])).toBe(true)
  })

  it('fewer men than rings can never work', () => {
    expect(canStillFill(['a'], at({ a: ['PG', 'SG'] }), ['PG', 'SG'])).toBe(false)
  })

  it('a ring nobody plays fails even with men to spare', () => {
    const m = { a: ['PG'], b: ['PG'], c: ['PG'] } as Record<string, Pos[]>
    expect(canStillFill(['a', 'b', 'c'], at(m), ['C'])).toBe(false)
  })

  it('THE CASE A GREEDY CHECK GETS WRONG: each ring has a taker, but not all at once', () => {
    // both men can play PG; only one can play C. Greedy "does every ring have someone?" says yes.
    const m = { a: ['PG', 'C'], b: ['PG'] } as Record<string, Pos[]>
    expect(m.a.includes('PG') && m.b.includes('PG')).toBe(true) // a naive per-ring check passes
    expect(canStillFill(['a', 'b'], at(m), ['PG', 'C'])).toBe(true) // a->C, b->PG
    // now take the only centre away and it must fail
    expect(canStillFill(['b'], at(m), ['C'])).toBe(false)
  })

  it('demand is a MULTISET — two sides each needing a point guard is two demands', () => {
    const m = { a: ['PG'], b: ['SG'] } as Record<string, Pos[]>
    expect(canStillFill(['a', 'b'], at(m), ['PG'])).toBe(true)
    expect(canStillFill(['a', 'b'], at(m), ['PG', 'PG'])).toBe(false)
  })

  it('a full ten-ring board: five two-way men cannot cover both sides', () => {
    const men = ['a', 'b', 'c', 'd', 'e']
    const m = Object.fromEntries(men.map((n) => [n, [...POSITIONS]])) as Record<string, Pos[]>
    expect(canStillFill(men, at(m), [...POSITIONS])).toBe(true)
    expect(canStillFill(men, at(m), [...POSITIONS, ...POSITIONS])).toBe(false)
    expect(canStillFill([...men, ...men.map((x) => x + '2')], at({ ...m, ...Object.fromEntries(men.map((n) => [n + '2', [...POSITIONS]])) }), [...POSITIONS, ...POSITIONS])).toBe(true)
  })

  it('augmenting really augments: a chain that has to be re-shuffled to fit', () => {
    // a: PG only. b: PG or SG. c: SG or SF. Demand PG, SG, SF -> a=PG, b=SG, c=SF, but only if
    // b gives up PG to a and c gives up SG to b.
    const m = { a: ['PG'], b: ['PG', 'SG'], c: ['SG', 'SF'] } as Record<string, Pos[]>
    expect(canStillFill(['b', 'c', 'a'], at(m), ['PG', 'SG', 'SF'])).toBe(true)
  })
})
