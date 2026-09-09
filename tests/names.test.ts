import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { bareName, surname, surnameCaps, teamCode } from '../src/engine/names'
import { WHEEL } from '../src/data/wheel'

/**
 * E16 (2026-09-09): the jersey, the scorebug and the tactics chips took the LAST token of a card's
 * name, so a generational suffix became the whole name — Marvin Bagley III ran out wearing "III".
 * The Game 7 tape had the opposite fault, keeping the season: "Maxey '26 boards it".
 */
describe('a short name is a family name', () => {
  it('a suffix rides with the surname and never replaces it', () => {
    expect(surname("Marvin Bagley III '26")).toBe('Bagley III')
    expect(surname("Gary Payton II '22")).toBe('Payton II')
    expect(surname("Larry Nance Jr. '21")).toBe('Nance Jr.')
    expect(surnameCaps("Michael Porter Jr. '21")).toBe('PORTER JR.')
  })

  it('the season never survives — the tape used to read "Maxey \'26"', () => {
    expect(surname("Tyrese Maxey '26")).toBe('Maxey')
    expect(bareName("Marvin Bagley III '26")).toBe('Marvin Bagley III')
    for (const p of PLAYERS.slice(0, 400)) expect(surname(p.name), p.name).not.toMatch(/'\d\d/)
  })

  it('hyphens and one-word names survive whole', () => {
    expect(surname("Shai Gilgeous-Alexander '25")).toBe('Gilgeous-Alexander')
    expect(surname("Nenê '13")).toBe('Nenê')
  })

  it('no card in the pool ends up wearing a bare suffix', () => {
    const bare = PLAYERS.filter((p) => /^(jr|sr|ii|iii|iv|v)\.?$/i.test(surname(p.name)))
    expect(bare.map((p) => p.name)).toEqual([])
  })

  it('and the men it was actually breaking are fixed — 105 cards across 27 men', () => {
    const affected = PLAYERS.filter((p) => /^(Jr\.|Sr\.|II|III|IV|V)$/i.test(bareName(p.name).split(' ').pop() ?? ''))
    expect(affected.length).toBeGreaterThan(100)
    for (const p of affected) expect(surname(p.name).split(' ').length, p.name).toBe(2)
  })
})

/**
 * E3b: the scoreboard code for a team with no written `ab` — the franchise HE names (any of 34,099
 * cities plus a nickname he types) and the two sides of a custom matchup. Both were falling back to
 * "the last word, upper-cased", which puts the NICKNAME on the bug: Salt Lake City Sevens read
 * SEVENS, and every team anyone ever names in Boston read the same as every other.
 *
 * The first replacement proposed was an initial off every word. It was MEASURED and thrown out:
 * 78% of the world's cities are one word, so it returned two-letter codes for four names in five —
 * BS for Boston Sevens, DN for Denver Nine.
 */
describe('a team code is the city, and it is never shorter than three', () => {
  it('a one-word city gives its first three letters, a multi-word city its initials', () => {
    expect(teamCode('Boston Celtics')).toBe('BOS')
    expect(teamCode('Denver Nuggets')).toBe('DEN')
    expect(teamCode('Dnipropetrovsk Wanderers')).toBe('DNI')
    expect(teamCode('Los Angeles Lakers')).toBe('LAL')
    expect(teamCode('Golden State Warriors')).toBe('GSW')
    expect(teamCode('New York Knicks')).toBe('NYK')
    expect(teamCode('Salt Lake City Sevens')).toBe('SLC')
    expect(teamCode('Rio de Janeiro Sevens')).toBe('RDJ')
  })

  it('the nickname never lands on the bug — that was the whole bug', () => {
    for (const nick of ['Sevens', 'Nine', 'Wanderers']) {
      expect(teamCode(`Boston ${nick}`)).toBe('BOS')
      expect(teamCode(`Salt Lake City ${nick}`)).toBe('SLC')
    }
  })

  it('the season comes off BOTH ends: a card writes it behind the name, Custom writes it in front', () => {
    expect(teamCode("Orlando Magic '26")).toBe('ORL')
    expect(teamCode("'96 Chicago Bulls")).toBe('CHI')
    expect(teamCode("'26 Portland Trail Blazers")).toBe('PTB')
    for (const t of WHEEL.slice(0, 200)) expect(teamCode(t.team), t.team).not.toMatch(/['0-9]/)
  })

  it('punctuation and combining marks are dropped, not counted', () => {
    expect(teamCode("'s-Hertogenbosch Sevens")).toBe('SHE')
    expect(teamCode('H\u0331olon Sevens')).toBe('HOL')
    expect(teamCode('Philadelphia 76ers')).toBe('PHI')
  })

  it('the 18 cities with fewer than three letters run on into the nickname rather than coming up short', () => {
    expect(teamCode('Bo Sevens')).toBe('BOS')
    expect(teamCode('Ho Nine')).toBe('HON')
    expect(teamCode('Wa Wanderers')).toBe('WAW')
  })

  /**
   * THE MEASUREMENT the first helper failed. Every city the name screen can offer, against three
   * nicknames, and not one code under three characters.
   */
  it('no code is shorter than three characters, over all 34,099 cities x 3 nicknames', () => {
    const cities = JSON.parse(readFileSync('public/cities.json', 'utf8')) as [string, string, number][]
    expect(cities.length).toBe(34099)
    const short: string[] = []
    for (const [city] of cities) {
      for (const nick of ['Sevens', 'Nine', 'Trail Blazers']) {
        const code = teamCode(`${city} ${nick}`)
        if ([...code].length < 3) short.push(`${city} ${nick} -> ${code}`)
      }
    }
    expect(short).toEqual([])
  })
})
