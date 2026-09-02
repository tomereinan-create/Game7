import { describe, expect, it } from 'vitest'
import { outsideLine, spotsFor } from '../src/ui/CourtFive'
import { DEFAULT_TACTICS, pnrPair, type PnrPair } from '../src/engine/tactics'
import type { Player } from '../src/engine/types'
import { PLAYERS } from '../src/engine/pool'

/**
 * THE DRAWN SET, held to the shape he called for.
 *
 * HIS RULING: "Balanced should be 4 out 1 in not 3 out 1 in" — the default formation stood two men
 * inside (the PF on the block beside the C), and must stand exactly one. And: "When selenting pnr
 * you have to select the 2 handler and screener" — the pick-and-roll shape must stand the plan's
 * own two men, not the two the court would have guessed.
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
    const at = spotsFor({ style: 'balanced', pnr: null }, FIVE)
    expect(at).toHaveLength(5)
    expect(inside(at)).toBe(1)
  })

  it('is the shape drawn with no plan at all (the team db, the scout court, the draft)', () => {
    expect(spotsFor(null, FIVE)).toEqual(spotsFor({ style: 'balanced', pnr: null }, FIVE))
    // and while the five is still being filled, so an empty draft floor stands balanced too
    expect(inside(spotsFor(null, nulls))).toBe(1)
  })

  it('leaves five-out alone: all five behind the line', () => {
    expect(inside(spotsFor({ style: 'fiveout', pnr: null }, FIVE))).toBe(0)
  })
})

describe('the pick-and-roll court draws the pair the plan names', () => {
  it('stands the chosen handler and screener on the handler and screener spots', () => {
    const auto = spotsFor({ style: 'pnr', pnr: null }, FIVE)
    const picked = pnrPair(FIVE, null)
    const hAuto = FIVE.findIndex((p) => p.name === picked.handler!.name)
    const sAuto = FIVE.findIndex((p) => p.name === picked.screener!.name)
    // hand the call to two men the engine would NOT have picked
    const chosen: PnrPair = { handler: "Klay Thompson '15", screener: "Draymond Green '16" }
    const h = FIVE.findIndex((p) => p.name === chosen.handler)
    const s = FIVE.findIndex((p) => p.name === chosen.screener)
    expect([h, s]).not.toEqual([hAuto, sAuto])
    const at = spotsFor({ style: 'pnr', pnr: chosen }, FIVE)
    expect(at[h]).toEqual(auto[hAuto]) // the ball is his now
    expect(at[s]).toEqual(auto[sAuto]) // and so is the roll
    // and the men who were the pair are back in the spacing
    expect(at[hAuto]).not.toEqual(auto[hAuto])
    expect(at[sAuto]).not.toEqual(auto[sAuto])
  })

  it('never doubles a spot, whatever the plan says', () => {
    for (const pair of [null, { handler: "Klay Thompson '15", screener: "Klay Thompson '15" }, { handler: 'nobody', screener: 'nobody' }]) {
      const at = spotsFor({ style: 'pnr', pnr: pair }, FIVE)
      expect(at.filter(Boolean)).toHaveLength(5)
      expect(new Set(at.map((xy) => xy.join(','))).size).toBe(5)
    }
  })

  it('the default plan carries no pair, so nothing on the floor changed for a save without one', () => {
    expect(DEFAULT_TACTICS.pnr).toBe(null)
  })
})
