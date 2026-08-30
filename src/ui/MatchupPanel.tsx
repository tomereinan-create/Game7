import { defenseVs, matchupMargin, MKNOBS, ratings100, REF_FIVE, scoreVs, type Assignment } from '../engine/offense'
import { fieldGauges, seasonGauges } from '../engine/gauges'
import type { Player } from '../engine/types'

const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')
const sgn = (v: number, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d)

/** A 0–100 dial: a three-quarter arc, the number in the middle. */
export function Dial({ label, value, tone, sub }: { label: string; value: number; tone: 'you' | 'them'; sub?: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  const arc = c * 0.75
  const on = (arc * Math.max(0, Math.min(100, value))) / 100
  return (
    <div className={`dial ${tone}`}>
      <svg viewBox="0 0 64 64" aria-label={`${label} ${value}`}>
        <circle className="track" cx="32" cy="32" r={r} strokeDasharray={`${arc} ${c}`} transform="rotate(135 32 32)" />
        <circle className="fill" cx="32" cy="32" r={r} strokeDasharray={`${on} ${c}`} transform="rotate(135 32 32)" />
        <text x="32" y="37" textAnchor="middle">
          {value}
        </text>
      </svg>
      <span className="dl">{label}</span>
      {sub ? <span className="ds">{sub}</span> : null}
    </div>
  )
}

/** A player's three little dials: OVR, OFF, DEF. */
/** What OVR actually is, for the hover — it is value, not the average of the two dials beside it. */
export const OVR_TIP = 'OVR blends offense, defense, and team-context value.'

export function PlayerDials({ p, tone = 'you' }: { p: Player; tone?: 'you' | 'them' }) {
  return (
    <span className="pdials" title={OVR_TIP}>
      <Dial label="OVR" value={p.ovr} tone={tone} />
      <Dial label="OFF" value={p.o_ovr} tone={tone} />
      <Dial label="DEF" value={p.d_ovr} tone={tone} />
    </span>
  )
}

/** The two dials a team card carries, with the raw numbers underneath. recal_64: pass `vs`
 * (a season, or 'field' for the campaign's opponents) to percentile WITHIN that pool — the
 * basis rides on the dial so a 64-18 champ is never judged against all of history unlabeled. */
export function TeamDials({ five, tone, vs }: { five: Player[]; tone: 'you' | 'them'; vs?: number | 'field' }) {
  if (vs !== undefined) {
    const g = vs === 'field' ? fieldGauges(five) : seasonGauges(five, vs)
    return (
      <div className="dials">
        <Dial label="OFF" value={g.off} tone={tone} sub={g.basis} />
        <Dial label="DEF" value={g.def} tone={tone} sub={g.basis} />
      </div>
    )
  }
  const r = ratings100(five)
  return (
    <div className="dials">
      <Dial label="OFF" value={r.off} tone={tone} sub={r.offRaw.toFixed(1)} />
      <Dial label="DEF" value={r.def} tone={tone} sub={r.drtgRef.toFixed(1)} />
    </div>
  )
}

/** Points of spread a defensive-index term is worth: didx × DRTG_COEF. */
const ptsOfIdx = (idx: number) => idx * MKNOBS.DRTG_COEF

/**
 * The matchup panel: how much THIS pairing shifts the margin against both
 * teams' neutral baselines, and the reads that explain it — each with the
 * points it is worth where the engine can say.
 */
export function MatchupPanel({
  mine,
  theirs,
  myName,
  theirName,
  assignment,
}: {
  mine: Player[]
  theirs: Player[]
  myName: string
  theirName: string
  assignment: Assignment
}) {
  const base = scoreVs(mine, REF_FIVE).net - scoreVs(theirs, REF_FIVE).net
  const actual = matchupMargin(mine, theirs, assignment)
  const swing = actual - base
  const us = defenseVs(mine, theirs, assignment)
  const them = defenseVs(theirs, mine)
  const anchorPts = (d: typeof us) => ptsOfIdx(0.26 * d.anchor * 0.9)
  const stealPts = (d: typeof us) => ptsOfIdx(0.2 * Math.min(99, d.steals) * 0.9) + MKNOBS.STEAL_PTS * d.steals
  const glassPts = (d: typeof us) => ptsOfIdx(0.12 * Math.max(0, 60 + d.glass / 4))
  const row = (k: string, a: string, b: string, note?: string) => (
    <div className="mp-row" key={k}>
      <span className="mp-k">{k}</span>
      <span className="mp-a">{a}</span>
      <span className="mp-b">{b}</span>
      {note ? <span className="mp-note">{note}</span> : null}
    </div>
  )
  const hideLine = (d: typeof us, vs: Player[]) =>
    `${short(vs[d.worstShooter].name)} (out ${d.minOppOut}) · ${Math.round(100 * d.hide)}% · ${sgn(-anchorPts(d))} pts`
  const huntLine = (d: typeof us, we: Player[], vs: Player[]) =>
    `${short(we[d.weakIdx].name)} hunted by ${short(vs[d.star].name)} · ${d.starPaint > 0.5 ? 'anchor helps' : 'no help'} · +${d.huntPen.toFixed(1)} pts`
  const stealLine = (d: typeof us, vs: Player[]) =>
    `${short(vs[d.star].name)} · ballsec ${vs[d.star].attrs.ballsec} × usg ${vs[d.star].attrs.usg_raw.toFixed(0)} · ${sgn(-stealPts(d))} pts`
  const glassLine = (d: typeof us) => `${d.glass >= 0 ? 'ours' : 'theirs'} by ${Math.abs(d.glass).toFixed(0)} · ${sgn(-glassPts(d))} pts`

  return (
    <div className="card mp">
      <div className="card-head">
        <span className="label">Matchup</span>
        <span className="cap">vs both teams’ neutral baselines</span>
      </div>
      <div className={`mp-head ${swing >= 0 ? 'you' : 'them'}`}>
        <b>
          {swing >= 0 ? 'Matchup: +' : 'Matchup: −'}
          {Math.abs(swing).toFixed(1)} pts
        </b>
        <i>
          {swing >= 0 ? `favours ${myName}` : `favours ${theirName}`} · neutral gap {sgn(base)} → this pairing {sgn(actual)}
        </i>
      </div>
      <div className="mp-cols">
        <span />
        <span className="you">{myName}</span>
        <span className="them">{theirName}</span>
      </div>
      {row('Anchor hides on', hideLine(us, theirs), hideLine(them, mine), 'points allowed saved by rim protection, after the hiding spot')}
      {row('Hunted man', huntLine(us, mine, theirs), huntLine(them, theirs, mine), 'points allowed to the star attacking the weakest defender')}
      {row('Steal target', stealLine(us, theirs), stealLine(them, mine), 'steal generation: points allowed saved plus transition scored')}
      {row('Glass', glassLine(us), glassLine(them), 'top-2 defensive rebounders vs their crash')}
    </div>
  )
}
