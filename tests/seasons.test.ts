import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { CardSheet, careerOf, peakOf } from '../src/ui/CardSheet'
import type { Player } from '../src/engine/types'

/**
 * HIS RULING: "In the player page add option to navigate between years".
 *
 * The player card is one player-SEASON; the strip under the name is the rest of the man's seasons.
 * What has to hold: the strip lists exactly his cards, in year order, with the peak marked and the
 * open one lit — and the sheet is a pure function of the season the strip hands it, which is the
 * whole of what a chip press does (its handler is setSeason(thatCard) and nothing else).
 */

const card = (name: string): Player => {
  const p = PLAYERS.find((x) => x.name === name)
  if (!p) throw new Error(`no card named ${name}`)
  return p
}

const sheet = (p: Player) => renderToStaticMarkup(createElement(CardSheet, { p, onClose: () => {} }))

/** The strip's chips, in rendered order: the year they name, whether lit, whether marked peak. */
const chips = (html: string) =>
  [...html.matchAll(/<button class="sortb yrchip( on)?"[^>]*>(.*?)<\/button>/g)].map((m) => ({
    on: m[1] !== undefined,
    year: /’(\d\d)/.exec(m[2])?.[1] ?? '',
    peak: m[2].includes('<i>peak</i>'),
  }))

const seasonsOf = (man: string) =>
  PLAYERS.filter((x) => x.player === man).sort((a, b) => a.peak_season - b.peak_season)

const yy = (p: Player) => String(p.peak_season).slice(2)

describe('the season strip lists the man, not the card', () => {
  it('names exactly his cards, in year order, with the open one lit', () => {
    const all = seasonsOf('Marcus Smart')
    expect(all.length).toBeGreaterThan(3)
    const got = chips(sheet(card("Marcus Smart '20")))
    expect(got.map((c) => c.year)).toEqual(all.map(yy))
    expect(got.filter((c) => c.on).map((c) => c.year)).toEqual(['20'])
    // and opening a different season of the same man lights that one instead
    expect(chips(sheet(card("Marcus Smart '22"))).filter((c) => c.on).map((c) => c.year)).toEqual(['22'])
  })

  it('marks the peak — one chip, the highest OVR he has', () => {
    const all = seasonsOf('Marcus Smart')
    const best = Math.max(...all.map((x) => x.ovr))
    const marked = chips(sheet(card("Marcus Smart '19"))).filter((c) => c.peak)
    expect(marked.length).toBe(1)
    expect(all.find((x) => yy(x) === marked[0].year)?.ovr).toBe(best)
    expect(peakOf(all).ovr).toBe(best)
  })

  it('carries a 20-year career without dropping a season', () => {
    const all = seasonsOf('LeBron James')
    expect(all.length).toBeGreaterThan(20)
    const got = chips(sheet(card("LeBron James '13")))
    expect(got.map((c) => c.year)).toEqual(all.map(yy))
    expect(got.filter((c) => c.peak).length).toBe(1)
  })

  it('has no strip at all for a man with one card', () => {
    const n = new Map<string, number>()
    for (const x of PLAYERS) n.set(x.player, (n.get(x.player) ?? 0) + 1)
    const one = PLAYERS.filter((x) => n.get(x.player) === 1)
    expect(one.length).toBeGreaterThan(0)
    const html = sheet(one[0])
    expect(careerOf(one[0])).toEqual([])
    expect(html).not.toContain('pc-years')
    expect(chips(html)).toEqual([])
  })
})

describe('stepping a year redraws the same sheet for the other card', () => {
  /**
   * A chip press is `setSeason(x)` for the card the chip carries, and every field on the sheet is
   * read from that season — so rendering the sheet at the two cards the strip holds is exactly the
   * before and after of the press.
   */
  it('the name, the season line and the verdict all follow the year', () => {
    const a = card("Marcus Smart '20")
    const b = card("Marcus Smart '15")
    const ha = sheet(a)
    const hb = sheet(b)
    expect(ha).toContain('Season 2020')
    expect(hb).toContain('Season 2015')
    expect(ha).toContain('Marcus Smart &#x27;20')
    expect(hb).toContain('Marcus Smart &#x27;15')
    expect(a.ovr).not.toBe(b.ovr)
    const ovr = (h: string) => /class="pc-big lead"><i>OVR<\/i><b>(\d+)<\/b>/.exec(h)?.[1]
    expect(ovr(ha)).toBe(String(a.ovr))
    expect(ovr(hb)).toBe(String(b.ovr))
    // the stat line under it is the other season's too
    const pts = (h: string) => /<i>PTS<\/i><b>([\d.]+)<\/b>/.exec(h)?.[1]
    expect(pts(ha)).not.toBe(pts(hb))
    // and the strip itself does not move — same chips, a different one lit
    expect(chips(ha).map((c) => c.year)).toEqual(chips(hb).map((c) => c.year))
  })
})
