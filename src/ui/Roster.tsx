import { useEffect, useMemo, useRef, useState } from 'react'
import { archetype, PLAYERS } from '../engine/pool'
import { Compare, COMPARE_MAX } from './Compare'
import type { AttrKey, Player, StatLine } from '../engine/types'
import { PlayerDials } from './MatchupPanel'
import { CardName } from './CardSheet'
import { Face } from './Face'
import { DetailGrid, LINES, SHEET } from './Stat'

type AxisKey = 'peak_season' | 'ovr' | 'o_ovr' | 'd_ovr'
type Key = 'name' | AxisKey | `attrs.${AttrKey}`

/** Sort rail: OVR, the 17 attributes in group order, then peak year. Default is OVR. */
const RAIL: { k: Key; label: string; short: string }[] = [
  { k: 'ovr', label: 'OVR', short: 'OVR' },
  { k: 'o_ovr', label: 'OFF', short: 'O' },
  { k: 'd_ovr', label: 'DEF', short: 'D' },
  ...SHEET.map((r) => ({
    k: `attrs.${r.k}` as Key,
    label: r.label.toUpperCase(),
    short: r.label.toUpperCase(),
  })),
  { k: 'peak_season', label: 'PEAK YR', short: 'YR' },
]

const valueOf = (p: Player, k: Key): number =>
  k === 'name' ? 0 : k.startsWith('attrs.') ? p.attrs[k.slice(6) as AttrKey] : (p[k as AxisKey] as number)

/** Anything sorted on that isn't already on the row surfaces as a fourth column. */
const inRow = (k: Key) => k === 'name' || k === 'ovr' || k === 'o_ovr' || k === 'd_ovr'

/** The real season line, the fields worth filtering on. `pct` marks the ones stored as percentages. */
const STATS: { k: keyof StatLine; label: string }[] = [
  { k: 'ppg', label: 'PTS' },
  { k: 'rpg', label: 'REB' },
  { k: 'apg', label: 'AST' },
  { k: 'spg', label: 'STL' },
  { k: 'bpg', label: 'BLK' },
  { k: 'topg', label: 'TOV' },
  { k: 'mpg', label: 'MPG' },
  { k: 'gp', label: 'GP' },
  { k: 'fgp', label: 'FG%' },
  { k: 'tpp', label: '3P%' },
  { k: 'ftp', label: 'FT%' },
  { k: 'ts', label: 'TS%' },
  { k: 'usg', label: 'USG%' },
  { k: 'per', label: 'PER' },
  { k: 'ws', label: 'WS' },
  { k: 'bpm', label: 'BPM' },
]
/** Every team that appears on a card, for the picker. */
const TEAMS = [...new Set(Object.values(LINES).map((l) => l?.team).filter((t): t is string => !!t))].sort()
const YEARS = { min: Math.min(...PLAYERS.map((p) => p.peak_season)), max: Math.max(...PLAYERS.map((p) => p.peak_season)) }

const ROW_H = 66
const OVERSCAN = 12

export function Roster({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState<Key>('ovr')
  // A second tap on the active chip flips the order; picking a new key starts best-first (A-first) again.
  const [flip, setFlip] = useState(false)
  const pickKey = (k: Key) => {
    if (k === key) setFlip((f) => !f)
    else {
      setKey(k)
      setFlip(false)
    }
  }
  const chip = (k: Key) => `sortb ${key === k ? (flip ? 'on asc' : 'on') : ''}`
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  /** The comparison tray: names picked off the list, in the order they were picked. */
  const [picked, setPicked] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [scroll, setScroll] = useState(0)
  const [viewH, setViewH] = useState(800)
  const sheet = useRef<HTMLDivElement>(null)
  // team / year / actual-stat filters. Empty means "no opinion", so the default view is the whole pool.
  const [team, setTeam] = useState('')
  const [yrFrom, setYrFrom] = useState('')
  const [yrTo, setYrTo] = useState('')
  const [statK, setStatK] = useState<keyof StatLine | ''>('')
  const [statOp, setStatOp] = useState<'>=' | '<='>('>=')
  const [statV, setStatV] = useState('')
  const [filtering, setFiltering] = useState(false)
  const activeFilters = [team, yrFrom, yrTo, statK && statV].filter(Boolean).length
  const clearFilters = () => {
    setTeam('')
    setYrFrom('')
    setYrTo('')
    setStatK('')
    setStatV('')
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const from = yrFrom ? Number(yrFrom) : null
    const to = yrTo ? Number(yrTo) : null
    const thr = statK && statV !== '' ? Number(statV) : null
    const list = PLAYERS.filter((p) => {
      if (needle && !p.name.toLowerCase().includes(needle)) return false
      if (from !== null && p.peak_season < from) return false
      if (to !== null && p.peak_season > to) return false
      const line = LINES[p.name]
      if (team && line?.team !== team) return false
      if (thr !== null) {
        const v = line?.[statK as keyof StatLine]
        // a card with no figure for that stat is not a match either way — the filter asks for evidence
        if (typeof v !== 'number') return false
        if (statOp === '>=' ? v < thr : v > thr) return false
      }
      return true
    })
    return list.sort((a, b) => {
      const d = key === 'name' ? a.name.localeCompare(b.name) : valueOf(b, key) - valueOf(a, key) || a.name.localeCompare(b.name)
      return flip ? -d : d
    })
  }, [key, flip, q, team, yrFrom, yrTo, statK, statOp, statV])

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const onScroll = () => setScroll(el.scrollTop)
    const onSize = () => setViewH(el.clientHeight)
    onSize()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onSize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onSize)
    }
  }, [])

  // THE ONE VARIABLE-HEIGHT ROW. The open panel's height is measured off the DOM and folded into
  // the window math: scroll past the panel is shifted back by its height before slicing, and the
  // pad on whichever side holds the open row reserves it. Without this the slice lagged the real
  // offset, and when the open row left the slice its panel unmounted, the list shrank and the
  // browser clamped the scroll straight back up — the press-a-player-then-scroll jump.
  const expRef = useRef<HTMLDivElement>(null)
  const [expH, setExpH] = useState(0)
  useEffect(() => {
    if (open && expRef.current) setExpH(expRef.current.offsetHeight)
  }, [open])
  const openIdx = open ? rows.findIndex((p) => p.name === open) : -1
  const panelAt = openIdx >= 0 ? (openIdx + 1) * ROW_H : Infinity
  const eff = scroll > panelAt ? Math.max(panelAt, scroll - expH) : scroll
  const first = Math.max(0, Math.floor(eff / ROW_H) - OVERSCAN)
  const count = Math.ceil(viewH / ROW_H) + OVERSCAN * 2
  const slice = rows.slice(first, first + count)
  const padTop = first * ROW_H + (openIdx >= 0 && openIdx < first ? expH : 0)
  const padBottom = Math.max(0, (rows.length - first - slice.length) * ROW_H) + (openIdx >= first + slice.length ? expH : 0)

  const extra = !inRow(key)
  const extraLabel = RAIL.find((r) => r.k === key)?.short ?? ''
  const rowCls = `row db ${extra ? 'x' : ''}`

  const toggle = (name: string) =>
    setPicked((c) => (c.includes(name) ? c.filter((x) => x !== name) : c.length >= COMPARE_MAX ? c : [...c, name]))

  if (comparing) return <Compare initial={picked} onBack={() => setComparing(false)} />

  return (
    <div className="sheet" ref={sheet}>
      <div className="topbar">
        <span>
          Database · <b>{rows.length.toLocaleString()}</b>
          {q ? ` of ${PLAYERS.length.toLocaleString()}` : ' players'}
        </span>
        <button className="cmp-open" onClick={() => setComparing(true)}>
          Compare{picked.length ? ` · ${picked.length}` : ''} →
        </button>
      </div>
      <div className="rule2" />

      <label className="search">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" stroke="#6E6656" strokeWidth="1.5" />
          <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#6E6656" strokeWidth="1.5" />
        </svg>
        <input
          type="search"
          placeholder="Search a player…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            if (sheet.current) sheet.current.scrollTop = 0
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="filterbar">
        <button className={`sortb ${activeFilters ? 'on' : ''}`} onClick={() => setFiltering((f) => !f)}>
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
        {activeFilters ? (
          <button className="sortb" onClick={clearFilters}>
            Clear
          </button>
        ) : null}
        {activeFilters ? <span className="filtercount">{rows.length.toLocaleString()} match</span> : null}
      </div>
      {filtering ? (
        <div className="filters">
          <label className="filt">
            <span>Team</span>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">any</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="filt">
            <span>Season</span>
            <span className="filt-pair">
              <input type="number" placeholder={String(YEARS.min)} value={yrFrom} onChange={(e) => setYrFrom(e.target.value)} min={YEARS.min} max={YEARS.max} />
              <i>to</i>
              <input type="number" placeholder={String(YEARS.max)} value={yrTo} onChange={(e) => setYrTo(e.target.value)} min={YEARS.min} max={YEARS.max} />
            </span>
          </label>
          <label className="filt">
            <span>Stat line</span>
            <span className="filt-pair">
              <select value={statK} onChange={(e) => setStatK(e.target.value as keyof StatLine | '')}>
                <option value="">any</option>
                {STATS.map((s) => (
                  <option key={s.k} value={s.k}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select value={statOp} onChange={(e) => setStatOp(e.target.value as '>=' | '<=')}>
                <option value=">=">at least</option>
                <option value="<=">at most</option>
              </select>
              <input type="number" placeholder="value" value={statV} onChange={(e) => setStatV(e.target.value)} />
            </span>
          </label>
          <div className="filt-note">The stat line is what he actually did that season — real Basketball-Reference numbers, not ratings.</div>
        </div>
      ) : null}

      <div className="rail-wrap">
        <div className="rail">
          <button className={chip('name')} onClick={() => pickKey('name')}>
            A–Z
          </button>
          {RAIL.map((r) => (
            <button key={r.k} className={chip(r.k)} onClick={() => pickKey(r.k)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="rail-fade" />
      </div>

      <div className="pool" style={{ marginTop: 10 }}>
        <div className={`rowhead db ${extra ? 'x' : ''}`} style={{ marginTop: 0 }}>
          <span>Player</span>
          <span className="gcap dialhead">
            <i>OVR</i>
            <i>OFF</i>
            <i>DEF</i>
          </span>
          {extra ? <span className="r on">{extraLabel} ▾</span> : null}
        </div>

        <div style={{ height: padTop }} />
        {slice.map((p) => (
          <div key={p.name} style={{ display: 'contents' }}>
            <div
              className={`${rowCls} ${open === p.name ? 'exp' : ''}`}
              role="button"
              tabIndex={0}
              aria-expanded={open === p.name}
              onClick={() => setOpen(open === p.name ? null : p.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen(open === p.name ? null : p.name)
                }
              }}
            >
              <span className="pname">
                <span
                  className={`cmp-pick ${picked.includes(p.name) ? 'on' : ''}`}
                  role="checkbox"
                  aria-checked={picked.includes(p.name)}
                  aria-label={`Compare ${p.name}`}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(p.name)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      toggle(p.name)
                    }
                  }}
                >
                  {picked.includes(p.name) ? '✓' : '+'}
                </span>
                <Face player={p} size={34} />
                <span className="who">
                  <CardName p={p} />
                  <i>{archetype(p)}</i>
                </span>
              </span>
              <PlayerDials p={p} />
              {extra ? <span className="pextra">{valueOf(p, key)}</span> : null}
            </div>
            {open === p.name ? (
              <div ref={expRef}>
                <DetailGrid p={p} />
              </div>
            ) : null}
          </div>
        ))}
        <div style={{ height: padBottom }} />
      </div>

      <div className="dock">
        <div className="dock-inner">
          <button className="btn ghost" onClick={onBack}>
            Back
          </button>
          {picked.length ? (
            <>
              {/* the season stays: the database is per-season, and two years of the same man are different players here */}
              <span className="cmp-tray">{picked.join(" · ")}</span>
              <button className="btn ghost" onClick={() => setPicked([])}>
                Clear
              </button>
              <button className="btn" onClick={() => setComparing(true)}>
                Compare {picked.length}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
