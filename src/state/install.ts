import { useSyncExternalStore } from 'react'
import { track } from '../analytics'

/**
 * ANDROID'S INSTALL PROMPT (P9). Chrome fires `beforeinstallprompt` once it decides the site is
 * installable; held here, it becomes an Install button instead of a mini-infobar the player never
 * reads. iOS has no such event — its Add to Home Screen is explained by hand (src/ui/Escape.tsx).
 * `listenForInstall` is called from main.tsx before the first render, because the event can fire
 * before any component is mounted to hear it.
 */
interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function listenForInstall() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  track('install_prompt', {})
  await e.prompt()
  const { outcome } = await e.userChoice
  track('install_choice', { outcome })
  deferred = null
  emit()
  return outcome === 'accepted'
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => void subs.delete(cb)),
    () => deferred !== null,
    () => false,
  )
}

/** The first spin of a visit, announced to whoever is waiting for it (the iOS install hint). */
export const FIRST_SPIN = 'g7:first-spin'
