import { useSyncExternalStore } from 'react'
import { useLayout } from './useLayout'

/**
 * THE CRAWL (Game7 Flow: "a 30px blue ticker pinned to the foot" of every screen). One line of
 * League Gothic on franchise blue, sitting under the action bar — the arena's own bottom third,
 * and the only piece of furniture that never leaves.
 *
 * It is a store rather than a prop because App renders each screen from its own early return and
 * the bar lives OUTSIDE App, pinned to the window: threading a line through six returns would put
 * the same prop on six call sites. A screen states its line with `useTicker(...)` and the line
 * goes back to the house one when that screen unmounts.
 */
const HOUSE = 'Draft five · beat 150 teams · hang the banners'
let cur = HOUSE
const subs = new Set<() => void>()
const set = (v: string) => {
  cur = v
  for (const f of subs) f()
}

/** State the foot's line for as long as this screen is mounted. */
export function useTicker(line: string | null) {
  useLayout(() => {
    if (!line) return
    set(line)
    return () => set(HOUSE)
  }, [line])
}

export function Ticker() {
  const line = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => cur,
    () => cur,
  )
  return (
    <div className="ticker-foot" aria-hidden>
      <span>{line}</span>
    </div>
  )
}
