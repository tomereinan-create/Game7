import { eligible, POSITIONS } from './positions'
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
