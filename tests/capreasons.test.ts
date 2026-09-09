import { describe, expect, it } from 'vitest'
import SAL from '../src/data/salaries.json'
import { capPct, dimReason } from '../src/ui/Draft'
import { CAP_LIMIT, CAP_RESERVE, DRAFT_SIZE } from '../src/config'

/**
 * C3 / C4 / C5, engine report three (2026-09-09). A dimmed roster row must say WHICH of the two
 * unrelated reasons put it there, and the reason that actually binds must be the one printed.
 */
describe('a dimmed man says why he is dimmed', () => {
  const base = { unpriced: false, fits: 1, overCap: false, positions: ['PF', 'C'], cost: 10, budget: 55 }

  it('a man who can be drafted has nothing to explain', () => {
    expect(dimReason(base)).toBeUndefined()
  })

  it('C3: the two states no longer read the same', () => {
    const blocked = dimReason({ ...base, fits: 0 })
    const dear = dimReason({ ...base, overCap: true, cost: 33.3, budget: 26.3 })
    expect(blocked).toBe('no open spot — PF and C are already filled')
    expect(dear).toBe('over the cap — he costs 33.3%, 26.3% left to spend')
    expect(blocked).not.toBe(dear)
  })

  it('one position reads as one, not as two', () => {
    expect(dimReason({ ...base, fits: 0, positions: ['SF'] })).toBe('no open spot — SF is already filled')
  })

  it('position beats price when both bind — money is not the obstacle if the ring is gone', () => {
    expect(dimReason({ ...base, fits: 0, overCap: true, cost: 40, budget: 8.1 })).toMatch(/^no open spot/)
  })

  it('a man with no salary on record says that first', () => {
    expect(dimReason({ ...base, unpriced: true, fits: 0, overCap: true })).toBe('no salary on record — he cannot be priced')
  })

  /**
   * C5: the payroll line read "0.0% of 75%" while the card beside it read "25% of cap". The
   * arithmetic was never wrong — this is the proof that both numbers are shares of the SAME
   * denominator, which is why the fix was the wording and not the maths.
   */
  it('C5: the payroll limit and a man’s price are both shares of the season cap', () => {
    const sal = SAL as unknown as Record<string, { sal: number; pct: number }>
    for (const n of ["Tyrone Hill '97", "Terrell Brandon '97", "Bobby Phills '97"]) {
      expect(capPct(n), n).toBe(sal[n].pct)
      // and all three were affordable on an opening board, so their grey was never about money
      expect(capPct(n)!).toBeLessThan(CAP_LIMIT - CAP_RESERVE * (DRAFT_SIZE - 1))
    }
    expect(CAP_LIMIT).toBe(75)
  })
})
