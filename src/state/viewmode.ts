import { useSyncExternalStore } from 'react'

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
 */
export type ViewMode = 'scout' | 'user' | 'tutorial'
const KEY = 'game7.viewmode'
const LEGACY = 'game7.usermode'

const isMode = (v: unknown): v is ViewMode => v === 'scout' || v === 'user' || v === 'tutorial'

let cur: ViewMode = (() => {
  try {
    const v = localStorage.getItem(KEY)
    if (isMode(v)) return v
    return localStorage.getItem(LEGACY) === '1' ? 'user' : 'scout'
  } catch {
    return 'scout'
  }
})()
const subs = new Set<() => void>()

export const viewMode = () => cur
/** Blind to ratings — user mode and the tutorial alike. */
export const isUserMode = () => cur !== 'scout'
export const isTutorial = () => cur === 'tutorial'

export function setViewMode(v: ViewMode) {
  cur = v
  try {
    localStorage.setItem(KEY, v)
    localStorage.setItem(LEGACY, v === 'scout' ? '0' : '1')
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
