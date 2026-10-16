import { describe, expect, it } from 'vitest'
import { POSITIONS } from '../src/engine/positions'
import { WHEEL } from '../src/ui/Draft'
import { legalRingsFor, loadCheck, onClock, replay, versusPool, type VsMove } from '../src/ui/Versus'

/**
 * ONLINE FRIENDS (2026-10-16): two phones share one Player vs Friend table by sharing its MOVE LOG,
 * and each phone replays the log through `replay`. So `replay` has to be the hot seat's law,
 * exactly — and it has to refuse a bad move the same way on both phones, or they drift apart.
 */
const seeds = Array.from({ length: 60 }, (_, i) => (i * 2654435761 + 7) >>> 0)

/** A whole draft as moves, always the first legal man in his first legal ring. */
function draftMoves(seed: number): VsMove[] {
  const pool = versusPool(seed)
  const moves: VsMove[] = []
  for (let k = 0; k < 10; k++) {
    const t = replay(pool, moves)
    const who = onClock(t.slots, t.loaded)
    const taken = new Set(POSITIONS.flatMap((x) => [t.slots[0][x], t.slots[1][x]]).filter(Boolean))
    const remaining = pool.filter((p) => !taken.has(p.name))
    const pick = remaining.map((p) => ({ p, rings: legalRingsFor(t.slots, t.loaded, who, remaining, p.name) })).find((c) => c.rings.length)
    if (!pick) throw new Error(`seed ${seed}: stuck at pick ${k}`)
    moves.push({ k: 'pick', side: who, name: pick.p.name, ring: pick.rings[0] })
  }
  return moves
}

describe('the move log is the table', () => {
  it('a full draft replays to two full fives, and a sim only counts once both are full', () => {
    for (const s of seeds) {
      const pool = versusPool(s)
      const moves = draftMoves(s)
      expect(replay(pool, [...moves.slice(0, 9), { k: 'sim', seed: 1 }]).simSeed, `seed ${s}: sim before the last pick`).toBeNull()
      const t = replay(pool, [...moves, { k: 'sim', seed: 42 }])
      expect(POSITIONS.every((x) => t.slots[0][x] && t.slots[1][x])).toBe(true)
      expect(t.simSeed).toBe(42)
      expect(t.order.map((o) => o.side)).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 1])
    }
  })

  it('a move out of turn, a man already taken, or a ring he cannot play is skipped', () => {
    const pool = versusPool(seeds[0])
    const [first, second] = draftMoves(seeds[0]) as Extract<VsMove, { k: 'pick' }>[]
    const before = replay(pool, [first])
    // out of turn: side 0 again on side 1's clock
    expect(replay(pool, [first, { ...second, side: 0 }])).toEqual(before)
    // the same man twice
    expect(replay(pool, [first, { ...first, side: 1 }])).toEqual(before)
    // a man not on this board
    expect(replay(pool, [first, { ...second, name: 'Nobody At All' }])).toEqual(before)
    // a ring he does not play
    const wrong = POSITIONS.find((r) => !legalRingsFor(before.slots, before.loaded, 1, pool.filter((p) => p.name !== first.name), second.name).includes(r))!
    expect(replay(pool, [first, { ...second, ring: wrong }])).toEqual(before)
  })

  it('a take-back removes the last drafted pick and hands the clock back', () => {
    const pool = versusPool(seeds[1])
    const moves = draftMoves(seeds[1])
    const three = replay(pool, moves.slice(0, 3))
    expect(replay(pool, [...moves.slice(0, 4), { k: 'undo' }])).toEqual(three)
    expect(replay(pool, [{ k: 'undo' }])).toEqual(replay(pool, []))
  })

  it('a loaded real team takes the side whole, off the clock, under its club name', () => {
    for (const s of seeds.slice(0, 20)) {
      const pool = versusPool(s)
      const empty = replay(pool, [])
      const t = WHEEL.find((w) => loadCheck(pool, empty.slots, empty.loaded, w, 1).ok)!
      const out = replay(pool, [{ k: 'load', side: 1, team: t.team, y: t.y }])
      expect(out.loaded).toEqual([false, true])
      expect(POSITIONS.every((x) => out.slots[1][x])).toBe(true)
      expect(out.teams[1]).toBe(`'${String(t.y).slice(2)} ${t.team.split(' ').pop()}`)
      // the snake collapses to the side still drafting
      expect(onClock(out.slots, out.loaded)).toBe(0)
    }
  })
})
