import { describe, expect, it } from 'vitest'
import { TITLE } from '../src/App'

// A death match run must read "Death Match" everywhere a mode becomes a label — the map
// topbar, the team-setup screen, and the achievements feed all go through TITLE(). It used to
// fall through to "Campaign" for death runs because the death case was handled by a ternary at
// two call sites but never taught to TITLE itself, which the other two call sites relied on
// directly (src/App.tsx, LevelMap's title prop and TeamSetup's title prop).
describe('TITLE', () => {
  it('labels every campaign mode distinctly', () => {
    expect(TITLE('campaign')).toBe('Campaign')
    expect(TITLE('salary')).toBe('Salary Cap Campaign')
    expect(TITLE('death')).toBe('Death Match')
  })
})
