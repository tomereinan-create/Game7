import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { ROUNDS, SIGMA } from '../src/config'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import type { Opponent, Player, SeriesResult } from '../src/engine/types'
import {
  altText,
  cardNames,
  emojiGrid,
  fileName,
  headline,
  proseName,
  shareData,
  shareText,
  stampLabel,
  stampsFor,
  teamLabel,
  xIntent,
  type ShareData,
  type ShareGame,
  type ShareInput,
} from '../src/share/data'
import { SITE } from '../src/site'
import { Series } from '../src/ui/Series'

/**
 * THE SHARE CARD'S WORDS (P10). The canvas is drawn in a browser and cannot run here; everything
 * it SAYS is built by src/share/data.ts, which has no DOM, and is pinned below — the stamps, the
 * colour-blind grid, the one-line alt, the share text, and the wording rule.
 */

const opponents = OPP as Opponent[]
const A: Player[] = opponents[5].players
const B: Player[] = opponents[16].players
const LINK = 'https://example.test/?s=abc12345&ref=x'

/** A series from a list of [us, them] scores, first to `toWin`. */
function series(scores: [number, number][], toWin = 4): SeriesResult {
  const games = scores.map(([us, them], i) => ({ game: i + 1, margin: us - them, won: us > them, us, them, note: '' }))
  const wins = games.filter((g) => g.won).length
  return { games, wins, losses: games.length - wins, won: wins === toWin, toWin }
}

/** The result screen's props, around a hand-written series. */
function input(r: SeriesResult, over: Partial<ShareInput> = {}): ShareInput {
  return {
    opponent: { round: 12, team: 'Chicago Bulls', season: 1996, ab: 'CHI', players: B },
    five: A,
    mine: compile(A, B),
    theirs: compile(B, A),
    teamName: 'Salt Lake City Sevens',
    result: r,
    sigma: SIGMA,
    ...over,
  }
}

const games = (rows: [number, number][]): ShareGame[] => rows.map(([us, them], i) => ({ n: i + 1, us, them, won: us > them }))

/** 4–3 from 0–3 down, Game 7 by one. */
const COMEBACK: [number, number][] = [[98, 104], [101, 112], [95, 99], [110, 102], [107, 96], [104, 100], [112, 111]]

const BANNED = /\b(odds|bet|lock|spread|line|pot|ante)\b/i

describe('names on the card', () => {
  it('a surname and the season tag, the suffix kept, a clash given initials', () => {
    expect(cardNames(["Michael Jordan '96", "Marvin Bagley III '26", "Shai Gilgeous-Alexander '25", "Nenê '13", "Tony Mitchell '14 (a)"])).toEqual([
      "Jordan '96",
      "Bagley III '26",
      "Gilgeous-Alexander '25",
      "Nenê '13",
      "Mitchell '14",
    ])
    expect(cardNames(["Jalen Williams '24", "Jaylin Williams '24", "Chet Holmgren '24"])).toEqual(["Jalen Williams '24", "Jaylin Williams '24", "Holmgren '24"])
    expect(cardNames(["Marcus Morris '19", "Markieff Morris '19", "Kevin Morris '19"])).toEqual(["Marcus Morris '19", "Markieff Morris '19", "K. Morris '19"])
    expect(cardNames(["Brook Lopez '19", "Robin Lopez '19"])).toEqual(["B. Lopez '19", "R. Lopez '19"])
  })

  it('the opponent with its season said once, and said as a sentence says it', () => {
    expect(teamLabel('Washington Wizards', 2026)).toBe("Washington Wizards '26")
    expect(teamLabel("Denver Nuggets '23", 2023)).toBe("Denver Nuggets '23")
    expect(teamLabel("'96 Chicago Bulls")).toBe("'96 Chicago Bulls")
    expect(teamLabel('All-time Lakers')).toBe('All-time Lakers')

    expect(proseName('Washington Wizards', 2026)).toBe('the 2026 Washington Wizards')
    expect(proseName("Denver Nuggets '23", 2023)).toBe('the 2023 Denver Nuggets')
    expect(proseName("'96 Chicago Bulls", undefined, true)).toBe('the 1996 Chicago Bulls')
    expect(proseName("'04 Pistons", undefined, true)).toBe('the 2004 Pistons')
    expect(proseName('All-time Lakers')).toBe('the All-time Lakers')
    expect(proseName('Player 2', undefined, true)).toBe('Player 2')
    expect(proseName('The Machine', undefined, true)).toBe('The Machine')
  })
})

describe('the stamps', () => {
  it('UPSET: won, from a win chance under 50%', () => {
    const g = games([[100, 90], [100, 90], [100, 90], [100, 90]])
    expect(stampsFor(g, true, 4, 0.49)).toContain('upset')
    expect(stampsFor(g, true, 4, 0.5)).not.toContain('upset')
    expect(stampsFor(g, false, 4, 0.1)).toEqual([]) // nothing is stamped on a loss
  })

  it('0–3 COMEBACK: won after losing the first three, and only then', () => {
    expect(stampsFor(games(COMEBACK), true, 4, 0.9)).toContain('comeback')
    const twoDown = games([[90, 100], [90, 100], [100, 90], [90, 100], [100, 90], [100, 90], [100, 90]])
    expect(stampsFor(twoDown, true, 4, 0.9)).not.toContain('comeback')
    // a best of five's version is 0–2, a best of three has none
    expect(stampsFor(games([[90, 100], [90, 100], [100, 90], [100, 90], [100, 90]]), true, 3, 0.9)).toContain('comeback')
    expect(stampsFor(games([[90, 100], [100, 90], [100, 90]]), true, 2, 0.9)).not.toContain('comeback')
    expect(stampLabel('comeback', 4)).toBe('0–3 COMEBACK')
    expect(stampLabel('comeback', 3)).toBe('0–2 COMEBACK')
  })

  it('WON BY 1: the last game, won by a single point', () => {
    expect(stampsFor(games(COMEBACK), true, 4, 0.9)).toContain('by1')
    expect(stampsFor(games([[100, 90], [100, 90], [100, 90], [101, 99]]), true, 4, 0.9)).not.toContain('by1')
    // a one-point win earlier in the series is not the last game
    expect(stampsFor(games([[101, 100], [100, 90], [100, 90], [110, 99]]), true, 4, 0.9)).not.toContain('by1')
  })

  it('shareData reads the screen\'s own scores, so a Game 7 off the tape stamps what the strip shows', () => {
    const r = series([[98, 104], [101, 112], [95, 99], [110, 102], [107, 96], [104, 100], [112, 105]])
    expect(shareData(input(r)).stamps).not.toContain('by1')
    const scores = COMEBACK.map(([us, them]) => ({ us, them }))
    const d = shareData(input(r, { scores }))
    expect(d.stamps).toContain('by1')
    expect(d.games[6]).toEqual({ n: 7, us: 112, them: 111, won: true })
  })
})

describe('shareData', () => {
  it('a campaign win carries its level, its stars and the win chance; a loss carries no stars', () => {
    const win = shareData(input(series([[100, 90], [100, 90], [90, 100], [100, 90], [100, 90]])), 'example.test')
    expect(win.kicker).toBe(`Level 12 of ${ROUNDS}`)
    expect(win.bestOf).toBe('Best of seven')
    expect(win.stars).toBe(2)
    expect(win.maxStars).toBe(3)
    expect(win.winChance).toBeGreaterThan(0)
    expect(win.winChance).toBeLessThan(1)
    expect(win.us).toMatchObject({ name: 'Salt Lake City Sevens', code: 'SLC' })
    expect(win.them).toMatchObject({ name: "Chicago Bulls '96", code: 'CHI', prose: 'the 1996 Chicago Bulls' })
    expect(win.us.five).toHaveLength(5)
    expect(win.them.five).toHaveLength(5)
    expect(win.url).toBe('example.test')
    const loss = shareData(input(series([[90, 100], [90, 100], [100, 90], [90, 100], [90, 100]])))
    expect(loss.stars).toBeNull()
    expect(loss.won).toBe(false)
  })

  it('an exhibition has no level and no stars, and keeps the screen\'s kicker', () => {
    const r = series([[100, 90], [100, 90], [100, 90], [100, 90]])
    const d = shareData(input(r, { exhibition: true, kicker: '1v1 Bid', teamName: 'Player 1', teamAb: 'P1', opponent: { round: 1, team: 'The Machine', ab: 'CPU', players: B } }))
    expect(d.stars).toBeNull()
    expect(d.kicker).toBe('1v1 Bid')
    expect(d.us.code).toBe('P1')
    expect(d.them.prose).toBe('The Machine')
    expect(shareData(input(r, { exhibition: true })).kicker).toBe('Exhibition')
  })

  it('UPSET follows the engine\'s own pre-series win chance', () => {
    // the same two fives, both ways round: one side is the favourite, the other is not
    const r = series([[100, 90], [100, 90], [100, 90], [100, 90]])
    const ab = shareData(input(r))
    const ba = shareData(input(r, { mine: compile(B, A), theirs: compile(A, B) }))
    expect(ab.winChance + ba.winChance).toBeCloseTo(1, 6)
    expect(ab.stamps.includes('upset')).toBe(ab.winChance < 0.5)
    expect(ba.stamps.includes('upset')).toBe(ba.winChance < 0.5)
  })
})

describe('the text', () => {
  const d = shareData(input(series(COMEBACK)), 'example.test')

  it('the grid is blue and orange, never red or green, with a letter on every square, and the score', () => {
    const grid = emojiGrid(d)
    expect(grid).toBe('🟧L 🟧L 🟧L 🟦W 🟦W 🟦W 🟦W · 4–3')
    expect(grid).not.toMatch(/🟥|🟩|🔴|🟢|❌|✅/u)
    const squares = grid.match(/🟦|🟧/gu) ?? []
    const letters = grid.match(/(?:🟦|🟧)([WL])/gu) ?? []
    expect(squares).toHaveLength(7)
    expect(letters).toHaveLength(7)
    // the shape and the letter agree, so the colour is never the only signal
    for (const m of grid.matchAll(/(🟦|🟧)([WL])/gu)) expect(m[2]).toBe(m[1] === '🟦' ? 'W' : 'L')
  })

  it('the one-line alt says the result, the drama and the stars in words', () => {
    const alt = altText(d)
    expect(alt).not.toContain('\n')
    expect(alt).toContain('Won 4–3 against the 1996 Chicago Bulls')
    expect(alt).toContain('from 0–3 down')
    expect(alt).toContain('Game 7 by 1 point')
    expect(alt).toMatch(/1 of 3 stars\.$/)
    expect(alt).not.toContain('★')
    const ex = shareData(input(series(COMEBACK), { exhibition: true }))
    expect(altText(ex)).not.toMatch(/stars/)
    const loss = shareData(input(series([[90, 100], [90, 100], [90, 100], [90, 100]])))
    expect(altText(loss)).toBe('Lost 0–4 to the 1996 Chicago Bulls.')
  })

  it('the share text is the headline, the grid, the invitation in the product\'s name, and the link', () => {
    const t = shareText(d, LINK).split('\n')
    expect(t).toEqual([headline(d), emojiGrid(d), `Play me in ${SITE.name}`, LINK])
    expect(t[0]).toMatch(/★☆☆$/)
    expect(shareText(d, LINK, false)).not.toContain(LINK)
    // the product's name is written as src/site.ts writes it ("Game 7"), never the old "Game7"
    expect(shareText(d, LINK)).not.toMatch(/Game7/)
  })

  it('X gets the text and the link, the link once', () => {
    const u = new URL(xIntent(d, LINK))
    expect(u.origin + u.pathname).toBe('https://x.com/intent/post')
    expect(u.searchParams.get('url')).toBe(LINK)
    expect(u.searchParams.get('text')).toBe(shareText(d, LINK, false))
    expect(u.searchParams.get('text')).not.toContain(LINK)
  })

  it('a file name off the product, never off a league or a team', () => {
    expect(fileName(d, 'story')).toMatch(/^[a-z0-9-]+-4-3-story\.png$/)
    expect(fileName(d, 'wide')).toMatch(/-4-3-wide\.png$/)
  })

  it('never reads like a betting slip, across real simmed series of every shape', () => {
    const shapes = new Set<string>()
    for (let seed = 1; seed <= 400; seed++) {
      const r = simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA)
      for (const exhibition of [false, true]) {
        const s: ShareData = shareData(input(r, { exhibition }))
        shapes.add(`${s.won}-${s.games.length}-${s.stamps.join('+')}`)
        const words = [headline(s), altText(s), emojiGrid(s), shareText(s, LINK), s.kicker, s.bestOf, ...s.stamps.map((x) => stampLabel(x, s.toWin))]
        for (const w of words) expect(w, w).not.toMatch(BANNED)
        expect(s.stars === null).toBe(exhibition || !r.won)
      }
    }
    // the sweep covered wins and losses, short and long series
    expect([...shapes].some((k) => k.startsWith('true-7'))).toBe(true)
    expect([...shapes].some((k) => k.startsWith('false-'))).toBe(true)
    expect([...shapes].some((k) => k.startsWith('true-4'))).toBe(true)
  })
})

describe('the door on the result screen', () => {
  // a series that ends before Game 7: settled-open, a decider would still be on its tape
  let seed = 1
  while (simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA).games.length === 7) seed++
  const screen = (reveal: boolean) =>
    renderToStaticMarkup(
      createElement(Series, {
        reveal,
        opponent: { round: 3, team: 'Chicago Bulls', season: 1996, ab: 'CHI', players: B, positions: [] },
        five: A,
        mine: compile(A, B),
        theirs: compile(B, A),
        teamName: 'Salt Lake City Sevens',
        result: simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA),
        seed,
        onAdvance: () => {},
      }),
    )

  it('stands under the verdict once the series has settled, and not before', () => {
    expect(screen(false)).toContain('class="shr-open"')
    // while the series is still landing the verdict has not spoken, and neither has the door
    expect(screen(true)).not.toContain('shr-open')
  })

  it('is not one of the dock\'s doors', () => {
    expect(screen(false)).not.toMatch(/class="btn[^"]*"[^>]*>[^<]*Share/)
  })
})
