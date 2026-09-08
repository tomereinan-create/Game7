import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { setUserMode } from '../src/state/viewmode'
import { CardSheet } from '../src/ui/CardSheet'
import { bandSlot, floorSlot, sameSlot, type Slot } from '../src/ui/ManBand'

/**
 * HIS REPORT: the draft screen spins on a desk — React logs "Maximum update depth exceeded" over
 * and over and the screen re-measures thousands of times a second. Below 900px it never did,
 * because there the same line writes null and null is null.
 *
 * The screen measures the band's rectangle AFTER EVERY RENDER on purpose: a column that grows, a
 * wheel that lands and a man drafted onto the court all move the floor, and none of them is a
 * dependency you can name. What it must not do is write a NEW OBJECT saying where the old one
 * already was — React compares state by identity, so that is a change, and the render it causes
 * measures again. The boolean set beside it in the same effect never looped, because an equal
 * primitive is where React bails; that contrast is the whole bug.
 */
const box = (left: number, top: number, right: number, bottom: number) =>
  ({
    getBoundingClientRect: () => ({ left, top, right, bottom, width: right - left, height: bottom - top }),
  }) as unknown as HTMLElement

/** A desk-width draft: the scout card runs long, the middle and last columns leave floor. */
const grid = box(0, 0, 1365, 956)
const tall = box(0, 42, 377, 914)
const short = box(395, 42, 971, 204)
const spare = box(988, 42, 1365, 455)
const cols = [tall, short, spare]
const FLOOR_Y = 800

describe('the floor under the columns', () => {
  it('is the rectangle the short columns leave above the dock', () => {
    expect(bandSlot(grid, cols, FLOOR_Y)).toEqual({ top: 469, left: 395, width: 970, height: 260 })
    expect(bandSlot(grid, [tall], FLOOR_Y)).toBe(null) // every column tall: no floor, no band
  })

  it('is a fresh object every time it is measured — which is the defect, stated', () => {
    const a = bandSlot(grid, cols, FLOOR_Y)
    const b = bandSlot(grid, cols, FLOOR_Y)
    expect(a).toEqual(b)
    expect(a).not.toBe(b) // equal in value, new in identity: React cannot bail on this
    expect(sameSlot(a, b)).toBe(true)
  })
})

describe('what the draft screen writes to state', () => {
  it('keeps the rectangle it already has when the floor has not moved', () => {
    const cur = bandSlot(grid, cols, FLOOR_Y)
    expect(floorSlot(grid, cols, FLOOR_Y, cur)).toBe(cur) // the same object: React bails, the loop dies
    expect(floorSlot(grid, [tall], FLOOR_Y, null)).toBe(null) // a phone, over and over
  })

  it('takes the new rectangle the moment the floor really moves', () => {
    const cur = bandSlot(grid, cols, FLOOR_Y)
    const moved = floorSlot(grid, cols, FLOOR_Y - 100, cur)
    expect(moved).not.toBe(cur)
    expect(moved).toEqual({ top: 469, left: 395, width: 970, height: 231 })
    // and the band leaves when the floor does, and comes back when it returns
    expect(floorSlot(grid, [tall], FLOOR_Y, cur)).toBe(null)
    expect(floorSlot(grid, cols, FLOOR_Y, null)).toEqual(cur)
  })
})

/**
 * The loop itself, modelled: an effect with no dependency array that writes the measurement after
 * every render. React renders when what it is handed is not what it holds, and re-runs the effect.
 */
const settleIn = (write: (cur: Slot | null) => Slot | null, passes = 200) => {
  let state: Slot | null = null
  for (let i = 1; i <= passes; i++) {
    const written = write(state)
    if (written === state) return i // React bails: no render, so no further measurement
    state = written
  }
  return Infinity
}

describe('the measuring effect settles instead of spinning', () => {
  it('never settles when the measurement goes straight to state', () => {
    expect(settleIn(() => bandSlot(grid, cols, FLOOR_Y))).toBe(Infinity)
  })

  it('settles on the second pass the way the screen writes it now', () => {
    expect(settleIn((cur) => floorSlot(grid, cols, FLOOR_Y, cur))).toBe(2)
  })
})

/**
 * AND THEN THE DRAFT STOPPED MEASURING A FLOOR AT ALL — his ruling: "Pressing on a player shouldnt
 * open the thing on the buttom left, it shall open photo #2." The rows had already been turned
 * round to open the man's season line where he stands; what was left were the rings on your own
 * court and the shirts on the tip-off, and neither of those has a row to open out into. Both open
 * his CARD now, which carries photo #2's season line and the rest of him, so nothing on the screen
 * puts a panel on the black floor and the whole band apparatus came out of it.
 *
 * These are read off the source because the screen has no test harness: what is being defended is
 * that no call site quietly comes back.
 */
describe('the draft opens the card, never the floor panel', () => {
  const DRAFT = readFileSync('src/ui/Draft.tsx', 'utf8')

  it('has nothing left that sets a band or mounts one', () => {
    expect(DRAFT).not.toMatch(/setBand|showMan|<ManBand/)
  })

  it('measures the roster box and no longer measures a floor', () => {
    expect(DRAFT).not.toMatch(/setFloor|floorSlot/)
    expect(DRAFT).toContain('setRosterEnd(list.scrollTop + list.clientHeight >= list.scrollHeight - 2)')
  })

  it('sends the man on a ring and the man on a shirt to his card', () => {
    expect(DRAFT).toContain('onTap: p ? () => openCard(p) : undefined')
    expect(DRAFT).toContain('onTap={(p) => openCard(p)}')
  })

  it('leaves the drag off a ring alone: a tap is still only what a short press does', () => {
    expect(readFileSync('src/ui/CourtFive.tsx', 'utf8')).toContain('s.onTap?.()')
  })

  /**
   * And the card is a fair swap for the panel: it opens on photo #2's own line — SEASON, then the
   * position, height, team, games and minutes — so the ruling is kept and not merely obeyed. The
   * tip-off is a NEW door into the card in user mode, so the blind card is checked through it: a
   * new route must not hand back the verdict the mode takes away.
   */
  it('opens on photo #2 line, and stays blind in user mode', () => {
    const p = PLAYERS.find((x) => x.name.endsWith("'96"))!
    setUserMode(true)
    try {
      const card = renderToStaticMarkup(createElement(CardSheet, { p, onClose: () => {} }))
      for (const cap of ['SEASON', 'POS', 'HT', 'TEAM', 'GP', 'MPG']) expect(card).toContain(`<span>${cap}</span>`)
      expect(card).not.toContain('pct-readouts')
      expect(card).not.toContain('OVERALL')
      expect(card).not.toContain('ATTRIBUTES')
    } finally {
      setUserMode(false)
    }
  })
})
