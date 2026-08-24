import { describe, expect, it } from 'vitest'
import { gameOdds, seriesOdds } from '../src/engine/odds'

describe('pre-sim odds', () => {
  it('match the spread table at sigma 10 and the series formula', () => {
    expect(gameOdds(0)).toBeCloseTo(0.5, 6)
    expect(gameOdds(10)).toBeCloseTo(0.841, 2)
    expect(gameOdds(-10)).toBeCloseTo(0.159, 2)
    expect(seriesOdds(0.5)).toBeCloseTo(0.5, 6)
    expect(seriesOdds(0.6)).toBeCloseTo(0.7102, 3) // best-of-seven at 60% a game
    expect(seriesOdds(1)).toBe(1)
  })
})
