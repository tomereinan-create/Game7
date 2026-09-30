import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { clubCode, isClubCode, MODES, resetProgress, type CampaignMode, type Progress } from '../src/state/campaign'
import { setViewMode } from '../src/state/viewmode'
import { FrontDoor } from '../src/ui/FrontDoor'
import { TeamSetup } from '../src/ui/TeamSetup'

/**
 * HIS RULING, 2026-09-30: "Remove the name, only have the 2 letters. Selecting a team from now on
 * you will choose a 3 letters such as GSW, and these 3 letters will replace the 2 letters from now on."
 */
describe('the club’s three letters', () => {
  const team = { city: 'Golden State', country: 'US', name: 'Warriors' }

  it('three capitals are a code; anything else is not, and the name’s own letters stand in', () => {
    expect(isClubCode('GSW')).toBe(true)
    expect(isClubCode('gsw')).toBe(false)
    expect(isClubCode('GS')).toBe(false)
    expect(isClubCode('GSWX')).toBe(false)
    expect(clubCode({ ...team, code: 'GSW' })).toBe('GSW')
    expect(clubCode(team)).toBe(clubCode({ ...team, code: 'bad' }))
    expect(clubCode(team)).toMatch(/^[A-Z]{2,3}$/)
    expect(clubCode(null)).toBe('')
  })

  it('the door’s corner wears the code alone — no name', () => {
    setViewMode('scout')
    const progress = Object.fromEntries(MODES.map((m) => [m, resetProgress(m)])) as Record<CampaignMode, Progress>
    const html = renderToStaticMarkup(createElement(FrontDoor, { user: false, progress, team: { ...team, code: 'GSW' }, onPick: () => {} }))
    expect(html).toMatch(/class="fd-crest"[^>]*>GSW</)
    expect(html).not.toContain('fd-club')
    expect(html).not.toContain('Golden State Warriors</b>')
  })

  it('the name screen asks for the letters, shows what the name would give, and keeps a club’s own', () => {
    const fresh = renderToStaticMarkup(createElement(TeamSetup, { title: 'Campaign', initial: null, onDone: () => {}, onBack: () => {} }))
    expect(fresh).toContain('Three letters')
    expect(fresh).toContain('id="tcode"')
    expect(fresh).toContain('placeholder="e.g. GSW"')
    const kept = renderToStaticMarkup(createElement(TeamSetup, { title: 'Campaign', initial: { ...team, code: 'GSW' }, onDone: () => {}, onBack: () => {} }))
    expect(kept).toContain('value="GSW"')
    expect(kept).toContain('Worn as GSW')
  })
})
