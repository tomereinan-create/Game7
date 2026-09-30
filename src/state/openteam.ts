import { useSyncExternalStore } from 'react'
import type { TeamSeason } from '../data/wheel'

/**
 * "TAKE ME TO HIS TEAM" — his ruling, 2026-09-30: "In the player card, there need to be a
 * pressable option to move to this year's team (that he played on)."
 *
 * The card lives ABOVE the app (CardProvider wraps App in main.tsx) and the Team database lives
 * inside it, so the card cannot hand App a team directly. This is the note passed under the door:
 * the card asks for a team-season here, App reads it, opens the database on that team and clears
 * it when the database is closed. One value, no queue — a second press replaces the first.
 */
let cur: TeamSeason | null = null
const subs = new Set<() => void>()

export const teamRequest = () => cur
export function requestTeam(t: TeamSeason | null) {
  cur = t
  for (const f of subs) f()
}
const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => subs.delete(cb)
}
export function useTeamRequest(): TeamSeason | null {
  return useSyncExternalStore(subscribe, () => cur, () => cur)
}
