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
