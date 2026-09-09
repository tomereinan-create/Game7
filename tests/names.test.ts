import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { bareName, surname, surnameCaps } from '../src/engine/names'

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
