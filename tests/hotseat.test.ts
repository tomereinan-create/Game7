import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Auction } from '../src/ui/Auction'
import { Versus } from '../src/ui/Versus'

/**
 * THE HOT-SEAT FLOORS — his ruling, 2026-10-19: "The 1v1 bid should be more full screen. Push both
 * teams to the side. Dont show the player OVR. put his name and stats in the middle" / "Same for
 * Player vs Friend". The layout itself is the stylesheet's; what is pinned here is the markup it
 * stands on and the rating that must not be printed.
 */
describe('1v1 bid and Player vs Friend', () => {
  const bid = renderToStaticMarkup(createElement(Auction, { onHome: () => {} }))
  const friend = renderToStaticMarkup(createElement(Versus, { onHome: () => {} }))

  it('stand the two sides and the middle on one floor', () => {
    for (const html of [bid, friend]) {
      expect(html).toContain('class="hs-floor"')
      expect(html).toContain('class="hs-stage"')
      expect(html.indexOf('class="vs-head"')).toBeLessThan(html.indexOf('class="hs-stage"'))
    }
  })

  it('print no player OVR anywhere', () => {
    for (const html of [bid, friend]) expect(html).not.toContain('class="ovr"')
  })

  it('the man on the block is his name and his season', () => {
    expect(bid).toContain('class="au-name"')
    expect(bid).toContain('class="bgrid"')
    expect(bid).toContain('PTS')
  })

  it('the draft board prints the season line where the rating stood', () => {
    expect(friend).toContain('class="rowhead st"')
    expect(friend).toContain('class="mini"')
  })
})
