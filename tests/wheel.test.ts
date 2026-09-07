import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { buildSpin, landingTurn } from '../src/ui/SpinWheel'

/**
 * HIS RULING: "Instead of the wheel spinning like it currently does, add an actual wheel with a
 * design fitting to the stage."
 *
 * The disc is an animation of a decision `landOn` has already made, so the one thing that must
 * hold is that it CANNOT disagree with it: the landed team is on the disc, `at` points at it, and
 * the angle the disc is turned to puts that wedge under the pointer. A wheel that stops a wedge
 * short of the answer it prints underneath is worse than the flicker it replaced.
 */

const N = 12
/** Where wedge i's middle sits on the disc, degrees clockwise from twelve. */
const midOf = (i: number) => i * (360 / N) + 180 / N
/** Where that middle ends up on SCREEN once the disc has been turned by `turn`. */
const onScreen = (turn: number, i: number) => (((midOf(i) + turn) % 360) + 360) % 360

// a deterministic stand-in for Math.random, so a failure is the same failure twice
const seeded = (n: number) => () => {
  n = (n * 1664525 + 1013904223) % 4294967296
  return n / 4294967296
}

describe('the disc carries the answer', () => {
  it('puts the landed team on it and points at it', () => {
    const rnd = seeded(7)
    for (let k = 0; k < 40; k++) {
      const landed = WHEEL[Math.floor(rnd() * WHEEL.length)]
      const s = buildSpin(landed, WHEEL, rnd, k)
      expect(s.segs).toHaveLength(N)
      expect(s.at).toBeGreaterThanOrEqual(0)
      expect(s.segs[s.at]).toBe(landed)
    }
  })

  it('never puts one franchise on two wedges', () => {
    const rnd = seeded(11)
    for (let k = 0; k < 20; k++) {
      const s = buildSpin(WHEEL[Math.floor(rnd() * WHEEL.length)], WHEEL, rnd, k)
      expect(new Set(s.segs.map((t) => t.ab)).size).toBe(N)
    }
  })
})

describe('the disc stops where it says it stopped', () => {
  it('finishes every wedge under the pointer, from any starting angle', () => {
    for (const from of [0, 137.4, 1800, 4321.9, -95]) {
      for (let at = 0; at < N; at++) {
        const turn = landingTurn(from, at)
        // the landed wedge's middle is at twelve o'clock, to within a rounding hair
        const got = onScreen(turn, at)
        expect(Math.min(got, 360 - got)).toBeLessThan(0.001)
      }
    }
  })

  it('always goes forward, and never by less than five whole turns', () => {
    let from = 0
    for (let k = 0; k < 30; k++) {
      const at = (k * 5) % N
      const next = landingTurn(from, at)
      expect(next - from).toBeGreaterThanOrEqual(5 * 360)
      expect(next - from).toBeLessThan(6 * 360)
      from = next
    }
  })

  it('does not stand still when the same wedge comes up twice', () => {
    const a = landingTurn(0, 4)
    const b = landingTurn(a, 4)
    expect(b - a).toBe(5 * 360)
  })
})
