/**
 * CREATOR MODE (P6, the launch gate) — `?creator=1`, a filming mode that is never saved.
 *
 *   ?creator=1                         a wheel run against campaign level 1, played by hand
 *   &level=12                          ...against campaign level 12
 *   &b=1996-CHI                        ...against a team-season's five instead (year-ABBR)
 *   &a=1996-CHI&b=2017-GSW             "Settle It": two team-seasons, the 10,000-sim win chance, then
 *                                      one featured series — `seed` is that series' exact seed, the
 *                                      number scripts/batch-sim.ts prints for its closest Game 7s
 *   &a=L113&b=L120                     a side may also be a LADDER LEVEL, played exactly as the campaign
 *                                      has it — L91..L120 are the All-Time franchise fives (the Cup)
 *   &a5=Name '26,Name '26,…&an=Label   ...or a HAND-BUILT five, by card name (five names, comma
 *                                      separated; `an`/`bn` the name shown, `aab`/`bab` the scorebug code)
 *   &seed=123456                       the run's seed: the same seed films the same wheel and series
 *   &team=Tel+Aviv+Jets                the club's name on the scorebug (last word = nickname)
 *   &auto=1                            hands-free: spin, pick, sim on timers (what the clip script uses)
 *   &framed=1                          already inside a 9:16 viewport; do not wrap in the frame
 *
 * Plain parsing, no DOM and no storage: src/boot.ts reads it before any module touches a save.
 */
export interface Creator {
  seed: number
  /** Whether the seed was given (a replay) or minted for this visit. */
  seeded: boolean
  /** A side by id: a team-season `1996-CHI` or a ladder level `L113`. */
  a: string | null
  b: string | null
  /** A side as a hand-built five: card names, and the name and code it is shown under. */
  aFive: string[] | null
  bFive: string[] | null
  aName: string | null
  bName: string | null
  aAb: string | null
  bAb: string | null
  /** Both sides are given: the Settle It screen. */
  settle: boolean
  team: string | null
  level: number
  auto: boolean
  framed: boolean
}

/** The phone frame every creator page is laid out in, then scaled to the screen it is shown on. */
export const FRAME = { w: 432, h: 768 } as const

export function parseCreator(search: string): Creator | null {
  const q = new URLSearchParams(search)
  if (q.get('creator') !== '1') return null
  const n = Number(q.get('seed'))
  const seeded = Number.isFinite(n) && n > 0
  const level = Math.max(1, Math.round(Number(q.get('level')) || 1))
  const id = (k: string) => {
    const v = q.get(k)?.trim().toUpperCase() ?? ''
    return /^\d{4}-[A-Z]{2,4}$/.test(v) || /^L\d{1,3}$/.test(v) ? v : null
  }
  const five = (k: string) => {
    const v = (q.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return v.length === 5 ? v : null
  }
  const text = (k: string, n: number) => q.get(k)?.trim().slice(0, n) || null
  const a = id('a')
  const b = id('b')
  const aFive = a ? null : five('a5')
  const bFive = b ? null : five('b5')
  return {
    seed: seeded ? n >>> 0 || 1 : ((Math.random() * 0xffffffff) >>> 0) || 1,
    seeded,
    a,
    b,
    aFive,
    bFive,
    aName: text('an', 40),
    bName: text('bn', 40),
    aAb: text('aab', 4)?.toUpperCase() ?? null,
    bAb: text('bab', 4)?.toUpperCase() ?? null,
    settle: !!(a || aFive) && !!(b || bFive),
    team: q.get('team')?.trim().slice(0, 40) || null,
    level,
    auto: q.get('auto') === '1',
    framed: q.get('framed') === '1',
  }
}

export const CREATOR: Creator | null = typeof location === 'undefined' ? null : parseCreator(location.search)
