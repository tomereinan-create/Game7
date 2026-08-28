import { useSyncExternalStore } from 'react'

/**
 * USER MODE (his ruling) — an immersion switch, pressable on the home screen and saved with the
 * browser. On, the app plays blind: no Database, no attribute sheets or engine ratings on any
 * card, and no evaluation of anything you choose — the tactics, the fits, the pace read, the
 * board edges and the odds all keep working underneath, they just stop telling you whether your
 * call was good. Scout mode (off) is the app as it always was.
 */
const KEY = 'game7.usermode'

let cur = (() => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()
const subs = new Set<() => void>()

export const isUserMode = () => cur
export function setUserMode(v: boolean) {
  cur = v
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* private mode — the toggle still works for the session */
  }
  for (const f of subs) f()
}

export function useUserMode(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => cur,
  )
}
