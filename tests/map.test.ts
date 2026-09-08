import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import CAMPAIGNS from '../src/data/campaigns.json'
import { ROUNDS } from '../src/config'
import { balance, buy, canBuy, NODE, NODES, type NodeId } from '../src/engine/tree'
import type { Opponent } from '../src/engine/types'
import { DEFAULT_TACTICS } from '../src/engine/tactics'
import type { Progress } from '../src/state/campaign'
import { setUserMode } from '../src/state/viewmode'
import { heightOf, LevelMap, perRow, rowsOf, seamOf, skinAt, WOBBLE, xOf, yOf } from '../src/ui/LevelMap'

const opponents = OPP as Opponent[]
const eras = [{ name: 'Modern', years: [2016, 2024] as [number, number], first: 1 }]

const progress = (over: Partial<Progress> = {}): Progress => ({
  coach: null,
  team: null,
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

/** What a case may vary about the map: the campaign it is drawing, and the ladder's own tiers. */
type Vary = { salary?: boolean; death?: boolean; onToggleAuto?: () => void; onMyTeam?: () => void; eras?: typeof eras }

const map = (p: Progress, mode: Vary = {}) =>
  renderToStaticMarkup(
    createElement(LevelMap, {
      title: 'Campaign',
      progress: p,
      opponents,
      eras,
      teamName: 'Zhengzhou GA',
      onPlay: () => {},
      onTeam: () => {},
      onStaff: () => {},
      onReset: () => {},
      ...mode,
    }),
  )

/** The same map, drawn in the mode that plays blind. */
const userMap = (p: Progress, mode: Vary = {}) => {
  setUserMode(true)
  try {
    return map(p, mode)
  } finally {
    setUserMode(false)
  }
}
const won = () => progress({ stars: Array.from({ length: ROUNDS }, () => 3) })

/** The header's two staff affordances: the always-present door, and the his-ruling notice. */
const hasDoor = (html: string) => /<button [^>]*class="map-total"/.test(html)
const hasNotice = (html: string) => html.includes('class="map-link staff"')

describe('the campaign map always has a door to the staff tree', () => {
  /**
   * HIS REPORT: "where is my skill tree to spend stars?" — four levels cleared, ten stars on the
   * counter, every one of them already spent in a death run. `spendable` is false (correctly: his
   * ruling is that the NOTICE only shows when a star can be placed), and the notice was the map's
   * only route to the tree, so the screen had no way back into it.
   */
  it('with stars earned but the balance spent to zero, the notice is gone and the counter still opens it', () => {
    let p = progress({ stars: [3, 3, 2, 2, ...Array.from({ length: ROUNDS - 4 }, () => 0)], roster: ['a', 'b', 'c', 'd', 'e'] })
    for (const id of ['surv_life', 'surv_life', 'surv_life', 'surv_save', 'surv_save', 'surv_save', 'surv_sub', 'surv_sub', 'scout_ratings', 'scout_ratings'] as NodeId[]) {
      p = buy(p, id)!
      expect(p, `${id} must be affordable on the way to zero`).toBeTruthy()
    }
    expect(balance(p)).toBe(0)
    // nothing in the tree is affordable — this is the reported state, not a contrived one
    expect(NODES.some((n) => canBuy(p, n.id))).toBe(false)

    const html = map(p, { death: true })
    expect(hasNotice(html)).toBe(false) // his ruling, kept
    expect(hasDoor(html)).toBe(true) // the bug: this used to be a plain <div>
  })

  it('a fresh campaign has no stars at all and still has the door', () => {
    const html = map(progress())
    expect(hasNotice(html)).toBe(false)
    expect(hasDoor(html)).toBe(true)
  })

  it('the notice comes back the moment a star can be placed, and the door never moves', () => {
    const p = progress({ stars: [3, ...Array.from({ length: ROUNDS - 1 }, () => 0)] })
    const html = map(p)
    expect(hasNotice(html)).toBe(true)
    expect(html).toContain('to spend')
    expect(hasDoor(html)).toBe(true)
  })

  it('the notice still stays off a branch this mode does not sell', () => {
    // every always-sold branch maxed, stars in hand: only the Salary node is left to buy
    let p = progress({ stars: Array.from({ length: ROUNDS }, () => 3) })
    for (const n of NODES) if (NODE[n.id].branch !== 'Salary' && NODE[n.id].branch !== 'Survival') for (let r = 0; r < n.ranks; r++) p = buy(p, n.id)!
    expect(canBuy(p, 'cap')).toBe(true)
    expect(hasNotice(map(p))).toBe(false) // plain campaign does not sell payroll room
    expect(hasNotice(map(p, { salary: true }))).toBe(true)
    expect(hasDoor(map(p))).toBe(true) // and the door is there either way
  })
})

/**
 * THE SNAKE (his ruling: "instead of only going up, make it go like a snake to fill the screen").
 * The trail is a boustrophedon now: a row of levels left to right, a U-turn at the wall, the next
 * row right to left, climbing. Three claims are worth holding down, and all three are arithmetic
 * rather than something to check on a screenshot.
 *
 * One: the width decides how many stand in a row, so a wider window is a shorter map — that is the
 * whole point of the change. Two: consecutive levels are NEIGHBOURS — one lane apart along a row,
 * or directly above each other at a turn — so the trail never jumps the screen. Three: the turn is
 * vertical, which is what makes it read as a U-turn rather than a kink.
 *
 * And the fourth, from his ruling "a snake going slightly up, not rows on rows": EVERY level is
 * higher than the one before it. A row is not a shelf — it climbs as it runs, at a few degrees off
 * level — so the whole trail gains height rather than standing still between lifts.
 */
describe('the trail snakes across whatever width it is given', () => {
  it('a wider window puts more levels in a row and fewer rows on the screen', () => {
    expect(perRow(375)).toBe(2) // a phone still snakes, two at a time
    expect(perRow(900)).toBeGreaterThan(perRow(375))
    expect(perRow(1900)).toBeGreaterThan(perRow(900))
    // and the scroll shrinks with it: the old climbing column was ~25,000px for 150 levels
    expect(heightOf(1900)).toBeLessThan(heightOf(900))
    expect(heightOf(1900)).toBeLessThan(9000)
    expect(rowsOf(1900) * perRow(1900)).toBeGreaterThanOrEqual(ROUNDS)
  })

  /**
   * HIS RULING: "Make the stages cut in 30, 60, 90, 120 — 31 and 30 can't be the same line as the
   * design is different." The floor changes at a ROW boundary (a horizontal line cannot cross a
   * row of tickets standing side by side), so the only way a block of thirty can have a floor of
   * its own is for a row never to straddle one. That is a property of how many levels stand in a
   * row, not of the seam, which is why it is tested here.
   */
  it('a row never straddles a block of thirty, at any width', () => {
    for (let colW = 320; colW <= 2600; colW += 17) {
      const cols = perRow(colW)
      expect(30 % cols, `${cols} to a row at ${colW}px puts level 30 and level 31 on the same line`).toBe(0)
      // and every block is a whole number of rows, so the ladder has no part-row at its head either
      expect(ROUNDS % cols).toBe(0)
    }
  })

  it('and so every block begins on a row of its own', () => {
    for (const colW of [375, 562, 900, 1438, 1900]) {
      const cols = perRow(colW)
      for (const first of [1, 31, 61, 91, 121]) {
        expect((first - 1) % cols, `level ${first} must start a row at ${colW}px`).toBe(0)
      }
    }
  })

  it('every level stands inside the width it was handed', () => {
    for (const colW of [375, 562, 900, 1438, 1900]) {
      const x = xOf(colW)
      for (let i = 0; i < ROUNDS; i++) {
        expect(x(i)).toBeGreaterThanOrEqual(0)
        expect(x(i)).toBeLessThanOrEqual(colW)
      }
    }
  })

  it('neighbours are always one lane apart, or all but above each other at a turn', () => {
    for (const colW of [375, 900, 1438, 1900]) {
      const x = xOf(colW)
      const y = yOf(colW)
      const cols = perRow(colW)
      // the lane, with the wander taken back out of it — every level is nudged off its lane by up
      // to WOBBLE, so no two gaps are exactly equal and there is nothing exact to compare to
      const lane = Math.abs(x(1) - x(0))
      for (let i = 0; i < ROUNDS - 1; i++) {
        const dx = Math.abs(x(i + 1) - x(i))
        const dy = Math.abs(y(i + 1) - y(i))
        if ((i + 1) % cols === 0) {
          // the turn: the same column, one row up, give or take the wander on either ticket
          expect(dx).toBeLessThanOrEqual(2 * WOBBLE + 0.01)
          expect(dy).toBeGreaterThan(100)
        } else {
          expect(Math.abs(dx - lane)).toBeLessThanOrEqual(4 * WOBBLE + 0.01)
          // along a row the climb is the row's own tilt, never a whole row's worth
          expect(dy).toBeLessThan(200)
        }
      }
    }
  })

  it('and it climbs: level 1 is at the foot, the last level at the head', () => {
    for (const colW of [375, 1438]) {
      const y = yOf(colW)
      expect(y(0)).toBeGreaterThan(y(ROUNDS - 1))
      expect(y(0)).toBeLessThanOrEqual(heightOf(colW))
      expect(y(ROUNDS - 1)).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * HIS RULING: "a snake going slightly up, not rows on rows." The rows used to be level, which
   * made the map a stack of shelves with a lift at each end — every level in a row stood at exactly
   * the same height. A row climbs across its own length now, so this is the claim to hold down:
   * there is no step anywhere on the ladder that does not gain height, at either wall or in between.
   */
  it('no level anywhere on the ladder stands level with the one before it', () => {
    for (const colW of [375, 562, 900, 1438, 1900]) {
      const y = yOf(colW)
      for (let i = 0; i < ROUNDS - 1; i++) {
        expect(y(i + 1), `level ${i + 2} must stand above level ${i + 1} at ${colW}px`).toBeLessThan(y(i))
      }
    }
  })

  it('and the climb along a row is a slight one — the same slight one at every width', () => {
    // the tilt is stated as an angle, not a rise: a fixed rise is gentle across a desk's ten-ticket
    // row and a staircase across a phone's two, and his ruling was about what the eye reads
    for (const colW of [375, 562, 900, 1438, 1900]) {
      const x = xOf(colW)
      const y = yOf(colW)
      const cols = perRow(colW)
      // the tilt of a whole row, end to end, in degrees off level
      const deg = (Math.atan2(y(0) - y(cols - 1), Math.abs(x(cols - 1) - x(0))) * 180) / Math.PI
      expect(deg).toBeCloseTo(6.8, 0)
    }
  })
})

/**
 * THE FOUR SKINS, in the order his ruling on Campaign Map.dc.html puts them for SCOUT MODE ("For
 * levels 61-90, I want it to be the banner hall. For levels 121-150, I want it to be the Twilight
 * Dynasty" — and "all these changes are for scout mode only"): 1b ARENA NIGHTS 1-30, 1c HARDWOOD
 * PRIME 31-60, 2b BANNER HALL 61-120, 2a TWILIGHT DYNASTY 121 to the top — and, since his ruling
 * of 2026-09-08, for user mode too.
 *
 * He named two of the five blocks. 31-60 comes from the design doc's own plan line; 91-120 is the
 * block the doc has no board for, so it carries 61-90 on — the same rule his earlier ruling set
 * for the top tier, one block further down now that the top has a board of its own.
 *
 * ONE ORDER, BOTH MODES (his ruling, 2026-09-08: "Make user mode same as scout"). There used to be
 * a second list for the mode that plays blind; `skinAt` no longer reads the view mode at all, and
 * the last case below is what says so.
 *
 * The block edges are WRITTEN as levels rather than derived from the tiers, because they no longer
 * agree: the design draws five blocks of thirty and The Champions alone runs 31-90, so the 61 seam
 * is inside a tier. That is exactly why it is tested — if a tier is resized in scripts/campaigns.ts
 * this is what says so.
 */
describe('the map wears four skins over five blocks of thirty', () => {
  const first = (t: number) => CAMPAIGNS.slice(0, t).reduce((a, c) => a + c.levels.length, 0) + 1
  const runsOf = () => {
    const runs: { skin: string; from: number; to: number }[] = []
    for (let l = 1; l <= ROUNDS; l++) {
      const skin = skinAt(l)
      const last = runs[runs.length - 1]
      if (last && last.skin === skin) last.to = l
      else runs.push({ skin, from: l, to: l })
    }
    return runs
  }

  it('every level from 1 to the top of the ladder has a skin, and they change only at the blocks', () => {
    expect(runsOf()).toEqual([
      { skin: 'arena', from: 1, to: 30 },
      { skin: 'hall', from: 31, to: 90 },
      { skin: 'wood', from: 91, to: 120 },
      { skin: 'dusk', from: 121, to: ROUNDS },
    ])
  })

  it('every block has a board of its own — nothing is carried on and nothing repeats', () => {
    const skins = [skinAt(1), skinAt(31), skinAt(91), skinAt(121)]
    expect(new Set(skins).size).toBe(4)
    // the swap: hardwood is 91-120's alone, and the hall runs 31-90 in one piece
    expect(skinAt(90)).toBe('hall')
    expect(skinAt(91)).toBe('wood')
    expect(skinAt(120)).toBe('wood')
  })

  it('the two blocks he named are the two he named', () => {
    expect(skinAt(61)).toBe('hall')
    expect(skinAt(90)).toBe('hall')
    expect(skinAt(121)).toBe('dusk')
    expect(skinAt(ROUNDS)).toBe('dusk')
  })

  it('the seams that CAN follow the tiers still do — 31 and 121 are tier boundaries', () => {
    expect(first(1)).toBe(31) // The League ends, The Champions begin: arena -> hall
    expect(first(3)).toBe(121) // The Customs begin: wood -> dusk, and here the two agree
    expect(skinAt(first(1) - 1)).toBe('arena')
    expect(skinAt(first(1))).toBe('hall')
    expect(skinAt(first(3) - 1)).toBe('wood')
    expect(skinAt(first(3))).toBe('dusk')
  })

  it('and the one that CANNOT is inside a tier, which is why it is written and not derived', () => {
    // The Champions runs 31-90 in one piece; the 61 seam splits it, so nothing derives it
    const champions = CAMPAIGNS[1]
    expect(champions.levels.length).toBe(60)
    expect(first(1)).toBeLessThan(61)
    expect(first(2)).toBe(91)
    // 31-90 is one room now, so the 61 seam no longer changes the floor — the block that DOES
    // fall inside a tier is 91, and that is the one nothing can derive
    expect(skinAt(60)).toBe('hall')
    expect(skinAt(61)).toBe('hall')
    expect(skinAt(90)).toBe('hall')
    expect(skinAt(91)).toBe('wood')
  })

  it('user mode reads the SAME ladder — one order, both modes', () => {
    const scout = runsOf()
    setUserMode(true)
    try {
      expect(runsOf()).toEqual(scout)
      // and it is the dealt order, not merely equal to whatever scout happens to hold
      expect(runsOf()).toEqual([
        { skin: 'arena', from: 1, to: 30 },
        { skin: 'hall', from: 31, to: 90 },
        { skin: 'wood', from: 91, to: 120 },
        { skin: 'dusk', from: 121, to: ROUNDS },
      ])
    } finally {
      setUserMode(false)
    }
  })
})

/**
 * THE TROPHY (his ruling, 2026-09-08: "Add a trophy for EVERY mode at 150 wins(An actual golden
 * trophy at the end)").
 *
 * There used to be TWO of them, split by view mode: a `map-trophy` strip across the header in user
 * mode, and a `map-crown` monument at the head of the trail in scout mode. His ruling collapses
 * that split in both directions at once — at the END, and in EVERY mode — so the monument stands
 * in both view modes and in all three campaigns, and the header strip is gone. These cases hold
 * down the rule that replaced the split.
 */
describe('the trophy stands at the end of the ladder, in every mode', () => {
  const hasCrown = (html: string) => html.includes('class="map-crown')
  const isWon = (html: string) => /class="map-crown [a-z]+ won"/.test(html)
  const hasHeaderStrip = (html: string) => html.includes('map-trophy')

  it('a finished ladder is crowned in scout mode and in user mode alike', () => {
    for (const html of [map(won()), userMap(won())]) {
      expect(hasCrown(html)).toBe(true)
      expect(isWon(html)).toBe(true)
      expect(html).toContain('Champion of the ladder')
    }
  })

  it('and in every campaign the map serves — the ladder, the cap and the death match', () => {
    for (const mode of [{}, { salary: true }, { death: true }]) {
      expect(hasCrown(map(won(), mode)), `scout ${JSON.stringify(mode)}`).toBe(true)
      expect(hasCrown(userMap(won(), mode)), `user ${JSON.stringify(mode)}`).toBe(true)
    }
  })

  /** It is up the whole climb, not only at the top of it: a prize you cannot see is not one. */
  it('an unfinished ladder still has it, standing dim, in both modes', () => {
    const mid = progress({ stars: Array.from({ length: ROUNDS }, (_, i) => (i < 77 ? 2 : 0)) })
    for (const html of [map(mid), userMap(mid)]) {
      expect(hasCrown(html)).toBe(true)
      expect(isWon(html)).toBe(false)
      expect(html).toContain('The end of the ladder')
      expect(html).toContain(`77 of ${ROUNDS} cleared`)
    }
  })

  it('and the header says it once, not twice — the strip that stood there is gone', () => {
    for (const html of [map(won()), userMap(won()), map(progress()), userMap(progress())]) {
      expect(hasHeaderStrip(html)).toBe(false)
    }
  })
})

/**
 * AUTO-COMPLETE IS SCOUT'S ALONE (his ruling, 2026-09-08: "Remove auto complete from all user mode
 * campaigns"). The door borrows the ladder — every level marked cleared at one star so the upper
 * blocks can be walked, the real stars put back when it is switched off — which is a way of
 * LOOKING at the design rather than a way of playing a campaign.
 */
describe('the auto door belongs to scout mode', () => {
  const hasAuto = (html: string) => html.includes('um-era auto')

  it('scout mode still has it, in every campaign', () => {
    for (const mode of [{}, { salary: true }, { death: true }]) {
      expect(hasAuto(map(progress(), { ...mode, onToggleAuto: () => {} }))).toBe(true)
    }
  })

  it('user mode has no auto door in any campaign', () => {
    for (const mode of [{}, { salary: true }, { death: true }]) {
      expect(hasAuto(userMap(progress(), { ...mode, onToggleAuto: () => {} }))).toBe(false)
    }
  })

  it('and the era chips beside it are untouched — only the last chip goes', () => {
    const html = userMap(progress(), { onToggleAuto: () => {} })
    expect(html).toContain('um-era')
    expect(hasAuto(html)).toBe(false)
  })
})

/**
 * THE HEADER RUNS ACROSS (his ruling, 2026-09-08: "Make the campaign header ... smaller, and
 * instead of it being one on top of another, make it one by another"). The shape of it is CSS's,
 * but what the shape may not do is lose a control: the counter is the only door to the staff tree
 * when nothing is affordable, and Reset, rename and My team have no other door on this screen.
 */
describe('laying the header across drops none of its doors', () => {
  it('every control his ruling names is still in the markup, in one row', () => {
    const p = progress({ stars: [3, ...Array.from({ length: ROUNDS - 1 }, () => 0)], roster: ['a', 'b', 'c', 'd', 'e'] })
    const html = map(p, { death: true, onMyTeam: () => {} })
    expect(html).toContain('class="map-head across"')
    expect(html).toContain('class="map-doors"')
    expect(hasDoor(html)).toBe(true) // ★ 3 / 450 →
    expect(hasNotice(html)).toBe(true) // ★ 3 to spend · Staff →
    expect(html).toContain('class="map-link team"') // Zhengzhou GA · rename
    expect(html).toContain('My team') // the death match's own door
    expect(html).toContain('Reset this campaign')
    // and the reading line carries both kickers his ruling lists, joined rather than stacked
    expect(html).toContain('class="map-read"')
    expect(html).toContain('Level 2 is up')
    expect(html).toContain(`1 of ${ROUNDS} cleared`)
  })

  it('user mode keeps its own staff and rename buttons, so the header still reaches everything', () => {
    const html = userMap(progress(), { death: true })
    expect(html).toContain('class="map-head across"')
    expect(hasDoor(html)).toBe(true)
    expect(html).toContain('um-staff') // the bundle's own staff door
    expect(html).toContain('um-rename')
    expect(html).toContain('Reset this campaign')
  })
})

/**
 * THE FOOT OF THE MAP (his ruling, 2026-09-08: "Delete everything below the league 2026 in both
 * modes"). Three of the four era rules are drawn on a SEAM — the line between two rows, which the
 * floor also changes at — and those three must not move. The fourth, era I, has no seam under it:
 * it begins in the bottom row, so its own `seam()` falls past the end of the trail. It used to be
 * clamped to `heightOf - 34` and then pulled up half its own height by a transform, which left
 * ~24px of arena floor showing under the rule at every width. It is pinned to the end of the trail
 * now, by `.era-band.foot`, so nothing at all stands under "Era I · The League · 2026".
 *
 * The placement is read off the MARKUP rather than a screenshot: a band that carries an inline
 * `top` is drawn on its seam, and the band that carries none is the one the stylesheet pins.
 */
describe('the bottom era stands on the foot of the trail, and the rest on their seams', () => {
  const FOUR: typeof eras = [
    { name: 'The League', years: [2026, 2026], first: 1 },
    { name: 'The Champions', years: [1980, 2025], first: 31 },
    { name: 'All-Time', years: [1980, 2026], first: 91 },
    { name: 'The Customs', years: [1980, 2026], first: 121 },
  ]
  /** Every era band in the markup: its classes, and the inline top it was given (null for none). */
  const bandsOf = (html: string) =>
    [...html.matchAll(/<div class="era-band ([^"]*)"(?: style="top:([\d.]+)px")?>/g)].map((m) => ({
      cls: m[1],
      top: m[2] === undefined ? null : Number(m[2]),
    }))
  const both = [map, userMap]

  it('era I carries the foot class and no top of its own — the stylesheet puts it on the end', () => {
    for (const draw of both) {
      const bands = bandsOf(draw(progress(), { eras: FOUR }))
      expect(bands).toHaveLength(4)
      expect(bands[0].cls).toContain('foot')
      expect(bands[0].top).toBeNull()
    }
  })

  it('and the other three sit exactly on their seams, which is where the floor changes', () => {
    // 375 is the width a server render is laid out at — the phone geometry the map falls back to
    const seam = seamOf(375)
    for (const draw of both) {
      const bands = bandsOf(draw(progress(), { eras: FOUR }))
      for (const [i, first] of [31, 91, 121].entries()) {
        expect(bands[i + 1].cls, `era ${i + 2} must not be pinned to the foot`).not.toContain('foot')
        expect(bands[i + 1].top).toBeCloseTo(seam(first), 3)
        expect(bands[i + 1].top!).toBeLessThan(heightOf(375)) // and inside the trail it is drawn on
      }
    }
  })

  /** The clamp that left the gap: era I centred on `heightOf - 34`, half of it hanging below. */
  it('and nothing is drawn on the old clamp line any more', () => {
    for (const draw of both) {
      for (const b of bandsOf(draw(progress(), { eras: FOUR }))) expect(b.top).not.toBeCloseTo(heightOf(375) - 34, 3)
    }
  })

  /** Pinned to the foot, but WHOLE: the rule still says which era, which name and which years. */
  it('the band pinned to the foot still carries all three of its parts', () => {
    for (const draw of both) {
      const html = draw(progress(), { eras: FOUR })
      const band = html.slice(html.indexOf('<div class="era-band'))
      expect(band).toMatch(/^<div class="era-band arena foot"><em>Era I<\/em><b>The League<\/b><i>2026<\/i><\/div>/)
    }
  })
})

/**
 * THE MAP MAY NOT BE DRAGGED SIDEWAYS (his report: "the map scrolls sideways on a phone").
 *
 * A ticket is centred on its own x, so one standing in the right-hand lane hangs half its width
 * past that x — and tonight's banner hangs a spotlight off the same point (.node.hall.now::before,
 * 190px across and swelled to 1.14 of that at the top of its pulse). On a 375px phone that light
 * fell some sixty pixels past the wall, and nothing on this screen bounded the map to the window,
 * so the whole ladder could be dragged over to look at it: 434px of content in a 375px window.
 * Mid-ladder in scout mode is the state the game is in almost all the time, so that was the map
 * almost all the time — and he plays on a phone.
 *
 * Two claims hold it down. The arithmetic one is WHY the fix could not be a clamp on a ticket: the
 * light falls so far past the lane that pulling it inside would mean moving the ladder, and the
 * ladder's geometry is ruled on. The contract one is the fix itself: the trail stands in a room,
 * and that room's walls are the page's own gutter — exactly where the floor bands already stop —
 * so the wall cuts what was never on the screen and moves nothing that was.
 */
describe('the ladder cannot be dragged sideways', () => {
  const CSS = readFileSync('src/styles.css', 'utf8')
  /** The page's gutter, and so the trail's own box on a 375px phone. */
  const GUTTER = 14
  const PHONE = 375 - GUTTER * 2
  /** One rule's block, by selector — the stylesheet is the only place these numbers live. */
  const rule = (selector: string) => {
    const at = CSS.indexOf(selector + ' {')
    expect(at, `${selector} must be in the stylesheet`).toBeGreaterThan(-1)
    return CSS.slice(at, CSS.indexOf('}', at))
  }

  it("tonight's spotlight falls past the wall, and no clamp on a ticket could have pulled it in", () => {
    const halo = Number(/width:\s*(\d+)px/.exec(rule('.node.hall.now::before'))![1])
    expect(halo).toBe(190)
    // level 78 — where a mid-ladder save stands, in the right-hand lane of a two-a-row phone
    const x = xOf(PHONE)(77)
    expect(x).toBeGreaterThan(PHONE / 2)
    const reach = x + (halo / 2) * 1.14 // embHalo swells it to 1.14 at the top of its pulse
    // past the screen's own edge, not merely past the trail: the gutter cannot absorb it either
    expect(reach).toBeGreaterThan(PHONE + GUTTER)
    // and it is not a rounding matter — containing it by arithmetic would mean moving the ladder
    expect(reach - (PHONE + GUTTER)).toBeGreaterThan(40)
  })

  it('so the trail stands in a room of its own, in both modes and at every point on the ladder', () => {
    const mid = progress({ stars: Array.from({ length: ROUNDS }, (_, i) => (i < 77 ? 2 : 0)) })
    for (const html of [map(mid), userMap(mid), map(progress()), userMap(progress()), map(won()), userMap(won())]) {
      expect(html).toMatch(/<div class="trail-room"><div class="trail/)
    }
  })

  it('and that room is walled exactly where the floor stops — the same gutter on a phone and on a desk', () => {
    const room = rule('.trail-room')
    // clip, not hidden: the map takes no scroll container of its own, so the header still sticks
    expect(room).toMatch(/overflow-x:\s*clip/)
    expect(room).toMatch(new RegExp(`margin:\\s*0 -${GUTTER}px`))
    expect(room).toMatch(new RegExp(`padding:\\s*0 ${GUTTER}px`))
    // the floor bleeds by that same gutter, which is what makes the wall invisible
    expect(rule('.ground')).toMatch(new RegExp(`left:\\s*-${GUTTER}px`))
    // ...and the desk restates the two together: 21px of gutter, 21px of bleed, one wall
    const desk = CSS.slice(CSS.indexOf('@media (min-width: 900px) { .ground'), CSS.indexOf('@media (min-width: 900px) { .ground') + 400)
    expect(desk).toMatch(/\.ground \{ left: -21px; right: -21px; \}/)
    expect(desk).toMatch(/\.trail-room \{ margin: 0 -21px; padding: 0 21px; \}/)
  })
})
