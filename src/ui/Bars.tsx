import type { Lineup } from '../engine/types'

const AXES: { key: keyof Lineup; label: string; group: 'Offense' | 'Defense'; word: string }[] = [
  { key: 'in', label: 'Inside scoring', group: 'Offense', word: 'INSIDE' },
  { key: 'out', label: 'Outside scoring', group: 'Offense', word: 'OUTSIDE' },
  { key: 'id', label: 'Interior defense', group: 'Defense', word: 'INTERIOR D' },
  { key: 'pd', label: 'Perimeter defense', group: 'Defense', word: 'PERIMETER D' },
]

const w = (v: number) => `${Math.max(0, Math.min(100, ((v - 1) / 98) * 100))}%`

/**
 * The comparison block. Talent headline in serif with the delta between; one
 * diverging row per axis from a shared center spine — the longer side wins, no
 * reading required; edge chips name the single biggest edge each way in words.
 */
export function Bars({
  mine,
  theirs,
  leftLabel = 'YOU',
  rightLabel = 'THEM',
  leftWord = 'YOUR',
  rightWord = 'THEIR',
  coachTag,
  title = 'The matchup',
  exact = true,
}: {
  mine: Lineup | null
  theirs: Lineup
  leftLabel?: string
  rightLabel?: string
  leftWord?: string
  rightWord?: string
  coachTag?: string
  title?: string
  /** Without the Scout node, the axes show as bars only. */
  exact?: boolean
}) {
  const delta = mine ? Math.round((mine.net - theirs.net) * 10) / 10 : null

  // Biggest edge each way, in the four axes.
  let bestYou: { word: string; d: number } | null = null
  let bestThem: { word: string; d: number } | null = null
  if (mine) {
    for (const a of AXES) {
      const d = Math.round(mine[a.key] - theirs[a.key])
      if (d > 0 && (!bestYou || d > bestYou.d)) bestYou = { word: a.word, d }
      if (d < 0 && (!bestThem || -d > bestThem.d)) bestThem = { word: a.word, d: -d }
    }
  }

  const rating = (
    <div className="rating">
      {(
        [
          ['OFF', 'off', 1],
          ['DRTG', 'drtg', -1],
        ] as const
      ).map(([label, key, sign]) => {
        const a = mine ? mine[key] : null
        const b = theirs[key]
        const lead = a === null ? 0 : Math.sign((a - b) * sign)
        return (
          <div className="rating-row" key={key}>
            <span className={`n you ${lead > 0 ? 'lead' : ''} ${mine ? '' : 'empty'}`}>
              {a === null ? '—' : a.toFixed(1)}
            </span>
            <span className="rl">{label}</span>
            <span className={`n them ${lead < 0 ? 'lead' : ''}`}>{b.toFixed(1)}</span>
          </div>
        )
      })}
    </div>
  )

  const section = (g: 'Offense' | 'Defense') => (
    <>
      <div className="section-rule">
        <span>{g}</span>
        <i />
      </div>
      {AXES.filter((a) => a.group === g).map((a) => (
        <div className="axis" key={a.key}>
          <div className="al">{a.label}</div>
          <div className="ar">
            <span className={`n you ${mine ? '' : 'empty'}`}>{mine ? (exact ? Math.round(mine[a.key]) : '·') : '—'}</span>
            <span className="tl">
              <i style={{ width: mine ? w(mine[a.key]) : '0%' }} />
            </span>
            <span className="tr">
              <i style={{ width: w(theirs[a.key]) }} />
            </span>
            <span className="n them">{exact ? Math.round(theirs[a.key]) : '·'}</span>
          </div>
        </div>
      ))}
    </>
  )

  return (
    <>
      <div className="card-head">
        <span className="label">{title}</span>
        {coachTag ? <span className="coach-tag">{coachTag}</span> : null}
      </div>
      <div className="cmp-talent">
        <div>
          <div className="side">{leftLabel}</div>
          <div className={`big you ${mine ? '' : 'empty'}`}>{mine ? (mine.net > 0 ? '+' : '') + mine.net.toFixed(1) : '—'}</div>
        </div>
        <div className="mid">
          <div className="t">NET · VS EACH OTHER</div>
          <div
            className="d"
            style={{ color: delta === null ? 'var(--line-3)' : delta >= 0 ? 'var(--you)' : 'var(--them)' }}
          >
            {delta === null ? '—' : delta >= 0 ? `+${delta.toFixed(1)} ${leftLabel}` : `+${(-delta).toFixed(1)} ${rightLabel}`}
          </div>
        </div>
        <div>
          <div className="side r">{rightLabel}</div>
          <div className="big them">{(theirs.net > 0 ? '+' : '') + theirs.net.toFixed(1)}</div>
        </div>
      </div>
      {rating}
      {section('Offense')}
      {section('Defense')}
      <div className="chips">
        {!mine ? (
          <span className="chip">DRAFT TO SEE THE MATCHUP</span>
        ) : (
          <>
            {bestYou ? (
              <span className="chip you">
                ▲ {leftWord} EDGE · {bestYou.word} +{bestYou.d}
              </span>
            ) : null}
            {bestThem ? (
              <span className="chip them">
                ▼ {rightWord} EDGE · {bestThem.word} +{bestThem.d}
              </span>
            ) : null}
            {!bestYou && !bestThem ? <span className="chip">DEAD EVEN</span> : null}
          </>
        )}
      </div>
    </>
  )
}
