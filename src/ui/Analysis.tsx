import { SIGMA } from '../config'
import { odds } from '../engine/odds'
import { defenseVs, MKNOBS, readsOf, teamOffense, transitionBonus, type Assignment, type DefenseVs, type Offense } from '../engine/offense'
import { applyMod, compile } from '../engine/resolver'
import type { Coach, Player } from '../engine/types'

const f1 = (v: number) => v.toFixed(1)
const sgn = (v: number, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d)
const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')

interface Side {
  label: string
  five: Player[]
  off: Offense
  transition: number
  steals: number
  d: DefenseVs // this side defending the other
  tone: 'you' | 'them'
}

/**
 * The full analysis of a pairing: how each offense is priced, how each defense
 * rates against the other five, and the matchup keys — every number the sim
 * uses to set the spread, with the player it comes from. One overlay, both
 * teams, readable top to bottom.
 */
export function Analysis({
  mine,
  theirs,
  myName,
  theirName,
  coach,
  assignment = 'optimal',
  onClose,
}: {
  mine: Player[]
  theirs: Player[]
  myName: string
  theirName: string
  coach?: Coach
  /** Our defensive assignment — what the sim actually scored. The opponent is always optimal. */
  assignment?: Assignment
  onClose: () => void
}) {
  const sigma = coach?.sigma ?? SIGMA
  const A: Side = { label: myName, five: mine, off: teamOffense(mine), transition: transitionBonus(mine), d: defenseVs(mine, theirs, assignment), steals: 0, tone: 'you' }
  const B: Side = { label: theirName, five: theirs, off: teamOffense(theirs), transition: transitionBonus(theirs), d: defenseVs(theirs, mine), steals: 0, tone: 'them' }
  A.steals = A.d.steals
  B.steals = B.d.steals
  const L = coach ? applyMod(compile(mine, theirs, assignment), coach.mod) : compile(mine, theirs, assignment)
  const R = compile(theirs, mine)
  const o = mine.length && theirs.length ? odds(L, R, sigma) : null
  const readsB = theirs.length ? readsOf(theirs) : null
  const readsA = mine.length ? readsOf(mine) : null

  const offense = (s: Side) => (
    <div className={`an-side ${s.tone}`}>
      <div className="an-team">{s.label}</div>
      <div className="an-big">
        {f1(s.off.off + MKNOBS.STEAL_PTS * s.steals)} <i>OFF</i>
      </div>
      <div className="an-rows">
        {s.off.lines.map((l, i) => {
          const p = s.five[i]
          return (
            <div className="an-row" key={l.name}>
              <span className="nm">{short(l.name)}</span>
              <span className="v">
                usg {p.attrs.usg_raw.toFixed(1)} → <b>{l.usg.toFixed(1)}</b>
              </span>
              <span className="v" title="era-relative TS: his TS minus his league's, recentred on 57.0">
                TS {(100 * (p.attrs.ts_rel ?? p.attrs.ts_raw)).toFixed(1)} → <b>{l.ts.toFixed(1)}</b>
              </span>
            </div>
          )
        })}
      </div>
      <div className="an-kv">
        <span>Scoring (Σ usage × TS × 2)</span>
        <b>{f1(s.off.base)}</b>
      </div>
      <div className="an-kv">
        <span>Fouls drawn × FT</span>
        <b>{sgn(s.off.ftPts)}</b>
      </div>
      <div className="an-kv">
        <span>Second chances (ORB × misses)</span>
        <b>×{s.off.orbMult.toFixed(3)}</b>
      </div>
      <div className="an-kv">
        <span>Transition off steals ({f1(s.steals)} generation)</span>
        <b>{sgn(MKNOBS.STEAL_PTS * s.steals)}</b>
      </div>
    </div>
  )

  const defense = (s: Side, vs: Side) => {
    const d = s.d
    const anchor = s.five[d.anchorIdx]
    const weak = s.five[d.weakIdx]
    const star = vs.five[d.star]
    const hide = vs.five[d.worstShooter]
    return (
      <div className={`an-side ${s.tone}`}>
        <div className="an-team">
          {s.label} <i>defending {vs.label}</i>
        </div>
        <div className="an-big">
          {f1(d.drtg)} <i>DRTG</i>
        </div>
        <div className="an-kv">
          <span>Anchor {anchor ? `— ${short(anchor.name)} (rimprot ${anchor.attrs.rimprot})` : ''}</span>
          <b>{f1(d.anchor)}</b>
        </div>
        <div className="an-sub">
          hidden on {hide ? short(hide.name) : '—'} (out {d.minOppOut}) · holds {Math.round(100 * d.hide)}% of its value
          {d.hide < 1 ? ' — five-out erodes it' : ''}
        </div>
        <div className="an-kv">
          <span>Protection — perdef deficit the anchor covers</span>
          <b>{sgn(d.cover)}</b>
        </div>
        <div className="an-sub">they hunt the paint {Math.round(100 * d.paintOrient)}% → cover scales ×{Math.min(1, d.paintOrient * 2).toFixed(2)}</div>
        <div className="an-kv">
          <span>Hunted man {weak ? `— ${short(weak.name)} (perdef ${weak.attrs.perdef})` : ''}</span>
          <b className="bad">{sgn(d.huntPen)} pts</b>
        </div>
        <div className="an-sub">
          hunter {star ? short(star.name) : '—'} · usage {star ? star.attrs.usg_raw.toFixed(1) : '—'} · paint share {Math.round(100 * d.starPaint)}%
          {d.starPaint > 0.5 ? ' → anchor mitigates' : ' → pull-up hunter, no anchor help'}
        </div>
        <div className="an-kv">
          <span>Steals — on-ball {f1(d.onball)} · team pressure {f1(d.team)}</span>
          <b>{f1(d.steals)}</b>
        </div>
        <div className="an-sub">
          vs {star ? short(star.name) : '—'}: ball security {star ? star.attrs.ballsec : '—'}
        </div>
        <div className="an-kv">
          <span>Glass — top-2 DRB vs their ORB crash</span>
          <b>{sgn(d.glass)}</b>
        </div>
        <div className="an-kv">
          <span>Fouls → free points</span>
          <b className="bad">{sgn(d.discPts)}</b>
        </div>
        <div className="an-kv">
          <span>Defensive index</span>
          <b>{f1(d.didx)}</b>
        </div>
        <div className="an-sub">
          DRtg = 110 − {MKNOBS.DRTG_COEF} × (Didx − 55) + hunted + fouls
        </div>
      </div>
    )
  }

  const keys = (s: Side, vs: Side, r: ReturnType<typeof readsOf> | null) =>
    r ? (
      <div className={`an-side ${s.tone}`}>
        <div className="an-team">
          Keys against {vs.label}
        </div>
        <div className="an-key">
          <span>{r.fiveOut ? 'Five out' : 'Hide your anchor on'}</span>
          <b>{short(r.worstShooter.name)}</b>
          <i>out {r.worstShooter.out}{r.fiveOut ? ' — no hiding spot, rim protection loses value' : ' — rim protection holds'}</i>
        </div>
        <div className="an-key">
          <span>Steal target</span>
          <b>{short(r.star.name)}</b>
          <i>usage {r.star.usg.toFixed(1)} · ball security {r.star.ballsec}</i>
        </div>
        <div className="an-key">
          <span>They hunt</span>
          <b>{r.paintOrient >= 0.6 ? 'the paint' : r.paintOrient <= 0.4 ? 'the perimeter' : 'both ways'}</b>
          <i>{Math.round(100 * r.paintOrient)}% at the rim</i>
        </div>
      </div>
    ) : null

  return (
    <div className="sheet sheet2 an" onClick={(e) => e.stopPropagation()}>
      <div className="topbar">
        <span>Full analysis</span>
        <button onClick={onClose}>← Back</button>
      </div>
      <div className="rule2" />

      {o ? (
        <div className="card an-head">
          <div className="an-spread">
            <span className="you">{myName}</span>
            <b className={o.spread >= 0 ? 'you' : 'them'}>{o.spread >= 0 ? '−' : '+'}{Math.abs(o.spread).toFixed(1)}</b>
            <span className="them">{theirName}</span>
          </div>
          <div className="an-odds">
            {(100 * o.game).toFixed(0)}% a game · {(100 * o.series).toFixed(0)}% the series · noise σ {sigma}
          </div>
          <div className="an-odds">
            talent {sgn(o.parts.talent)} · fit {sgn(o.parts.fit)} · modifiers {sgn(o.parts.modifiers)} = {sgn(o.parts.total)}
          </div>
          <div className="an-net">
            <span>
              NET <b>{sgn(L.net)}</b>
            </span>
            <span>
              NET <b>{sgn(R.net)}</b>
            </span>
          </div>
        </div>
      ) : (
        <div className="adv-err">Draft at least one player to rate the pairing.</div>
      )}

      <div className="an-sec">Offense — the usage economy</div>
      <div className="an-two">
        {offense(A)}
        {offense(B)}
      </div>

      <div className="an-sec">Defense — rated against the other five</div>
      <div className="an-two">
        {defense(A, B)}
        {defense(B, A)}
      </div>

      <div className="an-sec">Matchup keys</div>
      <div className="an-two">
        {keys(A, B, readsB)}
        {keys(B, A, readsA)}
      </div>
    </div>
  )
}
