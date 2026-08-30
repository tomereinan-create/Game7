import { useEffect, useState } from 'react'
import PIPELINE from '../data/pipeline.json'
import type { AttrKey, Player } from '../engine/types'
import { useUserMode } from '../state/viewmode'

/**
 * The "how every number is made" window. For each of the 17 attributes it shows
 * THIS player-season's actual inputs, read from public/provenance.json — a
 * sidecar the pipeline emits alongside the ratings. Fetched lazily so the
 * 3.8 MB never enters the app bundle. The formula essays are gone by his
 * ruling — the inputs and values stand on their own.
 */
/** What the pipeline recorded about a card's season blend, when it has one. */
export interface Smooth {
  prev: number | null
  next: number | null
  /** [this season, previous, next] after renormalising for a missing neighbour. */
  w: [number, number, number]
  /** Only the attributes the blend actually moved: key -> value before blending. */
  was: Partial<Record<AttrKey, number>>
  /** True when the next-season slot reached two years out because the year between was missed. */
  gap?: boolean
}
type Prov = Record<string, Partial<Record<AttrKey, (number | null)[] | null>> & { smooth?: Smooth }>

let cache: Prov | null = null
let pending: Promise<Prov> | null = null
function loadProv(): Promise<Prov> {
  if (cache) return Promise.resolve(cache)
  pending ??= fetch('provenance.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((j: Prov) => (cache = j))
  return pending
}

const n1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10))
const pc = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 1000) / 10}%`)
const ptl = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `p${Math.round(v * 100)}`)
const ft = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Math.floor(v / 12)}'${Math.round(v % 12)}"`

interface Row {
  label: string
  value: string
}
interface Section {
  k: AttrKey
  title: string
  rows: (p: Player, v: (number | null)[]) => Row[]
}

const single = (k: AttrKey, title: string, label: string, fmt: (x: number | null) => string): Section => ({
  k,
  title,
  rows: (_p, v) => [{ label, value: fmt(v?.[0] ?? null) }],
})

const SECTIONS: Section[] = [
  {
    k: 'rim',
    title: 'paint',
    rows: (_p, v) =>
      v[0] === 1
        ? [
            { label: 'paint attempts /100 (self-created-adj)', value: n1(v[1]) },
            { label: 'paint FG%', value: pc(v[2]) },
            { label: 'assisted share of 2P makes', value: pc(v[3]) },
          ]
        : [
            { label: '2P%', value: pc(v[1]) },
            { label: 'FT%', value: pc(v[2]) },
            { label: 'FT rate', value: n1(v[3]) },
            { label: 'height', value: ft(v[4]) },
            { label: '2PA /100', value: n1(v[5]) },
            { label: 'usage', value: pc((v[6] ?? 0) / 100) },
          ],
  },
  {
    k: 'mid',
    title: 'mid',
    rows: (_p, v) =>
      v[0] === 1
        ? [
            { label: 'mid attempts /100', value: n1(v[1]) },
            { label: 'mid FG%', value: pc(v[2]) },
          ]
        : [],
  },
  {
    k: '3pt',
    title: '3pt',
    rows: (_p, v) => [
      { label: 'path', value: v[0] === 0 ? 'GUNNER' : v[0] === 1 ? 'DEADEYE' : 'under 2 attempts/100 — FT-touch fallback' },
      { label: '3PA /100 (raw)', value: n1(v[1]) },
      { label: 'era multiplier', value: `×${n1(v[2])}` },
      { label: '3P%', value: pc(v[3]) },
      { label: 'volume percentile (era-adj, modern pool)', value: ptl(v[4]) },
      { label: 'accuracy percentile (modern pool)', value: ptl(v[5]) },
      // the gate multiplier is a season input, not an essay — it stays as a row
      ...((v[6] ?? 1) < 1 ? [{ label: 'chucker gate', value: `×${n1(v[6])}` }] : []),
    ],
  },
  single('ft', 'ft', 'FT%', (x) => (x === null ? '—' : 'shown value is the stat itself')),
  single('fouldraw', 'fouldraw', 'FT rate', n1),
  single('volume', 'volume', 'USG% · TOV%', n1),
  single('efficiency', 'efficiency', 'TS%', pc),
  {
    k: 'rimprot',
    title: 'rimprot',
    rows: (_p, v) => [
      { label: 'block %', value: n1(v[0]) },
      { label: 'height', value: ft(v[1]) },
      { label: 'DBPM', value: n1(v[2]) },
      { label: 'defensive reputation (votes, decayed)', value: n1(v[3]) },
      { label: 'tracking defended FG% inside 6 ft', value: v[4] == null ? 'not tracked' : `${v[4] > 0 ? '+' : ''}${(100 * v[4]).toFixed(1)}%` },
    ],
  },
  {
    k: 'perdef',
    title: 'perdef',
    rows: (_p, v) => [
      { label: 'defensive reputation (0–1)', value: n1(v[0]) },
      { label: 'DBPM', value: n1(v[1]) },
      { label: 'team def. rating', value: n1(v[2]) },
      { label: 'height', value: ft(v[3]) },
      { label: 'voted-band weight', value: v[6] == null ? '—' : n1(v[6]) },
      { label: 'tracking defended FG% 6 ft +', value: v[5] == null ? 'not tracked' : `${v[5] > 0 ? '+' : ''}${(100 * v[5]).toFixed(1)}%` },
      { label: 'shots defended (season)', value: v[7] ? `${v[7]} — ${Math.round(100 * Math.min(1, v[7] / 350))}% blend weight` : 'not tracked' },
    ],
  },
  single('perimdisrupt', 'perimdisrupt', 'STL%', n1),
  single('playvol', 'playvol', 'AST%', n1),
  {
    k: 'ballsec',
    title: 'ballsec',
    rows: (_p, v) => [
      { label: 'TOV%', value: n1(v?.[0] ?? null) },
      { label: 'USG%', value: n1(v?.[1] ?? null) },
      { label: 'AST%', value: n1(v?.[2] ?? null) },
      { label: 'ratio', value: v?.[0] == null ? '—' : n1(((v[0] ?? 13) * 25) / Math.max(10, (v[1] ?? 20) + 0.5 * (v[2] ?? 15))) },
    ],
  },
  single('orb', 'orb', 'ORB /100', n1),
  single('drb', 'drb', 'DRB%', n1),
  single('discipline', 'discipline', 'PF /100', n1),
  single('durability', 'durability', 'minutes', (x) => (x === null ? '—' : String(x))),
]

export function Advanced({ p, onClose }: { p: Player; onClose: () => void }) {
  const [prov, setProv] = useState<Prov | null>(cache)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadProv()
      .then((j) => live && setProv(j))
      .catch((e) => live && setErr(String(e)))
    return () => {
      live = false
    }
  }, [])

  const mine = prov?.[p.name]
  const user = useUserMode()

  return (
    <div className="sheet sheet2" onClick={(e) => e.stopPropagation()}>
      <div className="topbar">
        <span>How the numbers are made</span>
        <button onClick={onClose}>← Back</button>
      </div>
      <div className="rule2" />
      <div className="adv-head">
        <div className="adv-name">{p.name}</div>
        {user ? null : (
          <div className="adv-ovr">
            OVR <b>{p.ovr}</b> · OFF <b>{p.o_ovr}</b> · DEF <b>{p.d_ovr}</b>
          </div>
        )}
        <div className="adv-sub">
          Season {p.peak_season} · every rating is a within-season percentile of real Basketball-Reference statistics —
          this player against that year's league.
        </div>
        <div className="adv-ver">
          pipeline v{PIPELINE.version} · {PIPELINE.cards.toLocaleString()} cards · smoothed export is the shared
          calibration base
        </div>
      </div>

      {err ? <div className="adv-err">Could not load the provenance file ({err}).</div> : null}
      {!prov && !err ? <div className="adv-err">Loading…</div> : null}

      {mine ? (
        <div className="card adv-card">
          <div className="card-head">
            <span className="label">Season smoothing</span>
            <span className="adv-val">{mine.smooth ? `${Math.round(100 * mine.smooth.w[0])}%` : '100%'}</span>
          </div>
          {mine.smooth ? (
            <>
              <div className="adv-rows">
                <div className="adv-row">
                  <span>this season {p.peak_season}</span>
                  <b>{Math.round(100 * mine.smooth.w[0])}%</b>
                </div>
                {mine.smooth.prev ? (
                  <div className="adv-row">
                    <span>previous {mine.smooth.prev}</span>
                    <b>{Math.round(100 * mine.smooth.w[1])}%</b>
                  </div>
                ) : null}
                {mine.smooth.next ? (
                  <div className="adv-row">
                    <span>
                      next {mine.smooth.next}
                      {mine.smooth.gap ? ` · ${mine.smooth.next - 1} missed the minutes floor` : ''}
                    </span>
                    <b>{Math.round(100 * mine.smooth.w[2])}%</b>
                  </div>
                ) : null}
              </div>
              {Object.keys(mine.smooth.was).length ? (
                <div className="adv-rows">
                  {(Object.entries(mine.smooth.was) as [AttrKey, number][]).map(([k, was]) => (
                    <div className="adv-row" key={k}>
                      <span>{k}</span>
                      <b>
                        {was} → {p.attrs[k]}
                      </b>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {mine
        ? SECTIONS.map((sec) => {
            const v = mine[sec.k]
            return (
              <div className="card adv-card" key={sec.k}>
                <div className="card-head">
                  <span className="label">{sec.title}</span>
                  <span className="adv-val">{p.attrs[sec.k]}</span>
                </div>
                {v && sec.rows(p, v).length ? (
                  <div className="adv-rows">
                    {sec.rows(p, v).map((r) => (
                      <div className="adv-row" key={r.label}>
                        <span>{r.label}</span>
                        <b>{r.value}</b>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })
        : null}

      <div className="dock">
        <div className="dock-inner">
          <button className="btn ghost" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
