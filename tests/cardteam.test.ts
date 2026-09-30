import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { WHEEL } from '../src/data/wheel'
import { CardSheet } from '../src/ui/CardSheet'
import { requestTeam, teamRequest } from '../src/state/openteam'

/**
 * HIS RULING, 2026-09-30: "In the player card, there need to be a pressable option to move to
 * this year's team (that he played on)."
 */
describe('the card’s door to his team', () => {
  const by = (name: string) => PLAYERS.find((p) => p.name === name)!

  it('names the club whose roster lists him that season, with its record', () => {
    const p = by("Karl Malone '94")
    const html = renderToStaticMarkup(createElement(CardSheet, { p, onClose: () => {} }))
    expect(html).toContain('data-team="UTA1994"')
    expect(html).toContain('1994 Utah Jazz')
    expect(html).toContain('53–29')
  })

  it('a season split between clubs gets a door per club; a man no roster lists gets none', () => {
    const split = PLAYERS.find((p) => WHEEL.filter((t) => t.y === p.peak_season && t.p.includes(p.name)).length > 1)
    if (split) {
      const html = renderToStaticMarkup(createElement(CardSheet, { p: split, onClose: () => {} }))
      expect((html.match(/class="linkb pc-club"/g) ?? []).length).toBeGreaterThan(1)
    }
    const nowhere = PLAYERS.find((p) => !WHEEL.some((t) => t.y === p.peak_season && t.p.includes(p.name)))
    if (nowhere) {
      const html = renderToStaticMarkup(createElement(CardSheet, { p: nowhere, onClose: () => {} }))
      expect(html).not.toContain('pc-club')
    }
  })

  it('the ask is one value that App reads and clears', () => {
    const t = WHEEL.find((x) => x.ab === 'UTA' && x.y === 1994)!
    requestTeam(t)
    expect(teamRequest()).toBe(t)
    requestTeam(null)
    expect(teamRequest()).toBeNull()
  })
})
