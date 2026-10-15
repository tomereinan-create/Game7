import { useSyncExternalStore } from 'react'

/**
 * SOUND ON OR OFF — the one audio preference, a chip in the front door's mode row, saved with the
 * browser like the view mode beside it. On by default: nothing can sound before the first tap
 * anyway, because a browser will not start audio a page has not been touched for.
 *
 * Its own key, outside `game7.tut.*`, so resetting the tutorial does not touch it.
 */
const KEY = 'game7.sound.v1'

let on: boolean = (() => {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
})()
const subs = new Set<() => void>()

export const soundOn = () => on

export function setSoundOn(v: boolean) {
  on = v
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* private mode — the switch still works for the session */
  }
  for (const f of subs) f()
}

const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => subs.delete(cb)
}

export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribe, () => on, () => on)
}
