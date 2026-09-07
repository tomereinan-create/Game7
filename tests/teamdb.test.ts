import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { inSpan, spanFrom, spanLabel, spanTo, TeamDb, type Span } from '../src/ui/TeamDb'
import { ratingTone, teamColor } from '../src/ui/teamColors'

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
/** How many team cards the list laid down. */
const cards = (html: string) => html.split('class="tcard"').length - 1

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
    expect(cards(one)).toBe(WHEEL.filter((t) => t.y === YMAX).length)
    expect(one).not.toContain('class="morebtn"')

    const wide = db([YMIN, YMAX])
    expect(cards(wide)).toBe(60)
    expect(wide).toContain('class="morebtn"')
    expect(wide).toContain(`${(WHEEL.length - 60).toLocaleString()} more seasons`)
  })

  it('a range card carries its year; a single-year card does not need to', () => {
    expect(db([1996, 2017])).toContain('’96 · 72–10')
    expect(db([YMAX, YMAX])).toContain('men on pool')
    expect(db([YMAX, YMAX])).not.toContain('’26 · ')
  })

  /** The sort runs over the whole span, not inside each season — that is the point of the ruling. */
  it('best record over 1996–2017 opens with the ’16 Warriors, then the ’96 Bulls', () => {
    const html = db([1996, 2017])
    const gsw = html.indexOf('’16 · 73–9')
    const chi = html.indexOf('’96 · 72–10')
    expect(gsw).toBeGreaterThan(-1)
    expect(chi).toBeGreaterThan(gsw)
    // and the two of them are the first two cards of the list
    expect(cards(html.slice(0, gsw))).toBe(1)
  })
})

/**
 * HIS RULING on the Claude Design "Team Database Redesigns" (1b Night Game): "I want to use this
 * design, but with different colors. In the short of the team name (OKC) have the colors of the
 * team. The OFF DEF OVR will be either red green or white, depending of how far is it from 50
 * (50 is white)."
 */
describe('the club is on the chip and the scale is on the numbers', () => {
  beforeEach(() => store.clear())

  it('gives each chip its own club, and never the fallback for a club in the table', () => {
    const html = db([YMAX, YMAX])
    // Boston's green and Milwaukee's, off the same table the map's tickets are painted from
    expect(html).toContain(teamColor('BOS').primary)
    expect(html).toContain(teamColor('MIL').primary)
    // and the chip carries all three of the values the CSS asks it for
    expect(html).toContain('--chip-bg')
    expect(html).toContain('--chip-edge')
    expect(html).toContain('--chip-ink')
  })

  it('is white at 50 and further from white the further from 50', () => {
    // 50 is the league that season: no colour at all
    const mid = /hsl\(\d+ (\d+)% (\d+)%\)/.exec(ratingTone(50))!
    expect(Number(mid[1])).toBeLessThanOrEqual(6)
    expect(Number(mid[2])).toBeGreaterThanOrEqual(89)

    // and either side of it climbs away from white, evenly
    const sat = (v: number) => Number(/hsl\(\d+ (\d+)%/.exec(ratingTone(v))![1])
    expect(sat(60)).toBeLessThan(sat(70))
    expect(sat(70)).toBeLessThan(sat(85))
    expect(sat(40)).toBeLessThan(sat(30))
    expect(sat(30)).toBeLessThan(sat(15))
    expect(sat(65)).toBe(sat(35))
  })

  it('is green above the middle and red below it', () => {
    const hue = (v: number) => Number(/hsl\((\d+)/.exec(ratingTone(v))![1])
    for (const v of [51, 60, 80, 99]) expect(hue(v)).toBe(145)
    for (const v of [49, 40, 20, 1]) expect(hue(v)).toBe(352)
    // the middle itself takes the green hue, but at no saturation it is white either way
    expect(hue(50)).toBe(145)
  })

  it('gives every card either three tracks or the words, and never neither', () => {
    // a five the pool cannot field has no gauges to draw, and the card says that in words instead
    // of three empty tracks — which is what the old row's "—" said in one character
    for (const span of [[YMAX, YMAX], [YMIN, YMAX]] as Span[]) {
      const html = db(span)
      const n = cards(html)
      expect(n).toBeGreaterThan(0)
      expect((html.split('class="tcard-bars"').length - 1) + (html.split('class="tcard-nofive"').length - 1)).toBe(n)
    }
  })

  it('has no colour to give a rating that does not exist', () => {
    expect(ratingTone(null)).toBe('var(--muted)')
    expect(ratingTone(undefined)).toBe('var(--muted)')
    expect(ratingTone(NaN)).toBe('var(--muted)')
  })
})
