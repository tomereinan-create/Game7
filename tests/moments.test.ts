import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CAMPAIGNS from '../src/data/campaigns.json'
import SHEET from '../src/data/moments.json'
import { ROUNDS } from '../src/config'
import { DEFAULT_TACTICS } from '../src/engine/tactics'
import type { Opponent } from '../src/engine/types'
import type { Progress } from '../src/state/campaign'
import { LevelMap, xOf, yOf } from '../src/ui/LevelMap'
import MANIFEST from '../public/moments/manifest.json'
import { fileOf, MODES, MOMENTS, postersFor, TIER_KEYS, type Mode } from '../src/ui/moments'

/**
 * THE ICONIC MOMENTS (his ask, 2026-10-16): posters in the gutters beside the ladder, one list
 * shared by the generator and the map. Since 2026-10-19 each hangs beside the level it belongs to,
 * on one campaign's ladder only, and lights when that level is reached.
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
const y = yOf(W)
const stars = (lit: (level: number) => boolean) => Array.from({ length: ROUNDS }, (_, i) => (lit(i + 1) ? 1 : 0))

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
  it('the style forbids text, logos and likenesses — the moment is recognised by the situation, not the man', () => {
    for (const m of MOMENTS) expect((m as { look?: string }).look, m.slug + ' has a look of its own').toBeTruthy()
    expect(new Set(MOMENTS.map((m) => (m as { look?: string }).look)).size).toBe(MOMENTS.length)
    const style = SHEET.style.toLowerCase()
    for (const word of ['no text of any kind', 'no logos', 'portraits of no one']) expect(style).toContain(word)
    for (const m of MOMENTS) expect((m as { concepts?: string[] }).concepts?.length, m.slug + ' has concepts').toBeGreaterThanOrEqual(1)
  })
})

/** The ladder exactly as App deals it: four tiers, levels renumbered 1..ROUNDS. */
const LADDER = tiers.flatMap((t, ti) =>
  (t.levels as { team: string }[]).map((o, i) => ({ ...o, round: eras[ti].first + i, era: t.name })),
) as unknown as Opponent[]
const levelOf = (team: string) => LADDER.find((o) => o.team === team)?.round ?? null
const at = (level: number) => y(level - 1)
const hang = (mode: Mode, s = stars(() => false)) => postersFor(mode, levelOf, ROUNDS, s, at)
/** The posters he picked by hand (2026-10-19) — the manifest's completed entries. */
const KEEPERS = Object.entries(MANIFEST as Record<string, { status?: string }>)
  .filter(([, m]) => m.status === 'completed')
  .map(([slug]) => slug)

describe('the correct place (his ruling, 2026-10-19)', () => {
  it('every moment on a wall names a mode and a team the ladder carries', () => {
    for (const m of MOMENTS) {
      if (!m.mode && !m.at) continue
      expect(MODES, m.slug).toContain(m.mode)
      expect(levelOf(m.at!), `${m.slug} hangs beside "${m.at}", which is not on the ladder`).not.toBeNull()
    }
  })
  it('every poster he kept is on a wall', () => {
    expect(KEEPERS.length).toBeGreaterThanOrEqual(10)
    const placed = new Set(MODES.flatMap((mode) => hang(mode).map((p) => p.slug)))
    for (const slug of KEEPERS) expect(placed.has(slug), slug).toBe(true)
  })
  it('a poster stands level with the ticket of the stage it belongs to', () => {
    for (const mode of MODES)
      for (const p of hang(mode)) {
        expect(p.level).toBe(levelOf(MOMENTS.find((m) => m.slug === p.slug)!.at!))
        expect(p.top).toBe(y(p.level - 1))
      }
    // the anchors are the moments' own nights, not their tiers' bands
    const block = hang('campaign').find((p) => p.slug === 'the-block')!
    expect(LADDER[block.level - 1].team).toBe("Cleveland Cavaliers '16")
  })
  it('two posters a few levels apart never share a wall', () => {
    for (const mode of MODES) {
      const ps = hang(mode)
      for (let i = 1; i < ps.length; i++) if (Math.abs(ps[i].top - ps[i - 1].top) < 600) expect(ps[i].side, `${ps[i - 1].slug} / ${ps[i].slug}`).not.toBe(ps[i - 1].side)
    }
  })
  it('takes the wall nearer its own ticket, unless a neighbour already stands there', () => {
    const x = xOf(W)
    for (const mode of MODES) {
      const ps = postersFor(mode, levelOf, ROUNDS, stars(() => false), at, (l) => x(l - 1), W, 600)
      ps.forEach((p, i) => {
        const near = x(p.level - 1) < W / 2 ? 'left' : 'right'
        const crowded = ps.slice(0, i).some((q) => q.side === near && Math.abs(q.top - p.top) < 600)
        if (!crowded) expect(p.side, p.slug).toBe(near)
        for (const q of ps.slice(0, i)) if (q.side === p.side) expect(Math.abs(q.top - p.top) >= 600 || crowded, `${q.slug} / ${p.slug}`).toBe(true)
      })
    }
  })
  it('a ladder too short for a moment does not hang it', () => {
    const few = postersFor('campaign', levelOf, 5, [1, 1, 1, 1, 1], at)
    expect(few.every((p) => p.level <= 5)).toBe(true)
  })
})

describe('each campaign its own images (his ruling, 2026-10-19)', () => {
  it('the three ladders share no poster, and each hangs at least three', () => {
    const seen = new Map<string, Mode>()
    for (const mode of MODES) {
      const ps = hang(mode)
      expect(ps.length, mode).toBeGreaterThanOrEqual(3)
      for (const p of ps) {
        expect(seen.has(p.slug), `${p.slug} on ${seen.get(p.slug)} and ${mode}`).toBe(false)
        seen.set(p.slug, mode)
      }
    }
  })
})

describe('images only unlock as you get to the stage (his ruling, 2026-10-19)', () => {
  it('a fresh campaign lights nothing above level 1', () => {
    for (const mode of MODES) expect(hang(mode).filter((p) => p.lit).every((p) => p.level === 1)).toBe(true)
  })
  it('reaching a stage lights its poster — before it is cleared — and nothing above it', () => {
    const block = hang('campaign').find((p) => p.slug === 'the-block')!
    const onIt = hang('campaign', stars((l) => l < block.level))
    expect(onIt.find((p) => p.slug === 'the-block')!.lit).toBe(true)
    expect(onIt.filter((p) => p.level > block.level).every((p) => !p.lit)).toBe(true)
    const below = hang('campaign', stars((l) => l < block.level - 1))
    expect(below.find((p) => p.slug === 'the-block')!.lit).toBe(false)
  })
  it('a cleared stage stays lit, and the whole ladder cleared lights all of them', () => {
    for (const mode of MODES) expect(hang(mode, stars(() => true)).every((p) => p.lit)).toBe(true)
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
  const map = (p: Progress, mode: Mode = 'campaign') =>
    renderToStaticMarkup(
      createElement(LevelMap, {
        title: 'Campaign',
        progress: p,
        opponents: LADDER,
        eras,
        teamName: 'Zhengzhou GA',
        onPlay: () => {},
        onTeam: () => {},
        onStaff: () => {},
        onReset: () => {},
        salary: mode === 'salary',
        death: mode === 'death',
      }),
    )

  it('paints the murals INSIDE the trail room, under the lit line, with no frame text at all', () => {
    const html = map(progress())
    // inside .trail-room (so the room's clip and the floor apply), before the trail's own line
    const room = html.indexOf('class="trail-room"')
    const murals = html.indexOf('class="moments"')
    const line = html.indexOf('class="trail-svg"')
    expect(murals).toBeGreaterThan(room)
    expect(line).toBeGreaterThan(murals)
    // no gutter wrapper any more: the trail runs wall to wall
    expect(html).not.toContain('class="trail-wrap"')
    // his ruling: no name and no date on the image - and no caption element to carry one
    expect(html).not.toContain('<figcaption')
    expect(html).not.toContain('reach level')
    for (const m of MOMENTS) expect(html).not.toContain(m.title)
  })

  it('with no manifest there is no picture, so nothing is painted - a mural is never a blank frame', () => {
    const html = map(progress())
    expect(html).not.toContain('<figure')
    expect(html).not.toContain('<img')
  })

  it('a mural is decoration, not a door - nothing in it is a button', () => {
    const html = map(progress())
    const block = html.slice(html.indexOf('class="moments"'))
    expect(block.slice(0, block.indexOf('</div>'))).not.toContain('<button')
  })
})
