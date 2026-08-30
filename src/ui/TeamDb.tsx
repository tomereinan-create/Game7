import { useEffect, useMemo, useState } from 'react'
import { archetype, PLAYERS } from '../engine/pool'
import { eligible, POSITIONS } from '../engine/positions'
import { ratings100 } from '../engine/offense'
import type { Player } from '../engine/types'
import { WHEEL, type TeamSeason } from './Draft'
import { DetailGrid, LINES } from './Stat'
import { TeamDials } from './MatchupPanel'

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

/** The team database: pick a year, pick a team, read their best five and its ratings. */
export function TeamDb({ onBack }: { onBack: () => void }) {
  const [year, setYear] = useState(YEARS[0])
  const [picked, setPicked] = useState<TeamSeason | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [conf, setConf] = useState<'E' | 'W' | null>(null)
  const [sort, setSort] = useState<'rec' | 'az'>('rec')
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const teams = useMemo(
    () =>
      WHEEL.filter((t) => t.y === year && (!conf || t.c === conf)).sort((a, b) =>
        sort === 'az' ? a.team.localeCompare(b.team) : winsOf(b.rec) - winsOf(a.rec),
      ),
    [year, conf, sort],
  )

  // A non-empty query leaves the year rail behind: every season of every matching franchise, newest first.
  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    return WHEEL.filter((t) => (!conf || t.c === conf) && (t.team.toLowerCase().includes(s) || t.ab.toLowerCase().includes(s))).sort(
      (a, b) => b.y - a.y || winsOf(b.rec) - winsOf(a.rec),
    )
  }, [q, conf])

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
            <button className={`sortb ${conf === 'E' ? 'on' : ''}`} onClick={() => setConf(conf === 'E' ? null : 'E')}>
              East
            </button>
            <button className={`sortb ${conf === 'W' ? 'on' : ''}`} onClick={() => setConf(conf === 'W' ? null : 'W')}>
              West
            </button>
            {!found ? (
              <>
                <button className={`sortb ${sort === 'rec' ? 'on' : ''}`} onClick={() => setSort('rec')}>
                  Best record
                </button>
                <button className={`sortb ${sort === 'az' ? 'on' : ''}`} onClick={() => setSort('az')}>
                  A–Z
                </button>
              </>
            ) : (
              <span className="filtercount">
                {found.length} season{found.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {found ? (
            <>
              <div className="section-rule">
                <span>
                  All years · newest first
                  {conf ? (conf === 'E' ? ' · East only' : ' · West only') : ''}
                </span>
                <i />
              </div>
              {found.slice(0, CAP).map((t) => (
                <button key={t.team + t.y} className="lrow" onClick={() => setPicked(t)}>
                  <span className="lwho">
                    <b>{t.team}</b>
                    <i>
                      ’{String(t.y % 100).padStart(2, '0')} · {t.ab}
                      {t.rec ? ` · ${t.rec}` : ''}
                    </i>
                  </span>
                  <span className="tdb-go">→</span>
                </button>
              ))}
              {found.length > CAP ? <div className="cap hint">{(found.length - CAP).toLocaleString()} more seasons match — keep typing to narrow it.</div> : null}
              {found.length === 0 ? <div className="cap hint">No team by that name in the book.</div> : null}
            </>
          ) : (
            <>
              <div className="yr-rail">
                {YEARS.map((y) => (
                  <button key={y} className={`sortb ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>
                    {y}
                  </button>
                ))}
              </div>
              <div className="section-rule">
                <span>
                  {year} · {teams.length} teams · {sort === 'az' ? 'A to Z' : 'best record first'}
                  {conf ? (conf === 'E' ? ' · East only' : ' · West only') : ''}
                </span>
                <i />
              </div>
              {teams.map((t) => (
                <button key={t.team + t.y} className="lrow" onClick={() => setPicked(t)}>
                  <span className="lwho">
                    <b>{t.team}</b>
                    <i>
                      {t.ab}
                      {t.rec ? ` · ${t.rec}` : ''}
                      {t.div ? ` · ${t.div}` : ''} · {t.p.length} men on the card pool
                    </i>
                  </span>
                  <span className="tdb-go">→</span>
                </button>
              ))}
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
              <span className="cap">Best five by OVR</span>
            </div>
            <div className="opp-name">{picked.team}</div>
            {detail.dials ? <TeamDials five={detail.fielded} tone="them" vs={picked.y} /> : null}
            <div className="rowhead dr tdb">
              <span>Starting five</span>
              <span className="gcap">PTS · REB · AST</span>
              <span className="gcap">OVR · O · D</span>
            </div>
            {detail.five.map((p, i) =>
              p ? (
                <Row key={p.name} p={p} slot={POSITIONS[i]} open={open === p.name} onTap={() => setOpen(open === p.name ? null : p.name)} />
              ) : (
                <div className="row dr tdb slot-open" key={POSITIONS[i]}>
                  <span className="pname">
                    <span className="who">
                      <b>{POSITIONS[i]}</b>
                      <i>no man on the pool for the slot</i>
                    </span>
                  </span>
                  <span />
                  <span />
                </div>
              ),
            )}
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
