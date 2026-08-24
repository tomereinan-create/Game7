import { useEffect, useState } from 'react'
import PIPELINE from '../data/pipeline.json'
import type { AttrKey, Player } from '../engine/types'

/**
 * The "how every number is made" window. For each of the 17 attributes it shows
 * the formula (from data/build_ratings.py / RATINGS_UPDATE.md) and THIS
 * player-season's actual inputs, read from public/provenance.json — a sidecar
 * the pipeline emits alongside the ratings. Fetched lazily so the 3.8 MB never
 * enters the app bundle.
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
  formula: string
  rows: (p: Player, v: (number | null)[]) => Row[]
  note?: (p: Player, v: (number | null)[]) => string | null
}

const single = (k: AttrKey, title: string, formula: string, label: string, fmt: (x: number | null) => string): Section => ({
  k,
  title,
  formula,
  rows: (_p, v) => [{ label, value: fmt(v?.[0] ?? null) }],
})

const SECTIONS: Section[] = [
  {
    k: 'rim',
    title: 'paint',
    formula:
      'Paint scoring, 0–10 ft: 0.65 × paint-volume percentile + 0.35 × paint FG% percentile. Volume is discounted by the assisted share of 2P makes (up to −45%) — self-creators keep full credit.',
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
    note: (_p, v) =>
      v[0] === 1 ? null : 'No shot-location data before 1997 — inferred by a regression fitted on 1997–2005 (R² .78).',
  },
  {
    k: 'mid',
    title: 'mid',
    formula: 'Mid-range scoring, 10 ft to the arc: 0.65 × volume percentile + 0.35 × FG% percentile. No assisted discount.',
    rows: (_p, v) =>
      v[0] === 1
        ? [
            { label: 'mid attempts /100', value: n1(v[1]) },
            { label: 'mid FG%', value: pc(v[2]) },
          ]
        : [],
    note: (_p, v) => (v[0] === 1 ? null : 'Inferred with the paint regression (R² .60) — same features as paint.'),
  },
  {
    k: '3pt',
    title: '3pt',
    formula:
      'Max of two paths. GUNNER: 0.45 × era-adjusted 3PA volume + 0.55 × 3P% (percentiles vs the modern 2011–25 pool), chucker-gated below the season-median 3P%. DEADEYE: min(.95, 0.88 × accuracy + 0.12 × volume), needs ≥3 era-adjusted attempts/100.',
    rows: (_p, v) => [
      { label: 'path', value: v[0] === 0 ? 'GUNNER' : v[0] === 1 ? 'DEADEYE' : 'under 2 attempts/100 — FT-touch fallback' },
      { label: '3PA /100 (raw)', value: n1(v[1]) },
      { label: 'era multiplier', value: `×${n1(v[2])}` },
      { label: '3P%', value: pc(v[3]) },
      { label: 'volume percentile (era-adj, modern pool)', value: ptl(v[4]) },
      { label: 'accuracy percentile (modern pool)', value: ptl(v[5]) },
    ],
    note: (_p, v) => ((v[6] ?? 1) < 1 ? `Chucker gate applied: ×${n1(v[6])} — 3P% below that season's median.` : null),
  },
  single('ft', 'ft', 'The literal free-throw percentage of the season. Not a percentile.', 'FT%', (x) =>
    x === null ? '— (shown value is the stat itself)' : 'shown value is the stat itself',
  ),
  single('fouldraw', 'fouldraw', 'Within-season percentile of free-throw rate (FTA per FGA).', 'FT rate', n1),
  single(
    'volume',
    'volume',
    'True shot volume: the within-season percentile of USG% × (1 − TOV%/100), hardened ^1.15. It is the share of possessions he turned into a SHOT or a trip to the line — the turnover slice is removed, because ballsec already charges him for those and counting them here priced the same possession twice.',
    'USG% · TOV%',
    n1,
  ),
  single('efficiency', 'efficiency', 'Within-season percentile of true-shooting percentage.', 'TS%', pc),
  {
    k: 'rimprot',
    title: 'rimprot',
    formula:
      'Rim protection is pure shot deterrence: 0.55 × block% + 0.25 × height + 0.20 × DBPM (within-season percentiles), plus a bonus when a big man holds defensive votes. From 2014 on it is blended with measured evidence: NBA tracking defended-FG% on shots inside 6 feet, where the rim is actually protected. Rebounding is its own attribute (drb) and is not counted here.',
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
    formula:
      'Perimeter/impact defense: anchored on defensive reputation (All-Defensive selections + DPOY vote shares over a career window, decaying 15%/yr), plus DBPM, the defense his team actually played, and size. Each stat counts once: steals belong to perimdisrupt, and minutes and usage are out of perdef entirely — playing time is not defense. Entry to the voted band is graded — a fading legend slides rather than falling off a cliff. Without votes the composite is shrunk toward the league middle, but from 2014 on it is replaced by measured evidence: NBA tracking defended-FG% as closest defender on shots from 15 feet out — the shots a perimeter defender is actually responsible for, with the rim slice feeding rimprot instead. A thin sample is discounted toward neutral, and a man the league hunts every possession leans back on the composite — being targeted constantly is itself evidence.',
    rows: (_p, v) => [
      { label: 'defensive reputation (0–1)', value: n1(v[0]) },
      { label: 'DBPM', value: n1(v[1]) },
      { label: 'team def. rating', value: n1(v[2]) },
      { label: 'height', value: ft(v[3]) },
      { label: 'voted-band weight', value: v[6] == null ? '—' : n1(v[6]) },
      { label: 'tracking defended FG% 15 ft +', value: v[5] == null ? 'not tracked' : `${v[5] > 0 ? '+' : ''}${(100 * v[5]).toFixed(1)}%` },
      { label: 'all shots, for reference', value: v[8] == null ? 'not tracked' : `${v[8] > 0 ? '+' : ''}${(100 * v[8]).toFixed(1)}%` },
      { label: 'shots defended (season)', value: v[7] ? `${v[7]} — ${Math.round(100 * Math.min(1, v[7] / 350))}% blend weight` : 'not tracked' },
    ],
    note: (_p, v) =>
      v[5] != null && (v[6] ?? 0) < 1
        ? 'Measured on-ball evidence: opponents shot this much better or worse than expected against him, which replaces the no-vote shrinkage. How far it moves him depends on how many shots he actually defended.'
        : v[4] === 1
          ? 'No career All-D/DPOY votes — score shrunk toward the league middle.'
          : (v[6] ?? 0) < 1
            ? 'Partial voted-band membership: the selections are fading, so the score blends down smoothly.'
            : null,
  },
  single('perimdisrupt', 'perimdisrupt', 'Within-season percentile of steal rate.', 'STL%', n1),
  single('playvol', 'playvol', 'Within-season percentile of assist rate.', 'AST%', n1),
  {
    k: 'ballsec',
    title: 'ballsec',
    formula:
      'Two readings of the same turnovers, blended 65/35 and inverted. The RATIO is TOV% × 25 ÷ max(10, USG% + 0.5 × AST%): turnovers measured against total responsibility — the scoring load plus half the creation load, because a passer’s turnovers belong to passes his usage never counted. The RAW is the plain TOV% percentile. The ratio alone let a big enough load excuse any number of them, so a man could cough it up sixteen times a hundred plays and still read secure because he was busy. Load excuses turnovers; it never excuses them completely.',
    rows: (_p, v) => [
      { label: 'TOV%', value: n1(v?.[0] ?? null) },
      { label: 'USG%', value: n1(v?.[1] ?? null) },
      { label: 'AST%', value: n1(v?.[2] ?? null) },
      {
        label: 'ratio: TOV% × 25 ÷ max(10, USG% + 0.5×AST%)',
        value: v?.[0] == null ? '—' : n1(((v[0] ?? 13) * 25) / Math.max(10, (v[1] ?? 20) + 0.5 * (v[2] ?? 15))),
      },
      { label: 'blend', value: '0.65 × ratio percentile + 0.35 × TOV% percentile, inverted' },
    ],
  },
  single('orb', 'orb', 'Within-season percentile of offensive rebounds per 100 possessions.', 'ORB /100', n1),
  single('drb', 'drb', 'Within-season percentile of defensive-rebound rate.', 'DRB%', n1),
  single('discipline', 'discipline', 'Inverse within-season percentile of personal fouls per 100 possessions.', 'PF /100', n1),
  single('durability', 'durability', 'Within-season percentile of minutes played.', 'minutes', (x) =>
    x === null ? '—' : String(x),
  ),
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

  return (
    <div className="sheet sheet2" onClick={(e) => e.stopPropagation()}>
      <div className="topbar">
        <span>How the numbers are made</span>
        <button onClick={onClose}>← Back</button>
      </div>
      <div className="rule2" />
      <div className="adv-head">
        <div className="adv-name">{p.name}</div>
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
          <div className="adv-formula">
            A single season on modest volume is noisy, so every RATING on this card is a weighted blend of the season and
            its neighbours — 60% this year, 20% the year before, 20% the year after, renormalised when a neighbour is
            missing. An injured year is reached over — if the next season missed the minutes floor, the one after it takes that weight — so 75/25 now means there is genuinely nothing on that side. The season line below the card is never blended:
            those are the real numbers he put up that year.
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
              ) : (
                <div className="adv-note">The neighbours agreed with this season: the blend moved nothing.</div>
              )}
            </>
          ) : (
            <div className="adv-note">
              No qualifying neighbour season — he cleared the minutes floor in {p.peak_season} and not in the years either
              side, so this card stands alone, unblended.
            </div>
          )}
        </div>
      ) : null}

      {mine
        ? SECTIONS.map((sec) => {
            const v = mine[sec.k]
            const note = v && sec.note ? sec.note(p, v) : null
            return (
              <div className="card adv-card" key={sec.k}>
                <div className="card-head">
                  <span className="label">{sec.title}</span>
                  <span className="adv-val">{p.attrs[sec.k]}</span>
                </div>
                <div className="adv-formula">{sec.formula}</div>
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
                {note ? <div className="adv-note">{note}</div> : null}
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
