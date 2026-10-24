import { useEffect, useState } from 'react'
import { answerStats, markStatsAsked, shouldAskStats } from '../analytics'

/** How long the settled night is read before the ask joins the dock. */
const BEAT_MS = 1200

/**
 * THE ONE-TIME ASK (P5; his decision, 2026-10-24: "ID after a one-time yes (Recommended)" — "One
 * small prompt after the first series: 'Share anonymous stats to help improve the game?' Yes stores a
 * random ID in the save … No, or ignoring it, stays cookieless as today").
 *
 * Series mounts it in its dock once the night has settled, so it is the result screen of a series
 * he played — never mid-draft, never on the front door, never someone else's series replayed from a
 * link — in every mode that plays one (User, Tutorial, Scout; the ladders, a custom matchup, the hot
 * seat, a challenge turn). It sits on top of the dock's doors rather than over the verdict, so it
 * covers nothing, and the trophy toasts, which stand on `--dock`, rise above it.
 *
 * It shows at most once, ever: `shouldAskStats` is false without a PostHog key, in creator mode,
 * under GPC / Do Not Track / the off switch, and once any answer is stored — and the moment it shows,
 * "no" is stored until Yes is tapped, so walking off the screen or closing the tab is a no.
 */
export function StatsAsk() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!shouldAskStats()) return
      markStatsAsked()
      setOpen(true)
    }, BEAT_MS)
    return () => window.clearTimeout(t)
  }, [])
  if (!open) return null
  const answer = (yes: boolean) => {
    answerStats(yes)
    setOpen(false)
  }
  return (
    <div className="g7-ask" role="group" aria-label="Anonymous stats">
      <p>
        Share anonymous stats to help improve the game?{' '}
        <a href={`${import.meta.env.BASE_URL}privacy/`} target="_blank" rel="noopener">
          Privacy
        </a>
      </p>
      <div className="g7-ask-btns">
        <button type="button" onClick={() => answer(false)}>
          No
        </button>
        <button type="button" className="yes" onClick={() => answer(true)}>
          Yes
        </button>
      </div>
    </div>
  )
}
