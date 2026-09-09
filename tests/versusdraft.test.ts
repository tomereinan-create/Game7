import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { POSITIONS, type Pos } from '../src/engine/positions'
import { canStillFill, type Slots } from '../src/engine/slots'
import { posOf } from '../src/ui/Draft'
import { demandMinus, legalRingsFor, versusPool } from '../src/ui/Versus'
import type { Player } from '../src/engine/types'

/**
 * G10 (2026-09-10), his ruling: VS FRIEND has a position constraint. Before this the mode modelled
 * a side as a flat list of five names, so there was nothing to constrain against and 69% of
 * finished boards were not position-legal at all.
 *
 * A constraint is only half the job. The board is TWELVE shared cards feeding TEN rings, so a pick
 * that is legal on its own can strand the other drafter — which is why every legal ring is also
 * checked against whether the rest of the board can still be fielded. These tests drive the real
 * exported rules to exhaustion, because the failure this guards against is a soft-lock that only
 * appears several picks deep.
 */
const ORDER: (0 | 1)[] = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]
const seeds = Array.from({ length: 400 }, (_, i) => (i * 2654435761) >>> 0)

describe('the hot seat can always field two legal fives', () => {
  it('every generated board can fill ten rings before a card is touched', () => {
    let worst = 0
    for (const s of seeds) {
      const board = versusPool(s)
      expect(board.length, `seed ${s}`).toBe(12)
      const ok = canStillFill(board.map((p) => p.name), posOf, [...POSITIONS, ...POSITIONS])
      expect(ok, `seed ${s} cannot field two fives`).toBe(true)
      worst = Math.max(worst, board.length)
    }
    expect(worst).toBe(12)
  })

  /** Drive a whole draft, always taking the first legal ring of the first legal man. */
  const playOut = (board: Player[], pick: (cands: { p: Player; rings: Pos[] }[], turn: number) => number) => {
    const slots: [Slots, Slots] = [{}, {}]
    const loaded: [boolean, boolean] = [false, false]
    for (let turn = 0; turn < 10; turn++) {
      const who = ORDER[turn]
      const fielded = new Set(([0, 1] as const).flatMap((i) => POSITIONS.map((x) => slots[i][x]).filter(Boolean) as string[]))
      const remaining = board.filter((p) => !fielded.has(p.name))
      const cands = remaining.map((p) => ({ p, rings: legalRingsFor(slots, loaded, who, remaining, p.name) })).filter((c) => c.rings.length)
      if (!cands.length) return { stuck: turn, slots }
      const c = cands[pick(cands, turn)]
      slots[who][c.rings[0]] = c.p.name
    }
    return { stuck: -1, slots }
  }

  it('NO DRAFT EVER DEAD-ENDS — greedy, and both sides hoarding one ring', () => {
    for (const s of seeds) {
      const board = versusPool(s)
      for (const [label, pick] of [
        ['first legal', () => 0],
        ['last legal', (c: { p: Player; rings: Pos[] }[]) => c.length - 1],
        // the adversarial one: always take the man with the FEWEST rings, which is what strands a board
        ['scarcest man', (c: { p: Player; rings: Pos[] }[]) => c.reduce((b, x, i) => (x.rings.length < c[b].rings.length ? i : b), 0)],
        // and the opposite: always take the most flexible man, hoarding the specialists to the end
        ['most flexible', (c: { p: Player; rings: Pos[] }[]) => c.reduce((b, x, i) => (x.rings.length > c[b].rings.length ? i : b), 0)],
      ] as const) {
        const { stuck, slots } = playOut(board, pick as (c: { p: Player; rings: Pos[] }[], t: number) => number)
        expect(stuck, `seed ${s} (${label}) stuck at pick ${stuck}`).toBe(-1)
        for (const i of [0, 1] as const) {
          expect(POSITIONS.filter((x) => slots[i][x]).length, `seed ${s} (${label}) side ${i}`).toBe(5)
          // and every man really can play the ring he ended up in
          for (const x of POSITIONS) expect(posOf(slots[i][x]!), `${slots[i][x]} at ${x}`).toContain(x)
        }
      }
    }
  })

  it('no man is fielded twice across the two sides', () => {
    const bare = new Map(PLAYERS.map((p) => [p.name, p.player]))
    for (const s of seeds.slice(0, 120)) {
      const { slots } = playOut(versusPool(s), () => 0)
      const men = ([0, 1] as const).flatMap((i) => POSITIONS.map((x) => bare.get(slots[i][x]!)!))
      expect(new Set(men).size, `seed ${s}`).toBe(10)
    }
  })

  it('a loaded side owes nothing — its rings drop out of the demand', () => {
    const empty: [Slots, Slots] = [{}, {}]
    expect(demandMinus(empty, [false, false], 0, null)).toHaveLength(10)
    expect(demandMinus(empty, [true, false], 0, null)).toHaveLength(5)
    expect(demandMinus(empty, [true, true], 0, null)).toHaveLength(0)
    // and the pick's own ring comes out exactly once, not from both sides
    const d = demandMinus(empty, [false, false], 0, 'C')
    expect(d).toHaveLength(9)
    expect(d.filter((x) => x === 'C')).toHaveLength(1)
  })

  it('the guard actually bites: a ring he can legally play is still refused', () => {
    // A board that CAN field ten rings, but only one way round. Exactly two men can play centre —
    // one of them a PF/C swing — so both C rings need both of them. Spending the swing at power
    // forward leaves one centre for two centre rings, and the board dies four picks later.
    const exactly = (want: Pos[], n: number) =>
      PLAYERS.filter((p) => {
        const r = posOf(p.name)
        return r.length === want.length && want.every((x) => r.includes(x))
      }).slice(0, n)
    const pg = exactly(['PG'], 2)
    const sg = exactly(['SG'], 2)
    const sf = exactly(['SF'], 2)
    const pf = exactly(['PF'], 2)
    const c = exactly(['C'], 1)
    const swing = exactly(['PF', 'C'], 1)
    const board = [...pg, ...sg, ...sf, ...pf, ...c, ...swing]
    expect(board).toHaveLength(10)
    expect(canStillFill(board.map((p) => p.name), posOf, [...POSITIONS, ...POSITIONS])).toBe(true)

    const rings = legalRingsFor([{}, {}], [false, false], 0, board, swing[0].name)
    expect(posOf(swing[0].name), 'the swing man really can play both').toEqual(expect.arrayContaining(['PF', 'C']))
    expect(rings, 'spending him at PF would strand a centre ring').not.toContain('PF')
    expect(rings, 'centre is the only place he can go').toEqual(['C'])
  })
})
