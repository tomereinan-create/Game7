import { describe, expect, it } from 'vitest'
import { migrate, NODE, NODES, NODE_PRICE } from '../src/engine/tree'

/** His report, 2026-10-22: "Matchup reads ... costs 2 stars for no effect, and you have to buy it to reach Sight seeing." */
describe('the Scout branch has no dead node', () => {
  it('Matchup reads is gone and Sight seeing hangs off Exact ratings', () => {
    expect(NODES.map((n) => n.id)).not.toContain('scout_reads')
    expect(NODE.scout_wheel.requires).toBe('scout_ratings')
    expect(NODE.scout_wheel.depth).toBe(1)
  })

  it('a save that owned Matchup reads gets its stars back on load', () => {
    const old = { spent: 6 * NODE_PRICE, nodes: { scout_ratings: 3, scout_reads: 2, scout_wheel: 1 } as Record<string, number> }
    const w = migrate(old as never) as { spent: number; nodes: Record<string, number> }
    expect(w.nodes).toEqual({ scout_ratings: 3, scout_wheel: 1 })
    expect(w.spent).toBe(4 * NODE_PRICE)
  })
})
