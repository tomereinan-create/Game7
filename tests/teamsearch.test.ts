import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { inSpan, listCaption, named, TeamDb, type Span } from '../src/ui/TeamDb'

/**
 * HIS RULING: "I want to still be able to filter even after searching team". The query used to take
 * the list over — all years, newest first, the sort row gone. It is one filter among the others now.
 */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

/** What the screen's own memo does: name, then years, then conference. */
const rows = (query: string, span: Span, conf: 'E' | 'W' | null = null) =>
  WHEEL.filter((t) => inSpan(t.y, span) && (!conf || t.c === conf) && named(t, query))

describe('a search narrows the same list the other filters narrow', () => {
  it('celtics over 1980–1990 is eleven seasons, not every Celtics season in the book', () => {
    expect(rows('celtics', [1980, 1990])).toHaveLength(11)
    expect(rows('celtics', [1980, 1990]).every((t) => t.ab === 'BOS' && t.y >= 1980 && t.y <= 1990)).toBe(true)
    expect(rows('celtics', [1980, 2026]).length).toBeGreaterThan(11)
  })

  it('the conference still bites while a query is on', () => {
    expect(rows('celtics', [1980, 1990], 'E')).toHaveLength(11)
    expect(rows('celtics', [1980, 1990], 'W')).toHaveLength(0) // the Celtics never played out west
  })

  it('the abbreviation finds the team too, and an empty query filters nothing', () => {
    expect(rows('bos', [2026, 2026])).toHaveLength(1)
    expect(rows('', [2026, 2026])).toHaveLength(WHEEL.filter((t) => t.y === 2026).length)
  })
})

describe('the caption follows every filter, in the order they were applied', () => {
  it('his line: "celtics · 1980–1990 · 11 seasons · best DEF first"', () => {
    expect(listCaption({ query: 'celtics', span: [1980, 1990], n: 11, sort: 'def', flip: false, conf: null })).toBe(
      'celtics · 1980–1990 · 11 seasons · best DEF first',
    )
  })

  it('no query is the range list it always was, and the conference is the tail', () => {
    expect(listCaption({ query: '', span: [1996, 2017], n: 651, sort: 'rec', flip: false, conf: null })).toBe('1996–2017 · 651 teams · best record first')
    expect(listCaption({ query: 'celtics', span: [1980, 1990], n: 11, sort: 'az', flip: true, conf: 'E' })).toBe('celtics · 1980–1990 · 11 seasons · Z to A · East only')
    // one hit reads "1 season", not "1 seasons"
    expect(listCaption({ query: 'lakers', span: [2026, 2026], n: 1, sort: 'ovr', flip: false, conf: null })).toBe('lakers · 2026 · 1 season · best OVR first')
  })
})

describe('the sort row does not go away', () => {
  it('one control bar and the five sorts; the bounds wait behind FILTERS', () => {
    store.set('game7.teamdb.years', '2026-2026')
    const html = renderToStaticMarkup(createElement(TeamDb, { onBack: () => {} }))
    // his ruling: "not all these words in the main page" — the three stacked bars are one bar now
    expect(html.split('class="filterbar"').length - 1).toBe(1)
    // five sorts, on one rail that fits 375px without scrolling — the caption spells the order out
    for (const chip of ['Record', 'A–Z', 'OVR', 'OFF', 'DEF']) expect(html).toContain(`>${chip}</button>`)
    // the drawer is shut, so no conference or tactic chip is on the page until it is opened
    expect(html).not.toContain('class="filters"')
    expect(html).not.toContain('>East</button>')
    expect(html).not.toContain('>five-out</button>')
  })
})
