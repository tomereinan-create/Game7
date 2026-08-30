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

/** The team database: pick a year, pick a team, read their best five and its ratings. */
export function TeamDb({ onBack }: { onBack: () => void }) {
  const [year, setYear] = useState(YEARS[0])
  const [picked, setPicked] = useState<TeamSeason | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const teams = useMemo(() => WHEEL.filter((t) => t.y === year).sort((a, b) => winsOf(b.rec) - winsOf(a.rec)), [year])

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
          <div className="yr-rail">
            {YEARS.map((y) => (
              <button key={y} className={`sortb ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
          <div className="section-rule">
            <span>
              {year} · {teams.length} teams · best record first
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
