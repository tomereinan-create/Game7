import { useLayoutEffect } from 'react'

/**
 * WHILE A DIALOG IS UP, THE PAGE BEHIND IT TAKES NO FOCUS (the live check, 2026-10-22: Tab walked
 * out of the share sheet onto the series controls it covers, eight stops with no visible ring).
 * For a dialog portalled to <body>: the app's own root goes inert — no focus, no clicks, nothing for
 * a screen reader — and comes back when the dialog closes. A dialog opened over another leaves the
 * root to the first one. A layout effect, so the root is live again before the caller hands focus
 * back to the button that opened it.
 */
export function useInertRoot() {
  useLayoutEffect(() => {
    const root = document.getElementById('root')
    if (!root || root.inert) return
    root.inert = true
    return () => {
      root.inert = false
    }
  }, [])
}
