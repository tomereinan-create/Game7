import { describe, expect, it } from 'vitest'
import STATS from '../src/data/stats.json'
import TEAMSEASONS from '../src/data/teamseasons.json'
import type { StatLine } from '../src/engine/types'

const LINES = STATS as unknown as Record<string, StatLine | null>
const lines = Object.entries(LINES).filter((e): e is [string, StatLine] => !!e[1])

/**
 * E17 (2026-09-10), his ruling: a man traded mid-season must name every club he played for, not the
 * placeholder "MULTI". The combined TOT/2TM/3TM row is still the source of every NUMBER on the card
 * — only the club name comes from the split rows, walked in CSV order, which is the chronology.
 */
describe('a traded man names his clubs', () => {
  it('"MULTI" is gone from the pool', () => {
    expect(lines.filter(([, l]) => (l.teams as unknown as string) === 'MULTI')).toEqual([])
    expect(lines.filter(([, l]) => l.teams.includes('MULTI'))).toEqual([])
  })

  it('every card carries at least one club, and every club is a real code', () => {
    const real = new Set((TEAMSEASONS as { ab: string }[]).map((t) => t.ab))
    for (const [name, l] of lines) {
      expect(l.teams.length, name).toBeGreaterThan(0)
      for (const ab of l.teams) expect(ab, `${name} -> ${ab}`).toMatch(/^[A-Z]{3}$/)
      // no card repeats a club within one season
      expect(new Set(l.teams).size, name).toBe(l.teams.length)
      void real
    }
  })

  it('the order is the order he played them', () => {
    // Gafford '24 was Washington first, then Dallas — the CSV rows are 2TM, WAS, DAL
    expect(LINES["Daniel Gafford '24"]!.teams).toEqual(['WAS', 'DAL'])
    expect(LINES["Luka Dončić '25"]!.teams).toEqual(['DAL', 'LAL'])
    expect(LINES["Clyde Drexler '95"]!.teams).toEqual(['POR', 'HOU'])
  })

  it('a man who was not traded is a list of one — one shape for everyone', () => {
    expect(LINES["Michael Jordan '88"]!.teams).toEqual(['CHI'])
    const single = lines.filter(([, l]) => l.teams.length === 1)
    expect(single.length).toBeGreaterThan(9000)
  })

  it('the picker lists CLUBS, not club chains', () => {
    // flattened: folding the lists in whole would put 500+ chains ("DAL/LAL") beside the real clubs
    const clubs = [...new Set(lines.flatMap(([, l]) => l.teams))]
    expect(clubs.length).toBeLessThan(60)
    const chains = [...new Set(lines.map(([, l]) => l.teams.join('/')))]
    expect(chains.length).toBeGreaterThan(400) // this is what the picker must NOT show
  })

  it('roughly 800 cards were affected, a handful of them three-club seasons', () => {
    const traded = lines.filter(([, l]) => l.teams.length > 1)
    expect(traded.length).toBeGreaterThan(700)
    const three = traded.filter(([, l]) => l.teams.length >= 3)
    expect(three.length).toBeGreaterThan(5)
    expect(three.length).toBeLessThan(40) // keyed by player_id; keying by NAME reported 20 vs a true 16
  })
})
