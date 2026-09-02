import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { SeasonStrip } from '../src/ui/SeasonStrip'
import { franchiseOf, franchiseYears, ovrOf, seasonId } from '../src/ui/TeamDb'

/**
 * HIS RULING: "You can navigate here as well between years" — the team page gets the strip the
 * player card has, and it follows the FRANCHISE, not the abbreviation, so the Thunder page steps
 * back into the Seattle years.
 */
const seasonOf = (ab: string, y: number) => WHEEL.find((t) => t.ab === ab && t.y === y)!

describe('the strip follows the franchise lineage, not the abbreviation', () => {
  it('Seattle and Oklahoma City are one team, and the Thunder page holds the Sonics years', () => {
    expect(franchiseOf('SEA')).toBe('OKC')
    const { all } = franchiseYears(seasonOf('OKC', 2026))
    expect(all[0].y).toBe(1980)
    expect(all[all.length - 1].y).toBe(2026)
    expect(all.some((t) => t.team === 'Seattle SuperSonics')).toBe(true)
    // and the Sonics page holds the Thunder years — one strip, either way in
    expect(franchiseYears(seasonOf('SEA', 1996)).all).toEqual(all)
  })

  it('the Charlotte line — Hornets, Bobcats, Hornets — is one team, and New Orleans is another', () => {
    const cho = franchiseYears(seasonOf('CHO', 2026)).all.map((t) => t.ab)
    expect(new Set(cho)).toEqual(new Set(['CHH', 'CHA', 'CHO']))
    expect(cho).not.toContain('NOP')
    const nop = franchiseYears(seasonOf('NOP', 2026)).all.map((t) => t.ab)
    expect(new Set(nop)).toEqual(new Set(['NOH', 'NOK', 'NOP']))
  })

  it('every season on the wheel belongs to exactly one thirty-franchise strip', () => {
    const seen = new Set<string>()
    for (const t of WHEEL) seen.add(franchiseOf(t.ab))
    expect(seen.size).toBe(30)
    // a strip holds every season of its franchise and nothing else
    const bos = franchiseYears(seasonOf('BOS', 2008))
    expect(bos.all.length).toBe(WHEEL.filter((t) => t.ab === 'BOS').length)
    expect(bos.all.map((t) => t.y)).toEqual([...bos.all.map((t) => t.y)].sort((a, b) => a - b))
  })

  it('the marked chip is the franchise best by team OVR, the way the card marks PEAK', () => {
    const { all, best } = franchiseYears(seasonOf('OKC', 2026))
    expect(best).not.toBeNull()
    const top = ovrOf(best!)
    for (const t of all) expect(ovrOf(t) ?? -1).toBeLessThanOrEqual(top!)
    expect(best!.y).toBe(1996) // the ’96 Sonics, 64–18
  })
})

describe('the strip itself: chips, the lit one, the mark and the two ends', () => {
  const years = [
    { id: 'a', y: 1994 },
    { id: 'b', y: 1996, mark: true },
    { id: 'c', y: 1997 },
  ]
  const strip = (cur: string, mark?: string) => renderToStaticMarkup(createElement(SeasonStrip, { years, cur, go: () => {}, mark }))

  it('one chip per season, the open one lit, the best one marked', () => {
    const html = strip('b')
    expect(html.split('class="sortb yrchip').length - 1).toBe(3)
    expect(html).toContain('<span>’96</span>')
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('<i>peak</i>') // the card's word
    expect(strip('b', 'best')).toContain('<i>best</i>') // the team page's word
  })

  it('the arrows stop at the ends — no step off either edge', () => {
    // first season: the ‹ is disabled, the › is not
    const first = strip('a').split('yr-arrow')
    expect(first[1]).toContain('disabled')
    expect(first[2]).not.toContain('disabled')
    const last = strip('c').split('yr-arrow')
    expect(last[1]).not.toContain('disabled')
    expect(last[2]).toContain('disabled')
  })

  it('a season id names one team-season and no other', () => {
    const ids = WHEEL.map(seasonId)
    expect(new Set(ids).size).toBe(WHEEL.length)
  })
})
