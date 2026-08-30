import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * A .posbar's chip row, made phone-usable (his report: at 375px the Main scorer
 * row ran 692px wide and the page itself scrolled sideways to reach the chips).
 *
 * The row scrolls INSIDE itself instead of widening the card — the same idiom
 * the year rail and the database's sort rail already use — so the posbar keeps
 * its one-line rhythm and the panel costs no extra height. A hairline fade on
 * whichever side still holds chips is the affordance that more exist, and the
 * selected chip is revealed on mount, after every change, and on any resize,
 * so the current call is never stranded off-edge.
 *
 * Shrink-to-fit (flex 0 1 auto): when the chips fit they sit hard right exactly
 * as before, so nothing moves on a desktop.
 */
export function ChipRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ l: false, r: false })

  const measure = useCallback((el: HTMLDivElement) => {
    const max = el.scrollWidth - el.clientWidth
    const l = el.scrollLeft > 1
    const r = max > 1 && el.scrollLeft < max - 1
    // keep the same object when nothing moved: a fresh one every scroll event would
    // re-render the whole tactics panel on every pixel of a drag
    setEdge((cur) => (cur.l === l && cur.r === r ? cur : { l, r }))
  }, [])

  /**
   * Bring the selected chip into view — but only when it is actually out of it, so a
   * resize never yanks a row the reader just scrolled by hand. Re-run on resize because
   * the width this is measured against settles late: My team adds `body.wide` in an
   * effect, which lands after this component's layout pass.
   */
  const reveal = useCallback(
    (el: HTMLDivElement) => {
      const on = el.querySelector<HTMLElement>('.sortb.on')
      const max = el.scrollWidth - el.clientWidth
      if (on && max > 1) {
        // measured off client rects, not offsetLeft: the fade wrapper is positioned, so it
        // would be the offsetParent and the number would not describe the scroller at all
        const box = el.getBoundingClientRect()
        const chip = on.getBoundingClientRect()
        if (chip.left < box.left || chip.right > box.right) {
          const want = el.scrollLeft + (chip.left - box.left) - (el.clientWidth - chip.width) / 2
          el.scrollLeft = Math.max(0, Math.min(want, max))
        }
      }
      measure(el)
    },
    [measure],
  )

  useLayoutEffect(() => {
    if (ref.current) reveal(ref.current)
  }, [children, reveal])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // the width settles a beat late (My team adds `body.wide` in an effect of its own, and
    // a card can reflow after paint), so re-read on the next frame as well as on resize
    const frame = requestAnimationFrame(() => reveal(el))
    const onResize = () => reveal(el)
    window.addEventListener('resize', onResize)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
    ro?.observe(el)
    // and the body: My team flips `wide` on it from an effect, which reflows this row
    // without ever resizing the window
    ro?.observe(document.body)
    // webfonts are the blind spot: when the mono face swaps in, the CHIPS get wider but this
    // element's own box does not, so no observer fires and the fades would describe the
    // fallback-font layout for the rest of the session
    let live = true
    document.fonts?.ready.then(() => { if (live) reveal(el) })
    return () => {
      live = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [reveal])

  return (
    <div className={`chiprow ${edge.l ? 'fl' : ''} ${edge.r ? 'fr' : ''}`}>
      <div className={`poschips ${className}`} ref={ref} onScroll={(e) => measure(e.currentTarget)}>
        {children}
      </div>
    </div>
  )
}
