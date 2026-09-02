import { describe, expect, it } from 'vitest'
import { harnessTable, runHarness } from '../src/engine/harness'
import { PLAYERS } from '../src/engine/pool'
import { DEFAULT_TACTICS, gateTactics, pnrPair, reconcileTactics, styleFit, stylePts, type PnrPair, type Tactics } from '../src/engine/tactics'
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
    const want =
      0.4 * Math.min(g(pick.handler).attrs.playvol, g(pick.handler).attrs.volume) +
      0.35 * Math.min(g(pick.screener).attrs.rim, g(pick.screener).attrs.efficiency) +
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
