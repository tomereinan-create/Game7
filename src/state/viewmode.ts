import { useSyncExternalStore } from 'react'
import { STAFF } from './staff'

/**
 * THE VIEW MODE — three of them since 2026-09-30, and the third is the second with a coach.
 *
 * USER MODE (his ruling) is an immersion switch, pressable on the home screen and saved with the
 * browser. On, the app plays blind: no Database, no attribute sheets or engine ratings on any
 * card, and no evaluation of anything you choose — the tactics, the fits, the pace read, the
 * board edges and the odds all keep working underneath, they just stop telling you whether your
 * call was good. Scout mode is the app as it always was.
 *
 * TUTORIAL MODE (his ruling, 2026-09-30: "Add tutorial mode, which will be the same as user mode,
 * but everything explain. Everytime you unlock a new feature its explained as well.") is user
 * mode with the coach standing beside it. Every gate user mode has, tutorial mode has — it is the
 * SAME blindfold, which is why `useUserMode()` answers true for both and nothing on a screen has
 * to know the difference. What tutorial mode adds is read off `useTutorial()` in exactly two
 * places: the coach overlay (src/ui/Coach.tsx) and the hooks that hand it lessons
 * (src/state/tutorial.ts). A screen that forks on the tutorial for anything else is doing the
 * coach's job in the wrong room.
 *
 * STORAGE. The old key held a boolean and every save out there has one; the new key holds the
 * name. The old key is read only when the new one is absent, so a player who was in user mode
 * yesterday is in user mode today, and it is still WRITTEN so that nothing else that reads it
 * (nothing does, today) sees a stale answer.
 *
 * SCOUT MODE IS STAFF-ONLY (his ruling, 2026-10-24: "Scout mode is only for me. Once I publish the
 * game, only the user mode matters"). On the published site a fresh browser opens in User mode, a
 * stored Scout (a visit from before the launch, an old save code) reads as User, and asking for
 * Scout lands on User; the front door offers it only to staff (state/staff.ts: the dev server, this
 * machine, or a browser opened once with `?scout=1`). On staff nothing changed: a fresh browser
 * still opens in Scout. The stored key is not rewritten on read — a browser that is later let in
 * gets its Scout back. `resolveMode` is the whole rule, pure, so the tests can read it.
 */
export type ViewMode = 'scout' | 'user' | 'tutorial'
const KEY = 'game7.viewmode'
const LEGACY = 'game7.usermode'

const isMode = (v: unknown): v is ViewMode => v === 'scout' || v === 'user' || v === 'tutorial'

/**
 * The mode a browser is in: the stored name when it is one; else the old boolean ('1' user, '0'
 * scout); else the default — Scout for staff, User for everyone else. Scout is staff's alone, so
 * for anyone else it reads as User.
 */
export function resolveMode(stored: string | null, legacy: string | null, staff: boolean): ViewMode {
  const m: ViewMode = isMode(stored) ? stored : legacy === '1' ? 'user' : legacy === '0' ? 'scout' : staff ? 'scout' : 'user'
  return m === 'scout' && !staff ? 'user' : m
}

let cur: ViewMode = (() => {
  try {
    return resolveMode(localStorage.getItem(KEY), localStorage.getItem(LEGACY), STAFF)
  } catch {
    return resolveMode(null, null, STAFF)
  }
})()
const subs = new Set<() => void>()

export const viewMode = () => cur
/** Blind to ratings — user mode and the tutorial alike. */
export const isUserMode = () => cur !== 'scout'
export const isTutorial = () => cur === 'tutorial'

export function setViewMode(v: ViewMode) {
  // Scout is staff's alone (see the head of this file): anyone else asking for it gets User
  cur = resolveMode(v, null, STAFF)
  try {
    localStorage.setItem(KEY, cur)
    localStorage.setItem(LEGACY, cur === 'scout' ? '0' : '1')
  } catch {
    /* private mode — the toggle still works for the session */
  }
  for (const f of subs) f()
}
/** The old two-way switch, kept for its callers: on is user mode, off is scout. */
export function setUserMode(v: boolean) {
  setViewMode(v ? 'user' : 'scout')
}

const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => subs.delete(cb)
}

export function useViewMode(): ViewMode {
  // outside a browser (a static render in a test) the store still has an answer: the default,
  // since localStorage was unreachable when `cur` was read
  return useSyncExternalStore(subscribe, () => cur, () => cur)
}

/** True in user mode AND in the tutorial: both play blind. See the head of this file. */
export function useUserMode(): boolean {
  return useViewMode() !== 'scout'
}

export function useTutorial(): boolean {
  return useViewMode() === 'tutorial'
}
