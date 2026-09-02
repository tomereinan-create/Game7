import { describe, expect, it } from 'vitest'
import { FLOOR, inCorner, inferredStyle, outsideLine, spotsFor } from '../src/ui/CourtFive'
import { bestStyle, canSpace, DEFAULT_TACTICS, pnrPair, styleFit, STYLES, type PnrPair, type Style } from '../src/engine/tactics'
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

  it('is what a five still being filled stands in, having no best tactic yet', () => {
    // an empty draft floor, and a floor with four men on it, still stand balanced
    expect(inside(spotsFor(null, nulls))).toBe(1)
    expect(inferredStyle(nulls)).toBe(null)
    expect(spotsFor(null, [...FIVE.slice(0, 4), null])).toEqual(spotsFor(null, nulls))
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

/**
 * HIS RULING: "Assign each team on the court by using their best tactic". A five nobody called a
 * plan for — every scouted opponent, the team db, the campaign fives, the draft floor — is drawn
 * in the shape of the style it is BEST at, and no longer stands balanced because nobody spoke.
 */
describe('a five with no plan stands in the shape of its best tactic', () => {
  // fives cut out of the pool in pool order: a wide, deterministic sample of real personnel
  const SAMPLE: Player[][] = [FIVE]
  for (let i = 0; i + 5 <= PLAYERS.length && SAMPLE.length < 60; i += 37) SAMPLE.push(PLAYERS.slice(i, i + 5))

  /** The ruling's own definition, written out longhand so the test does not lean on the engine. */
  const argmax = (five: Player[]): { style: Style; fit: number } => {
    let style: Style = 'balanced'
    let fit = 60
    for (const s of STYLES) {
      if (s.key === 'balanced') continue
      const f = styleFit(s.key, five)
      if (f > fit) {
        fit = f
        style = s.key
      }
    }
    return { style, fit }
  }

  it('the inferred style is the argmax of styleFit, and balanced when nothing beats 60', () => {
    for (const five of SAMPLE) {
      const want = argmax(five)
      expect(bestStyle(five)).toEqual(want)
      expect(inferredStyle(five)).toEqual(want)
      if (want.style === 'balanced') {
        // nothing may be inferred that does not actually beat the free default
        for (const s of STYLES) expect(styleFit(s.key, five)).toBeLessThanOrEqual(60)
      } else {
        expect(styleFit(want.style, five)).toBeGreaterThan(60)
      }
    }
  })

  it('draws that style exactly as if it had been called', () => {
    for (const five of SAMPLE) {
      expect(spotsFor(null, five)).toEqual(spotsFor({ style: argmax(five).style, pnr: null }, five))
    }
  })

  it('runs the pick-and-roll with the engine own auto-pair, the men the AI would use', () => {
    const five = SAMPLE.find((f) => argmax(f).style === 'pnr')
    expect(five).toBeTruthy()
    const pair = pnrPair(five!, undefined)
    const at = spotsFor(null, five!)
    const h = five!.findIndex((p) => p.name === pair.handler!.name)
    const s = five!.findIndex((p) => p.name === pair.screener!.name)
    // the handler is behind the line, the screener rolling inside it
    expect(outsideLine(at[h])).toBe(true)
    expect(outsideLine(at[s])).toBe(false)
    expect(at).toEqual(spotsFor({ style: 'pnr', pnr: null }, five!))
  })

  it('leaves a five WITH a plan alone: the call is drawn, never the inference', () => {
    const called = SAMPLE.filter((f) => argmax(f).style !== 'balanced')
    expect(called.length).toBeGreaterThan(0)
    for (const five of called) {
      // a plan that says balanced still stands balanced, whatever the five is best at
      expect(inside(spotsFor({ style: 'balanced', pnr: null }, five))).toBe(1)
      expect(spotsFor({ style: 'balanced', pnr: null }, five)).not.toEqual(spotsFor(null, five))
      // and a call the five is not best at is still drawn as called: five-out stands five out
      expect(inside(spotsFor({ style: 'fiveout', pnr: null }, five))).toBe(0)
    }
  })
})

/**
 * HIS RULING: "Why is Ayton out and James in? Makes no sense" — the Lakers' post-up set stood
 * Deandre Ayton, who cannot shoot, out in the weak-side corner as a spacer. A man takes a SPACING
 * spot only if he can shoot from it (`canSpace`, the pool's own 3pt < 40 class line); a big who
 * cannot and is not the shape's featured man stands inside, on the dunker spot or the block.
 */
describe('a man who cannot shoot is never sent out to space the floor', () => {
  const LAKERS = [
    g("Luka Dončić '26"),
    g("Austin Reaves '26"),
    g("Rui Hachimura '26"),
    g("LeBron James '26"),
    g("Deandre Ayton '26"),
  ]
  const AYTON = 4

  it('the Lakers five stands Ayton inside, not in the corner', () => {
    expect(canSpace(LAKERS[AYTON])).toBe(false)
    const at = spotsFor(null, LAKERS)
    expect(inferredStyle(LAKERS)!.style).toBe('postup')
    expect(outsideLine(at[AYTON])).toBe(false)
    expect(inCorner(at[AYTON])).toBe(false)
  })

  it('holds in every shape, called or inferred', () => {
    for (const s of STYLES) {
      const at = spotsFor({ style: s.key, pnr: null }, LAKERS)
      expect(inCorner(at[AYTON])).toBe(false)
      // every set but five-out owns an inside spot, and it is his
      if (s.key !== 'fiveout') expect(outsideLine(at[AYTON])).toBe(false)
    }
  })

  it('five-out is the exception, and is never INFERRED for a five with two who cannot shoot', () => {
    // a called five-out still shows five out (his earlier ruling), so it keeps Ayton behind the
    // line — but off the corners, which go to the shooters
    const at = spotsFor({ style: 'fiveout', pnr: null }, LAKERS)
    expect(at.filter((xy) => !outsideLine(xy))).toHaveLength(0)
    // and a five carrying two non-shooters is never read as five-out, whatever the fit says
    const two = [g("Stephen Curry '16"), g("Klay Thompson '15"), g("LeBron James '13"), g("Draymond Green '18"), g("Rudy Gobert '17")]
    expect(two.filter((p) => !canSpace(p))).toHaveLength(2)
    expect(bestStyle(two).style).not.toBe('fiveout')
  })

  it('the featured man is still chosen as before: the post spot is the post scorer', () => {
    // LeBron is the post man by the fit formula proxy, and he keeps the block; Ayton is the
    // second big and takes the dunker spot rather than the corner Ayton used to stand in
    const at = spotsFor({ style: 'postup', pnr: null }, LAKERS)
    const bigs = at.filter((xy) => !outsideLine(xy))
    expect(bigs).toHaveLength(2)
    expect(at[3]).not.toEqual(at[AYTON])
    expect(outsideLine(at[3])).toBe(false) // LeBron '26 on the block
  })
})

/**
 * HIS RULING: "The ft line is cutting the ft line, fix it for irl proportions" — the free-throw
 * circle was drawn across the top of the key instead of centred on the free-throw line, because
 * the floor was drawn by eye. It is now one scale of NBA feet, and every spot stands in it.
 */
describe('the floor is drawn to real proportions, and every spot stands on it', () => {
  const F = FLOOR
  const ft = (u: number) => u / F.ft

  it('the court is 50 feet by 47, and the key 16 by 19 with the circle centred on the line', () => {
    expect(ft(F.right - F.left)).toBeCloseTo(50, 6)
    expect(ft(F.base - F.half)).toBeCloseTo(47, 6)
    // the free-throw line is the far edge of a 19-foot key, and the 6-foot circle is centred ON it
    expect(ft(F.base - F.ftLine)).toBeCloseTo(19, 6)
    // the basket sits 5.25 feet off the baseline, so the circle cannot reach the rim
    expect(ft(F.base - F.rimY)).toBeCloseTo(5.25, 6)
    expect(F.ftLine + 6 * F.ft).toBeLessThan(F.rimY) // the circle's near half stops short of the rim
  })

  it('the line is the real line: 22 feet in the corner, 23.75 around', () => {
    const at = (x: number, y: number) => [50 + x * F.ft, F.base - y * F.ft] as const
    expect(outsideLine(at(22.5, 6))).toBe(true) // half a foot behind the corner line
    expect(outsideLine(at(21.5, 6))).toBe(false) // and a foot in front of it
    expect(inCorner(at(23, 7))).toBe(true)
    expect(outsideLine(at(0, 5.25 + 23.8))).toBe(true) // straight out from the basket, behind the arc
    expect(outsideLine(at(0, 5.25 + 23.7))).toBe(false)
    expect(inCorner(at(0, 5.25 + 23.8))).toBe(false) // the top of the arc is not a corner
  })

  it('no shape stands a man off the floor', () => {
    const fives = [FIVE, PLAYERS.slice(0, 5), PLAYERS.slice(300, 305)]
    for (const five of fives) {
      for (const s of STYLES) {
        for (const [x, y] of spotsFor({ style: s.key, pnr: null }, five)) {
          expect(x).toBeGreaterThan(F.left)
          expect(x).toBeLessThan(F.right)
          expect(y).toBeGreaterThan(F.half)
          expect(y).toBeLessThanOrEqual(F.base)
        }
      }
    }
  })
})
