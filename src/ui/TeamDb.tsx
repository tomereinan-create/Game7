import { useEffect, useMemo, useRef, useState } from 'react'
import { seasonGauges } from '../engine/gauges'
import { archetype, PLAYERS } from '../engine/pool'
import { eligible, POSITIONS } from '../engine/positions'
import { ratings100 } from '../engine/offense'
import type { Player } from '../engine/types'
import { WHEEL, type TeamSeason } from './Draft'
import { useCard } from './CardSheet'
import { CourtFive } from './CourtFive'
import { DetailGrid, LINES } from './Stat'
import { useUserMode } from '../state/viewmode'
import { Dial, TeamDials } from './MatchupPanel'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
export const YEARS = [...new Set(WHEEL.map((t) => t.y))].sort((a, b) => b - a)
export { startingFive, winsOf } from '../engine/bestfive'
const f1 = (v: number | undefined) => (v === undefined ? '–' : v.toFixed(1))

import { startingFive, winsOf } from '../engine/bestfive'

function Row({ p, slot, open, onTap }: { p: Player; slot: string; open: boolean; onTap: () => void }) {
  const l = LINES[p.name]
  return (
    <>
      <button className="row dr tdb" onClick={onTap}>
        <span className="pname">
          <span className="who">
            <b>{p.name}</b>
            <i>
              {slot} · {archetype(p)}
            </i>
          </span>
        </span>
        <span className="mini">
          {f1(l?.ppg)} <i>·</i> {f1(l?.rpg)} <i>·</i> {f1(l?.apg)}
        </span>
        <span className="oppman-nums">
          <i>{p.ovr}</i>
          <i>{p.o_ovr}</i>
          <i>{p.d_ovr}</i>
        </span>
      </button>
      {open ? <DetailGrid p={p} /> : null}
    </>
  )
}

/** All-years search stops here — past this many rows the query is doing the work, not the reader. */
const CAP = 60

const YMAX = YEARS[0]
const YMIN = YEARS[YEARS.length - 1]
const clampYear = (n: number) => Math.min(YMAX, Math.max(YMIN, n))

/** "96" → 1996, "199" → the newest 199x, "2005" → 2005; empty → Any; a lone digit keeps the current pick. */
function resolveYear(raw: string): number | null | 'partial' {
  const d = raw.replace(/\D/g, '')
  if (!d) return null
  if (d.length === 1) return 'partial'
  if (d.length === 2) {
    const n = Number(d)
    return clampYear(n >= 80 ? 1900 + n : 2000 + n)
  }
  if (d.length === 3) return YEARS.find((y) => String(y).startsWith(d)) ?? 'partial'
  return clampYear(Number(d.slice(0, 4)))
}

// The startingFive backtrack is the expensive part — cached once per team-season,
// and the OVR and the gauges both read from it instead of re-deriving. Exported:
// the Custom and Versus team pickers rank on the same cache.
const FIVES = new Map<TeamSeason, Player[] | null>()
export function fiveOf(t: TeamSeason): Player[] | null {
  const hit = FIVES.get(t)
  if (hit !== undefined) return hit
  const five = startingFive(t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  const out = five.length === 5 ? five : null
  FIVES.set(t, out)
  return out
}

/**
 * Team OVR — his ruling: a COMPOSITE OF THE TWO GAUGES, not the mean card OVR.
 * The old average put a talent number (all-time card scale) beside the
 * within-season OFF/DEF percentiles, so Spurs '07 read "OVR 78" under 92/99
 * dials; now all three live on one scale: round((off + def) / 2). Every
 * surface (rows, detail head, the pickers, the OVR sort and its bounds)
 * routes through here. Unfieldable five stays null.
 */
export function ovrOf(t: TeamSeason): number | null {
  const g = gaugeOf(t)
  return g ? Math.round((g.off + g.def) / 2) : null
}

/** Season-percentile OFF/DEF of the team's best legal five, or null when the pool cannot field one. */
type TeamGauge = { off: number; def: number } | null
const GAUGES = new Map<TeamSeason, TeamGauge>()
function gaugeOf(t: TeamSeason): TeamGauge {
  const hit = GAUGES.get(t)
  if (hit !== undefined) return hit
  const five = fiveOf(t)
  let g: TeamGauge = null
  if (five) {
    const { off, def } = seasonGauges(five, t.y)
    g = { off, def }
  }
  GAUGES.set(t, g)
  return g
}

/** The row's right edge: the team's three mini dials, same idiom as a player's (his ruling).
 * Ice is the team tone; a ranked sort turns its own dial gold. No legal five reads "—". */
function RowDials({ t, sorted }: { t: TeamSeason; sorted: 'ovr' | 'off' | 'def' | null }) {
  const o = ovrOf(t)
  const g = gaugeOf(t)
  if (o === null || g === null) return <span className="tdb-gauge">—</span>
  return (
    <span className="pdials">
      <Dial label="OVR" value={o} tone={sorted === 'ovr' ? 'you' : 'them'} />
      <Dial label="OFF" value={g.off} tone={sorted === 'off' ? 'you' : 'them'} />
      <Dial label="DEF" value={g.def} tone={sorted === 'def' ? 'you' : 'them'} />
    </span>
  )
}

/** 1..99 or null; the inputs are free text, so garbage reads as no bound. */
const bound = (s: string) => {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? Math.min(99, Math.max(1, Math.round(n))) : null
}

const yy = (y: number) => `’${String(y % 100).padStart(2, '0')}`

/** The team database: pick a year, pick a team, read their best five and its ratings. */
export function TeamDb({ onBack }: { onBack: () => void }) {
  const [year, setYear] = useState<number | null>(YEARS[0])
  const [yearQ, setYearQ] = useState(String(YEARS[0]))
  const [picked, setPicked] = useState<TeamSeason | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [conf, setConf] = useState<'E' | 'W' | null>(null)
  const [sort, setSort] = useState<'rec' | 'az' | 'ovr' | 'off' | 'def'>('rec')
  // A second tap on the active chip flips the order; picking a new sort starts best-first again.
  const [flip, setFlip] = useState(false)
  const [minQ, setMinQ] = useState('')
  const [maxQ, setMaxQ] = useState('')
  const user = useUserMode()
  const openCard = useCard()
  // Opening a team starts at the top of its card (his report: the list's scroll carried over);
  // walking back restores the list right where he left it.
  const listScroll = useRef(0)
  useEffect(() => {
    window.scrollTo(0, picked ? 0 : listScroll.current)
  }, [picked])
  const pick = (t: TeamSeason) => {
    listScroll.current = window.scrollY
    setPicked(t)
  }

  const rating = sort === 'off' || sort === 'def' ? sort : null
  /** OVR and the gauges share the 1-99 scale, so the same Min/Max inputs bind whichever sort is on. */
  const ranked = rating !== null || sort === 'ovr'

  const pickSort = (k: typeof sort) => {
    if (k === sort) setFlip((f) => !f)
    else {
      setSort(k)
      setFlip(false)
    }
  }
  const chip = (k: typeof sort) => `sortb ${sort === k ? (flip ? 'on asc' : 'on') : ''}`

  const teams = useMemo(() => {
    const pool = WHEEL.filter((t) => (year === null || t.y === year) && (!conf || t.c === conf))
    if (!ranked) {
      const cmp = (a: TeamSeason, b: TeamSeason) =>
        sort === 'az' ? a.team.localeCompare(b.team) || b.y - a.y : winsOf(b.rec) - winsOf(a.rec) || b.y - a.y
      return pool.sort((a, b) => (flip ? cmp(b, a) : cmp(a, b))).map((t) => ({ t, g: null as TeamGauge }))
    }
    // The caches memoize for good: the first ranked sort over Any grinds every season once, then it's free.
    const lo = bound(minQ)
    const hi = bound(maxQ)
    const key = (t: TeamSeason) => (rating ? (gaugeOf(t)?.[rating] ?? null) : ovrOf(t))
    let rows = pool.map((t) => ({ t, g: rating ? gaugeOf(t) : null }))
    if (lo !== null || hi !== null)
      rows = rows.filter((r) => {
        const k = key(r.t)
        return k !== null && (lo === null || k >= lo) && (hi === null || k <= hi)
      })
    return rows.sort((a, b) => {
      const ka = key(a.t)
      const kb = key(b.t)
      // a pool with no legal five reads "—" and stays last in BOTH directions
      if (ka === null || kb === null) return (ka === null ? 1 : 0) - (kb === null ? 1 : 0)
      const d = kb - ka || winsOf(b.t.rec) - winsOf(a.t.rec) || b.t.y - a.t.y
      return flip ? -d : d
    })
  }, [year, conf, sort, rating, ranked, flip, minQ, maxQ])

  // A non-empty query takes over the list: every season of every matching franchise, newest first.
  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    return WHEEL.filter(
      (t) => (year === null || t.y === year) && (!conf || t.c === conf) && (t.team.toLowerCase().includes(s) || t.ab.toLowerCase().includes(s)),
    ).sort((a, b) => b.y - a.y || winsOf(b.rec) - winsOf(a.rec))
  }, [q, conf, year])

  const detail = useMemo(() => {
    if (!picked) return null
    const roster = picked.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)
    const { five, bench } = startingFive(roster)
    const fielded = five.filter((p): p is Player => !!p)
    return { roster, five, bench, dials: fielded.length === 5 ? ratings100(fielded) : null, fielded }
  }, [picked])

  return (
    <div className="sheetcard">
      <div className="topbar">
        <span>Team database</span>
        <button onClick={() => (picked ? (setPicked(null), setOpen(null)) : onBack())}>{picked ? '← Teams' : '← Back'}</button>
      </div>
      <div className="rule2" />

      {!picked ? (
        <>
          <label className="search">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" stroke="#6E6656" strokeWidth="1.5" />
              <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#6E6656" strokeWidth="1.5" />
            </svg>
            <input
              type="search"
              placeholder="Search a team…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                window.scrollTo(0, 0)
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="filterbar">
            <label className="dbnum">
              <span>Year</span>
              <input
                inputMode="numeric"
                placeholder="Any"
                value={yearQ}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  setYearQ(e.target.value)
                  const r = resolveYear(e.target.value)
                  if (r !== 'partial') setYear(r)
                }}
                autoComplete="off"
              />
            </label>
            <button
              className={`sortb ${year === null ? 'on' : ''}`}
              onClick={() => {
                setYearQ('')
                setYear(null)
              }}
            >
              Any
            </button>
            <button className={`sortb ${conf === 'E' ? 'on' : ''}`} onClick={() => setConf(conf === 'E' ? null : 'E')}>
              East
            </button>
            <button className={`sortb ${conf === 'W' ? 'on' : ''}`} onClick={() => setConf(conf === 'W' ? null : 'W')}>
              West
            </button>
            {found ? (
              <span className="filtercount">
                {found.length} season{found.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          {!found ? (
            <div className="filterbar">
              <button className={chip('rec')} onClick={() => pickSort('rec')}>
                Best record
              </button>
              <button className={chip('az')} onClick={() => pickSort('az')}>
                A–Z
              </button>
              <button className={chip('ovr')} onClick={() => pickSort('ovr')}>
                OVR
              </button>
              <button className={chip('off')} onClick={() => pickSort('off')}>
                OFF
              </button>
              <button className={chip('def')} onClick={() => pickSort('def')}>
                DEF
              </button>
              {ranked ? (
                <>
                  <label className="dbnum">
                    <span>Min</span>
                    <input type="number" min={1} max={99} placeholder="1" value={minQ} onChange={(e) => setMinQ(e.target.value)} />
                  </label>
                  <label className="dbnum">
                    <span>Max</span>
                    <input type="number" min={1} max={99} placeholder="99" value={maxQ} onChange={(e) => setMaxQ(e.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}

          {found ? (
            <>
              <div className="section-rule">
                <span>
                  {year === null ? 'All years' : year} · newest first
                  {conf ? (conf === 'E' ? ' · East only' : ' · West only') : ''}
                </span>
                <i />
              </div>
              {found.slice(0, CAP).map((t) => (
                <button key={t.team + t.y} className="lrow" onClick={() => pick(t)}>
                  <span className="lwho">
                    <b>{t.team}</b>
                    <i>
                      {yy(t.y)} · {t.ab}
                      {t.rec ? ` · ${t.rec}` : ''}
                    </i>
                  </span>
                  <RowDials t={t} sorted={null} />
                  <span className="tdb-go">→</span>
                </button>
              ))}
              {found.length > CAP ? <div className="cap hint">{(found.length - CAP).toLocaleString()} more seasons match — keep typing to narrow it.</div> : null}
              {found.length === 0 ? <div className="cap hint">No team by that name in the book.</div> : null}
            </>
          ) : (
            <>
              <div className="section-rule">
                <span>
                  {year === null ? 'All years' : year} · {teams.length} teams ·{' '}
                  {sort === 'az'
                    ? flip
                      ? 'Z to A'
                      : 'A to Z'
                    : sort === 'rec'
                      ? `${flip ? 'worst' : 'best'} record first`
                      : `${flip ? 'lowest' : 'best'} ${sort.toUpperCase()} first`}
                  {conf ? (conf === 'E' ? ' · East only' : ' · West only') : ''}
                </span>
                <i />
              </div>
              {(year === null ? teams.slice(0, CAP) : teams).map(({ t }) => (
                <button key={t.team + t.y} className="lrow" onClick={() => pick(t)}>
                  <span className="lwho">
                    <b>{t.team}</b>
                    <i>
                      {year === null ? `${yy(t.y)} · ` : ''}
                      {t.ab}
                      {t.rec ? ` · ${t.rec}` : ''}
                      {year === null ? '' : `${t.div ? ` · ${t.div}` : ''} · ${t.p.length} men on the card pool`}
                    </i>
                  </span>
                  <RowDials t={t} sorted={rating ?? (sort === 'ovr' ? 'ovr' : null)} />
                  <span className="tdb-go">→</span>
                </button>
              ))}
              {year === null && teams.length > CAP ? (
                <div className="cap hint">{(teams.length - CAP).toLocaleString()} more teams match — set a year, a conference or tighter bounds.</div>
              ) : null}
              {teams.length === 0 ? <div className="cap hint">No team inside those bounds.</div> : null}
            </>
          )}
        </>
      ) : detail ? (
        <>
          <div className="card" style={{ paddingBottom: 6 }}>
            <div className="card-head">
              <span className="label">
                {picked.y}
                {picked.rec ? ` · ${picked.rec}` : ''}
                {picked.div ? ` · ${picked.div}` : ''}
              </span>
              <span className="cap">Best five · OVR {ovrOf(picked) ?? '—'}</span>
            </div>
            <div className="opp-name">{picked.team}</div>
            {detail.dials ? <TeamDials five={detail.fielded} tone="them" vs={picked.y} /> : null}
            {/* his ruling: the five stands on a floor, not in a list — tap a spot for the full card */}
            <CourtFive
              spots={detail.five.map((p, i) => ({
                p,
                tag: p ? (user ? POSITIONS[i] : `${POSITIONS[i]} · ${p.ovr}`) : `${POSITIONS[i]} · open`,
                onTap: p ? () => openCard(p) : undefined,
              }))}
            />
            {detail.bench.length ? (
              <>
                <div className="rowhead dr tdb">
                  <span>The rest of the roster · {detail.bench.length}</span>
                  <span className="gcap">PTS · REB · AST</span>
                  <span className="gcap">OVR · O · D</span>
                </div>
                {detail.bench.map((p) => (
                  <Row key={p.name} p={p} slot={eligible(LINES[p.name]?.pos).join(' · ')} open={open === p.name} onTap={() => setOpen(open === p.name ? null : p.name)} />
                ))}
              </>
            ) : null}
          </div>
          <div className="cap hint">Only men in the card pool appear — a season the pipeline never rated is not here.</div>
        </>
      ) : null}
    </div>
  )
}
