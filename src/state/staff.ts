/**
 * STAFF — WHO IS SHOWN SCOUT MODE.
 *
 * HIS RULING, 2026-10-24: "Scout mode is only for me. Once I publish the game, only the user mode
 * matters". Scout mode (and the Advanced window inside it, which reads the 6 MB provenance file) is
 * his workbench, not a way to play: a visitor to the published game gets User and Tutorial, and
 * state/viewmode.ts turns a stored Scout into User for anyone who is not staff.
 *
 * STAFF IS, read once when the page loads:
 *   · the dev server (`import.meta.env.DEV`, which is also every vitest run);
 *   · this machine: localhost, 127.0.0.1, [::1] or *.localhost — the test the `?stars=` door uses
 *     (state/campaign.ts), since he plays the local build on localhost:5178. NOT inside the Android
 *     app, whose WebView also serves the game from https://localhost: that is a published build;
 *   · a browser that carries `game7.staff = '1'`. Open the game once with `?scout=1` and it is set,
 *     so his phone keeps Scout on the live site; `?scout=0` takes it off again. The parameter is
 *     taken off the address straight away, and every other parameter and the hash are kept (the
 *     analytics read ref / s / utm_*, and #c= / #import= are a challenge and a save code).
 *
 * A DOOR, NOT A LOCK. Anyone who knows the parameter can open it; nothing behind it is secret.
 * What it does is keep a public visitor from landing in a mode the game is not being published
 * with. The flag stays with the browser it was set in: a save code does not carry it (see SKIP in
 * state/savecode.ts).
 */
export const STAFF_KEY = 'game7.staff'
const PARAM = 'scout'

/** This machine, by the same test as the `?stars=` door, plus the *.localhost names. */
export const isLocalHost = (h: string) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h) || /\.localhost$/.test(h)

/** The Android app (Capacitor) serves the game from https://localhost too; it is a public build. */
const inNativeShell = () => {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    return !!cap?.isNativePlatform?.()
  } catch {
    return false
  }
}

/**
 * Reads the door and the flag, and takes `?scout=` off the address. Exported for the tests, which
 * pass `dev` false to see what the published site sees; the app reads `STAFF` below, once.
 */
export function readStaff(dev: boolean = !!import.meta.env.DEV): boolean {
  if (typeof location === 'undefined') return dev
  let door: string | null = null
  try {
    const u = new URL(location.href)
    door = u.searchParams.get(PARAM)
    if (door !== null) {
      try {
        if (door === '1') localStorage.setItem(STAFF_KEY, '1')
        else if (door === '0') localStorage.removeItem(STAFF_KEY)
      } catch {
        /* storage blocked: the door can still open for this page (below), it just will not stay */
      }
      u.searchParams.delete(PARAM)
      try {
        history.replaceState(history.state, '', u.href)
      } catch {
        /* an address that cannot be rewritten keeps the parameter; reading it twice is harmless */
      }
    }
  } catch {
    /* an address URL cannot parse: no door */
  }
  // the door wins for this page even when storage would not take the change
  let flag = door === '1'
  if (door !== '0' && !flag) {
    try {
      flag = localStorage.getItem(STAFF_KEY) === '1'
    } catch {
      /* private mode */
    }
  }
  return dev || flag || (isLocalHost(location.hostname) && !inNativeShell())
}

/** Whether this page is his: Scout mode and the Advanced window are shown only when it is. */
export const STAFF: boolean = readStaff()
