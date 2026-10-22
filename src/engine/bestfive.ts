import { eligible, oneStepFrom, POSITIONS, seatOutOfPosition } from './positions'
import { ratings100 } from './offense'
import { dialOvrRaw, seasonOf } from './gauges'
import { LINES } from '../ui/Stat'
import type { Player } from './types'

/** "62–20" -> 62; no record reads as 0 wins. */
export const winsOf = (rec: string | null) => (rec ? parseInt(rec, 10) || 0 : 0)

/**
 * THE SET TIE-BREAK (recal_147, his ruling: "Confirm 8").
 *
 * Total OVR is a sum of integers, so max-OVR legal fives TIE often — 142 of the 1,255 fieldable
 * team-seasons on the wheel have two or more. Until this round the winner of a tie was whichever
 * board the depth-first walk reached FIRST, and the walk visits candidates in `roster` order, which
 * is teamseasons.json's order, which is alphabetical. The Celtics '08 were the demonstration:
 * Eddie House '08 and Rajon Rondo '08 both read OVR 62, and House started for the best defence of
 * the 47 seasons because H comes before R. That five read DEF 82; with Rondo it reads 90. A five
 * chosen by a name's place in the alphabet is not a statement about a team.
 *
 * THE KEY: of the tied SETS, the one the TEAM DB ITSELF RATES HIGHEST — `dialOvrRaw`, the mean of
 * the five's two era-relative gauge channels, unrounded. It is the same compound key recal_142 gave
 * the Champions tier ("the dial OVR, raw net as the tie-break"), applied one layer down to the
 * choice of the men. Why this key, and not the alternatives that were measured:
 *
 *  - IT IS THE ONLY KEY THAT CANNOT CONTRADICT THE SCREEN. The Team DB shows a five AND its OVR;
 *    any other key lets the DB display a five it rates below one it could have shown. Raw net
 *    (offRaw - drtgRef) does exactly that on 34 of the 142 ties, by as much as 7 points, and the
 *    old first-found order on 62 of them, by as much as 12. Raw net benches Bill Laimbeer '92
 *    (team DEF 97 -> 84), Bruce Bowen '03 and '04, Matisse Thybulle '23
 *    (DEF 69 -> 50) and Jrue Holiday '24 — because offRaw's spread over the wheel is about seven
 *    times drtgRef's, so a 1:1 net is an offence key with the defence along for the ride. That is
 *    recal_142's own measured objection to the raw net (Spearman .963 against .238), and it applies
 *    here for the same reason.
 *  - THE MEN'S OWN NUMBERS CANNOT DECIDE IT. `o_ovr + d_ovr` ships rounded to integers and ties
 *    exactly on the subject: House 60+65 = Rondo 50+75 = 125.
 *  - MINUTES ARE REJECTED, on recal_142's finding, which this round does not reopen: "A season's
 *    minutes are an availability record, not a statement about who the team is."
 *
 * Determinism: exact dial ties fall to the raw net (recal_142's own tie-break), and an exact tie on
 * both keeps the first-found board — the pre-round behaviour. Boards that cannot fill five slots
 * are not priced at all and keep the first-found board too: a hole is not a team the engine reads.
 *
 * This chooses the SET. recal_74's assists rule below then arranges that set's SLOTS, exactly as
 * before. The two tie-breaks answer different questions, and neither now depends on file order.
 */
export function startingFive(roster: Player[]): { five: (Player | null)[]; bench: Player[] } {
  const cands = roster.map((p) => ({ p, pos: eligible(LINES[p.name]?.pos) }))
  let best: (Player | null)[] = POSITIONS.map(() => null)
  let bestSum = -1
  /** every DISTINCT max-OVR set, keyed by its men, holding the first board that spelled it */
  let tied = new Map<string, (Player | null)[]>()
  const slots: (Player | null)[] = POSITIONS.map(() => null)
  const used = new Set<string>()
  const walk = (i: number, sum: number) => {
    if (i === POSITIONS.length) {
      if (sum > bestSum) {
        bestSum = sum
        best = [...slots]
        tied = new Map()
      }
      if (sum === bestSum) {
        const key = slots
          .filter((p): p is Player => !!p)
          .map((p) => p.name)
          .sort()
          .join('|')
        if (!tied.has(key)) tied.set(key, [...slots])
      }
      return
    }
    for (const c of cands) {
      if (used.has(c.p.name) || !c.pos.includes(POSITIONS[i])) continue
      used.add(c.p.name)
      slots[i] = c.p
      walk(i + 1, sum + c.p.ovr)
      used.delete(c.p.name)
      slots[i] = null
    }
    // a roster hole (nobody left for the slot) still counts as a board
    walk(i + 1, sum)
  }
  walk(0, 0)
  if (tied.size > 1) {
    const boards = [...tied.values()]
    // only full fives get the key; a board with a hole is not a team the engine can price
    if (boards.every((b) => b.every((p) => !!p))) {
      let bestKey = -Infinity
      let bestNet = -Infinity
      for (const b of boards) {
        const men = b as Player[]
        const key = dialOvrRaw(men, seasonOf(men))
        const r = ratings100(men)
        const net = r.offRaw - r.drtgRef
        if (key > bestKey || (key === bestKey && net > bestNet)) {
          bestKey = key
          bestNet = net
          best = b
        }
      }
    }
  }
  // HIS RULING (post-recal_74): "If 2 players can play pg/sg, the one with more ast gets the pg
  // position." Slot assignment is a TIE-BREAK among legal boards of the SAME chosen five — the
  // max-OVR set never changes; of every legal arrangement of the chosen men, the board whose PG has
  // the most assists wins, remaining ties keep the first stable arrangement. Slot order feeds no
  // number on the optimal path (team math is order-invariant; receipts verified identical) — the
  // naive matchup board follows the displayed slots by design, which is the point of the ruling.
  const chosen = best.filter((p): p is Player => !!p)
  if (chosen.length > 1) {
    const apg = (p: Player | null) => (p ? (LINES[p.name]?.apg ?? 0) : -1)
    const slots2: (Player | null)[] = POSITIONS.map(() => null)
    let board2: (Player | null)[] = best
    let bestKey = -Infinity
    const place = (idx: number) => {
      if (idx === chosen.length) {
        const key = apg(slots2[0])
        if (key > bestKey) {
          bestKey = key
          board2 = [...slots2]
        }
        return
      }
      const pos = eligible(LINES[chosen[idx].name]?.pos)
      for (let s = 0; s < POSITIONS.length; s++) {
        if (slots2[s] || !pos.includes(POSITIONS[s])) continue
        slots2[s] = chosen[idx]
        place(idx + 1)
        slots2[s] = null
      }
    }
    place(0)
    best = board2
  }
  const picked = new Set(best.filter(Boolean).map((p) => p!.name))
  return { five: best, bench: roster.filter((p) => !picked.has(p.name)).sort((a, b) => b.ovr - a.ovr) }
}

/**
 * THE TEAM-SEASON FIVE (recal_232, his rulings, 2026-10-22: "yes, go with rule C for the 44 teams,
 * but have this player penelised for playing oop" / "re-solve version, 0.13 penalty, build it").
 *
 * 1,314 team-seasons stand on the wheel. 1,255 field a strict legal five — every man at a position
 * Basketball-Reference listed for him — and `startingFive` above is, and stays, their five. 15 have
 * fewer than five men in the card pool and still read "needs five". The other 44 have enough men
 * but no strict board: the walk leaves a slot empty (Wizards '25 have no PF; Hawks '85 can fill
 * neither SG nor SF behind Rivers and Wilkins). Those 44 had no dials, no season rank, and could not
 * be loaded into Versus or Custom.
 *
 * THE RE-SOLVE, and only when the strict walk leaves a hole: re-choose the five letting a man stand
 * ONE STEP (PG-SG-SF-PF-C) from a position he was listed at (positions.ts `oneStepFrom`). Of every
 * such board, in this order:
 *   (1) the FEWEST men out of position — 36 of the 44 need one, 8 need two (Hawks '85, Bullets '89,
 *       Warriors '10, Jazz '12, Heat '15, Hawks '20, Warriors '26, Grizzlies '26); none needs three;
 *   (2) the highest total OVR — the strict rule's own key;
 *   (3) of tied SETS, recal_147's key (the Team DB's unrounded dial OVR, raw net beneath it), read
 *       on the five as it would stand, penalty included;
 *   (4) of that set's boards, the one where the most men of the strict (holed) board keep their seat;
 *   (5) recal_74's arrangement: the PG with the most assists; then the first board found.
 * Each man seated off his listed positions comes back as a marked COPY (`oop` = his seat,
 * positions.ts `seatOutOfPosition`), never the card, and every engine path reads the mark:
 * MKNOBS.OOP_DRTG = 0.13 on the five's DRtg per marked man (offense.ts defenseVs / teamDefense), so
 * ratings100's drtgRef, the Team DB gauges and a simmed series all see the same penalised five.
 *
 * A club that fields strictly gets `startingFive`'s own result object back — the same five, the same
 * slots, the same numbers, bit for bit. The DRAFT and every five a person builds never come here:
 * `eligible` is still the whole of the draft's law.
 */
export function teamFive(roster: Player[]): { five: (Player | null)[]; bench: Player[] } {
  const strict = startingFive(roster)
  if (strict.five.every(Boolean) || roster.length < POSITIONS.length) return strict
  const cands = roster.map((p) => ({ p, pos: eligible(LINES[p.name]?.pos) }))
  type Board = { men: Player[]; off: boolean[] }
  let bestK = Infinity
  let bestSum = -1
  let boards: Board[] = []
  const men: Player[] = []
  const off: boolean[] = []
  const used = new Set<string>()
  const walk = (i: number, k: number, sum: number) => {
    if (k > bestK) return
    if (i === POSITIONS.length) {
      if (k < bestK || sum > bestSum) {
        bestK = k
        bestSum = sum
        boards = []
      }
      if (sum === bestSum) boards.push({ men: [...men], off: [...off] })
      return
    }
    const slot = POSITIONS[i]
    for (const c of cands) {
      if (used.has(c.p.name)) continue
      const inPos = c.pos.includes(slot)
      if (!inPos && !oneStepFrom(c.pos, slot)) continue
      used.add(c.p.name)
      men.push(c.p)
      off.push(!inPos)
      walk(i + 1, inPos ? k : k + 1, sum + c.p.ovr)
      used.delete(c.p.name)
      men.pop()
      off.pop()
    }
  }
  walk(0, 0, 0)
  // no board even one step out: the roster stays as the strict walk left it ("needs five")
  if (!boards.length) return strict
  const mark = (b: Board): Player[] => b.men.map((p, i) => (b.off[i] ? seatOutOfPosition(p, POSITIONS[i]) : p))
  // (3) the distinct SETS at the optimum, each with every board that spells it, in walk order
  const sets = new Map<string, Board[]>()
  for (const b of boards) {
    const key = b.men
      .map((p) => p.name)
      .sort()
      .join('|')
    const at = sets.get(key)
    if (at) at.push(b)
    else sets.set(key, [b])
  }
  let pick = [...sets.values()][0]
  if (sets.size > 1) {
    let bestKey = -Infinity
    let bestNet = -Infinity
    for (const bs of sets.values()) {
      const five = mark(bs[0])
      const key = dialOvrRaw(five, seasonOf(five))
      const r = ratings100(five)
      const net = r.offRaw - r.drtgRef
      if (key > bestKey || (key === bestKey && net > bestNet)) {
        bestKey = key
        bestNet = net
        pick = bs
      }
    }
  }
  // (4) the strict board's men keep their seats; (5) recal_74, the PG with the most assists
  const kept = (b: Board) => b.men.reduce((n, p, i) => n + (strict.five[i]?.name === p.name ? 1 : 0), 0)
  const apg = (b: Board) => LINES[b.men[0].name]?.apg ?? 0
  let board = pick[0]
  for (const b of pick) {
    const dk = kept(b) - kept(board)
    if (dk > 0 || (dk === 0 && apg(b) > apg(board))) board = b
  }
  const five = mark(board)
  const picked = new Set(five.map((p) => p.name))
  return { five, bench: roster.filter((p) => !picked.has(p.name)).sort((a, b) => b.ovr - a.ovr) }
}
