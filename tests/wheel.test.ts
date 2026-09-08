import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { heldPool, landOn } from '../src/ui/Draft'
import { buildReels, offsetOf, REEL_STAGGER_MS, REEL_TEAM_MS, REEL_YEAR_MS, reelPlan } from '../src/ui/SpinReels'
import { POSITIONS } from '../src/engine/positions'
import type { Pos } from '../src/engine/positions'

/**
 * HIS RULING, with a picture of Hearthstone's Finding Opponent screen: "I want 2 wheels, one for
 * team, and one for year. Pressing spin will spin both (unless selected to spin 1 only), and the
 * team will show first, then the year. But instead of a wheel like roullete, it will be like the
 * picture."
 *
 * The reels are an animation of a decision `landOn` has already made, so what must hold is that
 * they cannot disagree with it: both carry the answer, both point at it, and the year reel only
 * ever offers seasons the landed franchise actually played. A reel that stopped a row short of the
 * name printed under it is worse than the flicker it replaced.
 */

// a deterministic stand-in for Math.random, so a failure is the same failure twice
const seeded = (n: number) => () => {
  n = (n * 1664525 + 1013904223) % 4294967296
  return n / 4294967296
}

const ROWS = 5
const H = 30

describe('both reels carry the answer', () => {
  it('puts the landed team on one and its own season on the other', () => {
    const rnd = seeded(3)
    for (let k = 0; k < 40; k++) {
      const landed = WHEEL[Math.floor(rnd() * WHEEL.length)]
      const r = buildReels(landed, WHEEL, rnd, k)
      expect(r.team.rows[r.team.at]).toBe(landed.team)
      expect(r.year.rows[r.year.at]).toBe(String(landed.y))
    }
  })

  /** The year reel is loaded from the landed franchise, which is why the year can only be read
   *  after the team has stopped — and why the two can never contradict each other. */
  it('offers only seasons that franchise actually has on the wheel', () => {
    const rnd = seeded(9)
    for (let k = 0; k < 25; k++) {
      const landed = WHEEL[Math.floor(rnd() * WHEEL.length)]
      const real = new Set(WHEEL.filter((t) => t.team === landed.team).map((t) => String(t.y)))
      for (const y of buildReels(landed, WHEEL, rnd, k).year.rows) expect(real.has(y)).toBe(true)
    }
  })

  it('never lists one franchise twice on the team reel', () => {
    const rnd = seeded(17)
    for (let k = 0; k < 25; k++) {
      const r = buildReels(WHEEL[Math.floor(rnd() * WHEEL.length)], WHEEL, rnd, k)
      expect(new Set(r.team.rows).size).toBe(r.team.rows.length)
    }
  })

  it('records which reel was held, so a held one can be left where it is', () => {
    const rnd = seeded(21)
    const t = WHEEL[0]
    expect(buildReels(t, WHEEL, rnd, 1).held).toBe(null)
    expect(buildReels(t, WHEEL, rnd, 2, 'team').held).toBe('team')
    expect(buildReels(t, WHEEL, rnd, 3, 'year').held).toBe('year')
  })
})

describe('a reel stops with its answer under the arrows', () => {
  it('ends with the landing row in the middle of the window, whatever the list', () => {
    for (const rows of [3, 7, 13, 47]) {
      for (let at = 0; at < rows; at++) {
        const p = reelPlan(rows, at, 1400)
        // the row sitting in the window's middle band at the end is `at` of the repeating list
        const index = Math.round((Math.floor(ROWS / 2) * H - p.end) / H)
        expect(index % rows).toBe(at)
      }
    }
  })

  it('never runs off either end of the strip it built', () => {
    for (const rows of [3, 7, 13, 47]) {
      for (const spinMs of [1400, 2200]) {
        for (let at = 0; at < rows; at++) {
          const p = reelPlan(rows, at, spinMs)
          const first = offsetOf(0)
          const last = offsetOf(p.strip - 1 - Math.floor(ROWS / 2))
          // it starts no higher than the top of the strip and ends no lower than its foot
          expect(p.start).toBeLessThanOrEqual(first)
          expect(p.end).toBeGreaterThanOrEqual(last)
          expect(p.strip % rows).toBe(0)
        }
      }
    }
  })

  /**
   * HIS RULING: "make it animated". The run is LINEAR and the brake decelerates, and the brake's
   * distance is the ground a body at that speed covers while stopping evenly — which is what makes
   * the hand-off seamless instead of a lurch.
   */
  it('travels flat out, then brakes over half as much ground per second', () => {
    const p = reelPlan(13, 4, 1400)
    const run = p.start - p.mid
    const brake = p.mid - p.step
    expect(run).toBeGreaterThan(0)
    expect(brake).toBeGreaterThan(0)
    // same speed in the run; half the average speed in the brake
    expect(run / p.spinMs / (brake / p.brakeMs)).toBeCloseTo(2, 5)
  })

  /**
   * HIS RULING: "1 step back maximum at the end ... but not 10 back steps like now". The brake
   * stops one row short and a third phase takes the last row on its own, so the final movement is
   * exactly one row — never fourteen of them grinding past at walking pace.
   */
  it('takes exactly one row as its last step, whatever the list or the answer', () => {
    for (const rows of [3, 7, 13, 47]) {
      for (const spinMs of [1000, 1800]) {
        for (let at = 0; at < rows; at++) {
          const p = reelPlan(rows, at, spinMs)
          expect(p.step - p.end).toBe(H)
        }
      }
    }
  })

  it('always goes one way — down the strip, never back up it', () => {
    for (let at = 0; at < 13; at++) {
      const p = reelPlan(13, at, 1400)
      expect(p.mid).toBeLessThan(p.start)
      expect(p.step).toBeLessThan(p.mid)
      expect(p.end).toBeLessThan(p.step)
    }
  })

  it('stops the year exactly his 0.8s after the team', () => {
    expect(REEL_YEAR_MS - REEL_TEAM_MS).toBe(REEL_STAGGER_MS)
    expect(REEL_STAGGER_MS).toBe(800)
  })
})

/**
 * HIS RULING: "unless selected to spin 1 only". A held reel narrows the POOL the landing is drawn
 * from, not the animation — hold the team and the spin stays inside that franchise, hold the year
 * and it stays inside that season.
 */
describe('a held reel keeps its half', () => {
  const open = [...POSITIONS] as Pos[]

  it('hands the spin only that franchise, or only that season', () => {
    const t = WHEEL.find((x) => x.team === 'Boston Celtics')!
    expect(heldPool(null, t)).toBe(WHEEL)
    expect(heldPool('team', t).every((x) => x.team === t.team)).toBe(true)
    expect(heldPool('year', t).every((x) => x.y === t.y)).toBe(true)
    expect(heldPool('team', t).length).toBeGreaterThan(1)
    expect(heldPool('year', t).length).toBeGreaterThan(1)
  })

  it('is the whole wheel again when nothing has landed yet', () => {
    expect(heldPool('team', null)).toBe(WHEEL)
    expect(heldPool('year', null)).toBe(WHEEL)
  })

  it('keeps landOn inside the pool it is handed', () => {
    const t = WHEEL.find((x) => x.team === 'Boston Celtics')!
    const pool = heldPool('team', t)
    const rnd = seeded(5)
    for (let k = 0; k < 20; k++) {
      const got = landOn(new Set(), open, rnd, null, undefined, pool)
      expect(got).not.toBeNull()
      expect(got!.team).toBe(t.team)
    }
  })

  it('returns nothing rather than leaving the pool, so a hold can never spend a spin on a lie', () => {
    expect(landOn(new Set(), open, seeded(1), null, undefined, [])).toBeNull()
    // every man taken: no team-season in the pool can fill a slot, and none is returned anyway
    const t = WHEEL.find((x) => x.team === 'Boston Celtics')!
    const pool = heldPool('team', t)
    const allTaken = new Set(pool.flatMap((x) => x.p).map((n) => n.replace(/ '\d\d( \([a-z]\))?$/, '')))
    expect(landOn(allTaken, open, seeded(2), null, undefined, pool)).toBeNull()
  })
})
