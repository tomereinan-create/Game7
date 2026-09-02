import { useEffect, useRef } from 'react'
import { ChipRow } from './ChipRow'

/**
 * THE SEASON STRIP — his ruling on the player card ("In the player page add option to navigate
 * between years"), and his ruling on the team page ("You can navigate here as well between years").
 * One strip, so a year steps the same way wherever you are: mono chips under the name, the open one
 * lit, ‹ › at the ends, the row scrolling INSIDE itself (a franchise is 47 chips and neither page
 * may scroll sideways), and the best of them marked.
 *
 * It is a VIEWER, not a picker: stepping a year re-reads the page for that season and changes
 * nothing about what was opened, so BACK behaves exactly as it did.
 */
export type StripYear = { id: string; y: number; mark?: boolean }

export function SeasonStrip({
  years,
  cur,
  go,
  mark = 'peak',
  what = 'Season',
}: {
  years: StripYear[]
  cur: string
  go: (id: string) => void
  /** the word on the best year's chip — PEAK on a man, BEST on a franchise */
  mark?: string
  /** what a chip is, for a screen reader */
  what?: string
}) {
  const i = years.findIndex((x) => x.id === cur)
  return (
    <div className="pc-years">
      <button className="yr-arrow" onClick={() => go(years[i - 1].id)} disabled={i <= 0} aria-label="Earlier season">
        ‹
      </button>
      <ChipRow className="yrchips">
        {years.map((x) => (
          <button
            key={x.id}
            className={`sortb yrchip${x.id === cur ? ' on' : ''}`}
            aria-current={x.id === cur ? 'true' : undefined}
            aria-label={`${what} ${x.y}${x.mark ? `, ${mark} season` : ''}`}
            onClick={() => go(x.id)}
          >
            <span>&rsquo;{String(x.y).slice(2)}</span>
            {x.mark ? <i>{mark}</i> : null}
          </button>
        ))}
      </ChipRow>
      <button className="yr-arrow" onClick={() => go(years[i + 1].id)} disabled={i < 0 || i >= years.length - 1} aria-label="Later season">
        ›
      </button>
    </div>
  )
}

/** ← → step the years on a desktop, unless something is being typed into. */
export function useYearKeys(on: boolean, step: (d: -1 | 1) => void) {
  // read the step off a ref, not off the effect's closure: a held-down arrow must not
  // step twice from the same year, and the handler must not be rebound on every render
  const cur = useRef(step)
  cur.current = step
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      cur.current(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
}
