import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CAMPAIGNS from '../src/data/campaigns.json'
import SHEET from '../src/data/moments.json'
import OPP from '../src/data/opponents.json'
import { ROUNDS } from '../src/config'
import { DEFAULT_TACTICS } from '../src/engine/tactics'
import type { Opponent } from '../src/engine/types'
import type { Progress } from '../src/state/campaign'
import { heightOf, LevelMap, seamOf, yOf } from '../src/ui/LevelMap'
import { fileOf, MOMENTS, postersFor, TIER_KEYS } from '../src/ui/moments'

/**
 * THE ICONIC MOMENTS (his ask, 2026-10-16): posters in the gutters beside the ladder, one list
 * shared by the generator and the map, each hung inside its own tier's band and sealed until that
 * tier has fallen.
 */
const tiers = CAMPAIGNS as unknown as { id: string; name: string; years: [number, number]; levels: unknown[] }[]
const eras = (() => {
  let n = 0
  return tiers.map((t) => {
    const first = n + 1
    n += t.levels.length
    return { name: t.name, years: t.years, first }
  })
})()
const W = 1600
const seam = seamOf(W)
const H = heightOf(W)
const y = yOf(W)
const stars = (lit: (level: number) => boolean) => Array.from({ length: ROUNDS }, (_, i) => (lit(i + 1) ? 1 : 0))
const lastOf = (ti: number) => (eras[ti + 1]?.first ?? ROUNDS + 1) - 1

describe('the prompt sheet', () => {
  it('names only the four tiers, in the ladder order campaigns.json deals them', () => {
    // the sheet's keys stand for campaigns.json's ids, by position — this is the one place the two
    // lists are held together, so a re-dealt ladder fails here and not in the gutter
    expect(tiers.map((t) => t.id)).toEqual(['c2026', 'champs', 'alltime', 'customs'])
    expect(TIER_KEYS).toHaveLength(tiers.length)
    for (const m of MOMENTS) expect(TIER_KEYS, m.slug).toContain(m.tier)
  })
  it('every moment has a filename-safe slug, a title and a prompt, and no slug twice', () => {
    const slugs = new Set<string>()
    for (const m of MOMENTS) {
      expect(m.slug).toMatch(/^[a-z0-9-]+$/)
      expect(slugs.has(m.slug), m.slug).toBe(false)
      slugs.add(m.slug)
      expect(m.title.length).toBeGreaterThan(0)
      expect(m.prompt.length).toBeGreaterThan(40)
    }
    expect(MOMENTS.length).toBeGreaterThanOrEqual(10)
  })
  it('the style forbids text, logos and real people — the posters are art, not likenesses', () => {
    const style = SHEET.style
    for (const word of ['No text', 'no logos', 'no identifiable faces', 'no real people']) expect(style).toContain(word)
  })
})

describe('where a poster hangs', () => {
  const posters = postersFor(eras, ROUNDS, stars(() => false), seam, H)

  it('hangs every moment once', () => {
    expect(posters.map((p) => p.slug).sort()).toEqual(MOMENTS.map((m) => m.slug).sort())
  })

  it('inside its own tier: between that tier’s first ticket and its last, never over a seam', () => {
    for (const p of posters) {
      const ti = TIER_KEYS.indexOf(p.tier as (typeof TIER_KEYS)[number])
      const first = eras[ti].first
      const last = lastOf(ti)
      // the trail climbs, so a higher level is a SMALLER y
      const bottom = ti === 0 ? H : seam(first)
      const top = ti === eras.length - 1 ? 0 : seam(eras[ti + 1].first)
      expect(p.top, `${p.slug} below its tier`).toBeLessThan(bottom)
      expect(p.top, `${p.slug} above its tier`).toBeGreaterThan(top)
      expect(p.first).toBe(first)
      expect(p.eraName).toBe(eras[ti].name)
      // and it is nearer its own tier's tickets than the next tier's
      expect(p.top).toBeLessThan(y(first - 1) + 1)
      expect(p.top).toBeGreaterThan(y(last - 1) - 1)
    }
  })

  it('oldest lowest within a tier, and the one with no year on top', () => {
    const inTier = (key: string) => posters.filter((p) => p.tier === key)
    for (const key of TIER_KEYS) {
      const ps = inTier(key)
      for (let i = 1; i < ps.length; i++) {
        const a = Number.parseInt(ps[i - 1].era, 10)
        const b = Number.parseInt(ps[i].era, 10)
        if (Number.isFinite(a) && Number.isFinite(b)) expect(b).toBeGreaterThanOrEqual(a)
        expect(ps[i].top).toBeLessThan(ps[i - 1].top)
      }
    }
    const myth = posters.find((p) => p.slug === 'the-first-team')!
    expect(posters.filter((p) => p.tier === myth.tier).every((p) => p.top >= myth.top)).toBe(true)
  })

  it('alternates walls up the whole trail — no two neighbours on the same side', () => {
    const byHeight = [...posters].sort((a, b) => b.top - a.top)
    for (let i = 1; i < byHeight.length; i++) expect(byHeight[i].side).not.toBe(byHeight[i - 1].side)
  })

  it('a five-level test ladder hangs only the first tier’s posters', () => {
    const few = postersFor(eras, 5, [1, 1, 1, 1, 1], seamOf(375), heightOf(375))
    expect(few.every((p) => p.tier === TIER_KEYS[0])).toBe(true)
    expect(few.length).toBe(MOMENTS.filter((m) => m.tier === TIER_KEYS[0]).length)
  })
})

describe('sealed until the block falls (his ruling: unlock with progress)', () => {
  it('a fresh campaign has every poster sealed', () => {
    expect(postersFor(eras, ROUNDS, stars(() => false), seam, H).every((p) => !p.lit)).toBe(true)
  })
  it('the League cleared lights the League’s posters and no other', () => {
    const ps = postersFor(eras, ROUNDS, stars((l) => l <= lastOf(0)), seam, H)
    expect(ps.filter((p) => p.tier === 'league').every((p) => p.lit)).toBe(true)
    expect(ps.filter((p) => p.tier !== 'league').every((p) => !p.lit)).toBe(true)
  })
  it('one level short of the end of a tier is still sealed', () => {
    const ps = postersFor(eras, ROUNDS, stars((l) => l < lastOf(0)), seam, H)
    expect(ps.filter((p) => p.tier === 'league').every((p) => !p.lit)).toBe(true)
  })
  it('the whole ladder cleared lights all of them', () => {
    expect(postersFor(eras, ROUNDS, stars(() => true), seam, H).every((p) => p.lit)).toBe(true)
  })
})

describe('the manifest decides which pictures exist', () => {
  it('only a completed entry with a file is a picture', () => {
    expect(fileOf(null, 'the-block')).toBeNull()
    expect(fileOf({}, 'the-block')).toBeNull()
    expect(fileOf({ 'the-block': { status: 'failed' } }, 'the-block')).toBeNull()
    expect(fileOf({ 'the-block': { status: 'completed', file: 'moments/the-block.jpg' } }, 'the-block')).toBe('moments/the-block.jpg')
  })
})

describe('on the map', () => {
  const progress = (over: Partial<Progress> = {}): Progress => ({
    coach: null,
    stars: Array.from({ length: ROUNDS }, () => 0),
    seed: 1,
    plays: 0,
    spent: 0,
    nodes: {},
    roster: null,
    lives: 0,
    checkpoint: 0,
    deaths: 0,
    wear: {},
    subsUsed: 0,
    tactics: DEFAULT_TACTICS,
    bench: null,
    ...over,
  })
  const map = (p: Progress) =>
    renderToStaticMarkup(
      createElement(LevelMap, {
        title: 'Campaign',
        progress: p,
        opponents: OPP as Opponent[],
        eras,
        teamName: 'Zhengzhou GA',
        onPlay: () => {},
        onTeam: () => {},
        onStaff: () => {},
        onReset: () => {},
      }),
    )

  it('hangs every poster, sealed, outside the trail’s clipped room, with no picture before the generator has run', () => {
    const html = map(progress())
    const figures = html.match(/<figure class="moment [^"]*"/g) ?? []
    expect(figures).toHaveLength(MOMENTS.length)
    expect(figures.every((f) => f.includes(' sealed'))).toBe(true)
    // the gutter is OUTSIDE .trail-room (which clips sideways), beside it in .trail-wrap
    expect(html.indexOf('class="moments"')).toBeGreaterThan(html.indexOf('class="trail-room"'))
    expect(html).toContain('class="trail-wrap"')
    expect(html).not.toContain('<img')
    // a sealed poster says what opens it, not what it is
    expect(html).toContain('clear The League')
    expect(html).not.toContain('The Last Shot')
  })

  it('lights the League’s posters once its thirty have fallen, and names them', () => {
    const html = map(progress({ stars: stars((l) => l <= lastOf(0)) }))
    const lit = html.match(/<figure class="moment [^"]*\blit\b[^"]*"/g) ?? []
    expect(lit).toHaveLength(MOMENTS.filter((m) => m.tier === 'league').length)
    expect(html).toContain('Eighty-One')
    expect(html).not.toContain('The Last Shot')
  })

  it('a poster is decoration, not a door — nothing in the gutter is a button', () => {
    const html = map(progress())
    const gutter = html.slice(html.indexOf('class="moments"'))
    const end = gutter.indexOf('</div>')
    expect(gutter.slice(0, end)).not.toContain('<button')
  })
})
