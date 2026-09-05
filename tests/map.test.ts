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
import { LevelMap, skinAt, windOf, xOf } from '../src/ui/LevelMap'

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
 * THE DESK MAP (his ruling: "Widen it, needs to be full screen"). The trail is drawn in a 375-wide
 * space stretched to whatever column it is handed, so its amplitude is ALWAYS 34% of that width —
 * widening the map widens the swing for free. What does not come for free is the angle: held at
 * the 7-level period it wound at on a phone, a swing four times as wide over the same 170px step
 * would lay the trail down into a near-horizontal zigzag. So the period stretches with the width
 * and the horizontal travel per level stays put. That is the whole claim, and it is arithmetic, so
 * it is tested here rather than by looking at a screenshot.
 */
describe('the trail keeps its angle at any width', () => {
  const STEP = 170
  /** The widest gap between two neighbouring levels, in px, on a column this wide. */
  const travel = (colW: number) => {
    const x = xOf(colW)
    let worst = 0
    for (let i = 0; i < 60; i++) worst = Math.max(worst, (Math.abs(x(i + 1) - x(i)) * colW) / 375)
    return worst
  }

  it('winds every 7 levels on a phone, and slower the wider the column gets', () => {
    expect(windOf(347)).toBe(7)
    expect(windOf(375)).toBe(7)
    expect(windOf(1438)).toBeCloseTo(26.84, 1)
    // never tighter than the phone's 7, however narrow the box is measured
    expect(windOf(0)).toBe(7)
    expect(windOf(120)).toBe(7)
  })

  it('the swing still fills the column — the amplitude is 34% of it at every width', () => {
    for (const colW of [375, 562, 1438]) {
      const x = xOf(colW)
      const xs = Array.from({ length: 200 }, (_, i) => x(i))
      const spread = (Math.max(...xs) - Math.min(...xs)) / 375
      expect(spread).toBeGreaterThan(0.66)
      expect(spread).toBeLessThanOrEqual(0.68)
    }
  })

  it('and the step between neighbours stays the angle it was drawn at, not a flat zigzag', () => {
    const phone = travel(375)
    for (const colW of [562, 900, 1438, 1900]) {
      // within a couple of pixels of the phone's own travel, so the slope never lies down
      expect(Math.abs(travel(colW) - phone)).toBeLessThan(24)
      // and stated as an angle off vertical: the trail was drawn at ~30 degrees and stays there
      expect((Math.atan2(travel(colW), STEP) * 180) / Math.PI).toBeLessThan(38)
    }
    // the bug this guards: a fixed 7-level wind on a desk column lays the trail nearly flat
    const flat = (i: number) => 375 / 2 + 0.34 * 375 * Math.sin((i * 2 * Math.PI) / 7)
    let flatTravel = 0
    for (let i = 0; i < 60; i++) flatTravel = Math.max(flatTravel, (Math.abs(flat(i + 1) - flat(i)) * 1438) / 375)
    expect((Math.atan2(flatTravel, STEP) * 180) / Math.PI).toBeGreaterThan(60)
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
