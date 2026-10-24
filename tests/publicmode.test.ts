/**
 * THE PUBLISHED GAME. His ruling, 2026-10-24: "Scout mode is only for me. Once I publish the game,
 * only the user mode matters". This file runs with STAFF off — what a visitor to game7draft.com
 * gets — where the rest of the suite runs as staff (a vitest run is a dev build).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { isUserMode, setViewMode, viewMode } from '../src/state/viewmode'
import { FrontDoor } from '../src/ui/FrontDoor'
import { DetailGrid } from '../src/ui/Stat'
import { CardSheet } from '../src/ui/CardSheet'
import { PLAYERS } from '../src/engine/pool'
import { MODES, resetProgress, type CampaignMode, type Progress } from '../src/state/campaign'

// hoisted above the imports: every module that reads STAFF reads false
vi.mock('../src/state/staff', async (orig) => ({ ...(await orig<typeof import('../src/state/staff')>()), STAFF: false }))

describe('a visitor to the published game', () => {
  it('opens in User mode', () => {
    expect(viewMode()).toBe('user')
    expect(isUserMode()).toBe(true)
  })

  it('cannot be put in Scout mode: asking for it lands on User', () => {
    setViewMode('tutorial')
    expect(viewMode()).toBe('tutorial')
    setViewMode('scout')
    expect(viewMode()).toBe('user')
  })

  it('is offered two chips on the front door, User and Tutorial', () => {
    setViewMode('user')
    const progress = Object.fromEntries(MODES.map((m) => [m, resetProgress(m)])) as Record<CampaignMode, Progress>
    const html = renderToStaticMarkup(createElement(FrontDoor, { user: true, progress, team: null, onPick: () => {} }))
    expect(html).toContain('>User<')
    expect(html).toContain('>Tutorial<')
    expect(html).not.toContain('>Scout<')
    expect(html.match(/class="fd-mode[ "]/g)?.length).toBe(2)
    expect(html).toMatch(/fd-mode on"[^>]*aria-pressed="true">User</)
  })

  it('is never offered the Advanced window — not on the opponent sheet user mode can buy, not on the card', () => {
    const p = PLAYERS[0]
    expect(renderToStaticMarkup(createElement(DetailGrid, { p }))).not.toContain('adv-open')
    expect(renderToStaticMarkup(createElement(CardSheet, { p, onClose: () => {} }))).not.toContain('pc-adv')
  })
})
