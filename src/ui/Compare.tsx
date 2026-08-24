import { useMemo, useState } from 'react'
import { archetype, PLAYERS } from '../engine/pool'
import type { AttrKey, Player, StatLine } from '../engine/types'
import { OVR_TIP } from './MatchupPanel'
import { GROUPS, LINES } from './Stat'

/** The season line, same fields the detail panel shows, as comparable numbers. */
const BOX: { label: string; k: keyof StatLine; pct?: boolean }[] = [
  { label: 'PTS', k: 'ppg' },
  { label: 'REB', k: 'rpg' },
  { label: 'AST', k: 'apg' },
  { label: 'STL', k: 'spg' },
  { label: 'BLK', k: 'bpg' },
  { label: 'TOV', k: 'topg' },
  { label: 'FG%', k: 'fgp', pct: true },
  { label: '3P%', k: 'tpp', pct: true },
  { label: 'FT%', k: 'ftp', pct: true },
  { label: 'TS%', k: 'ts', pct: true },
  { label: 'USG%', k: 'usg' },
  { label: 'PER', k: 'per' },
  { label: 'WS', k: 'ws' },
  { label: 'BPM', k: 'bpm' },
]
/** Fewer is better on these, so the highlight has to flip. */
const LOWER_IS_BETTER = new Set<string>(['TOV'])
export const COMPARE_MAX = 4

const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')
const ht = (h: number) => (h ? `${Math.floor(h / 12)}'${h % 12}"` : '—')

/**
 * Compare players side by side: the ratings first, then the real season line
 * underneath. The best figure in every row is marked, and with exactly two men
 * the gap is spelled out — the point of a comparison is the difference, not two
 * columns of numbers the reader has to subtract in their head.
 */
export function Compare({ initial = [], onBack }: { initial?: string[]; onBack: () => void }) {
  const [names, setNames] = useState<string[]>(initial.slice(0, COMPARE_MAX))
  const [q, setQ] = useState('')

  const five = useMemo(() => names.map((n) => PLAYERS.find((p) => p.name === n)).filter(Boolean) as Player[], [names])
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return PLAYERS.filter((p) => p.name.toLowerCase().includes(needle) && !names.includes(p.name))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 8)
  }, [q, names])

  const add = (n: string) => {
    if (names.length >= COMPARE_MAX || names.includes(n)) return
    setNames((c) => [...c, n])
    setQ('')
  }
  const drop = (n: string) => setNames((c) => c.filter((x) => x !== n))

  /** Best value in a row, so the winner can be marked. Ties mark nobody. */
  const bestOf = (vals: (number | null)[], lower = false) => {
    const real = vals.filter((v): v is number => v !== null)
    if (real.length < 2) return null
    const b = lower ? Math.min(...real) : Math.max(...real)
    return real.filter((v) => v === b).length === 1 ? b : null
  }
  const pair = five.length === 2
  const gap = (vals: (number | null)[], dp = 0) => {
    if (!pair || vals[0] === null || vals[1] === null) return null
    const d = vals[0] - vals[1]
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(dp)}`
  }

  const cols = `cmp-grid c${five.length}${pair ? ' pair' : ''}`

  return (
    <div className="sheet">
      <div className="topbar">
        <span>
          Compare · <b>{five.length}</b> of {COMPARE_MAX}
        </span>
        <button onClick={onBack}>← Back</button>
      </div>
      <div className="rule2" />

      <label className="search">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" stroke="#6E6656" strokeWidth="1.5" />
          <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#6E6656" strokeWidth="1.5" />
        </svg>
        <input
          type="search"
          placeholder={five.length >= COMPARE_MAX ? 'Four is the limit — drop one to add another' : 'Add a player…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={five.length >= COMPARE_MAX}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {hits.length ? (
        <div className="cmp-hits">
          {hits.map((p) => (
            <button key={p.name} className="cmp-hit" onClick={() => add(p.name)}>
              <b>{p.name}</b>
              <i>
                {archetype(p)} · OVR {p.ovr}
              </i>
            </button>
          ))}
        </div>
      ) : null}

      {!five.length ? (
        <div className="lede">Search a player to put him in the first column, then add up to three more. Ratings first, then the season he actually played.</div>
      ) : (
        <>
          <div className={cols}>
            <div className="cmp-rowlabel head" />
            {five.map((p) => (
              <div key={p.name} className="cmp-card">
                <button className="cmp-drop" onClick={() => drop(p.name)} aria-label={`Remove ${p.name}`}>
                  ×
                </button>
                <b>{short(p.name)}</b>
                <span className="cmp-yr">{p.peak_season}</span>
                <i className="cmp-tag">{archetype(p)}</i>
                <div className="cmp-dials" title={OVR_TIP}>
                  <span className="cmp-dial you">
                    <em>{p.ovr}</em>OVR
                  </span>
                  <span className="cmp-dial">
                    <em>{p.o_ovr}</em>OFF
                  </span>
                  <span className="cmp-dial">
                    <em>{p.d_ovr}</em>DEF
                  </span>
                </div>
                <div className="cmp-meta">
                  {ht(p.attrs.height)} · {LINES[p.name]?.team ?? '—'} · {LINES[p.name]?.pos?.join('/') ?? '—'}
                </div>
              </div>
            ))}
            {pair ? <div className="cmp-rowlabel head gapcol">GAP</div> : null}
          </div>

          {GROUPS.map((g) => (
            <div className="card cmp-block" key={g.title}>
              <div className="card-head">
                <span className="label">{g.title}</span>
              </div>
              {g.keys.map((row) => {
                const vals = five.map((p) => p.attrs[row.k as AttrKey] ?? null)
                const best = bestOf(vals)
                return (
                  <div className={cols} key={row.k}>
                    <div className="cmp-rowlabel">{row.label}</div>
                    {vals.map((v, i) => (
                      <div key={five[i].name} className={`cmp-val ${v !== null && v === best ? 'best' : ''}`}>
                        {v ?? '—'}
                        <span className="cmp-bar" style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
                      </div>
                    ))}
                    {pair ? <div className="cmp-rowlabel gapcol">{gap(vals)}</div> : null}
                  </div>
                )
              })}
            </div>
          ))}

          <div className="card cmp-block">
            <div className="card-head">
              <span className="label">The season they played</span>
              <span className="cap">real numbers, not ratings</span>
            </div>
            {BOX.map((row) => {
              const vals = five.map((p) => {
                const v = LINES[p.name]?.[row.k]
                return typeof v === 'number' ? v : null
              })
              const lower = LOWER_IS_BETTER.has(row.label)
              const best = bestOf(vals, lower)
              const dp = 1
              return (
                <div className={cols} key={row.label}>
                  <div className="cmp-rowlabel">{row.label}</div>
                  {vals.map((v, i) => (
                    <div key={five[i].name} className={`cmp-val plain ${v !== null && v === best ? 'best' : ''}`}>
                      {v === null ? '—' : row.pct ? `${v.toFixed(1)}%` : v.toFixed(1)}
                    </div>
                  ))}
                  {pair ? <div className="cmp-rowlabel gapcol">{gap(vals, dp)}</div> : null}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
