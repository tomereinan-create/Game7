import { describe, expect, it } from 'vitest'
import { fold } from '../src/engine/names'
import { PLAYERS } from '../src/engine/pool'

// his report, 2026-10-22: the Database answered "Jokic", "Doncic" and "Ginobili" with 0 of 10,000
describe('a player search ignores accents', () => {
  const find = (q: string) => PLAYERS.filter((p) => fold(p.name).includes(fold(q)))
  it.each([
    ['jokic', 'Nikola Jokić'],
    ['Doncic', 'Luka Dončić'],
    ['GINOBILI', 'Manu Ginóbili'],
    ['porzingis', 'Kristaps Porziņģis'],
    ['sengun', 'Alperen Şengün'],
    ['asik', 'Ömer Aşık'],
    ['demin', 'Egor D'],
  ])('%s finds %s', (q, who) => {
    expect(find(q).some((p) => p.name.startsWith(who))).toBe(true)
  })
  it('an accent typed in still matches', () => {
    expect(find('Jokić').length).toBe(find('jokic').length)
  })
  it('after folding, no card name keeps a letter a keyboard cannot type', () => {
    expect(PLAYERS.filter((p) => /[^\x00-\x7f]/.test(fold(p.name))).map((p) => p.name)).toEqual([])
  })
})
