import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { RosterRow } from '../src/ui/TeamDb'

/**
 * HIS RULING: "Also pressing on a bench player will open this page same as starters" — the five on
 * the floor opened the player card; the men under "The rest of the roster" only unfolded a grid of
 * attributes under themselves. Now the row IS the door to the card, and it says so.
 */
const p = PLAYERS.find((x) => x.name.endsWith("'96"))!
const row = renderToStaticMarkup(createElement(RosterRow, { p, slot: 'C' }))

describe('a bench man opens the same card the starters do', () => {
  it('the whole row is the press — one button, no unfolding grid underneath it', () => {
    expect(row.startsWith('<button class="row dr tdb"')).toBe(true)
    // the DetailGrid the row used to toggle is gone: nothing is expanded in place any more
    expect(row).not.toContain('detailgrid')
    expect(row).not.toContain('class="dgrid')
  })

  it('the name carries the card affordance every other roster row in the app uses', () => {
    expect(row).toContain('class="cardname"')
    expect(row).toContain('role="button"')
    expect(row).toMatch(/aria-label="[^"]+ card"/)
    expect(row).toContain(p.name.replace(/'/g, '&#x27;'))
  })

  it('the row still reads as a row: the season line and the three ratings stay', () => {
    expect(row).toContain('class="mini"')
    expect(row).toContain('class="oppman-nums"')
    expect(row).toContain(`<i>${p.ovr}</i>`)
  })
})
