/** Seedable RNG. mulberry32 — small, fast, good enough for a snack game. */
export interface Rng {
  next(): number
  range(lo: number, hi: number): number
  int(n: number): number
  pick<T>(xs: readonly T[]): T
  gaussian(mean: number, sd: number): number
  shuffle<T>(xs: T[]): T[]
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  let spare: number | null = null

  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (n) => Math.floor(next() * n),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle(xs) {
      for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[xs[i], xs[j]] = [xs[j], xs[i]]
      }
      return xs
    },
    /** Box-Muller, caching the spare deviate. */
    gaussian(mean, sd) {
      if (spare !== null) {
        const s = spare
        spare = null
        return mean + sd * s
      }
      let u = 0
      let v = 0
      let s = 0
      do {
        u = next() * 2 - 1
        v = next() * 2 - 1
        s = u * u + v * v
      } while (s === 0 || s >= 1)
      const f = Math.sqrt((-2 * Math.log(s)) / s)
      spare = v * f
      return mean + sd * u * f
    },
  }
}

export const randomSeed = () => (Math.random() * 0xffffffff) >>> 0
