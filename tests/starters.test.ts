import { describe, expect, it } from 'vitest'
import STARTS from '../src/data/starters.json'
import { WHEEL } from '../src/data/wheel'
import { bestStarters, byStarts, loadFive, missingStarters, realStarters, rosterHash, STARTERS_HASH, startersKey, startsBasis } from '../src/engine/starters'

const names = (ps: { name: string }[]) => ps.map((p) => p.name).sort()

describe('real starters (P7a)', () => {
  it("the '96 Bulls load as the five who started: Harper, Jordan, Pippen, Rodman, Longley", () => {
    const five = realStarters(1996, 'CHI')
    expect(names(five)).toEqual(["Dennis Rodman '96", "Luc Longley '96", "Michael Jordan '96", "Ron Harper '96", "Scottie Pippen '96"])
    expect(startsBasis(1996, 'CHI')).toBe('gs')
    expect(missingStarters(1996, 'CHI')).toEqual([])
    // ...which is not what the ratings pick: the best legal five has Kukoč and Kerr in it
    expect(names(bestStarters(1996, 'CHI'))).not.toEqual(names(five))
    expect(names(loadFive(1996, 'CHI', 'real'))).toEqual(names(five))
  })

  it('a man already on the other side sits out and the next man by starts steps in', () => {
    const five = realStarters(1996, 'CHI', new Set(['Michael Jordan']))
    expect(five.map((p) => p.player)).not.toContain('Michael Jordan')
    expect(names(five)).toContain("Toni Kukoč '96") // 20 starts, sixth on the team
    expect(five).toHaveLength(5)
  })

  it('starts before 1981-82 were not kept, so minutes stand in', () => {
    expect(startsBasis(1980, 'LAL')).toBe('mp')
    expect(names(realStarters(1980, 'LAL'))).toContain("Jim Chones '80")
  })

  it('starters.json was built against the wheel as it is (rerun `npm run starters` after `npm run teams`)', () => {
    expect(rosterHash(WHEEL)).toBe(STARTERS_HASH)
    const order = (STARTS as { order: Record<string, string> }).order
    for (const t of WHEEL) {
      const o = order[startersKey(t.y, t.ab)]
      expect(o, `${t.y} ${t.ab}`).toBeDefined()
      expect([...o].map((c) => parseInt(c, 36)).sort((a, b) => a - b)).toEqual(t.p.map((_, i) => i))
      expect(new Set(byStarts(t))).toEqual(new Set(t.p))
    }
  })
})
