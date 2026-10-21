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

if (CREATOR) {
  try {
    const mem = new MemoryStorage()
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => mem })
  } catch {
    /* a browser that will not let the global be replaced: creator mode still runs, and saves */
  }
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
  const fit = () => {
    const k = Math.min(innerWidth / FRAME.w, innerHeight / FRAME.h)
    f.style.transform = `translate(-50%, -50%) scale(${k})`
  }
  fit()
  addEventListener('resize', fit)
  document.getElementById('root')?.replaceWith(f)
  return false
}
