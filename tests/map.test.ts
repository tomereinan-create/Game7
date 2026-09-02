import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { ROUNDS } from '../src/config'
import { balance, buy, canBuy, NODE, NODES, type NodeId } from '../src/engine/tree'
import type { Opponent } from '../src/engine/types'
import { DEFAULT_TACTICS } from '../src/engine/tactics'
import type { Progress } from '../src/state/campaign'
import { LevelMap } from '../src/ui/LevelMap'

const opponents = OPP as Opponent[]
const eras = [{ name: 'Modern', years: [2016, 2024] as [number, number], handicap: 0, first: 1 }]

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
