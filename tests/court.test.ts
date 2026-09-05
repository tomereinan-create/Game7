import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CourtFive, FLOOR, inCorner, inferredStyle, outsideLine, PAIR_FT, spotsFor, surname as surnameOf, type CourtSpot } from '../src/ui/CourtFive'
import { bestStyle, canSpace, DEFAULT_TACTICS, featured, heliMan, pnrPair, popPair, postMan, styleFit, STYLES, twoStars, type PnrPair, type Style, type Tactics } from '../src/engine/tactics'
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

  /** The ruling's own definition, written out longhand so the test does not lean on the engine —
   *  including the two VETOES it has grown since: five-out is never read for a five with two men
   *  who cannot shoot (recal_115), and helio is never read for a five with two stars (recal_115).
   *  They were missing here and the test agreed by luck until recal_127 removed transition, which
   *  had been winning outright on the sample five where the two answers diverge. */
  const argmax = (five: Player[]): { style: Style; fit: number } => {
    let style: Style = 'balanced'
    let fit = 60
    const shy = five.filter((p) => !canSpace(p)).length
    const duo = twoStars(five)
    for (const s of STYLES) {
      if (s.key === 'balanced') continue
      if (s.key === 'fiveout' && shy >= 2) continue
      if (s.key === 'helio' && duo) continue
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
    // recal_115 moved this five's READ from post-up to helio: LeBron '26 shoots 38 from three, so
    // the post-up hub term (which is now scaled by how interior a big's own game is) no longer
    // makes a post team of the Lakers, and Doncic is the five's best scorer-creator by 10 points.
    // The RULING under test is unchanged and is about the spot, not the shape: whatever the five is
    // read as, the man who cannot shoot stands inside and never in a corner.
    expect(inferredStyle(LAKERS)!.style).toBe('helio')
    expect(outsideLine(at[AYTON])).toBe(false)
    expect(inCorner(at[AYTON])).toBe(false)
  })

  it('holds in every shape, called or inferred', () => {
    for (const s of STYLES) {
      const at = spotsFor({ style: s.key, pnr: null }, LAKERS)
      // five-out is the exception: it stands the five in slot order now (his ruling: "In 5 out,
      // pg on top. SG/SF wings, PF/C corners"), so the C's spot is a corner whoever wears it.
      if (s.key !== 'fiveout') expect(inCorner(at[AYTON])).toBe(false)
      // every set but five-out stands him inside — the pick-and-roll as its screener (his
      // ruling: the rest stand outside), every other set on the inside spot it holds for him.
      // recal_120 note: Ayton '26 and Hachimura '26 BOTH cap at screenFit 71 off their efficiency,
      // and the tie is broken by the roll (rim 71 to 27), so the screen is still Ayton's.
      // recal_129: pick-and-pop is the second set with NO inside spot — the whole point of the
      // call is that the screener steps out instead of rolling — so it joins five-out here. The
      // corner check above still holds in both: a man who cannot shoot never takes a shooter's spot.
      if (s.key !== 'fiveout' && s.key !== 'pickpop') expect(outsideLine(at[AYTON])).toBe(false)
    }
  })

  it('five-out is the exception, and is never INFERRED for a five with two who cannot shoot', () => {
    // a called five-out still shows five out (his earlier ruling), so it keeps Ayton behind the
    // line — in his own slot's corner now, not off the corners (his ruling put C there on purpose)
    const at = spotsFor({ style: 'fiveout', pnr: null }, LAKERS)
    expect(at.filter((xy) => !outsideLine(xy))).toHaveLength(0)
    expect(inCorner(at[AYTON])).toBe(true)
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
 * HIS RULING: "If I put 5 out on my tactics it should be shown here as well" — the campaign prep
 * screen drew his five in its best-fit shape while the plan he had set in My team said five-out.
 * A court handed the set tactic draws THAT shape, and its caption says whose call it is. Balanced
 * is no call, so a balanced plan leaves the best-fit read, and its caption, exactly as they were.
 */
describe('a five drawn beside a set tactic stands in that tactic', () => {
  const POS = ['PG', 'SG', 'SF', 'PF', 'C']
  const spots = (five: (Player | null)[]): CourtSpot[] => five.map((p, i) => ({ p, tag: p ? `${POS[i]} · ${p.ovr}` : '', slot: POS[i] }))
  const draw = (tactic: Pick<Tactics, 'style' | 'pnr'> | null, five: (Player | null)[] = FIVE) =>
    renderToStaticMarkup(createElement(CourtFive, { spots: spots(five), tactic }))
  /** Where the markup stood each man, index-aligned, as the box positions them (percent of the cropped court). */
  const stood = (html: string) =>
    [...html.matchAll(/class="ct-spot[^"]*" style="left:([\d.]+)%;top:([\d.]+)%"/g)].map(([, x, y]) => [Number(x), Number(y)] as const)
  /** The same remap the court applies with no bench: 16 units of empty floor cropped off the top. */
  const drawn = (at: readonly (readonly [number, number])[]) => at.map(([x, y]) => [x, ((y - 16) / 84) * 100] as const)
  const same = (a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]) => {
    expect(a).toHaveLength(b.length)
    a.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(b[i][0], 6)
      expect(y).toBeCloseTo(b[i][1], 6)
    })
  }
  const caption = (html: string) => html.match(/class="ct-call">([^<]*)</)?.[1] ?? ''

  it('a called five-out shows five out, and says it is his call', () => {
    const html = draw({ style: 'fiveout', pnr: null })
    const at = stood(html)
    expect(at).toHaveLength(5)
    same(at, drawn(spotsFor({ style: 'fiveout', pnr: null }, FIVE)))
    expect(spotsFor({ style: 'fiveout', pnr: null }, FIVE).filter((xy) => !outsideLine(xy))).toHaveLength(0)
    expect(caption(html)).toBe('five-out · your tactic')
    // the best-fit read is gone from the caption, and there is no toggle: the plan is turned elsewhere
    expect(html).not.toContain('best fit')
    expect(html).not.toContain('ct-side')
  })

  it('every style he can call is drawn as called, with its own label', () => {
    for (const s of STYLES) {
      if (s.key === 'balanced') continue
      const html = draw({ style: s.key, pnr: null })
      same(stood(html), drawn(spotsFor({ style: s.key, pnr: null }, FIVE)))
      // recal_124: a called style names the men it runs through, the same way the best-fit read
      // does — the pair, or the post target — and then says whose call it is
      const named = featured(s.key, FIVE, { style: s.key, pnr: null } as Tactics).map((p) => surnameOf(p.name))
      expect(caption(html)).toBe(`${s.label}${named.length ? ` · ${named.join(' + ')}` : ''} · your tactic`)
    }
  })

  it('the pick-and-roll stands the pair he named, as the plan would', () => {
    const chosen: PnrPair = { handler: "Klay Thompson '15", screener: "Draymond Green '16" }
    const at = stood(draw({ style: 'pnr', pnr: chosen }))
    same(at, drawn(spotsFor({ style: 'pnr', pnr: chosen }, FIVE)))
    const auto = drawn(spotsFor({ style: 'pnr', pnr: null }, FIVE))
    expect(at.some(([x, y], i) => Math.abs(x - auto[i][0]) > 1e-6 || Math.abs(y - auto[i][1]) > 1e-6)).toBe(true)
  })

  it('balanced is no call: the best-fit read and its caption stay exactly as they were', () => {
    expect(draw({ style: 'balanced', pnr: null })).toBe(draw(null))
    expect(caption(draw(null))).not.toContain('your tactic')
    expect(caption(draw(null))).toContain(inferredStyle(FIVE)!.style === 'balanced' ? 'no better fit' : 'best fit')
  })

  it('the best-fit caption names the man, or the pair, the shape runs through', () => {
    // recal_115, his ruling: "Why is the system helio for rus when KD is a better scorrer?" — the
    // read used to name a shape and no man. The Thunder '16 read the pnr between their two stars,
    // and the caption names both; the Thunder '22 read helio and it names the one man.
    const okc16 = [g("Russell Westbrook '16"), g("Andre Roberson '16"), g("Kevin Durant '16"), g("Serge Ibaka '16"), g("Enes Freedom '16")]
    expect(caption(draw(null, okc16))).toMatch(/^pick-and-roll · best fit \d+ · Westbrook \+ Durant$/)
    const okc22 = [g("Josh Giddey '22"), g("Shai Gilgeous-Alexander '22"), g("Luguentz Dort '22"), g("Aleksej Pokusevski '22"), g("Darius Bazley '22")]
    expect(caption(draw(null, okc22))).toMatch(/^helio · best fit \d+ · Gilgeous-Alexander$/) // the fit number rides the pool (recal_116 moved it 65 -> 64); the man is the ruling
    // ...and a shape that features nobody names nobody, rather than picking a starter at random
    const bos25 = [g("Derrick White '25"), g("Jaylen Brown '25"), g("Jayson Tatum '25"), g("Kristaps Porziņģis '25"), g("Al Horford '25")]
    expect(caption(draw(null, bos25))).toMatch(/^five-out · best fit \d+$/)
  })

  it('a five still being filled keeps the ghost floor, and claims no shape', () => {
    const four = [...FIVE.slice(0, 4), null]
    expect(draw({ style: 'fiveout', pnr: null }, four)).toBe(draw(null, four))
    expect(caption(draw({ style: 'fiveout', pnr: null }, four))).toBe('')
  })

  it('a court with a plan of its own is untouched by the prop', () => {
    const plan: Tactics = { ...DEFAULT_TACTICS, style: 'postup' }
    const a = renderToStaticMarkup(createElement(CourtFive, { spots: spots(FIVE), plan }))
    const b = renderToStaticMarkup(createElement(CourtFive, { spots: spots(FIVE), plan, tactic: { style: 'fiveout', pnr: null } }))
    expect(b).toBe(a)
  })
})

/**
 * HIS RULING: "If its pnr, put the screener next to the handler, and the rest outside the 3pt
 * line" — the Thunder '24 court stood Holmgren on the block and Dort and Giddey low inside the arc.
 * The screen is now set beside the ball at the top of the key, one ring apart, and the other three
 * stand behind the line — the weak-side wing and both corners, the wing going to the shortest of
 * the three (his ruling: "smallest not handler guy on the wing, the other 2 corners"). It holds
 * everywhere the shape is drawn: a five read as pick-and-roll, a called one, a named pair.
 */
describe('the pick-and-roll stands the screen beside the ball, and the rest behind the line', () => {
  const THUNDER = [g("Shai Gilgeous-Alexander '24"), g("Josh Giddey '24"), g("Luguentz Dort '24"), g("Jalen Williams '24"), g("Chet Holmgren '24")]
  const POOL: Player[][] = []
  for (let i = 0; i + 5 <= PLAYERS.length && POOL.length < 60; i += 37) POOL.push(PLAYERS.slice(i, i + 5))
  const feet = ([x, y]: readonly [number, number]) => [(x - 50) / FLOOR.ft, (FLOOR.base - y) / FLOOR.ft] as const
  const dist = (a: readonly [number, number], b: readonly [number, number]) => {
    const [ax, ay] = feet(a)
    const [bx, by] = feet(b)
    return Math.hypot(ax - bx, ay - by)
  }
  /** The two men the floor stands as the pair: the plan's, or the court's own fallback for a pair it cannot honour. */
  const pairOf = (five: Player[], pick: PnrPair | null) => {
    const pair = pnrPair(five, pick)
    const h = pair.handler ? five.findIndex((p) => p.name === pair.handler!.name) : 0
    let s = pair.screener ? five.findIndex((p) => p.name === pair.screener!.name) : -1
    if (s < 0 || s === h) s = five.reduce((k, p, i) => (i !== h && (k < 0 || p.attrs.height > five[k].attrs.height) ? i : k), -1)
    return { h, s }
  }
  const holds = (five: Player[], pick: PnrPair | null) => {
    const at = spotsFor({ style: 'pnr', pnr: pick }, five)
    const { h, s } = pairOf(five, pick)
    // the screen is set beside the ball: one ring apart, and nearer to him than anyone else is
    expect(dist(at[h], at[s])).toBeLessThanOrEqual(PAIR_FT + 1e-9)
    for (let i = 0; i < 5; i++) {
      if (i === h || i === s) continue
      expect(dist(at[h], at[i])).toBeGreaterThan(dist(at[h], at[s]))
      expect(dist(at[s], at[i])).toBeGreaterThan(dist(at[h], at[s]))
    }
    // the ball is behind the line, the screen inside it at the top of the key — above the
    // free-throw line, not on a block
    expect(outsideLine(at[h])).toBe(true)
    expect(outsideLine(at[s])).toBe(false)
    expect(feet(at[s])[1]).toBeGreaterThan(19)
    // and nobody else is inside the arc: the other three stand behind the line — one wing and
    // two corners — and the shortest of the three is the man on the wing (his ruling: "smallest
    // not handler guy on the wing, the other 2 corners")
    const rest = [0, 1, 2, 3, 4].filter((i) => i !== h && i !== s)
    for (const i of rest) expect(outsideLine(at[i])).toBe(true)
    const wing = rest.filter((i) => !inCorner(at[i]))
    expect(wing).toHaveLength(1)
    for (const i of rest) if (i !== wing[0]) expect(five[i].attrs.height).toBeGreaterThanOrEqual(five[wing[0]].attrs.height)
    // five different spots, whatever the pair
    expect(new Set(at.map((xy) => xy.join(','))).size).toBe(5)
  }

  it("the Thunder '24: Holmgren beside Gilgeous-Alexander at the top, the other three behind the line", () => {
    // recal_115 moved this five's READ to helio — Gilgeous-Alexander '24 out-scores the next man on
    // the floor by 27 points of scorer-creator, which is what a helio offence is — so the pair is
    // asserted against the CALL, which is what the ruling was about ("If its pnr, ..."). The
    // inference is checked below on a five that is read as a pick-and-roll.
    expect(inferredStyle(THUNDER)!.style).toBe('helio')
    const pair = pnrPair(THUNDER, null)
    expect(pair.handler!.name).toBe("Shai Gilgeous-Alexander '24")
    expect(pair.screener!.name).toBe("Chet Holmgren '24")
    holds(THUNDER, null)
  })

  it('a five that IS read as a pick-and-roll draws the called floor, spot for spot', () => {
    // the Thunder '16 (his ruling: "why Helio when they have 2 superstars?") — two stars inside
    // DUO_GAP of each other, so the read is the pnr between them and the caption names both
    const okc = [g("Russell Westbrook '16"), g("Andre Roberson '16"), g("Kevin Durant '16"), g("Serge Ibaka '16"), g("Enes Freedom '16")]
    expect(inferredStyle(okc)!.style).toBe('pnr')
    expect(spotsFor(null, okc)).toEqual(spotsFor({ style: 'pnr', pnr: null }, okc))
    holds(okc, null)
  })

  it('holds for every five the pool can cut, auto-paired', () => {
    for (const five of [FIVE, ...POOL]) holds(five, null)
  })

  it('holds for the pair he names, and stands HIS two men as the pair', () => {
    const chosen: PnrPair = { handler: "Klay Thompson '15", screener: "Draymond Green '16" }
    holds(FIVE, chosen)
    const at = spotsFor({ style: 'pnr', pnr: chosen }, FIVE)
    const h = FIVE.findIndex((p) => p.name === chosen.handler)
    const s = FIVE.findIndex((p) => p.name === chosen.screener)
    expect(outsideLine(at[h])).toBe(true)
    expect(outsideLine(at[s])).toBe(false)
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

/**
 * THE POST-UP TARGET (recal_124, his ruling: "In post up playstyle, there need to be a post up
 * target."). The floor mirror of the pick-and-roll pair: the man the plan names stands on the
 * block, the caption says his name, and a plan that names nobody draws exactly as it always did.
 */
describe('the post-up stands the man he called on the block', () => {
  const LAK = [g("Ron Harper '00"), g("Kobe Bryant '00"), g("Glen Rice '00"), g("Robert Horry '00"), g("Shaquille O'Neal '00")]
  const SHAQ = 4
  const RICE = 2
  const spotsOf = (five: (Player | null)[]): CourtSpot[] => five.map((p) => ({ p, tag: '' }))

  it("with no target named it is the engine's hub, and the shape is the one it always drew", () => {
    expect(postMan(LAK, null).hub!.name).toBe("Shaquille O'Neal '00")
    expect(postMan(LAK, null).chosen).toBe(false)
    const at = spotsFor({ style: 'postup', pnr: null, post: null }, LAK)
    expect(at).toEqual(spotsFor({ style: 'postup', pnr: null }, LAK))
    expect(outsideLine(at[SHAQ])).toBe(false)
  })

  it('the man he names takes the block, whoever he is', () => {
    expect(postMan(LAK, "Glen Rice '00").chosen).toBe(true)
    const at = spotsFor({ style: 'postup', pnr: null, post: "Glen Rice '00" }, LAK)
    expect(outsideLine(at[RICE])).toBe(false)
    // ...and the engine's hub is off it: he cannot shoot, so he takes the set's other inside spot
    expect(at[SHAQ]).not.toEqual(at[RICE])
    expect(inCorner(at[SHAQ])).toBe(false)
    expect(outsideLine(at[SHAQ])).toBe(false)
  })

  it('the caption names him, on a called court and on a set-tactic court alike', () => {
    const plan = { ...DEFAULT_TACTICS, style: 'postup' as const, post: "Glen Rice '00" }
    const shot = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(CourtFive, props as never))
    // the markup is HTML-escaped, so O'Neal comes back as O&#x27;Neal
    const cap = (h: string) => (h.match(/ct-call">([^<]*)/)?.[1] ?? '').replace(/&#x27;/g, "'")
    expect(cap(shot({ spots: spotsOf(LAK), plan }))).toContain('post-up · Rice')
    expect(cap(shot({ spots: spotsOf(LAK), tactic: plan }))).toBe('post-up · Rice · your tactic')
    // with nobody named it says the engine's hub, which is the man it draws
    expect(cap(shot({ spots: spotsOf(LAK), tactic: { ...DEFAULT_TACTICS, style: 'postup' as const } }))).toBe("post-up · O'Neal · your tactic")
  })
})

/**
 * THE HELIO CREATOR (recal_125, his ruling: "In helio, allow me to pick a creator."). The same
 * mechanism again: the man the plan names stands alone above the arc, and the caption says so.
 */
describe('the helio court runs through the creator he called', () => {
  const OKC = [g("Josh Giddey '22"), g("Shai Gilgeous-Alexander '22"), g("Luguentz Dort '22"), g("Aleksej Pokusevski '22"), g("Darius Bazley '22")]
  const SGA = 1
  const DORT = 2
  const spotsOf = (five: (Player | null)[]): CourtSpot[] => five.map((p) => ({ p, tag: '' }))
  const shot = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(CourtFive, props as never))
  const cap = (h: string) => (h.match(/ct-call">([^<]*)/)?.[1] ?? '').replace(/&#x27;/g, "'")

  it("with nobody named it is the engine's man, and the shape is the one it always drew", () => {
    expect(heliMan(OKC, null).creator!.name).toBe("Shai Gilgeous-Alexander '22")
    const at = spotsFor({ style: 'helio', pnr: null, helio: null }, OKC)
    expect(at).toEqual(spotsFor({ style: 'helio', pnr: null }, OKC))
    // the engine stands alone behind the arc, above the break
    expect(outsideLine(at[SGA])).toBe(true)
    expect(inCorner(at[SGA])).toBe(false)
  })

  it('the man he names takes the ball, and the engine goes back into the spacing', () => {
    const auto = spotsFor({ style: 'helio', pnr: null }, OKC)
    const at = spotsFor({ style: 'helio', pnr: null, helio: "Luguentz Dort '22" }, OKC)
    expect(at[DORT]).toEqual(auto[SGA])
    expect(at[SGA]).not.toEqual(auto[SGA])
    expect(new Set(at.map((xy) => xy.join(','))).size).toBe(5)
  })

  it('the caption names him', () => {
    const plan = { ...DEFAULT_TACTICS, style: 'helio' as const, helio: "Luguentz Dort '22" }
    expect(cap(shot({ spots: spotsOf(OKC), plan }))).toContain('helio · Dort')
    expect(cap(shot({ spots: spotsOf(OKC), tactic: plan }))).toBe('helio · Dort · your tactic')
    expect(cap(shot({ spots: spotsOf(OKC), tactic: { ...DEFAULT_TACTICS, style: 'helio' as const } }))).toBe('helio · Gilgeous-Alexander · your tactic')
  })
})

/**
 * THE SIDELINE TRIANGLE (recal_128, his ruling: "Add Triangle"; then "Change the triangle to be like
 * the 2nd picture"; now his ruling: "Fix triangle to look like this", over the teaching diagram with
 * the 15-18-20-feet lines drawn between neighbours). What stood here was a two-guard front — point,
 * two wings, the bigs side by side at the elbows — a SETUP with no triangle in it. The strong side
 * now carries the triangle the set is named for, post + corner + wing, and the weak side carries the
 * two-man game, point + pinch post. Slot order still: PG point, SG wing, SF corner, PF pinch, C post.
 */
describe('the triangle stands a triangle on the strong side and the two-man game on the weak', () => {
  const BULLS = [g("Steve Kerr '97"), g("Michael Jordan '97"), g("Scottie Pippen '97"), g("Toni Kukoč '97"), g("Luc Longley '97")]
  const spotsOf = (five: (Player | null)[]): CourtSpot[] => five.map((p) => ({ p, tag: '' }))
  const shot = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(CourtFive, props as never))
  const cap = (h: string) => (h.match(/ct-call">([^<]*)/)?.[1] ?? '').replace(/&#x27;/g, "'")
  const MID = (FLOOR.left + FLOOR.right) / 2
  const feet = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) / FLOOR.ft

  it('the five it is read for draws it, and the post and the pinch post are the two men inside', () => {
    expect(inferredStyle(BULLS)!.style).toBe('triangle')
    const at = spotsFor(null, BULLS)
    expect(at).toEqual(spotsFor({ style: 'triangle', pnr: null }, BULLS))
    // PF and C (Kukoč, Longley) hold the two inside spots, whoever the engine's featured post option is
    expect(outsideLine(at[3])).toBe(false)
    expect(outsideLine(at[4])).toBe(false)
  })

  it('the triangle itself is on ONE side: the wing, the corner and the post share a half of the floor', () => {
    const at = spotsFor({ style: 'triangle', pnr: null }, BULLS)
    // SG on the wing, SF in the corner, C on the post — the three corners of the triangle, all strong side
    for (const i of [1, 2, 4]) expect(at[i][0]).toBeGreaterThan(MID)
    // and the two-man game is the other side: PG at the point, PF at the pinch post
    for (const i of [0, 3]) expect(at[i][0]).toBeLessThan(MID)
  })

  it('a man stands in the CORNER — which is what makes it a triangle and not a two-guard front', () => {
    const at = spotsFor({ style: 'triangle', pnr: null }, BULLS)
    expect(inCorner(at[2])).toBe(true)
    expect(at.filter(inCorner)).toHaveLength(1)
  })

  it('exactly two men are inside the arc, and the point, the wing and the corner are outside', () => {
    const at = spotsFor({ style: 'triangle', pnr: null }, BULLS)
    expect(at.filter((xy) => !outsideLine(xy))).toHaveLength(2)
    expect(new Set(at.map((xy) => xy.join(','))).size).toBe(5)
    expect(outsideLine(at[0])).toBe(true) // PG at the point
    expect(outsideLine(at[1])).toBe(true) // SG on the wing
    expect(outsideLine(at[2])).toBe(true) // SF in the corner
  })

  it('nobody crowds: every pair stands at least a pick-and-roll pair apart', () => {
    // the diagram's whole point is the 15-to-20 feet between neighbours; the floor cannot honour it
    // on the point's skip to the wing (an NBA arc is wider than the diagram's), but no two rings may
    // ever sit closer than the tightest pair this court draws anywhere, the pnr's own ball-to-screen
    const at = spotsFor({ style: 'triangle', pnr: null }, BULLS)
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) expect(feet(at[i], at[j])).toBeGreaterThan(PAIR_FT)
  })

  it('the inside spots are slot spots, not a shooting sort: PF and C stand there whether or not they can shoot', () => {
    // a five where the PF can space the floor and the C cannot — the pinch post and the post are
    // theirs by slot either way, not earned or lost by shooting
    const MIXED = [g("Steve Kerr '97"), g("Michael Jordan '97"), g("Scottie Pippen '97"), g("Draymond Green '16"), g("Rudy Gobert '17")]
    expect(canSpace(MIXED[3])).toBe(true)
    expect(canSpace(MIXED[4])).toBe(false)
    const at = spotsFor({ style: 'triangle', pnr: null }, MIXED)
    expect(outsideLine(at[3])).toBe(false)
    expect(outsideLine(at[4])).toBe(false)
  })

  it('the caption names the post option', () => {
    const plan = { ...DEFAULT_TACTICS, style: 'triangle' as const }
    expect(cap(shot({ spots: spotsOf(BULLS), tactic: plan }))).toBe('triangle · Jordan · your tactic')
    expect(cap(shot({ spots: spotsOf(BULLS) }))).toContain('triangle · best fit')
  })
})

/**
 * THE POP (recal_129, his ruling: "Add pick n pop"; then his ruling: "Make pick n pop to be the same
 * as pick n roll in terms of design"). The pop used to draw its own floor — the screener stepping
 * BACK behind the arc, nobody inside the line, and the other three sorted by shooting rather than by
 * height — which made the SHAPE the tell. It is not the tell: the roll and the pop set the same
 * screen, and what differs is which big walks into it. So the two sets now draw one floor, and part
 * only on the pair the engine names.
 */
describe('the pick-and-pop draws the pick-and-roll floor, and parts from it only on the men', () => {
  const SPURS = [g("Tony Parker '11"), g("Manu Ginóbili '11"), g("Richard Jefferson '11"), g("Matt Bonner '11"), g("Tim Duncan '11")]
  const spotsOf = (five: (Player | null)[]): CourtSpot[] => five.map((p) => ({ p, tag: '' }))
  const shot = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(CourtFive, props as never))
  const cap = (h: string) => (h.match(/ct-call">([^<]*)/)?.[1] ?? '').replace(/&#x27;/g, "'")
  const key = (at: readonly (readonly [number, number])[]) => [...at].map((xy) => xy.join(',')).sort()

  it('it stands on the SAME five spots the roll does — the screener is inside the arc, not behind it', () => {
    const pop = spotsFor({ style: 'pickpop', pnr: null }, SPURS)
    const roll = spotsFor({ style: 'pnr', pnr: null }, SPURS)
    expect(key(pop)).toEqual(key(roll))
    expect(new Set(key(pop)).size).toBe(5)
    // one man inside the line in both, and he is the screener
    expect(pop.filter((xy) => !outsideLine(xy))).toHaveLength(1)
    const s = SPURS.findIndex((p) => p.name === popPair(SPURS, null).screener!.name)
    expect(outsideLine(pop[s])).toBe(false)
  })

  it('the popper is the shooter, and the roll would have picked someone else', () => {
    expect(popPair(SPURS, null).screener!.name).toBe("Matt Bonner '11")
    expect(pnrPair(SPURS, null).screener!.name).not.toBe("Matt Bonner '11")
    // same spots, different men on them: the two sets therefore still differ, on WHO and not on WHERE
    expect(spotsFor({ style: 'pickpop', pnr: null }, SPURS)).not.toEqual(spotsFor({ style: 'pnr', pnr: null }, SPURS))
  })

  it('a named pair is honoured, and the caption names both men', () => {
    const chosen: PnrPair = { handler: "Manu Ginóbili '11", screener: "Tim Duncan '11" }
    const at = spotsFor({ style: 'pickpop', pnr: chosen }, SPURS)
    const h = SPURS.findIndex((p) => p.name === chosen.handler)
    const s = SPURS.findIndex((p) => p.name === chosen.screener)
    // the handler has the ball behind the line and the named screener is beside him, inside it —
    // the same two spots the roll gives the same named pair
    expect(outsideLine(at[h])).toBe(true)
    expect(outsideLine(at[s])).toBe(false)
    const roll = spotsFor({ style: 'pnr', pnr: chosen }, SPURS)
    expect(at[h]).toEqual(roll[h])
    expect(at[s]).toEqual(roll[s])
    const plan = { ...DEFAULT_TACTICS, style: 'pickpop' as const }
    expect(cap(shot({ spots: spotsOf(SPURS), tactic: plan }))).toBe('pick-and-pop · Parker + Bonner · your tactic')
  })
})
