import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { inSpan, spanFrom, spanLabel, spanTo, TeamDb, type Span } from '../src/ui/TeamDb'

/**
 * HIS RULING: "Make the year from to" — the team database filters on a SPAN of seasons, not one
 * year, so a single sort ranks the '96 Bulls against the '17 Warriors in one list.
 */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

const YEARS = [...new Set(WHEEL.map((t) => t.y))].sort((a, b) => a - b)
const YMIN = YEARS[0]
const YMAX = YEARS[YEARS.length - 1]

/** The database's own list screen, rendered with the span the reader left behind. */
const db = (span: Span) => {
  store.set('game7.teamdb.years', `${span[0]}-${span[1]}`)
  return renderToStaticMarkup(createElement(TeamDb, { onBack: () => {} }))
}

describe('the year range includes both ends and everything between', () => {
  it('1996–2017 holds every team-season in those 22 books and nothing outside them', () => {
    const rows = WHEEL.filter((t) => inSpan(t.y, [1996, 2017]))
    expect(rows.length).toBe(WHEEL.filter((t) => t.y >= 1996 && t.y <= 2017).length)
    expect(rows.every((t) => t.y >= 1996 && t.y <= 2017)).toBe(true)
    // both ends are IN: the first and last books of the span are on the list
    expect(rows.some((t) => t.y === 1996)).toBe(true)
    expect(rows.some((t) => t.y === 2017)).toBe(true)
    expect(rows.some((t) => t.y === 1995 || t.y === 2018)).toBe(false)
    // the whole point of the ruling: the two teams he wants compared are in the same list
    expect(rows.some((t) => t.y === 1996 && t.ab === 'CHI')).toBe(true)
    expect(rows.some((t) => t.y === 2017 && t.ab === 'GSW')).toBe(true)
  })

  it('a span of one year is the old single-year list, and Any is the whole book', () => {
    expect(WHEEL.filter((t) => inSpan(t.y, [YMAX, YMAX])).every((t) => t.y === YMAX)).toBe(true)
    expect(WHEEL.filter((t) => inSpan(t.y, [YMIN, YMAX])).length).toBe(WHEEL.length)
  })
})

describe('a backwards range is corrected to a single year — the box you touched wins', () => {
  it('a FROM above the TO pulls the TO up to meet it', () => {
    expect(spanFrom(2010, [2000, 2005])).toEqual([2010, 2010])
    expect(spanFrom(1996, [2026, 2026])).toEqual([1996, 2026]) // typing a FROM below the TO widens
  })

  it('a TO below the FROM pulls the FROM down to meet it', () => {
    expect(spanTo(1990, [2000, 2005])).toEqual([1990, 1990])
    expect(spanTo(2026, [1996, 1996])).toEqual([1996, 2026]) // typing a TO above the FROM widens
  })

  it('a corrected range is never empty — from is never past to', () => {
    for (const [a, b] of [
      [2020, 1980],
      [1999, 1998],
      [YMAX, YMIN],
    ] as Span[]) {
      expect(spanFrom(a, [0, b])[0]).toBeLessThanOrEqual(spanFrom(a, [0, b])[1])
      expect(spanTo(b, [a, 0])[0]).toBeLessThanOrEqual(spanTo(b, [a, 0])[1])
    }
  })
})

describe('the caption says the span, then the count, then the order', () => {
  beforeEach(() => store.clear())

  it('one year reads "2026 · 30 teams · best record first"', () => {
    const n = WHEEL.filter((t) => t.y === YMAX).length
    expect(db([YMAX, YMAX])).toContain(`${YMAX} · ${n} teams · best record first`)
  })

  it('a range reads "1996–2017 · 651 teams · best record first"', () => {
    const n = WHEEL.filter((t) => t.y >= 1996 && t.y <= 2017).length
    expect(db([1996, 2017])).toContain(`1996–2017 · ${n} teams · best record first`)
  })

  it('the whole book counts every team-season on the wheel', () => {
    expect(db([YMIN, YMAX])).toContain(`${YMIN}–${YMAX} · ${WHEEL.length.toLocaleString()} teams`)
  })

  it('spanLabel is the caption rule on its own', () => {
    expect(spanLabel([2026, 2026])).toBe('2026')
    expect(spanLabel([1996, 2017])).toBe('1996–2017')
  })
})

describe('the range list pages instead of laying 1,300 rows down at once', () => {
  beforeEach(() => store.clear())

  it('a one-year list is whole; a wide one shows a page and says how many are left', () => {
    const one = db([YMAX, YMAX])
    expect(one.split('class="lrow"').length - 1).toBe(WHEEL.filter((t) => t.y === YMAX).length)
    expect(one).not.toContain('class="morebtn"')

    const wide = db([YMIN, YMAX])
    expect(wide.split('class="lrow"').length - 1).toBe(60)
    expect(wide).toContain('class="morebtn"')
    expect(wide).toContain(`${(WHEEL.length - 60).toLocaleString()} more seasons`)
  })

  it('a range row carries its year; a single-year row does not need to', () => {
    expect(db([1996, 2017])).toContain('’96 · CHI · 72–10')
    expect(db([YMAX, YMAX])).toContain('men on the card pool')
  })

  /** The sort runs over the whole span, not inside each season — that is the point of the ruling. */
  it('best record over 1996–2017 opens with the ’16 Warriors, then the ’96 Bulls', () => {
    const html = db([1996, 2017])
    const gsw = html.indexOf('’16 · GSW · 73–9')
    const chi = html.indexOf('’96 · CHI · 72–10')
    expect(gsw).toBeGreaterThan(-1)
    expect(chi).toBeGreaterThan(gsw)
    // and the two of them are the first two rows of the list
    expect(html.slice(0, gsw).split('class="lrow"').length - 1).toBe(1)
  })
})
