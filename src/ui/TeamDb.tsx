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
import { SeasonStrip, useYearKeys } from './SeasonStrip'

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

/** How many team-seasons the range list lays down at once; the rest arrive as you reach them. */
const PAGE = 60

const YMAX = YEARS[0]
const YMIN = YEARS[YEARS.length - 1]
const clampYear = (n: number) => Math.min(YMAX, Math.max(YMIN, n))

/**
 * THE YEAR RANGE (his ruling: "Make the year from to"). Two boxes, FROM and TO, and the list is
 * every team-season in [from, to] — the point being that one sort then runs across seasons, so the
 * '96 Bulls and the '17 Warriors stand in the same ranked list. from === to is the old single year.
 */
export type Span = [number, number]
export const inSpan = (y: number, [from, to]: Span) => y >= from && y <= to
/** "2026" for one season, "1996–2017" for a range — the caption and nothing else. */
export const spanLabel = ([from, to]: Span) => (from === to ? String(from) : `${from}–${to}`)
/** The box you touched wins: a FROM above the TO pulls TO up to meet it, so a backwards range
 *  reads as that one season rather than as nothing at all. Clamp, not swap. */
export const spanFrom = (a: number, [, to]: Span): Span => [a, Math.max(a, to)]
export const spanTo = (b: number, [from]: Span): Span => [Math.min(from, b), b]

/** The range outlives the visit, the way the user mode does: same try/catch, same game7. key. */
const SPAN_KEY = 'game7.teamdb.years'
export function loadSpan(): Span {
  try {
    const raw = localStorage.getItem(SPAN_KEY)
    const m = raw?.match(/^(\d{4})-(\d{4})$/)
    if (m) {
      const a = clampYear(Number(m[1]))
      const b = clampYear(Number(m[2]))
      if (a <= b) return [a, b]
    }
  } catch {
    /* private mode — the range still works for the session */
  }
  return [YMAX, YMAX]
}
function saveSpan([from, to]: Span) {
  try {
    localStorage.setItem(SPAN_KEY, `${from}-${to}`)
  } catch {
    /* private mode */
  }
}

/** "96" → 1996, "199" → the newest 199x, "2005" → 2005; empty → the end of the book; a lone digit keeps the current pick. */
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

/**
 * THE FRANCHISE LINEAGE — forty abbreviations in the book, thirty franchises today. The same table
 * the campaign script merges its all-time fives by (`scripts/campaigns.ts`), so the Thunder's strip
 * walks back into the Sonics years and the Charlotte line (Hornets · Bobcats · Hornets) is one team.
 */
const FRANCHISE: Record<string, string> = {
  NJN: 'BRK',
  CHH: 'CHO',
  CHA: 'CHO',
  NOH: 'NOP',
  NOK: 'NOP',
  KCK: 'SAC',
  SDC: 'LAC',
  VAN: 'MEM',
  SEA: 'OKC',
  WSB: 'WAS',
}
export const franchiseOf = (ab: string) => FRANCHISE[ab] ?? ab
/** One team-season, named: the chip's id and the key a row is found by. */
export const seasonId = (t: TeamSeason) => `${t.ab}${t.y}`

/** Every season this franchise ever played, oldest first, with its best by team OVR marked. */
export function franchiseYears(t: TeamSeason): { all: TeamSeason[]; best: TeamSeason | null } {
  const fr = franchiseOf(t.ab)
  const all = WHEEL.filter((x) => franchiseOf(x.ab) === fr).sort((a, b) => a.y - b.y)
  let best: TeamSeason | null = null
  let top = -1
  for (const x of all) {
    const o = ovrOf(x)
    // a season the pool cannot field a five for has no OVR, so it cannot be the best one
    if (o !== null && o > top) {
      top = o
      best = x
    }
  }
  return { all, best }
}

/** The team database: pick a span of years, pick a team, read their best five and its ratings. */
export function TeamDb({ onBack }: { onBack: () => void }) {
  const [span, setSpanState] = useState<Span>(loadSpan)
  const [from, to] = span
  const [fromQ, setFromQ] = useState(() => String(span[0]))
  const [toQ, setToQ] = useState(() => String(span[1]))
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
  // …but stepping a YEAR on the strip is not opening a team: it redraws the page you are already
  // reading, so the scroll must stay exactly where it is (his ruling: "no scroll jump").
  const stepping = useRef(false)
  useEffect(() => {
    if (stepping.current) {
      stepping.current = false
      return
    }
    window.scrollTo(0, picked ? 0 : listScroll.current)
  }, [picked])
  const pick = (t: TeamSeason) => {
    listScroll.current = window.scrollY
    setPicked(t)
  }

  /**
   * HIS RULING: "You can navigate here as well between years" — the franchise's seasons as the same
   * strip the player card has, marked BEST at its best team OVR. It follows the LINEAGE, not the
   * abbreviation, so the Thunder's strip walks back into the Seattle years.
   */
  const franchise = useMemo(() => (picked ? franchiseYears(picked) : null), [picked])
  const stripYears = useMemo(
    () => franchise?.all.map((t) => ({ id: seasonId(t), y: t.y, mark: t === franchise.best })) ?? [],
    [franchise],
  )
  const step = (id: string) => {
    const next = franchise?.all.find((t) => seasonId(t) === id)
    if (!next) return
    stepping.current = true
    setPicked(next)
  }
  // ← → walk the franchise's years — but not while a player card is open on top of the page,
  // because that sheet is stepping its own man's seasons with the same two keys.
  useYearKeys(!!picked && stripYears.length > 1, (d) => {
    if (document.querySelector('.sheet')) return
    setPicked((cur) => {
      if (!cur || !franchise) return cur
      const at = franchise.all.indexOf(cur) + d
      if (at < 0 || at >= franchise.all.length) return cur
      stepping.current = true
      return franchise.all[at]
    })
  })

  const setSpan = (next: Span) => {
    setSpanState(next)
    setFromQ(String(next[0]))
    setToQ(String(next[1]))
    saveSpan(next)
  }
  // An empty box is not a hole in the range: it reads as that end of the book, which is what the
  // placeholder says. A lone digit is still being typed and changes nothing.
  const editFrom = (v: string) => {
    setFromQ(v)
    const r = resolveYear(v)
    if (r === 'partial') return
    const next = spanFrom(r ?? YMIN, span)
    setSpanState(next)
    if (next[1] !== to) setToQ(String(next[1]))
    saveSpan(next)
  }
  const editTo = (v: string) => {
    setToQ(v)
    const r = resolveYear(v)
    if (r === 'partial') return
    const next = spanTo(r ?? YMAX, span)
    setSpanState(next)
    if (next[0] !== from) setFromQ(String(next[0]))
    saveSpan(next)
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
    const pool = WHEEL.filter((t) => inSpan(t.y, span) && (!conf || t.c === conf))
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
  }, [from, to, conf, sort, rating, ranked, flip, minQ, maxQ])

  // A non-empty query takes over the list: every season of every matching franchise, newest first.
  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    return WHEEL.filter((t) => inSpan(t.y, span) && (!conf || t.c === conf) && (t.team.toLowerCase().includes(s) || t.ab.toLowerCase().includes(s))).sort(
      (a, b) => b.y - a.y || winsOf(b.rec) - winsOf(a.rec),
    )
  }, [q, conf, from, to])

  // A wide range is 1,300 team-seasons and 3,900 dials — more DOM than a phone will paint in one
  // go — so the list lays down a page at a time and grows as the bottom comes near. The SORT still
  // runs over the whole range: what you see is the true top of the list, just not all of its tail.
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [teams, found])
  const more = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const el = more.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShown((s) => s + PAGE), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, teams, picked])

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
            {/* the span and its reset stay one atom, so at 375px the conference chips wrap under
                them in a pair rather than splitting East from West */}
            <div className="filtergrp">
              <label className="dbnum">
                <span>From</span>
                <input
                  inputMode="numeric"
                  placeholder={String(YMIN)}
                  value={fromQ}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => editFrom(e.target.value)}
                  onBlur={() => setFromQ(String(from))}
                  autoComplete="off"
                />
              </label>
              <label className="dbnum">
                <span>To</span>
                <input
                  inputMode="numeric"
                  placeholder={String(YMAX)}
                  value={toQ}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => editTo(e.target.value)}
                  onBlur={() => setToQ(String(to))}
                  autoComplete="off"
                />
              </label>
              <button className={`sortb ${from === YMIN && to === YMAX ? 'on' : ''}`} onClick={() => setSpan([YMIN, YMAX])}>
                Any
              </button>
            </div>
            <div className="filtergrp">
              <button className={`sortb ${conf === 'E' ? 'on' : ''}`} onClick={() => setConf(conf === 'E' ? null : 'E')}>
                East
              </button>
              <button className={`sortb ${conf === 'W' ? 'on' : ''}`} onClick={() => setConf(conf === 'W' ? null : 'W')}>
                West
              </button>
            </div>
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
                  {spanLabel(span)} · newest first
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
                  {spanLabel(span)} · {teams.length.toLocaleString()} teams ·{' '}
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
              {teams.slice(0, shown).map(({ t }) => (
                <button key={t.team + t.y} className="lrow" onClick={() => pick(t)}>
                  <span className="lwho">
                    <b>{t.team}</b>
                    <i>
                      {from === to ? '' : `${yy(t.y)} · `}
                      {t.ab}
                      {t.rec ? ` · ${t.rec}` : ''}
                      {from === to ? `${t.div ? ` · ${t.div}` : ''} · ${t.p.length} men on the card pool` : ''}
                    </i>
                  </span>
                  <RowDials t={t} sorted={rating ?? (sort === 'ovr' ? 'ovr' : null)} />
                  <span className="tdb-go">→</span>
                </button>
              ))}
              {teams.length > shown ? (
                <button ref={more} className="morebtn" onClick={() => setShown((s) => s + PAGE)}>
                  {(teams.length - shown).toLocaleString()} more seasons · show {Math.min(PAGE, teams.length - shown)}
                </button>
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
            {stripYears.length > 1 ? <SeasonStrip years={stripYears} cur={seasonId(picked)} go={step} mark="best" /> : null}
            {detail.dials ? <TeamDials five={detail.fielded} tone="them" vs={picked.y} /> : null}
            {/* his ruling: the five stands on a floor, not in a list — tap a spot for the full card */}
            <CourtFive
              spots={detail.five.map((p, i) => ({
                p,
                slot: POSITIONS[i],
                tag: p ? (user ? POSITIONS[i] : `${POSITIONS[i]} · ${p.ovr}`) : '',
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
