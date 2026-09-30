import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { ROUNDS } from '../src/config'
import type { Opponent } from '../src/engine/types'
import { DEFAULT_TACTICS } from '../src/engine/tactics'
import type { Progress } from '../src/state/campaign'
import { setUserMode } from '../src/state/viewmode'
import { LevelMap } from '../src/ui/LevelMap'
import { durLesson, salaryLesson } from '../src/ui/lessons'

const opponents = OPP as Opponent[]
const eras = [{ name: 'Modern', years: [2016, 2024] as [number, number], first: 1 }]
const progress = (over: Partial<Progress> = {}): Progress => ({
  coach: null,
  stars: Array.from({ length: ROUNDS }, () => 0),
  seed: 1,
  plays: 0,
  spent: 0,
  nodes: {},
  roster: null,
  lives: 0,
  checkpoint: 0,
  deaths: 0,
  wear: {},
  subsUsed: 0,
  tactics: DEFAULT_TACTICS,
  bench: null,
  ...over,
})
const map = (p: Progress, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(LevelMap, {
      title: 'Death Match',
      progress: p,
      opponents,
      eras,
      teamName: 'Zhengzhou GA',
      onPlay: () => {},
      onTeam: () => {},
      onStaff: () => {},
      onReset: () => {},
      ...extra,
    } as never),
  )

/** HIS RULINGS, 2026-09-30: the heart beside the stars, the change beside the stars and off the ticket. */
describe('the death match header', () => {
  it('shows a heart with the lives in hand — the spares plus the one in play — in both modes, only in the death match', () => {
    const p = progress({ lives: 2, roster: ['a', 'b', 'c', 'd', 'e'] })
    const scout = map(p, { death: true })
    expect(scout).toContain('class="map-lives"')
    expect(scout).toContain('aria-label="3 lives in hand"')
    setUserMode(true)
    try {
      const user = map(p, { death: true })
      expect(user).toContain('class="um-lives"')
      expect(user).toContain('aria-label="3 lives in hand"')
    } finally {
      setUserMode(false)
    }
    expect(map(progress({ lives: 2 }), { death: false })).not.toContain('map-lives')
    // no spare life is still the life he is on: 1, never 0 (his ruling)
    expect(map(progress({ lives: 0 }), { death: true })).toContain('aria-label="1 life in hand"')
    expect(map(progress({ lives: 0 }), { death: true })).not.toContain('>♥</i> 0')
  })

  it('the change glyph stands beside the star, not over the ticket; a worn man keeps his sentence there', () => {
    const p = progress({ lives: 1, roster: ['a', 'b', 'c', 'd', 'e'] })
    const sub = map(p, { death: true, onMyTeam: () => {}, teamNote: { kind: 'sub', text: 'A change is waiting in My team' } })
    expect(sub).toContain('class="map-sub"')
    // the door to My team is a glyph, in both headers (his ruling: "instead of myteam have a team icon")
    expect(sub).toContain('class="map-team"')
    expect(sub).not.toContain('My team →')
    setUserMode(true)
    try {
      expect(map(p, { death: true, onMyTeam: () => {} })).toContain('class="um-team"')
    } finally {
      setUserMode(false)
    }
    expect(sub).not.toContain('node-note icon')
    expect((sub.match(/class="subicon"/g) ?? []).length).toBe(1)
    const worn = map(p, { death: true, onMyTeam: () => {}, teamNote: { kind: 'worn', text: 'A man is worn out — replace him in My team' } })
    expect(worn).not.toContain('map-sub')
    expect(worn).toContain('A man is worn out')
    expect(worn).toContain('class="node-note ')
  })
})

/** HIS RULINGS, 2026-09-30: the salary after the spin in the Salary cap, and DUR after the spin in the Death match. */
describe('the two after-the-spin lessons', () => {
  it('the salary lesson reads the payroll bar and names a man who cannot be paid', () => {
    const l = salaryLesson({ capUsed: 40.2, capMax: 75, capLeft: 34.8, reserve: 10, budget: 24.8, after: 2, greyed: [{ name: "Karl Malone '94", cost: 26.1 }] })
    expect(l.id).toBe('salary.landed')
    expect(l.steps[0].at).toBe('.capbar')
    const t = l.steps.flatMap((s) => s.body).join(' ')
    expect(t).toContain('75%')
    expect(t).toContain('40.2%')
    expect(t).toContain('10% of that is held back')
    expect(t).toContain('24.8% to spend')
    expect(l.steps[1].at).toBe('.col.b .row.dr.off')
    expect(l.steps[1].body.join(' ')).toContain("Karl Malone '94 costs 26.1%")
    const last = salaryLesson({ capUsed: 60, capMax: 75, capLeft: 15, reserve: 0, budget: 15, after: 0, greyed: [] })
    expect(last.steps[0].body.join(' ')).toContain('last slot')
    expect(last.steps[1].at).toBeUndefined()
  })

  it('the DUR lesson lights a badge on the landed roster and says the floor and the boost', () => {
    const l = durLesson({ boost: 10, floor: 7, sample: { name: "Shawn Bradley '98", dur: 61 } })
    expect(l.id).toBe('death.dur')
    expect(l.steps[0].at).toBe('.spin-roster .mt-dur')
    const t = l.steps[0].body.join(' ')
    expect(t).toContain("Shawn Bradley '98 has 61")
    expect(t).toContain('At 7 or less')
    expect(t).toContain('+10')
    expect(durLesson({ boost: 0, floor: 7, sample: null }).steps[0].body.join(' ')).toContain('Survival branch')
  })
})
