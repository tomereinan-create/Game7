import { CREATOR, FRAME } from './creator/params'

/**
 * WHAT HAS TO HAPPEN BEFORE ANY MODULE READS A SAVE. main.tsx imports this first, so it runs before
 * App and the stores it imports (several read localStorage the moment they load).
 *
 * CREATOR MODE IS NEVER SAVED (P6). The page gets an in-memory Storage in place of localStorage:
 * every store reads an empty browser and writes into a map that is gone on reload. Nothing a
 * filmed run does can touch the real campaign, and the same seed always starts from the same
 * empty state — which is what makes a run replayable.
 */
class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
}

/**
 * A CREATOR'S SHORT LINK, /c/<handle> (P5). On the domain's root the host serves the game for any
 * path it has no file for, so the handle arrives in the path. It becomes `ref=c-<handle>` (which
 * the analytics read once and drop) before anything resolves a relative URL against /c/.
 */
if (import.meta.env.BASE_URL.startsWith('/') && location.pathname.startsWith(`${import.meta.env.BASE_URL}c/`)) {
  const handle = location.pathname.slice(import.meta.env.BASE_URL.length + 2).replace(/\/$/, '')
  if (handle && !handle.includes('/')) {
    const u = new URL(location.href)
    u.pathname = import.meta.env.BASE_URL
    u.searchParams.set('ref', `c-${decodeURIComponent(handle).slice(0, 40)}`)
    history.replaceState(history.state, '', u.href)
  }
}

if (CREATOR) {
  try {
    const mem = new MemoryStorage()
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => mem })
  } catch {
    /* a browser that will not let the global be replaced: creator mode still runs, and saves */
  }
}

/**
 * THE WAY OUT OF CREATOR MODE (the live check, 2026-10-22: no screen of it had one, and in the
 * installed app — no address bar, no back button — a creator run was a dead end, since a reload
 * keeps ?creator=1). Never inside the filmed 9:16 frame: the Escape key; a press held for a second
 * and a half on the frame's top-left corner, which nothing is drawn on; and, on a screen with room
 * around the frame, a small "Exit" in the black margin. All lead to the game's own front door.
 */
const exitCreator = () => {
  const home = new URL(import.meta.env.BASE_URL, location.href).href
  try {
    ;(window.top ?? window).location.href = home
  } catch {
    location.href = home
  }
}
if (CREATOR) {
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') exitCreator()
  })
  let hold = 0
  addEventListener('pointerdown', (e) => {
    if (e.clientX > 56 || e.clientY > 56) return
    window.clearTimeout(hold)
    hold = window.setTimeout(exitCreator, 1500)
  })
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
    addEventListener(ev, () => window.clearTimeout(hold))
}

/**
 * THE EXACT 9:16 FRAME. A creator page is always laid out in a 432x768 phone viewport, so a run
 * looks the same on any screen that films it. When the window is not that viewport (a phone is
 * taller than 9:16; a 1080x1920 OBS browser source is 2.5x it), the page becomes a black stage
 * holding the game in an iframe of exactly that size, scaled to fit. Inside the frame (`framed=1`)
 * the game runs as normal.
 *
 * Returns false when this page is the stage and the app must not mount here.
 */
export function mountHere(): boolean {
  if (!CREATOR || CREATOR.framed) return true
  const url = new URL(location.href)
  url.searchParams.set('framed', '1')
  document.documentElement.style.background = '#000'
  document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;height:100vh'
  const f = document.createElement('iframe')
  f.src = url.href
  f.title = 'Creator frame'
  f.width = String(FRAME.w)
  f.height = String(FRAME.h)
  f.style.cssText = `position:fixed;left:50%;top:50%;width:${FRAME.w}px;height:${FRAME.h}px;border:0;transform-origin:50% 50%;background:#000`
  // the margin's own way out — shown only where the frame leaves room for it, never over the frame
  const exit = document.createElement('button')
  exit.textContent = 'Exit creator mode'
  exit.setAttribute('aria-label', 'Exit creator mode')
  exit.style.cssText =
    'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);transform:translateX(-50%);z-index:2;padding:8px 14px;border-radius:999px;border:1px solid #3a342c;background:#000;color:#a39a91;font:500 12px/1 system-ui,sans-serif;letter-spacing:.06em;cursor:pointer'
  exit.addEventListener('click', exitCreator)
  const fit = () => {
    const k = Math.min(innerWidth / FRAME.w, innerHeight / FRAME.h)
    f.style.transform = `translate(-50%, -50%) scale(${k})`
    exit.style.display = innerHeight - FRAME.h * k >= 2 * 44 ? 'block' : 'none'
  }
  fit()
  addEventListener('resize', fit)
  document.getElementById('root')?.replaceWith(f)
  document.body.appendChild(exit)
  return false
}
