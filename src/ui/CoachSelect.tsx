import { useState } from 'react'
import { COACHES } from '../data/coaches'
import type { CoachId } from '../engine/types'

const CHIP: Record<CoachId, string> = { def: 'DEFENSE', off: 'OFFENSE', gambler: 'CHAOS' }

/** Three cards, one gold selection, one button. A five-second screen. */
export function CoachSelect({
  best,
  onStart,
  onRoster,
}: {
  best: number
  onStart: (c: CoachId) => void
  onRoster: () => void
}) {
  const [sel, setSel] = useState<CoachId | null>(null)

  return (
    <>
      <div className="topbar">
        <span>Campaign</span>
      </div>
      <div className="rule2" />
      <div className="lede">
        120 teams across four eras, worst record to best, champions last. Draft a five for each and win a best-of-seven.
        {best > 0 ? <b> {best} cleared.</b> : null}
      </div>
      <div className="label" style={{ margin: '18px 2px 0' }}>
        Pick a coach
      </div>
      {COACHES.map((c) => (
        <button key={c.id} className={`coach ${sel === c.id ? 'on' : ''}`} onClick={() => setSel(c.id)}>
          <div className="h">
            <b>{c.name}</b>
            <span className="chipt">{sel === c.id ? 'SELECTED ✓' : CHIP[c.id]}</span>
          </div>
          <span>{c.blurb}.</span>
        </button>
      ))}
      <button className="linkb" onClick={onRoster}>
        See every player →
      </button>

      <div className="dock">
        <div className="dock-inner">
          <button className="btn" disabled={!sel} onClick={() => sel && onStart(sel)}>
            {sel ? 'Continue' : 'Choose a coach'}
          </button>
        </div>
      </div>
    </>
  )
}
