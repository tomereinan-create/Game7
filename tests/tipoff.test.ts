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
 * same in scout mode." — and his ruling of 2026-09-30, choosing the Jumbotron off the tip-off
 * board: "Use the Jumbotron E2."
 *
 * The CLAIM is the older ruling's and has not moved: this panel shows both fives with the board
 * between them, once, and the pairing it prints is the pairing being played. What changed is that
 * it is one lit table now instead of two jersey floors with the board written on the nameplates —
 * which is why the case below reads rows rather than "on HIM" captions.
 */
describe('the tip-off draws the board once, and draws the board being played', () => {
  const man = (name: string, i: number) =>
    ({ name, player: name, ovr: 70, o_ovr: 70, d_ovr: 70, peak_season: 1990 + i, attrs: {}, in: 50, out: 50, id: 50, pd: 50 }) as unknown as Player
  const mine = ['Abel', 'Baker', 'Cole', 'Dunn', 'Ewing'].map(man)
  const theirs = ['Vance', 'Ward', 'Xu', 'Young', 'Zane'].map(man)
  // a board that is NOT the identity: everyone is on somebody else's man
  const map = [2, 0, 4, 1, 3]

  const draw = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(TipOff, {
        bug: TIPOFF,
        us: 'ABC',
        them: 'XYZ',
        step: 'Level 4 · best of 7',
        mine,
        theirs,
        map,
        ...over,
      }),
    )
  const html = draw()

  it('reads the board before the tip: nothing scored, a full first quarter', () => {
    expect(html).toContain('>00<')
    expect(html).toContain('12:00')
    expect(html).toContain('1st')
    expect(html).toContain('Level 4 · best of 7')
    expect(html).toContain('>ABC<')
    expect(html).toContain('>XYZ<')
  })

  it('spells every pairing out, and stands the five in their own order', () => {
    // the ticker is where the panel CLAIMS a pairing, so that is where the claim is read
    for (let i = 0; i < map.length; i++) {
      expect(html).toContain(`◆ ${mine[i].name.toUpperCase()} ON ${theirs[map[i]].name.toUpperCase()}`)
    }
    // and the table stands your five in the order they were given
    const rows = [...html.matchAll(/class="jumbo-man"[^>]*>([A-Z]+)</g)].map((x) => x[1])
    expect(rows).toEqual(mine.map((p) => p.name.toUpperCase()))
    const foes = [...html.matchAll(/class="jumbo-man foe"[^>]*>([A-Z]+)</g)].map((x) => x[1])
    expect(foes).toEqual(map.map((j) => theirs[j].name.toUpperCase()))
  })

  it('names each man once a side, so neither five is drawn twice', () => {
    for (const p of [...mine, ...theirs]) {
      const n = html.split(p.name.toUpperCase()).length - 1
      // once in the ticker, once in the table, and the ticker is written twice to loop
      expect(n, `${p.name} appears ${n} times`).toBeLessThanOrEqual(3)
      expect(n).toBeGreaterThan(0)
    }
  })

  it('prints the payroll only where there is one', () => {
    expect(html).not.toContain('PAYROLL')
    expect(draw({ cap: { used: 68.2, max: 75 } })).toContain('PAYROLL 68.2/75')
    expect(draw({ cap: { used: 68.2, max: 75 } })).toContain('ROOM 6.8')
  })

  it('the shot still scores: the bump rides on top of the board', () => {
    expect(draw({ bump: 2, flash: true })).toContain('>02<')
    expect(draw({ bump: 2, flash: true })).toContain('+2')
  })

  it('says nothing about a pairing it has not been given', () => {
    const blind = draw({ map: null })
    for (const p of theirs) expect(blind).toContain(p.name.toUpperCase())
    expect(blind).not.toContain('◆')
  })
})
