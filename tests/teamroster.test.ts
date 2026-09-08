import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { setUserMode } from '../src/state/viewmode'
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

  /**
   * USER MODE PLAYS BLIND HERE TOO. The five on the floor above these rows has printed positions
   * rather than OVRs since the design bundle landed; the bench underneath went on printing all
   * three verdicts, which is the same card face-up one row lower. The box line stays — it is what
   * he actually did — and the column comes out of the grid rather than being left empty.
   */
  it('user mode drops the three ratings and keeps the season line', () => {
    setUserMode(true)
    try {
      const blind = renderToStaticMarkup(createElement(RosterRow, { p, slot: 'C' }))
      expect(blind.startsWith('<button class="row dr tdb blind"')).toBe(true)
      expect(blind).toContain('class="mini"')
      expect(blind).not.toContain('oppman-nums')
      expect(blind).not.toContain(`<i>${p.ovr}</i>`)
      expect(blind).not.toContain(`<i>${p.o_ovr}</i>`)
      expect(blind).not.toContain(`<i>${p.d_ovr}</i>`)
      // and the man is still the door to his own card
      expect(blind).toContain('class="cardname"')
    } finally {
      setUserMode(false)
    }
  })
})
