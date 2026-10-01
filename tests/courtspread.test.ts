import { describe, expect, it } from 'vitest'
import { LEVELS } from '../src/App'
import { DEFAULT_TACTICS, STYLES, type Style } from '../src/engine/tactics'
import { APART_FT, spotsFor } from '../src/ui/CourtFive'

/**
 * HIS RULING, 2026-10-01 (a picture of the Warriors '14 page, Bogut drawn on top of Lee at the
 * pin-down's two screens): "Some tactics players are one over the other and its unreadable. Make
 * sure it never happens." Every set, every campaign five: no pair closer than a bust's width.
 */
const FT = 78 / 47
describe('no two men on one spot', () => {
  const fives = LEVELS.map((o) => o.players.slice(0, 5)).filter((f) => f.length === 5)
  const styles: Style[] = [...new Set([...STYLES.map((s) => s.key), 'pindown' as Style, 'iso' as Style])]

  it(`every style over ${LEVELS.length} campaign fives keeps every pair at least ${APART_FT} feet apart`, () => {
    let checked = 0
    for (const five of fives)
      for (const style of styles) {
        const xy = spotsFor({ ...DEFAULT_TACTICS, style }, five)
        expect(xy).toHaveLength(5)
        for (let i = 0; i < 5; i++)
          for (let j = i + 1; j < 5; j++) {
            const d = Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1])
            expect(d, `${style}: ${five[i].name} and ${five[j].name}`).toBeGreaterThanOrEqual(APART_FT * FT - 1e-6)
          }
        checked++
      }
    expect(checked).toBeGreaterThan(100)
  })

  it('the pin-down stands its two screeners on the two posts, one each side, and the two shooters on the two wings', () => {
    const five = fives[0]
    const xy = spotsFor({ ...DEFAULT_TACTICS, style: 'pindown' }, five)
    const xs = xy.map(([x]) => x)
    // two men left of the middle and two right of it, beyond the one at the top
    expect(xs.filter((x) => x < 45).length).toBe(2)
    expect(xs.filter((x) => x > 55).length).toBe(2)
  })
})
