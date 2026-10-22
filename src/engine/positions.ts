/** The five slots a drafted five must cover, in floor order. */
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
export type Pos = (typeof POSITIONS)[number]

/**
 * Where a player may be slotted: every position Basketball-Reference ever
 * listed for him, any season of his career. No adjacency fudge — the data is
 * the rule. (An empty list should not happen; treat it as "anywhere".)
 */
export function eligible(pos: string[] | undefined): Pos[] {
  const set = new Set(pos ?? [])
  const out = POSITIONS.filter((p) => set.has(p))
  return out.length ? out : [...POSITIONS]
}

/**
 * ONE STEP ALONG THE FLOOR (recal_232, his rulings, 2026-10-22: "yes, go with rule C for the 44
 * teams, but have this player penelised for playing oop" / "re-solve version, 0.13 penalty, build
 * it"). The floor runs PG-SG-SF-PF-C and a step is one place along it. This is NOT an eligibility
 * rule — `eligible` above stays the data and nothing else, for the draft and every five a person
 * builds. It is read only by the team-season re-solve (bestfive.ts `teamFive`), and only when a
 * club's strict walk leaves a hole.
 *
 * The listed position a man seated at `slot` steps from: null when he is listed at `slot` itself
 * (he is in position) or when no listed position is one step from it (he cannot stand there).
 */
export function oneStepFrom(listed: readonly Pos[], slot: Pos): Pos | null {
  if (listed.includes(slot)) return null
  const at = POSITIONS.indexOf(slot)
  return listed.find((x) => Math.abs(POSITIONS.indexOf(x) - at) === 1) ?? null
}

/**
 * A man seated OUTSIDE his listed positions, marked: a shallow COPY carrying `oop` = the seat he
 * stands at, never the card itself (a card is the same man in every five he joins). The engine reads
 * the mark — MKNOBS.OOP_DRTG per marked man on the five's DRtg, offence unpenalised — and the floor
 * prints it ("C · at PF"). An unmarked man is read exactly as before.
 */
export function seatOutOfPosition<T extends { oop?: Pos }>(p: T, slot: Pos): T {
  return { ...p, oop: slot }
}
