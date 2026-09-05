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
import { heightOf, LevelMap, perRow, rowsOf, skinAt, xOf, yOf } from '../src/ui/LevelMap'

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

const map = (p: Progress, mode: { salary?: boolean; death?: boolean } = {}) =>
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
 */
describe('the trail snakes across whatever width it is given', () => {
  it('a wider window puts more levels in a row and fewer rows on the screen', () => {
    expect(perRow(375)).toBe(2) // a phone still snakes, two at a time
    expect(perRow(900)).toBeGreaterThan(perRow(375))
    expect(perRow(1900)).toBeGreaterThan(perRow(900))
    // and the scroll shrinks with it: the old climbing column was ~25,000px for 150 levels
    expect(heightOf(1900)).toBeLessThan(heightOf(900))
    expect(heightOf(1900)).toBeLessThan(6000)
    expect(rowsOf(1900) * perRow(1900)).toBeGreaterThanOrEqual(ROUNDS)
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

  it('neighbours are always one lane apart, or straight above each other at a turn', () => {
    for (const colW of [375, 900, 1438, 1900]) {
      const x = xOf(colW)
      const y = yOf(colW)
      const cols = perRow(colW)
      const lane = Math.abs(x(1) - x(0))
      for (let i = 0; i < ROUNDS - 1; i++) {
        const dx = Math.abs(x(i + 1) - x(i))
        const dy = Math.abs(y(i + 1) - y(i))
        if ((i + 1) % cols === 0) {
          // the turn: same column, one row up
          expect(dx).toBeLessThan(0.01)
          expect(dy).toBeGreaterThan(100)
        } else {
          expect(dx).toBeCloseTo(lane, 6)
          // along a row the climb is only the row's own bow, never a whole row
          expect(dy).toBeLessThan(60)
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
})

/**
 * THE FOUR SKINS, off the Campaign Map design board (his ruling: "Use 2b for 61-90, and 2a for
 * 91-120", and for the tier above it, "carry the 91-120 skin on"): 1b ARENA NIGHTS 1-30, 1c
 * HARDWOOD PRIME 31-60, 2b BANNER HALL 61-90, 2a TWILIGHT DYNASTY 91 to the top.
 *
 * The block edges are WRITTEN as levels rather than derived from the tiers, because they no longer
 * agree: the design draws five blocks of thirty and The Champions alone runs 31-90, so the 61 seam
 * is inside a tier. That is exactly why it is tested. Two of the three seams should still land on a
 * tier boundary, and if a tier is ever resized in scripts/campaigns.ts this is what says so.
 */
describe('the map wears four skins, one per block of thirty', () => {
  const first = (t: number) => CAMPAIGNS.slice(0, t).reduce((a, c) => a + c.levels.length, 0) + 1

  it('every level from 1 to the top of the ladder has a skin, and they change only at the blocks', () => {
    const runs: { skin: string; from: number; to: number }[] = []
    for (let l = 1; l <= ROUNDS; l++) {
      const skin = skinAt(l)
      const last = runs[runs.length - 1]
      if (last && last.skin === skin) last.to = l
      else runs.push({ skin, from: l, to: l })
    }
    expect(runs).toEqual([
      { skin: 'arena', from: 1, to: 30 },
      { skin: 'wood', from: 31, to: 60 },
      { skin: 'hall', from: 61, to: 90 },
      { skin: 'dusk', from: 91, to: ROUNDS },
    ])
  })

  it('the top tier carries the 91-120 skin on rather than falling back to one already passed', () => {
    // The Customs has no board of its own in the design; it must not look like an earlier block
    expect(skinAt(first(3))).toBe('dusk')
    expect(skinAt(ROUNDS)).toBe('dusk')
  })

  it('the seams that CAN follow the tiers still do — 31 and 91 are tier boundaries', () => {
    expect(first(1)).toBe(31) // The League ends, The Champions begin: arena -> wood
    expect(first(3)).toBe(121) // The Customs begin inside the dusk block, by his ruling
    expect(skinAt(first(1) - 1)).toBe('arena')
    expect(skinAt(first(1))).toBe('wood')
    expect(skinAt(first(2) - 1)).toBe('hall')
    expect(skinAt(first(2))).toBe('dusk') // All-Time begins at 91: hall -> dusk
  })

  it('and the one that CANNOT is inside a tier, which is why it is written and not derived', () => {
    // The Champions runs 31-90 in one piece; the 61 seam splits it, so nothing derives it
    const champions = CAMPAIGNS[1]
    expect(champions.levels.length).toBe(60)
    expect(first(1)).toBeLessThan(61)
    expect(first(2)).toBeGreaterThan(61)
    expect(skinAt(60)).toBe('wood')
    expect(skinAt(61)).toBe('hall')
  })
})
