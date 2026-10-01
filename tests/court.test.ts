import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CourtFive, FLOOR, inCorner, inferredStyle, outsideLine, PAIR_FT, spotsFor, surname as surnameOf, type CourtSpot } from '../src/ui/CourtFive'
import { bestStyle, canSpace, DEFAULT_TACTICS, featured, heliMan, pnrPair, popPair, postMan, styleFit, STYLES, TRI_POST, twoStars, Z_MID, type PnrPair, type Style, type Tactics } from '../src/engine/tactics'
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
   *  including the three VETOES it has grown since: five-out is never read for a five with two men
   *  who cannot shoot (recal_115), helio is never read for a five with two stars (recal_115), and
   *  the triangle is never read for a five with nobody to feed on the block (recal_128).
   *  recal_226, HIS RULING "all tactics scores will be relative": the free default is Z_MID 50 and
   *  not a raw 60 — balanced has no spread by construction, so it reads exactly ORDINARY, which is
   *  the same sentence the raw 60 used to say on a scale where 60 was the middle. The triangle's
   *  entry-pass veto is written in here for the first time: it was missing and the test agreed by
   *  luck while the triangle won 22 of 1,255, and this round takes it to 139. */
  const argmax = (five: Player[]): { style: Style; fit: number } => {
    let style: Style = 'balanced'
    let fit = Z_MID
    const shy = five.filter((p) => !canSpace(p)).length
    const duo = twoStars(five)
    const hasPost = five.some((p) => Math.max(p.attrs.rim, p.attrs.mid) >= TRI_POST)
    for (const s of STYLES) {
      if (s.key === 'balanced') continue
      if (s.key === 'fiveout' && shy >= 2) continue
      if (s.key === 'helio' && duo) continue
      if (s.key === 'triangle' && !hasPost) continue
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
        // nothing may be inferred that does not actually beat the free default — Z_MID since recal_226
        for (const s of STYLES) expect(styleFit(s.key, five)).toBeLessThanOrEqual(Z_MID)
      } else {
        expect(styleFit(want.style, five)).toBeGreaterThan(Z_MID)
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
    // recal_115 moved this five's READ from post-up to helio, recal_224 moved it back, and recal_226
    // — his ruling "all tactics scores will be relative" — moves it again, to the HAND-OFF HUB
    // (dho 84.0, horns 79.5, helio 79.0, postup 68.0): James '26 is a better hub against the league's
    // hubs than he is a post against the league's posts, which is the sentence the z scale is for and
    // the raw scale could not say. The RULING under test is unchanged and is about the SPOT, not the
    // shape: whatever the five is read as, the man who cannot shoot stands inside and never in a
    // corner, and the second half of this case asserts it in every shape. MOVED READ, reported in
    // data/rounds/226.json.
    //   recal_230 LEAVES THE READ WHERE recal_226 PUT IT, and the two halves of the round cancel on
    // this five exactly. His ruling "25' Thunder cant be hoh(hand of hub)" multiplies the hand-off's
    // hub leg by `central` (how close the hub is to being the five's own best creator) and Dončić '26
    // creates more than James '26 does, so the raw falls 100.00 -> 85.48. But his SECOND ruling the
    // same day — "The tighter one, full at 6'10", nothing under 6'5"" — is the size floor that keeps
    // the credit off guards, which drops the LEAGUE's hand-off distribution with it (STYLE_REF.dho mu
    // 86.378 -> 59.878, sd 6.388 -> 12.635), and James at 6'9" keeps 0.80 of the credit. Net: dho
    // 81.99 -> 80.39, still a shade ABOVE horns at 79.48 (helio 79.01, pindown 74.44 — all three
    // byte-identical to main). The RULING under test never moved and is about the SPOT, not the shape.
    expect(inferredStyle(LAKERS)!.style).toBe('dho')
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
    // his ruling removed the "· no better fit" tail, and his ruling of 2026-09-29 removed the
    // rest of the apparatus with it ("Remove best fit 60 Billups ... add Tactic: Helio"): an
    // inferred read is the label alone, under a Tactic: stamp. What this case is really pinning is
    // that the read is still INFERRED and not called.
    const inferred = inferredStyle(FIVE)!.style
    expect(caption(draw(null))).toBe(`Tactic: ${inferred === 'balanced' ? 'Balanced' : STYLES.find((x) => x.key === inferred)!.label}`)
    expect(caption(draw(null))).not.toContain('best fit')
    expect(caption(draw(null))).not.toContain('no better fit')
  })

  /**
   * THE SHAPE IS STILL READ OFF THE FIVE — the caption no longer NAMES the man it runs through
   * (his ruling, 2026-09-29: "Remove best fit 60 Billups"), which was recal_115's answer to "Why
   * is the system helio for rus when KD is a better scorrer?". The reading itself is what that
   * ruling was about and it is unchanged; this pins the READ rather than the sentence.
   * recal_226 RE-POINTS BOTH READS and reports them as moved (his ruling: "all tactics scores will
   * be relative"): the Thunder '16 go pick-and-pop -> PIN-DOWN (pindown 77.7, pickpop 75.9) and the
   * Thunder '22 go helio -> HAND-OFF HUB (dho 65.5, helio 62.7). Both are CONTRADICTED PINS and are
   * listed as such in data/rounds/226.json — the Thunder '22 were recal_115's "one clear star still
   * reads helio" case and they no longer do, because helio's own spread (sd 7.70) is wider than the
   * hub's (8.73) once every tactic is measured against its own league.
   *   ...AND BOTH COME BACK in the same round, on his three rulings of 2026-09-30 — "In pindown, we
   * have 2 players coming off pin down screens ... So 2 shooters, 1 handler, 2 rollers" and "DHO hub
   * should be - height playvol only" with `primacy` deleted. Re-pointed a SECOND time, to what the
   * two rulings they contradicted asked for in the first place: the Thunder '16 read PICK-AND-POP
   * again (75.87, pindown second at 73.52), which is recal_214's own ruling "KD is a better midpt
   * shooter than a finisher ... it needs to be pnp not pnr"; and the Thunder '22 read HELIO again
   * (62.69, dho fourth at 50.31), which is recal_115's "one clear star still reads helio". The
   * pin-down stopped winning them because it now asks for TWO shooters and TWO screeners instead of
   * paying one man 0.80 of the fit, and the hand-off hub stopped winning the '22 because the seat
   * went from Gilgeous-Alexander to Pokusevski once primacy was out of the nomination.
   */
  it('reads the shape off the five, and says only which shape', () => {
    // the CAPTION is the assertion, not the style key behind it: the key is the engine's private
    // name for the shape and the label is what the ruling is about
    const okc16 = [g("Russell Westbrook '16"), g("Andre Roberson '16"), g("Kevin Durant '16"), g("Serge Ibaka '16"), g("Enes Freedom '16")]
    expect(caption(draw(null, okc16))).toBe('Tactic: pick-and-pop')
    const okc22 = [g("Josh Giddey '22"), g("Shai Gilgeous-Alexander '22"), g("Luguentz Dort '22"), g("Aleksej Pokusevski '22"), g("Darius Bazley '22")]
    expect(caption(draw(null, okc22))).toBe('Tactic: helio')
    const bos25 = [g("Derrick White '25"), g("Jaylen Brown '25"), g("Jayson Tatum '25"), g("Kristaps Porziņģis '25"), g("Al Horford '25")]
    expect(caption(draw(null, bos25))).toBe('Tactic: five-out')
    // and not one of them carries the apparatus any more
    for (const five of [okc16, okc22, bos25]) expect(caption(draw(null, five))).not.toContain('best fit')
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
 * the three (his ruling: "smallest not handler guy on the wing, the other 2 corners") with a man
 * who cannot shoot sorting below every man who can (recal_209: a five with TWO bigs leaves one of
 * them outside the screen, and a straight height sort walked him into a corner). It holds
 * everywhere the shape is drawn: a five read as pick-and-roll, a called one, a named pair.
 *
 * ...with ONE exception, and it is the whole of recal_212 (his rulings: "You have moved Adams to the
 * wing. Adams can either be the screener or inside the paint, since he has no 3pt and no mid", then
 * "Enes Freedom cant be in the corner on a durant and westbrook pnr"). The wing recal_209 gave Adams
 * is still the arc, so the set keeps the dunker spot in reserve and gives up a corner for it when a
 * leftover cannot shoot. The GATE is the three alone, `canSpace`, because every spot this shape has
 * left is behind the line and a mid-range rating is no answer to a closeout; the RANK into the one
 * inside spot is `height + orb`, the dunker spot's own two questions, because on the three alone a
 * five can hand the shape two men who may not stand on the arc and only the deepest of them can
 * have the spot. A five whose leftovers can all shoot draws exactly as it did. `holds` therefore
 * asserts the RANKING — inside, then wing, then corner, in the shape's own sort order — rather
 * than "all three behind the line", and separately that the man sent inside can never shoot.
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
    // the other three stand in RANK order: the corner is the shooter's spot, the wing is below it,
    // and below the wing is the dunker spot, which this shape now holds in reserve for a man with
    // no jumper at all (recal_212, his ruling: "You have moved Adams to the wing. Adams can either
    // be the screener or inside the paint, since he has no 3pt and no mid"; recal_209 before it,
    // his ruling: "Pnr for 15' Thunder when Steven adams in the corner cant be the main tactic as
    // his def will sag off him"). The shape's own sort must agree with the ranks: worse man lower.
    const rest = [0, 1, 2, 3, 4].filter((i) => i !== h && i !== s)
    const dunker = (p: Player) => p.attrs.height + p.attrs.orb
    const rank = (i: number) => (!outsideLine(at[i]) ? 0 : inCorner(at[i]) ? 2 : 1)
    const sortKey = (p: Player) => (canSpace(p) ? p.attrs.height : -100 - dunker(five[five.indexOf(p)]))
    for (const i of rest)
      for (const j of rest) if (sortKey(five[i]) < sortKey(five[j])) expect(rank(i)).toBeLessThanOrEqual(rank(j))
    // the reserve is ONE spot and it is never given to a man who can shoot: at most one man is off
    // the line, and he always fails `canSpace`. A CORNER and a WING ask the same question of a man
    // and the three is the whole answer, so the gate that opens the spot reads nothing else.
    const inside = rest.filter((i) => !outsideLine(at[i]))
    expect(inside.length).toBeLessThanOrEqual(1)
    for (const i of inside) expect(canSpace(five[i])).toBe(false)
    // ...and he is the DEEPEST of the men who cannot shoot, by height + orb - not the worst shooter
    // of them (his ruling: "Enes Freedom cant be in the corner on a durant and westbrook pnr")
    for (const i of inside) for (const j of rest) if (!canSpace(five[j])) expect(dunker(five[i])).toBeGreaterThanOrEqual(dunker(five[j]))
    // still exactly one wing, whatever the reserve did to the corners
    expect(rest.filter((i) => rank(i) === 1)).toHaveLength(1)
    // a man who cannot shoot never takes a CORNER while a man who can is still standing
    const shooterOutside = rest.some((i) => canSpace(five[i]) && rank(i) < 2)
    if (!shooterOutside) for (const i of rest) if (!canSpace(five[i]) && rank(i) === 2) expect(rest.every((j) => !canSpace(five[j]))).toBe(true)
    // and a five whose leftovers can ALL shoot is untouched: three men behind the line, as before
    if (rest.every((i) => canSpace(five[i]))) for (const i of rest) expect(outsideLine(at[i])).toBe(true)
    // five different spots, whatever the pair
    expect(new Set(at.map((xy) => xy.join(','))).size).toBe(5)
  }

  it("the Thunder '24: Holmgren beside Gilgeous-Alexander at the top, the other three behind the line", () => {
    // recal_115 moved this five's READ to helio — Gilgeous-Alexander '24 out-scores the next man on
    // the floor by 27 points of scorer-creator, which is what a helio offence is — so the pair is
    // asserted against the CALL, which is what the ruling was about ("If its pnr, ..."). The
    // inference is checked below on a five that is read as a pick-and-roll.
    // recal_219 moved it to ISO and recal_222 moved it once more, to the PIN-DOWN: the pin-down spot
    // lost `pinCatch`'s rim subtraction and `pinOffBall` with every other minus in the file (his ruling
    // 1) and Gilgeous-Alexander '24 is a big mid-range scorer. The assertion below is the read, not the
    // ruling — what this test is here to prove is the PAIR and the floor, and both are asserted against
    // the CALL, unchanged: Holmgren is still the screener his ruling names.
    // ...and his ruling of 2026-09-30 ("In pindown, we have 2 players coming off pin down screens.
    // Therefore, we have 2 shooters, and screeners. Pin down screener should be roller. So 2 shooters,
    // 1 handler, 2 rollers") moves it BACK TO HELIO, which is where recal_115 put it and the read this
    // case carried for four rounds: the pin-down no longer pays one man 0.80 of the fit, so one big
    // mid-range scorer cannot carry the set on his own, and Oklahoma City is one man's offence again.
    // Re-pointed to the read, not loosened; the PAIR and the floor, which is what the case proves,
    // are asserted against the CALL below and are untouched.
    expect(inferredStyle(THUNDER)!.style).toBe('helio')
    const pair = pnrPair(THUNDER, null)
    expect(pair.handler!.name).toBe("Shai Gilgeous-Alexander '24")
    expect(pair.screener!.name).toBe("Chet Holmgren '24")
    holds(THUNDER, null)
  })

  it('a five that IS read as a pick-and-roll draws the called floor, spot for spot', () => {
    // the Jazz '97 (recal_120, his ruling: "Jazz 97' pnr Stockton and Malone is more fitting") —
    // the standing pick-and-roll read on the wheel. It was the Thunder '16 until recal_214 routed
    // the mid-range to one call ("KD is a better midpt shooter than a finisher ... it needs to be
    // pnp not pnr") and their read became the pop; the Jazz are the five that still reads the ROLL,
    // so the inference is checked on them.
    // recal_222 moved the Jazz's WINNING read to the pin-down (82.98 against a pnr of 76.35), so the
    // five whose INFERENCE is a pick-and-roll is now the Suns '05 — the other five recal_120's own
    // block pins to the roll, Nash handling and Stoudemire diving. The Jazz keep the pair and the
    // roll-over-pop preference, which is what his ruling said; that is asserted in tests/tactics.test.ts.
    const suns = [g("Steve Nash '05"), g("Joe Johnson '05"), g("Quentin Richardson '05"), g("Shawn Marion '05"), g("Amar'e Stoudemire '05")]
    expect(inferredStyle(suns)!.style).toBe('pnr')
    expect(spotsFor(null, suns)).toEqual(spotsFor({ style: 'pnr', pnr: null }, suns))
    holds(suns, null)
    const jazz = [g("John Stockton '97"), g("Jeff Hornacek '97"), g("Bryon Russell '97"), g("Karl Malone '97"), g("Greg Ostertag '97")]
    expect(pnrPair(jazz, null).handler!.name).toBe("John Stockton '97")
    expect(pnrPair(jazz, null).screener!.name).toBe("Karl Malone '97")
    holds(jazz, null)
  })

  it("the Thunder '15: Adams stands IN THE PAINT, and Jackson does not", () => {
    // recal_212, his ruling: "You have moved Adams to the wing. Adams can either be the screener or
    // inside the paint, since he has no 3pt and no mid". recal_209 got him out of the CORNER and on
    // to the wing (his ruling then: "Pnr for 15' Thunder when Steven adams in the corner cant be
    // the main tactic as his def will sag off him") — Ibaka sets the screen, so the OTHER big is
    // one of the three left over, and the wing was the lowest spot this shape owned. The wing is
    // still the arc, so the shape gained an inside spot and Adams takes it.
    //
    // THIS FIVE IS WHY THE GATE CANNOT PICK THE MAN. Jackson '15 fails the shooting line too (3pt
    // 37), so the gate hands the shape TWO men who may not stand on the arc against ONE inside
    // spot, and the RANK has to choose. It chooses on height + orb, the dunker spot's own two
    // questions, and Adams takes it by 60 — 83 + 84 against 74 + 33.
    // recal_222, his ruling 10: the ROLL screener is height .45 / rim .45 / efficiency .10, so ADAMS
    // (6'11", rim 54, efficiency 65) outreads Ibaka (6'11", rim 35, efficiency 48) and takes the screen
    // — which is the FIRST of the two spots his own ruling gives him ("Adams can either be the screener
    // or inside the paint"). The pop screener is still Ibaka, who is the shooter of the two, and the
    // POP is where the inside spot is now asserted (the next test down). MOVED, reported.
    const okc = [g("Reggie Jackson '15"), g("Anthony Morrow '15"), g("Russell Westbrook '15"), g("Serge Ibaka '15"), g("Steven Adams '15")]
    expect(pnrPair(okc, null).screener!.name).toBe("Steven Adams '15")
    expect(popPair(okc, null).screener!.name).toBe("Serge Ibaka '15")
    const [adams, jackson, morrow] = ["Steven Adams '15", "Reggie Jackson '15", "Anthony Morrow '15"].map((n) => okc.findIndex((p) => p.name === n))
    expect(okc[adams].attrs.height).toBe(Math.max(...okc.map((p) => p.attrs.height)))
    // both men fail the SHOOTING line, so the line alone cannot say which of them goes in
    expect(canSpace(okc[adams])).toBe(false)
    expect(canSpace(okc[jackson])).toBe(false)
    // and it is NOT settled by `rim`: Jackson is the better rim scorer of the two, because rim is a
    // scoring rate and a slashing guard finishes his own drives. The glass is what settles it.
    expect(okc[jackson].attrs.rim).toBeGreaterThan(okc[adams].attrs.rim)
    const dunker = (q: Player) => q.attrs.height + q.attrs.orb
    expect(dunker(okc[adams])).toBeGreaterThan(dunker(okc[jackson]))
    // the POP is the call that leaves him over, and it puts him where his ruling's other half says:
    // inside, in the paint and not on a block — down by the rim, below the free-throw line
    const at = spotsFor({ style: 'pickpop', pnr: null }, okc)
    expect(outsideLine(at[adams])).toBe(false)
    expect(feet(at[adams])[1]).toBeLessThan(8)
    // Jackson keeps the arc, on the wing; the one man who can really shoot keeps a corner
    expect(outsideLine(at[jackson])).toBe(true)
    expect(inCorner(at[jackson])).toBe(false)
    expect(inCorner(at[morrow])).toBe(true)
    // ...and on the ROLL, where Adams sets the screen, he is beside the ball and inside the arc
    const roll = spotsFor({ style: 'pnr', pnr: null }, okc)
    expect(outsideLine(roll[adams])).toBe(false)
    holds(okc, null)
  })

  it("the Thunder '16: Freedom in the paint, and the gate that reads a mid-range gets it backwards", () => {
    // his ruling: "Enes Freedom cant be in the corner on a durant and westbrook pnr". DURANT sets
    // this screen, so Freedom is one of the three left over, and a gate cut on max(3pt, mid) fails
    // this five in BOTH directions at once: Freedom (3pt 23, mid 47) clears such a gate and stays
    // out on the arc, while Roberson (3pt 16, mid 16) fails it and is sent inside instead. The three
    // alone gates it — both men fail `canSpace` — and height + orb ranks it, so Freedom goes in.
    // recal_222, his ruling 10: on the ROLL, Freedom (6'10", rim 93) is the screener and Durant is not,
    // so the five that leaves Freedom over is now the POP — where DURANT is the screener, which is the
    // pair his ruling names ("a durant and westbrook pnr"). The spot assertions move to the pop call.
    const okc = [g("Russell Westbrook '16"), g("Andre Roberson '16"), g("Kevin Durant '16"), g("Serge Ibaka '16"), g("Enes Freedom '16")]
    const pair = popPair(okc, null)
    expect(pair.handler!.name).toBe("Russell Westbrook '16")
    expect(pair.screener!.name).toBe("Kevin Durant '16")
    expect(pnrPair(okc, null).screener!.name).toBe("Enes Freedom '16")
    const [freedom, roberson, ibaka] = ["Enes Freedom '16", "Andre Roberson '16", "Serge Ibaka '16"].map((n) => okc.findIndex((p) => p.name === n))
    // the refuted gate: on the better of the two jump shots, Roberson is the worse man and Freedom
    // reads as a shooter. Both readings are wrong, and both are the same mistake.
    const jumper = (q: Player) => Math.max(q.attrs['3pt'], q.attrs.mid)
    expect(jumper(okc[freedom])).toBeGreaterThan(jumper(okc[roberson]))
    // ...and on the three, which is the only question a spot behind the line asks, both fail
    expect(canSpace(okc[freedom])).toBe(false)
    expect(canSpace(okc[roberson])).toBe(false)
    // Roberson is even the WORSE three-point shooter, so ranking by the three would seat him
    expect(okc[roberson].attrs['3pt']).toBeLessThan(okc[freedom].attrs['3pt'])
    const at = spotsFor({ style: 'pickpop', pnr: null }, okc)
    expect(outsideLine(at[freedom])).toBe(false)
    expect(feet(at[freedom])[1]).toBeLessThan(8)
    // Roberson takes the wing and Ibaka, who can shoot at 3pt 40, takes the corner
    expect(inCorner(at[roberson])).toBe(false)
    expect(outsideLine(at[roberson])).toBe(true)
    expect(canSpace(okc[ibaka])).toBe(true)
    expect(inCorner(at[ibaka])).toBe(true)
    holds(okc, null)
  })

  it('the pop keeps the inside spot too, and needs it more than the roll does', () => {
    // recal_129, his ruling: "Make pick n pop to be the same as pick n roll in terms of design" —
    // one body, so the reserve cannot be the roll's alone. The pop is also the case that needs it
    // most: ITS screener is the SHOOTING big (popPair), so a non-shooting big is never the man in
    // the screen and is always one of the three left over.
    const okc = [g("Reggie Jackson '15"), g("Anthony Morrow '15"), g("Russell Westbrook '15"), g("Serge Ibaka '15"), g("Steven Adams '15")]
    const adams = okc.findIndex((p) => p.name === "Steven Adams '15")
    expect(popPair(okc, null).screener!.name).toBe("Serge Ibaka '15")
    const pop = spotsFor({ style: 'pickpop', pnr: null }, okc)
    // recal_222, his ruling 10: the two calls now nominate DIFFERENT screeners on this five — the roll
    // takes Adams (rim 54) and the pop takes Ibaka (3pt 40) — so the two floors are no longer the same
    // five spots. "The same in terms of design" is asserted where it is a statement about the DESIGN:
    // both calls hold the reserved inside spot, and both put the non-shooting big inside the arc.
    expect(outsideLine(pop[adams])).toBe(false)
    expect(outsideLine(spotsFor({ style: 'pnr', pnr: null }, okc)[adams])).toBe(false)
    expect(new Set(pop.map((xy) => xy.join(','))).size).toBe(5)
  })

  it('a five whose leftovers can all shoot still draws three men behind the line', () => {
    // the ruling ADDS a case; it does not redraw the pick-and-roll. Nobody left over here has
    // nothing, so no corner is given up and the screener is the only man inside the arc.
    const gsw = [g("Stephen Curry '16"), g("Klay Thompson '16"), g("Kevin Durant '17"), g("Draymond Green '16"), g("Serge Ibaka '15")]
    const at = spotsFor({ style: 'pnr', pnr: null }, gsw)
    expect(at.filter((xy) => !outsideLine(xy))).toHaveLength(1)
    holds(gsw, null)
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
    expect(cap(shot({ spots: spotsOf(BULLS) }))).toBe('Tactic: triangle')
  })
})

/**
 * THE POP (recal_129, his ruling: "Add pick n pop"; then his ruling: "Make pick n pop to be the same
 * as pick n roll in terms of design"). The pop used to draw its own floor — the screener stepping
 * BACK behind the arc, nobody inside the line, and the other three sorted by shooting rather than by
 * height — which made the SHAPE the tell. It is not the tell: the roll and the pop set the same
 * screen, and what differs is which big walks into it. So the two sets now draw one floor, and part
 * only on the pair the engine names.
 *
 * ONE BODY means: hand the two calls the SAME pair and they draw the same five spots, man for man.
 * It does not mean the five spots are the same whoever the pair is - recal_212 gave the shape a
 * conditional inside spot, the dunker, taken when a man who cannot shoot is left OUT of the screen,
 * so a different pair can now move a spot and not merely a man. The Spurs '11 are the clean case
 * and they show the rule is one rule: Tim Duncan cannot shoot, and he is never stood on the arc in
 * either call - the roll walks him into the SCREEN, the pop hands the screen to Bonner and puts
 * Duncan on the DUNKER SPOT. The two sets still part only on the pair, which is the whole of his
 * ruling; what the pair decides is now slightly larger than it was.
 */
describe('the pick-and-pop draws the pick-and-roll floor, and parts from it only on the men', () => {
  const SPURS = [g("Tony Parker '11"), g("Manu Ginóbili '11"), g("Richard Jefferson '11"), g("Matt Bonner '11"), g("Tim Duncan '11")]
  const spotsOf = (five: (Player | null)[]): CourtSpot[] => five.map((p) => ({ p, tag: '' }))
  const shot = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(CourtFive, props as never))
  const cap = (h: string) => (h.match(/ct-call">([^<]*)/)?.[1] ?? '').replace(/&#x27;/g, "'")
  const key = (at: readonly (readonly [number, number])[]) => [...at].map((xy) => xy.join(',')).sort()

  it('it is drawn by ONE body: the same pair draws the same five spots in both calls', () => {
    // the ruling, stated exactly ("Make pick n pop to be the same as pick n roll in terms of
    // design"): there is no pop floor and no roll floor, there is one floor read with one pair.
    const same: PnrPair = { handler: "Tony Parker '11", screener: "Tim Duncan '11" }
    expect(spotsFor({ style: 'pickpop', pnr: same }, SPURS)).toEqual(spotsFor({ style: 'pnr', pnr: same }, SPURS))
    const pop = spotsFor({ style: 'pickpop', pnr: null }, SPURS)
    const roll = spotsFor({ style: 'pnr', pnr: null }, SPURS)
    expect(new Set(key(pop)).size).toBe(5)
    expect(new Set(key(roll)).size).toBe(5)
    // the screener is inside the arc in both calls, never behind it
    for (const [style, at] of [['pickpop', pop], ['pnr', roll]] as const) {
      const pair = (style === 'pickpop' ? popPair : pnrPair)(SPURS, null)
      const s = SPURS.findIndex((q) => q.name === pair.screener!.name)
      expect(outsideLine(at[s])).toBe(false)
    }
    // AND THE MAN WHO CANNOT SHOOT IS NEVER ON THE ARC IN EITHER (recal_212, his rulings: "Adams can
    // either be the screener or inside the paint" and "Enes Freedom cant be in the corner on a
    // durant and westbrook pnr") - which is the two places the roll and the pop respectively put
    // him: Duncan takes the screen when the roll names him and the dunker spot when the pop does not
    const duncan = SPURS.findIndex((q) => q.name === "Tim Duncan '11")
    expect(canSpace(SPURS[duncan])).toBe(false)
    expect(outsideLine(roll[duncan])).toBe(false)
    expect(outsideLine(pop[duncan])).toBe(false)
    expect(pnrPair(SPURS, null).screener!.name).toBe("Tim Duncan '11")
    expect(popPair(SPURS, null).screener!.name).toBe("Matt Bonner '11")
    // so the pop stands TWO men inside the line here and the roll stands one - the pop's screener is
    // the SHOOTING big, so its non-shooting big is a leftover and claims the reserve
    expect(pop.filter((xy) => !outsideLine(xy))).toHaveLength(2)
    expect(roll.filter((xy) => !outsideLine(xy))).toHaveLength(1)
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
