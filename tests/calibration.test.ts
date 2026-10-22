import { describe, expect, it } from 'vitest'
import { batchLineups, LADDER } from '../src/engine/batch'
import { night, odds } from '../src/engine/odds'
import { realStarters } from '../src/engine/starters'
import { DEFAULT_TACTICS, type Tactics } from '../src/engine/tactics'

/**
 * THE CARD IS HONEST (P8): what odds() prints before a series is what the sim delivers over many of
 * them. scripts/calibrate.ts is the full measurement (ten buckets, thirty thousand series each);
 * this is the guard — four nights against level 1, 10,000 fixed-seed series each, so the result is
 * deterministic and a 4-standard-error tolerance is both tight and never flaky.
 */
const N = 10000
const L1 = LADDER[0].players
function check(y: number, ab: string, plan: Tactics | null) {
  const nt = night(realStarters(y, ab), L1, 'naive', plan)
  const card = odds(nt.mine, nt.theirs, nt.sigma).series
  const got = batchLineups(nt.mine, nt.theirs, { n: N, seed: 1, sigma: nt.sigma, closest: 0 }).aPct
  const se = Math.sqrt((card * (1 - card)) / N)
  return { card, got, se, nt }
}

describe('calibration: the card against 10,000 seeded series', () => {
  it.each([
    [1996, 'CHI', 0.98], // the '96 Bulls' real five: a 98% card loses about 2%
    [2019, 'PHO', 0.8],
    [2013, 'CHA', 0.5],
  ])('plain campaign, %i %s (card near %f)', (y, ab, near) => {
    const r = check(y, ab, null)
    expect(r.card).toBeCloseTo(near, 1)
    expect(Math.abs(r.got - r.card)).toBeLessThanOrEqual(4 * r.se)
  })

  it('a plan on a wash night: the card prices the AI answering slow as the underdog, as the sim plays it', () => {
    // 1984-85 Cavaliers vs level 1 with the default plan: the usage surpluses are within 2, so the
    // AI's tempo is its underdog call — slow, sigma 10.8. The card used to price it normal (84.7%,
    // sim 82.3%); the night is one function now and the card has to land on the result.
    const r = check(1985, 'CLE', DEFAULT_TACTICS)
    expect(r.nt.pc!.lvl).toBeLessThan(0)
    expect(r.nt.sigma).toBeCloseTo(10.8, 6)
    expect(Math.abs(r.got - r.card)).toBeLessThanOrEqual(4 * r.se)
  })
})
