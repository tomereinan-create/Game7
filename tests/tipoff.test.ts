import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CrowdBar, TipOff, TIPOFF } from '../src/ui/JerseyFive'
import type { Player } from '../src/engine/types'

/**
 * HIS RULING, 2026-09-08: "Instead of a fake score 104 GA IND 101 4th · 5:55, put 0:0 with 12:00
 * 1st." The bug used to invent a closing-minutes score off a hash of the level — always inside a
 * possession either way, so it said nothing about who was better, but it was still a scoreboard
 * reporting a game nobody had played. A board before the tip is the honest version of the same
 * furniture: nothing scored, a full first quarter on the clock.
 */
describe('the scorebug before the tip', () => {
  it('is 0-0 with a full first quarter, whatever the level', () => {
    expect(TIPOFF).toEqual({ ours: 0, theirs: 0, clock: '12:00', period: '1st' })
  })

  it('prints the period off the bug rather than hard-coding the fourth', () => {
    const bar = renderToStaticMarkup(
      createElement(CrowdBar, { bug: TIPOFF, us: 'SLC', them: 'IND', step: 'Level 2 · best of 7', bump: 0, flash: false }),
    )
    expect(bar).toContain('1st')
    expect(bar).not.toContain('4th')
    expect(bar).toContain('12:00')
    expect(bar).toContain('Level 2 · best of 7')
  })

  /** The two points that land as the shot goes in still move the board — off zero now, not off 104. */
  it('the shot still scores: the bump rides on top of the board', () => {
    const bar = renderToStaticMarkup(
      createElement(CrowdBar, { bug: TIPOFF, us: 'SLC', them: 'IND', step: 'Level 2', bump: 2, flash: true }),
    )
    expect(bar).toContain('>2<')
    expect(bar).toContain('+2')
  })
})

/**
 * HIS RULING, 2026-09-08: "only show both teams one next to the other (with the matchups) … Do the
 * same in scout mode." The board is drawn on the nameplates rather than in a table beside the
 * floor — yours say who each man is ON, theirs say who is on HIM — so the two rows have to be
 * inverses of one another or the panel contradicts itself half way down.
 */
describe('the tip-off draws the same board from both sides', () => {
  const man = (name: string, i: number) =>
    ({ name, player: name, ovr: 70, o_ovr: 70, d_ovr: 70, peak_season: 1990 + i, attrs: {}, in: 50, out: 50, id: 50, pd: 50 }) as unknown as Player
  const mine = ['Abel', 'Baker', 'Cole', 'Dunn', 'Ewing'].map(man)
  const theirs = ['Vance', 'Ward', 'Xu', 'Young', 'Zane'].map(man)
  // a board that is NOT the identity: everyone is on somebody else's man
  const map = [2, 0, 4, 1, 3]

  const html = renderToStaticMarkup(
    createElement(TipOff, {
      bug: TIPOFF,
      us: 'ABC',
      them: 'XYZ',
      usName: 'Salt Lake City Sevens',
      themName: 'Sacramento Kings',
      step: 'Level 4 · best of 7',
      mine,
      theirs,
      map,
    }),
  )

  it('names both teams, one band each', () => {
    expect(html).toContain('Salt Lake City Sevens')
    expect(html).toContain('Sacramento Kings')
    expect(html).toContain('Your five')
    expect(html).toContain('Who guards whom')
  })

  it('every pairing reads the same both ways', () => {
    for (let i = 0; i < map.length; i++) {
      expect(html).toContain(`on ${theirs[map[i]].name.toUpperCase()}`)
      expect(html).toContain(`${mine[i].name.toUpperCase()} on him`)
    }
  })

  it('with no board to draw it prints no pairing at all rather than a wrong one', () => {
    const blank = renderToStaticMarkup(
      createElement(TipOff, {
        bug: TIPOFF, us: 'ABC', them: 'XYZ', usName: 'Us', themName: 'Them', step: 'Level 4', mine, theirs, map: null,
      }),
    )
    expect(blank).not.toContain('on him')
    expect(blank).not.toContain('on VANCE')
  })
})
