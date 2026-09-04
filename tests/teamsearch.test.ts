import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { inSpan, listCaption, named, sortHint, TeamDb, type Span } from '../src/ui/TeamDb'

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

/**
 * HIS RULING: "Put everything under filters. Add sort by option. Then, when pressing filters, dont
 * show all the options. You press filters then you hover over(or press to lock) playstyle and the
 * the playstyle list opens to you."
 */
describe('everything is under FILTERS, and the drawer opens one category at a time', () => {
  const shut = () => {
    store.set('game7.teamdb.years', '2026-2026')
    return renderToStaticMarkup(createElement(TeamDb, { onBack: () => {} }))
  }

  it('the page carries the search and the FILTERS chip and nothing else — the sort rail is gone', () => {
    const html = shut()
    expect(html.split('class="filterbar"').length - 1).toBe(1)
    // the five sorts used to live on a rail outside the drawer; now they are behind FILTERS with the rest
    expect(html).not.toContain('class="rail"')
    for (const chip of ['Record', 'A–Z', 'OVR', 'OFF', 'DEF']) expect(html).not.toContain(`>${chip}</button>`)
    // the drawer is shut, so no category row and no option is on the page until FILTERS is pressed
    expect(html).not.toContain('class="filters"')
    expect(html).not.toContain('>East</button>')
    expect(html).not.toContain('>five-out</button>')
  })

  it('the order still reaches the reader: the caption over the list says it in words', () => {
    expect(shut()).toContain('best record first')
  })
})

describe('the SORT BY row says what it is set to', () => {
  it('his five sorts, each with the direction a second tap turns around', () => {
    expect(sortHint('rec', false)).toBe('Record · best first')
    expect(sortHint('rec', true)).toBe('Record · worst first')
    expect(sortHint('az', false)).toBe('A to Z')
    expect(sortHint('az', true)).toBe('Z to A')
    expect(sortHint('ovr', false)).toBe('OVR · best first')
    expect(sortHint('def', true)).toBe('DEF · lowest first')
  })
})
