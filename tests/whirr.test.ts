import { describe, expect, it } from 'vitest'
import { reelPlan, WHIRR_STEP_MS, whirrRates } from '../src/ui/SpinReels'

/**
 * The wheel's whirr is the bike-wheel loop played at the reel's own speed. These hold the sound to
 * the picture: flat out while the strip runs, slowing along the same brake, and silent once the
 * reel has stopped visibly moving.
 */
describe('the whirr follows the reel', () => {
  const plan = reelPlan(13, 4, 900, 2)
  const brakePx = Math.abs(plan.mid - plan.end)
  const rates = whirrRates(plan.spinMs, brakePx)

  it('runs flat out for the whole run, then only ever slows', () => {
    const run = Math.floor(plan.spinMs / WHIRR_STEP_MS)
    for (let i = 0; i <= run; i++) expect(rates[i]).toBe(1)
    for (let i = run + 1; i < rates.length; i++) expect(rates[i]).toBeLessThanOrEqual(rates[i - 1] + 1e-6)
    // the brake starts at the speed the run left off at — no lurch in the pitch
    expect(rates[run + 1]).toBeGreaterThan(0.9)
  })

  it('stops where the eye says the reel stopped, not where the transition ends', () => {
    const ms = (rates.length - 1) * WHIRR_STEP_MS
    expect(ms).toBeGreaterThan(plan.spinMs + 500)
    expect(ms).toBeLessThan(plan.spinMs + plan.landMs)
    expect(rates[rates.length - 1]).toBeLessThan(0.1)
  })

  it('covers the same ground as the strip', () => {
    // speed × time, summed, is the distance the sound "travelled" at the reel's flat-out speed
    const v = (plan.mid - plan.start) / plan.spinMs
    const heard = rates.reduce((a, r) => a + r, 0) * WHIRR_STEP_MS * Math.abs(v)
    const seen = Math.abs(plan.end - plan.start)
    expect(Math.abs(heard - seen) / seen).toBeLessThan(0.03)
  })
})
