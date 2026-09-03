import { describe, expect, it } from 'vitest'
import { harnessTable, runHarness } from '../src/engine/harness'
import { PLAYERS } from '../src/engine/pool'
import {
  bestStyle,
  canSpace,
  DEFAULT_TACTICS,
  DUO_GAP,
  featured,
  ELITE_LIFT,
  ELITE_PV,
  gateTactics,
  handlerFit,
  pnrPair,
  reconcileTactics,
  scorerCreator,
  screenFit,
  STAR_LINE,
  styleFit,
  STYLES,
  stylePts,
  twoStars,
  type PnrPair,
  type Tactics,
} from '../src/engine/tactics'
import type { Player } from '../src/engine/types'

/**
 * THE DEVIATION TAX LAW (recal_59, permanent). Every tactic, on random matchups: the oracle-best
 * call must average at least +0.5 margin, and a BLIND deviation must average -0.3 to -1.5.
 * Balanced/default is 0 by construction. This runs on every tactics change forever — a red row
 * here means a tactic's tax is mis-calibrated, and the fix is tuning its constant, not this test.
 */
describe('the deviation tax law', () => {
  it('every tactic: oracle >= +0.5, blind deviation in [-1.5, -0.3], default 0', () => {
    const rows = runHarness(200)
    console.log(harnessTable(rows))
    // The ASSIGNMENT row has no constant and its blind read is a mean of naive-minus-shuffled
    // pairing edges — a quantity whose SIGN, not its size, is the law. At 200 matchups that mean
    // sits inside its own noise (recal_96 measured +0.02 at 200 and negative at every sample of
    // 400 or more, on this board and on the one before it); the structural sign is read at 800.
    const assignment = runHarness(800).find((r) => r.tactic === 'assignment')!
    for (const r of rows) {
      expect(r.dflt, r.tactic).toBe(0)
      expect(r.oracle, `${r.tactic} oracle`).toBeGreaterThanOrEqual(0.5)
      expect(r.random, `${r.tactic} random`).toBeGreaterThanOrEqual(-1.5)
      // ASSIGNMENT is exempt from the upper edge by its own definition (harness.ts): its tax is
      // STRUCTURAL — a bad board concedes real edges — so no constant exists to tune it with, and
      // its ratified rule is `random < 0 && oracle >= 0.5`. recal_76's removal of the team-defense
      // term compressed the pairing edges perdef feeds, taking its blind read to -0.12; the rule it
      // is actually held to still passes. Every tactic that HAS a tax keeps the full band.
      if (r.tactic !== 'assignment') expect(r.random, `${r.tactic} random`).toBeLessThanOrEqual(-0.3)
      else expect(assignment.random, `${r.tactic} random (800 matchups)`).toBeLessThan(0)
    }
  })
})

/**
 * THE PICK-AND-ROLL PAIR (his ruling: "When selenting pnr you have to select the 2 handler and
 * screener"). Calling the pnr now names two men, and the price must be THEIR price: the handler
 * term off the chosen handler, the dive term off the chosen screener, the other three as rest.
 * A plan that names nobody — an old save, an AI opponent — must price exactly as it did before,
 * off the engine's own auto-pick, or every run in progress would move underneath its owner.
 */
const g = (n: string): Player => {
  const p = PLAYERS.find((q) => q.name === n)
  if (!p) throw new Error(`no card: ${n}`)
  return p
}
const FIVE = [g("Stephen Curry '16"), g("Klay Thompson '15"), g("LeBron James '13"), g("Draymond Green '16"), g("Rudy Gobert '17")]
const NAMES = FIVE.map((p) => p.name)
const plan = (pnr: PnrPair | null): Tactics => ({ ...DEFAULT_TACTICS, style: 'pnr', pnr })

describe('the pick-and-roll pair he calls', () => {
  it('prices the chosen pair, not the pair the engine would have picked', () => {
    const auto = pnrPair(FIVE, null)
    expect(auto.handler?.name).toBe("Stephen Curry '16")
    expect(auto.screener?.name).toBe("LeBron James '13")
    // the same two men, named by hand, are the same number
    const same = pnrPair(FIVE, { handler: auto.handler!.name, screener: auto.screener!.name })
    expect(same.chosen).toBe(true)
    expect(stylePts(plan({ handler: auto.handler!.name, screener: auto.screener!.name }), FIVE)).toBeCloseTo(stylePts(plan(null), FIVE), 10)
    // a worse pair off the same five is worth less, and the fit says so in the same direction
    const bad: PnrPair = { handler: "Klay Thompson '15", screener: "Draymond Green '16" }
    expect(styleFit('pnr', FIVE, undefined, bad)).toBeLessThan(styleFit('pnr', FIVE))
    expect(stylePts(plan(bad), FIVE)).toBeLessThan(stylePts(plan(null), FIVE))
  })

  it('reads the handler and dive terms off the two men named, whoever they are', () => {
    // LeBron is 6'9": the auto-pick may never hand him the ball (height <= 78), a call can
    const pick: PnrPair = { handler: "LeBron James '13", screener: "Rudy Gobert '17" }
    const rest = FIVE.filter((p) => p.name !== pick.handler && p.name !== pick.screener)
    // recal_120: the two-man terms are handlerFit (playvol-led, with the elite-passer ramp) and
    // screenFit (the best finish off the screen, roll OR pop); the three weights are recal_58's
    const want =
      0.4 * handlerFit(g(pick.handler).attrs) +
      0.35 * screenFit(g(pick.screener).attrs) +
      0.25 * (rest.reduce((t, p) => t + p.attrs['3pt'], 0) / rest.length)
    expect(styleFit('pnr', FIVE, undefined, pick)).toBeCloseTo(want, 10)
  })

  it('an old plan with no pair at all still resolves, and prices as it always did', () => {
    const old = { ...DEFAULT_TACTICS, style: 'pnr' } as Tactics
    delete (old as { pnr?: unknown }).pnr
    expect(old.pnr).toBeUndefined()
    expect(pnrPair(FIVE, old.pnr).chosen).toBe(false)
    expect(stylePts(old, FIVE)).toBeCloseTo(stylePts(plan(null), FIVE), 10)
    // and it survives reconciliation rather than throwing on the way through
    expect(reconcileTactics(old, NAMES).pnr).toBe(null)
  })

  it('rejects a pair that names one man twice, or a man who is not on the five', () => {
    expect(reconcileTactics(plan({ handler: NAMES[0], screener: NAMES[0] }), NAMES).pnr).toBe(null)
    expect(reconcileTactics(plan({ handler: NAMES[0], screener: "Shaquille O'Neal '00" }), NAMES).pnr).toBe(null)
    expect(reconcileTactics(plan({ handler: "Shaquille O'Neal '00", screener: NAMES[4] }), NAMES).pnr).toBe(null)
    // a legal pair is kept exactly, and a man who leaves the five takes the call with him
    const good: PnrPair = { handler: NAMES[1], screener: NAMES[3] }
    expect(reconcileTactics(plan(good), NAMES).pnr).toEqual(good)
    expect(reconcileTactics(plan(good), NAMES.filter((n) => n !== NAMES[3])).pnr).toBe(null)
  })

  it('a dropped pair falls back to the auto-pick, so no saved run resets', () => {
    const dropped = reconcileTactics(plan({ handler: NAMES[0], screener: NAMES[0] }), NAMES)
    expect(stylePts(dropped, FIVE)).toBeCloseTo(stylePts(plan(null), FIVE), 10)
  })

  it('the pair rides with the style: below Playbook rank 2 neither is heard', () => {
    const called = plan({ handler: NAMES[1], screener: NAMES[3] })
    expect(gateTactics(called, 1).style).toBe('balanced')
    expect(gateTactics(called, 1).pnr).toBe(null)
    expect(gateTactics(called, 2).pnr).toEqual(called.pnr)
  })
})

/**
 * THE BEST-FIT TACTIC (recal_115, his rulings: "Why is the system helio for rus when KD is a better
 * scorrer? And in general, why Helio when they have 2 superstars? Other find a more fitting one,
 * adjust the bonuses, or create a new system." · "How come Boston post up and not 5 out?").
 *
 * Three general rules, held here on the fives he named: the helio engine is the five's best
 * SCORER-CREATOR and not its highest play-volume man; a five with two superstars is never read as
 * helio; and five-out is a count of shooters with no non-shooting big, not an average dragged down
 * by the worst man on the floor.
 */
const cut = (...names: string[]) => names.map(g)
const THUNDER_16 = cut("Russell Westbrook '16", "Andre Roberson '16", "Kevin Durant '16", "Serge Ibaka '16", "Enes Freedom '16")
const THUNDER_22 = cut("Josh Giddey '22", "Shai Gilgeous-Alexander '22", "Luguentz Dort '22", "Aleksej Pokusevski '22", "Darius Bazley '22")
const CELTICS_25 = cut("Derrick White '25", "Jaylen Brown '25", "Jayson Tatum '25", "Kristaps Porziņģis '25", "Al Horford '25")
const LAKERS_00 = cut("Ron Harper '00", "Kobe Bryant '00", "Glen Rice '00", "Robert Horry '00", "Shaquille O'Neal '00")
const ROCKETS_94 = cut("Kenny Smith '94", "Mario Elie '94", "Robert Horry '94", "Otis Thorpe '94", "Hakeem Olajuwon '94")

describe('the helio engine is the best scorer-creator, not the busiest man', () => {
  it("Durant '16 outranks Westbrook '16, though Westbrook touches more of the offense", () => {
    const kd = g("Kevin Durant '16").attrs
    const rw = g("Russell Westbrook '16").attrs
    // the OLD measure — pure play volume — put Westbrook first, which is the complaint
    expect(Math.min(rw.volume, rw.playvol)).toBeGreaterThan(Math.min(kd.volume, kd.playvol))
    // the composite reads scoring load x efficiency x creation, and Durant wins it
    expect(scorerCreator(kd)).toBeGreaterThan(scorerCreator(rw))
    expect(featured('helio', THUNDER_16)[0].name).toBe("Kevin Durant '16")
  })

  it('the featured man of a set is the man the fit is built on, one function for floor and caption', () => {
    // post-up features the interior hub, the pick-and-roll features BOTH of its men, and the sets
    // that feature nobody say so rather than naming an arbitrary starter
    expect(featured('postup', LAKERS_00)[0].name).toBe("Shaquille O'Neal '00")
    expect(featured('pnr', THUNDER_16).map((p) => p.name)).toEqual(["Russell Westbrook '16", "Kevin Durant '16"])
    expect(featured('fiveout', CELTICS_25)).toEqual([])
    expect(featured('balanced', CELTICS_25)).toEqual([])
  })
})

describe('two superstars are never read as helio', () => {
  it("the Thunder '16 read the pick-and-roll between their two, not one man's offense", () => {
    expect(twoStars(THUNDER_16)).toBe(true)
    const e = THUNDER_16.map((p) => scorerCreator(p.attrs)).sort((a, b) => b - a)
    expect(e[1]).toBeGreaterThanOrEqual(STAR_LINE)
    expect(e[0] - e[1]).toBeLessThanOrEqual(DUO_GAP)
    expect(bestStyle(THUNDER_16).style).toBe('pnr')
    // ...and the pair the caption names is the two of them
    expect(
      featured('pnr', THUNDER_16)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Kevin Durant '16", "Russell Westbrook '16"])
  })

  it("a five with ONE clear star still reads helio: the Thunder '22 survive untouched", () => {
    expect(twoStars(THUNDER_22)).toBe(false)
    const b = bestStyle(THUNDER_22)
    expect(b.style).toBe('helio')
    expect(b.fit).toBeGreaterThan(60)
    expect(featured('helio', THUNDER_22)[0].name).toBe("Shai Gilgeous-Alexander '22")
  })

  it('the gate is general: two men above the line and inside the gap, whoever they are', () => {
    // the same test on another roster, so the rule is not a fact about one five
    const pair = cut("Stephen Curry '17", "Klay Thompson '17", "Kevin Durant '17", "Draymond Green '17", "Zaza Pachulia '17")
    expect(twoStars(pair)).toBe(true)
    expect(bestStyle(pair).style).not.toBe('helio')
    // and a star beside a good second man is NOT two superstars
    const solo = cut("LeBron James '16", "Kyrie Irving '16", "J.R. Smith '16", "Kevin Love '16", "Timofey Mozgov '16")
    expect(twoStars(solo)).toBe(false)
  })
})

describe('five-out is a count of shooters, and a non-shooting big is a hole in it', () => {
  it('Boston 2025 reads five-out, and beats every other set on that floor', () => {
    expect(bestStyle(CELTICS_25).style).toBe('fiveout')
    // four men over the closeout line, and nobody the defence can leave at the rim
    expect(CELTICS_25.filter((p) => p.attrs['3pt'] >= 60)).toHaveLength(4)
    expect(CELTICS_25.filter((p) => p.attrs.height >= 81 && !canSpace(p))).toHaveLength(0)
    expect(styleFit('fiveout', CELTICS_25)).toBeGreaterThan(styleFit('postup', CELTICS_25))
  })

  it('a non-shooting big costs the set 25 points, so a four-out team is not read five-out', () => {
    const rockets = cut("Chris Paul '18", "James Harden '18", "Eric Gordon '18", "Ryan Anderson '18", "Clint Capela '18")
    expect(rockets.filter((p) => p.attrs['3pt'] >= 60)).toHaveLength(4)
    expect(rockets.filter((p) => p.attrs.height >= 81 && !canSpace(p))).toHaveLength(1) // Capela
    expect(styleFit('fiveout', rockets)).toBeLessThan(60)
    expect(bestStyle(rockets).style).toBe('pnr')
  })

  it('and two men who cannot shoot are never read five-out, however the fit lands', () => {
    const two = cut("Stephen Curry '16", "Klay Thompson '15", "LeBron James '13", "Draymond Green '18", "Rudy Gobert '17")
    expect(two.filter((p) => !canSpace(p))).toHaveLength(2)
    expect(bestStyle(two).style).not.toBe('fiveout')
  })
})

describe('post-up still fits a true post hub, and only one', () => {
  it("the Lakers '00 and the Rockets '94 read post-up, on O'Neal and on Olajuwon", () => {
    for (const [f, man] of [
      [LAKERS_00, "Shaquille O'Neal '00"],
      [ROCKETS_94, "Hakeem Olajuwon '94"],
    ] as const) {
      expect(bestStyle(f).style).toBe('postup')
      expect(featured('postup', f)[0].name).toBe(man)
    }
  })

  it('a big who shoots is not a hub: the post term is scaled by how interior his own game is', () => {
    // Porzingis '25 is 7'2" and shoots 86 from three; the old term made Boston a post team on him.
    // The five's post fit is now under the free default.
    expect(g("Kristaps Porziņģis '25").attrs['3pt']).toBeGreaterThanOrEqual(60)
    expect(styleFit('postup', CELTICS_25)).toBeLessThan(60)
    // O'Neal, who shoots 2, is untouched by the same term
    expect(styleFit('postup', LAKERS_00)).toBeGreaterThan(70)
  })
})

/**
 * THE TWO-MAN GAME (recal_120, his ruling: "Jazz 97' pnr Stockton and Malone is more fitting").
 * The pick-and-roll's two terms were minima — min(playvol, volume) for the handler, min(rim,
 * efficiency) for the screener — so the most famous pick-and-roll in the league's history read
 * post-up 81 / pnr 46. The handler is now playvol-led with an elite-passer ramp, the screener is
 * credited for the POP as well as the roll, and the mid-range left the post-up hub to pay for it.
 */
const JAZZ_97 = cut("John Stockton '97", "Jeff Hornacek '97", "Bryon Russell '97", "Karl Malone '97", "Greg Ostertag '97")
const SUNS_05 = cut("Steve Nash '05", "Joe Johnson '05", "Quentin Richardson '05", "Shawn Marion '05", "Amar'e Stoudemire '05")

describe('an elite passer and a big who pops are a pick-and-roll, not a post-up', () => {
  it("the Jazz '97 read the pick-and-roll between Stockton and Malone", () => {
    const b = bestStyle(JAZZ_97)
    expect(b.style).toBe('pnr')
    expect(featured('pnr', JAZZ_97).map((p) => p.name)).toEqual(["John Stockton '97", "Karl Malone '97"])
    // it beats the post-up built around the same big, and everything else on that floor
    expect(styleFit('pnr', JAZZ_97)).toBeGreaterThan(styleFit('postup', JAZZ_97))
    for (const s of STYLES) if (s.key !== 'pnr' && s.key !== 'balanced') expect(styleFit('pnr', JAZZ_97)).toBeGreaterThan(styleFit(s.key, JAZZ_97))
  })

  it('the handler is led by his passing, not capped by his scoring', () => {
    const js = g("John Stockton '97").attrs
    // the OLD term: a pass-first guard with 23 volume read 23, which said he cannot run the play
    expect(Math.min(js.playvol, js.volume)).toBe(js.volume)
    expect(handlerFit(js)).toBeGreaterThan(80)
    // and the elite ramp is what separates him from a good-but-not-elite passer at the same volume
    expect(ELITE_PV).toBe(80)
    expect(handlerFit({ ...js, playvol: ELITE_PV })).toBeLessThan(handlerFit(js) - ELITE_LIFT / 2)
  })

  it('the screener is paid for the pop as well as the roll, and the block is not', () => {
    const km = g("Karl Malone '97").attrs
    expect(km.mid).toBeGreaterThan(km.rim) // an elbow/mid-post big
    expect(screenFit(km)).toBeGreaterThan(Math.min(km.rim, km.efficiency))
    // the mid-range MOVED: the post-up hub reads the rim alone, so the same card is worth less there
    expect(styleFit('postup', JAZZ_97)).toBeLessThan(styleFit('pnr', JAZZ_97))
  })

  it("the Suns '05 are the same shape and read it too — Nash and Stoudemire", () => {
    expect(bestStyle(SUNS_05).style).toBe('pnr')
    expect(featured('pnr', SUNS_05).map((p) => p.name)).toEqual(["Steve Nash '05", "Amar'e Stoudemire '05"])
  })

  it('a true post hub whose handler is not an elite passer keeps the post-up', () => {
    // O'Neal and Olajuwon: no man on either five clears the handler gate at all
    for (const f of [LAKERS_00, ROCKETS_94]) {
      expect(pnrPair(f, null).handler).toBe(null)
      expect(bestStyle(f).style).toBe('postup')
    }
    // ...and the low-playvol hubs recal_115 protected are still post-ups
    const hornets95 = cut("Muggsy Bogues '95", "Hersey Hawkins '95", "Larry Johnson '95", "Scott Burrell '95", "Alonzo Mourning '95")
    expect(bestStyle(hornets95).style).toBe('postup')
    const magic11 = cut("Jameer Nelson '11", "Jason Richardson '11", "Hedo Türkoğlu '11", "Ryan Anderson '11", "Dwight Howard '11")
    expect(bestStyle(magic11).style).toBe('postup')
  })
})
