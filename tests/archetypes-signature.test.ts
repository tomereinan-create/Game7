import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_TAGS, archetype, ctxFor, DEFAULT_ORDER, pct, PLAYERS, RULES, ruleText, ruleTextOf, setTagOrder, SIG_FLOOR,
  SIGNATURE_TAGS, signature, strictTag, tagOrder,
} from '../src/engine/pool'
import type { Player } from '../src/engine/types'

/**
 * THE SIGNATURE BLOCK (his complaint: "Too many players have balanced archetype" — 61% of the pool).
 *
 * Fifteen rules at the very bottom of the tree that name a man for the one family he is top-quartile
 * at against the LEAGUE. These pin the four promises the block makes: the fallback is small, nobody who
 * had a name lost it, every one of the fifteen is a real population, and the named men read right.
 */
const FIFTEEN = [
  'Two-way shooter', 'Defensive specialist', 'Shot blocker', 'Pass-first playmaker', 'Ball-dominant guard', 'Microwave scorer', 'Gunner',
  'Midrange specialist', 'Paint scorer', 'Rim attacker', 'Spot-up shooter', 'Perimeter scorer', 'Shooting big',
  'Rebounder', 'Ball thief', 'Foul magnet',
]
const SIG = new Set(FIFTEEN)
/** The tree as it stood before the block: every rule that is not one of the fifteen, in shipped order. */
const OLD_RULES = RULES.filter((r) => !SIG.has(r.tag))
const oldTag = (p: Player): string | null => {
  const c = ctxFor(p)
  return OLD_RULES.find((r) => r.test(c))?.tag ?? null
}
const get = (name: string) => {
  const p = PLAYERS.find((x) => x.name === name)
  if (!p) throw new Error(`${name} is not in the pool`)
  return p
}
const hist = () => {
  const h = new Map<string, number>()
  for (const p of PLAYERS) h.set(archetype(p), (h.get(archetype(p)) ?? 0) + 1)
  return h
}

describe('the signature block', () => {
  it('is the fifteen, under unique names, at the very bottom of the shipped law', () => {
    expect(SIGNATURE_TAGS).toEqual(FIFTEEN)
    expect(DEFAULT_ORDER.slice(-FIFTEEN.length)).toEqual(FIFTEEN) // sixteen since the scoring-load group was split in two
    expect(new Set(DEFAULT_ORDER).size).toBe(DEFAULT_ORDER.length) // no name is claimed twice
    for (const t of FIFTEEN) expect(ALL_TAGS).toContain(t)
    // the star rule keeps its name and its place; the signature version has its own
    expect(DEFAULT_ORDER.indexOf('Two-way wing')).toBeLessThan(DEFAULT_ORDER.indexOf('Two-way shooter'))
  })

  it('a deleted name stays deleted: nobody is a Pick-and-pop big', () => {
    expect(ALL_TAGS).not.toContain('Pick-and-pop big')
    expect(PLAYERS.some((p) => archetype(p) === 'Pick-and-pop big')).toBe(false)
  })

  it('leaves the fallback under a tenth of the pool (it was six cards in ten)', () => {
    const before = PLAYERS.filter((p) => oldTag(p) === null).length
    const h = hist()
    const after = (h.get('Balanced') ?? 0) + (h.get('Unclassified') ?? 0)
    expect(before / PLAYERS.length).toBeGreaterThan(0.5)
    expect(after / PLAYERS.length).toBeLessThan(0.1)
  })

  it('takes no name away: a card the old rules named still wears that name', () => {
    const moved: string[] = []
    for (const p of PLAYERS) {
      const was = oldTag(p)
      const now = archetype(p)
      if (was !== null && now !== was) moved.push(`${p.name}: ${was} -> ${now}`)
      // and the other direction: a signature tag is only ever worn by a man the old rules could not name
      if (SIG.has(now) && was !== null) moved.push(`${p.name}: ${now} over ${was}`)
    }
    expect(moved).toEqual([])
  })

  it('every one of the fifteen names a real population', () => {
    const h = hist()
    for (const t of FIFTEEN) expect(h.get(t) ?? 0, t).toBeGreaterThanOrEqual(50)
  })

  it('names the men it was built for', () => {
    for (const [name, want] of [
      ["Scottie Pippen '97", 'Defensive specialist'],
      ["Eddie Jones '01", 'Two-way shooter'],
      ["LaMarcus Aldridge '16", 'Midrange specialist'],
      ["Pau Gasol '05", 'Paint scorer'],
      ["Clyde Drexler '93", 'Microwave scorer'],
      // De'Aaron Fox '19, not Kevin Johnson '96: recal_176 (the elite-passer re-cut, pipeline 176) lifted KJ '96's
      // offence into the star band, so the EXISTING 'Offensive superstar' rule now names him — which is the block
      // working as designed (a star rule always outranks a signature). Fox '19 sits at OFF 68, far from any star floor.
      ["De'Aaron Fox '19", 'Ball-dominant guard'],
      ["Rod Strickland '94", 'Pass-first playmaker'],
      ["Ray Allen '00", 'Perimeter scorer'],
      ["Josh Hart '25", 'Rebounder'],
      ["Luol Deng '06", 'Balanced'], // nothing on his sheet reaches the floor, and he is not dressed up
    ] as const) {
      expect(archetype(get(name)), name).toBe(want)
    }
  })

  it('is mutually exclusive below the Two-way shooter line, so ranking the fifteen moves nobody', () => {
    for (const p of PLAYERS) {
      const c = ctxFor(p)
      const hits = RULES.filter((r) => SIG.has(r.tag) && r.tag !== 'Two-way shooter' && r.test(c))
      expect(hits.length, p.name).toBeLessThanOrEqual(1)
      // a signature and a rule that reads it are the same fact
      expect(hits.length === 1, p.name).toBe(c.sig !== null)
    }
  })

  it('ignores relax: the floor is a percentile, not a 0-99 rating', () => {
    for (const p of PLAYERS.slice(0, 400)) {
      const c0 = ctxFor(p, 0)
      const c9 = ctxFor(p, 9)
      for (const r of RULES) if (SIG.has(r.tag)) expect(r.test(c9), `${p.name} / ${r.tag}`).toBe(r.test(c0))
    }
  })
})

describe('league percentile', () => {
  it('is bisect_right over the pool: the share of cards at or under the value', () => {
    for (const [k, v] of [['perdef', 70], ['3pt', 0], ['playvol', 99], ['rim', 55.5]] as const) {
      const brute = PLAYERS.filter((p) => p.attrs[k] <= v).length / PLAYERS.length
      expect(pct(k, v)).toBe(brute)
    }
    expect(pct('volume', -1)).toBe(0)
    expect(pct('volume', 1000)).toBe(1)
  })

  it('the floor is the one dial, and it is the top quartile', () => {
    expect(SIG_FLOOR).toBe(0.75)
  })

  it('takes the first-listed identity family on a tie, and a supporting family only when no identity family makes the floor', () => {
    for (const p of PLAYERS) {
      const a = p.attrs
      const s = signature(a)
      const id = (['perdef', 'rimprot', 'playvol', 'volume', '3pt', 'mid', 'rim'] as const).map((k) => [k, pct(k, a[k])] as const)
      const top = id.reduce((b, x) => (x[1] > b[1] ? x : b))
      if (top[1] >= SIG_FLOOR) {
        expect(s.sig, p.name).toBe(top[0])
        expect(s.sigPct).toBe(top[1])
      } else if (s.sig !== null) {
        expect(['reb', 'perimdisrupt', 'fouldraw'], p.name).toContain(s.sig)
        expect(s.sigPct).toBeGreaterThanOrEqual(SIG_FLOOR)
      }
    }
  })
})

describe('the signature rules print as arithmetic', () => {
  it('reads the block in the tree’s own vocabulary', () => {
    expect(ruleText('Two-way shooter')).toBe('h < 82 && pct(perdef) >= 0.75 && pct(3pt) >= 0.75')
    expect(ruleText('Pass-first playmaker')).toBe("sig === 'playvol' && volume < 65")
    expect(ruleText('Ball-dominant guard')).toBe("sig === 'playvol' && volume >= 65")
    expect(ruleText('Microwave scorer')).toBe("sig === 'volume' && efficiency >= 40")
    expect(ruleText('Spot-up shooter')).toBe("sig === '3pt' && h < 81 && volume < 60")
    expect(ruleText('Defensive specialist')).toBe("sig === 'perdef' && (h < 81 || pct(rimprot) < 0.75)")
    expect(ruleText('Midrange specialist')).toBe("sig === 'mid' && (h < 81 || paint >= mid || volume >= 60)")
    for (const t of FIFTEEN) {
      const s = ruleText(t)
      expect(s, t).not.toBe('')
      expect(s, t).not.toMatch(/\bc\.|=>|sigFloor|pctPerdef|pct3\b|pctRimprot|BIG_HT/)
    }
  })

  it('survives a production build: a renamed parameter, no spaces, double-quoted strings', () => {
    expect(ruleTextOf('e=>e.sig==="playvol"&&e.a.volume<65')).toBe("sig === 'playvol' && volume < 65")
    expect(ruleTextOf('e=>e.ltH(e.h,82)&&e.pctPerdef>=e.sigFloor&&e.pct3>=e.sigFloor')).toBe('h < 82 && pct(perdef) >= 0.75 && pct(3pt) >= 0.75')
    expect(ruleTextOf('t=>t.geH(t.h,81)&&(t.sig==="3pt"||t.sig==="mid"&&t.paint<t.mid&&t.a.volume<60)')).toBe(
      "h >= 81 && (sig === '3pt' || sig === 'mid' && paint < mid && volume < 60)",
    )
  })
})

/**
 * A RANKING SAVED BEFORE THE BLOCK EXISTED. His stored order names only the old tags; reconcile has to
 * keep every decision in it and put the fifteen where the shipped law puts them — at the bottom — so
 * that a saved ranking can never lift a signature rule over a name a card already had.
 */
describe('a saved ranking survives the fifteen arriving', () => {
  const oldOrder = () => OLD_RULES.map((r) => r.tag)
  afterEach(() => {
    setTagOrder(null, false)
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('keeps his order and appends the block beneath it, in shipped order', () => {
    const mine = oldOrder().reverse() // as far from the default as a ranking gets
    setTagOrder(mine, false)
    expect(tagOrder()).toEqual([...mine, ...FIFTEEN])
    // and under HIS order too, the block only names men his ranking could not
    for (const p of PLAYERS.slice(0, 1500)) {
      const c = ctxFor(p)
      const his = mine.find((t) => OLD_RULES.find((r) => r.tag === t)!.test(c)) ?? null
      if (his !== null) expect(strictTag(p), p.name).toBe(his)
      else expect(SIG.has(strictTag(p)) || strictTag(p) === 'Balanced', p.name).toBe(true)
    }
  })

  it('heals the copy on disk when the app boots on a pre-block ranking', async () => {
    const mine = oldOrder()
    ;[mine[0], mine[1]] = [mine[1], mine[0]]
    const disk = new Map<string, string>([['game7.tagorder.v1', JSON.stringify(mine)]])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => disk.get(k) ?? null,
      setItem: (k: string, v: string) => void disk.set(k, v),
      removeItem: (k: string) => void disk.delete(k),
    })
    vi.resetModules()
    const fresh = await import('../src/engine/pool')
    expect(fresh.tagOrder()).toEqual([...mine, ...FIFTEEN])
    expect(fresh.isSavedOrder()).toBe(true)
    expect(JSON.parse(disk.get('game7.tagorder.v1')!)).toEqual([...mine, ...FIFTEEN])
  })
})
