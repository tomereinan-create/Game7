import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { seasonGauges } from '../engine/gauges'
import { teamLine } from '../engine/teamline'
import { archetype, PLAYERS } from '../engine/pool'
import { eligible, POSITIONS } from '../engine/positions'
import { bestStyle, STYLES, type Style } from '../engine/tactics'
import type { Player } from '../engine/types'
import { WHEEL, type TeamSeason } from './Draft'
import { CardName, useCard } from './CardSheet'
import { CourtFive } from './CourtFive'
import { clubChip, ratingTone, teamColor } from './teamColors'
import { LINES, Mini, StatHead } from './Stat'
import { useUserMode } from '../state/viewmode'
import { Dial } from './MatchupPanel'
import { SeasonStrip, useYearKeys } from './SeasonStrip'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
export const YEARS = [...new Set(WHEEL.map((t) => t.y))].sort((a, b) => b - a)
export { startingFive, winsOf } from '../engine/bestfive'

import { startingFive, winsOf } from '../engine/bestfive'

/**
 * A man on the rest of the roster — his ruling: "Also pressing on a bench player will open this
 * page same as starters". The row used to unfold a grid of attributes under itself while the five
 * on the floor opened the player card; now the whole row opens the card, and the name carries the
 * same dotted underline it has on every other roster row in the app.
 */
export function RosterRow({ p, slot }: { p: Player; slot: string }) {
  const openCard = useCard()
  /**
   * USER MODE: the roster keeps what he did and drops what the engine makes of it. The five on the
   * floor above these rows has printed positions rather than OVRs since the design bundle landed;
   * the bench underneath it went on printing all three verdicts, which is the same card face-up
   * one row lower. `blind` takes the column out of the grid rather than emptying it, so the name
   * and the box line spread into the space instead of leaving a hole where a rating was.
   */
  const user = useUserMode()
  return (
    <button className={`row dr tdb${user ? ' blind' : ''}`} onClick={() => openCard(p)}>
      <span className="pname">
        <span className="who">
          <CardName p={p} />
          <i>
            {slot} · {archetype(p)}
          </i>
        </span>
      </span>
      <Mini name={p.name} />
      {user ? null : (
        <span className="oppman-nums">
          <i>{p.ovr}</i>
          <i>{p.o_ovr}</i>
          <i>{p.d_ovr}</i>
        </span>
      )}
    </button>
  )
}

/** How many team-seasons the list lays down at once; the rest arrive as you reach them. */
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

/** The five's best tactic fit (five-out, pick-and-roll, ...), cached the same way as the gauges. */
const TACTICS = new Map<TeamSeason, Style | null>()
function tacticOf(t: TeamSeason): Style | null {
  const hit = TACTICS.get(t)
  if (hit !== undefined) return hit
  const five = fiveOf(t)
  const out = five ? bestStyle(five).style : null
  TACTICS.set(t, out)
  return out
}
const tacticLabel = (s: Style) => STYLES.find((x) => x.key === s)?.label ?? s

/**
 * THE BOARD — Claude Design "Team Database Redesigns", board 1d Broadcast Board. HIS RULING,
 * 2026-09-21, verbatim: "Use 1d. The englarged team will only be the first one and the rest will
 * be pressable."
 *
 * 1d is one SPOTLIGHT drawn at size over a dense ticker: a hero panel washed in the club's colour
 * with the record set enormous beside three rings, and under it a run of 50px rows, each with the
 * club's second colour down its left edge. The board's own Tweaks let the spotlight be moved to
 * any rank; his ruling fixes it — THE HERO IS ALWAYS THE HEAD OF THE LIST, whatever the list is
 * sorted by, and every other season is a row you can press. A spotlight that could be any rank is
 * a second piece of state on a screen that already carries ten filters; pinned to the top it is
 * the same fact the list already states, drawn at the size that fact deserves.
 *
 * BOTH ARE PRESSABLE, THE HERO INCLUDED. "The rest will be pressable" is about the ticker being
 * rows you can open rather than a read-out; it is not an instruction to make the best team in the
 * book the one team on the screen that cannot be opened.
 *
 * WHAT IS TAKEN FROM 1d AND WHAT IS NOT is the same split board 1b got when it was adopted here:
 * the arena keeps the furniture. 1d's own palette — a #07080C ground, Chakra Petch, a red LIVE dot
 * — is not the room this app is in, so the panel is the app's surfaces, the faces are the house's
 * two, and the only colour on the board is the colour that was already earned: the club's, through
 * `clubChip` and `teamColor`, and the rating's, through `ratingTone`. What IS taken is 1d's SHAPE:
 * hero over ticker, the club's wash behind the hero, the record as the biggest thing on the
 * screen, the accent edge down every row, and the three ratings riding the far side of each line.
 *
 * ==========================================================================================
 * TOMBSTONE — `TeamCard`, board 1b Night Game, 2026-09-16 to 2026-09-21.
 *
 * Every season was a card in a two-across grid: the club's chip, the team and its line beside it,
 * the rank leading that line, and three `Dial` rings on the far side. It is superseded whole, but
 * the two things HIS OWN rulings bolted onto it were never 1b's and they carry over unchanged:
 *   · the chip in the club's colours — "in the short of the team name (OKC) have the colors of the
 *     team";
 *   · the ratings on the white-at-50 scale — "either red green or white, depending of how far is
 *     it from 50 (50 is white)".
 * The RINGS survive on the hero, which is the one place on this board with room for a ring ("the
 * circles that we have for OVR DEF OFF same as players"); the ticker prints the same three numbers
 * in the same tones, because three dials inside a 46px row would be the card this board replaces,
 * one row lower.
 * ==========================================================================================
 */

/**
 * The club's primary driven down toward black — 1d's own `shade(c1, .62)`, which is the wash that
 * puts a hero in its team's colour without putting a team's colour behind a page of type. It lives
 * here rather than in teamColors because this is the only screen that asks for it.
 */
const wash = (hex: string, f: number) =>
  'rgb(' +
  [1, 3, 5]
    .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f))
    .join(',') +
  ')'

/**
 * THE HERO'S ACCENT — the club's second colour, EXCEPT WHEN THAT COLOUR IS BLACK. 1d draws its
 * rank, its pill and the pill's border in `c2`, which works because the board's twenty teams were
 * hand-picked with bright seconds. Ours are the real thirty: Chicago's second is #111111 and
 * Brooklyn's deep is near it, so a pill drawn in the club's accent on a wash that is already the
 * club's primary at 62% would be a black outline on a black field — the tag would simply not be
 * there. Anything under a tenth of relative luminance falls back to the club's own ink, which is
 * the colour that club already letters its chip in.
 */
function accentOf(c: { accent: string; ink: string }): string {
  const lum = [1, 3, 5]
    .map((i) => parseInt(c.accent.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  return lum < 0.1 ? c.ink : c.accent
}

/** The three ratings of one team-season, in the order the board prints them. */
function ratingsOf(t: TeamSeason) {
  const g = gaugeOf(t)
  const o = ovrOf(t)
  return {
    live: o !== null && g !== null,
    rows: [
      { k: 'ovr' as const, v: o },
      { k: 'off' as const, v: g?.off ?? null },
      { k: 'def' as const, v: g?.def ?? null },
    ],
  }
}

/**
 * THE SPOTLIGHT — the head of the list, drawn at size.
 *
 * `tag` is 1d's own pill and it is the one thing on the hero that had to be re-thought rather than
 * copied. The board hard-codes "BEST RECORD · 1980–2026" because its list has one order; this list
 * has five sorts and either direction of each, so the pill says what actually put this team at the
 * top — "BEST DEF · 1996–2017", "LOWEST OVR · 2026" — which is the sort and the span the caption
 * above already states, said in the hero's own voice.
 */
function TeamHero({ t, sorted, tag, onPick, span: [from, to] }: { t: TeamSeason; sorted: 'ovr' | 'off' | 'def' | null; tag: string; onPick: () => void; span: Span }) {
  const { live, rows } = ratingsOf(t)
  const c = teamColor(t.ab)
  return (
    <button
      className="thero"
      onClick={onPick}
      style={
        {
          ...clubChip(t.ab),
          '--hero-wash': `linear-gradient(115deg, ${wash(c.primary, 0.62)} 0%, var(--surface) 68%)`,
          '--hero-accent': accentOf(c),
        } as React.CSSProperties
      }
    >
      <span className="thero-body">
        <span className="thero-id">
          <em className="thero-rank">#1</em>
          <span className="tcard-ab">{t.ab}</span>
          <span className="thero-who">
            <b>{t.team}</b>
            <i>
              {from === to ? '' : `${yy(t.y)} · `}
              {t.div ? `${t.div} · ` : ''}
              {t.p.length} men on pool
            </i>
          </span>
        </span>
        <span className="thero-rec">
          <b>{t.rec ?? '—'}</b>
          <em className="thero-tag">{tag}</em>
        </span>
      </span>
      {live ? (
        <span className="thero-dials">
          {rows.map(({ k, v }) => (
            <span className={`thero-dial ${sorted === k ? 'on' : ''}`} key={k}>
              <Dial label={k.toUpperCase()} value={v!} tone="scale" color={ratingTone(v)} />
            </span>
          ))}
        </span>
      ) : (
        <span className="tcard-nofive">No legal five in the card pool</span>
      )}
    </button>
  )
}

/**
 * ONE LINE OF THE TICKER, AND IT IS A BUTTON — the second half of his ruling. 1d's row exactly:
 * the rank, the club, who it is with its season under it, the record, and the three ratings on the
 * far side, with the club's accent down the left edge so a run of rows reads as a run of clubs.
 */
function TeamTick({ t, at, sorted, onPick, span: [from, to] }: { t: TeamSeason; at: number; sorted: 'ovr' | 'off' | 'def' | null; onPick: () => void; span: Span }) {
  const { rows } = ratingsOf(t)
  const c = teamColor(t.ab)
  return (
    <button className="ttick" onClick={onPick} style={{ ...clubChip(t.ab), '--tick-edge': accentOf(c) } as React.CSSProperties}>
      <em className="ttick-rank">#{at + 1}</em>
      <span className="tcard-ab">{t.ab}</span>
      <span className="ttick-who">
        <b>{t.team}</b>
        <i>
          {from === to ? '' : `${yy(t.y)} · `}
          {t.div || t.ab}
        </i>
      </span>
      <span className="ttick-rec">{t.rec ?? '—'}</span>
      <span className="ttick-nums">
        {rows.map(({ k, v }) => (
          <span className={`ttick-num ${sorted === k ? 'on' : ''}`} key={k}>
            <i>{k.toUpperCase()}</i>
            <b style={{ color: ratingTone(v) }}>{v ?? '—'}</b>
          </span>
        ))}
      </span>
    </button>
  )
}

/**
 * THE REAL LINE, AS THE LEAGUE KEPT IT — his ruling, 2026-09-21: "add more(as many as possible)
 * real (basic, not advanced) stats on the team from basketball ref."
 *
 * IT CARRIES NO HEAD — his ruling, 2026-09-22: "Remove TEAM.2016 ▸ PER GAME · 82 GAMES · RANK 1 OF
 * 30 IS BEST · BASKETBALL REFERENCE". The strapline was a caption explaining a table that explains
 * itself: the four labels down the left already say TEAM, LG RANK, OPP, LG RANK, and the season is
 * on the chip at the top of the page. The table starts at the table now.
 *
 * A season the dump has no row for prints nothing at all rather than a row of dashes: the pool
 * reaches back to 1980 and so does the file, so the only way here is a team-season that never
 * played (and there is none in the wheel).
 */
function TeamLineBlock({ t }: { t: TeamSeason }) {
  const line = teamLine(t.ab, t.y)
  if (!line) return null
  return (
    <>
      {/* ONE GRID, FIVE ROWS, NINETEEN COLUMNS — his ruling: "have the stats be 4 lines - basic
          stats. League ranking. Opp basic stats. League ranking." A column has to line up down all
          four lines or a rank under a figure means nothing, so the whole block is a single grid and
          every row is just cells in it; a row of its own would only line up by luck. */}
      <div className="tdb-line" style={{ '--cols': line.cols.length } as React.CSSProperties}>
        <span className="tdb-lab head" />
        {line.cols.map((c) => (
          <span className="tdb-col" key={c}>
            {c}
          </span>
        ))}
        {line.rows.map((r, i) => (
          <Fragment key={`${r.label}${r.side}${i}`}>
            <span className={`tdb-lab ${r.kind} ${r.side}`}>{r.label}</span>
            {r.cells.map((v, j) => (
              <span className={`tdb-num ${r.kind} ${r.side}`} key={line.cols[j]}>
                {v}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
    </>
  )
}

/** 1..99 or null; the inputs are free text, so garbage reads as no bound. */
const bound = (s: string) => {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? Math.min(99, Math.max(1, Math.round(n))) : null
}

const yy = (y: number) => `’${String(y % 100).padStart(2, '0')}`

export type Sort = 'rec' | 'az' | 'ovr' | 'off' | 'def'

/** The sort, said short, for the SORT BY row's hint: "Record · best first", "OVR · lowest first". */
export const sortHint = (s: Sort, flip: boolean) =>
  s === 'az' ? (flip ? 'Z to A' : 'A to Z') : s === 'rec' ? `Record · ${flip ? 'worst' : 'best'} first` : `${s.toUpperCase()} · ${flip ? 'lowest' : 'best'} first`

/** The four things behind FILTERS. One opens at a time (his ruling: "dont show all the options"). */
type Cat = 'seasons' | 'conf' | 'style' | 'sort'

/**
 * The line over the list, in the order the filters were applied — his ruling: "I want to still be
 * able to filter even after searching team", so the search is simply the first term of it:
 * "celtics · 1980–1990 · 11 seasons · best DEF first · East only".
 */
export function listCaption({
  query,
  span,
  n,
  sort,
  flip,
  conf,
  tactic,
}: {
  query: string
  span: Span
  n: number
  sort: Sort
  flip: boolean
  conf: 'E' | 'W' | null
  tactic?: Style | null
}) {
  const order =
    sort === 'az' ? (flip ? 'Z to A' : 'A to Z') : sort === 'rec' ? `${flip ? 'worst' : 'best'} record first` : `${flip ? 'lowest' : 'best'} ${sort.toUpperCase()} first`
  const what = (query ? 'season' : 'team') + (n === 1 ? '' : 's')
  return (
    (query ? `${query} · ` : '') +
    `${spanLabel(span)} · ${n.toLocaleString()} ${what} · ${order}` +
    (conf ? (conf === 'E' ? ' · East only' : ' · West only') : '') +
    (tactic ? ` · ${tacticLabel(tactic)}` : '')
  )
}

/** The search box is a filter like the others: a franchise by name or by its abbreviation. */
export const named = (t: TeamSeason, query: string) => !query || t.team.toLowerCase().includes(query) || t.ab.toLowerCase().includes(query)

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
  const [q, setQ] = useState('')
  const [conf, setConf] = useState<'E' | 'W' | null>(null)
  const [tactic, setTactic] = useState<Style | null>(null)
  const [sort, setSort] = useState<Sort>('rec')
  // A second tap on the active chip flips the order; picking a new sort starts best-first again.
  const [flip, setFlip] = useState(false)
  const [minQ, setMinQ] = useState('')
  const [maxQ, setMaxQ] = useState('')
  // The filters live behind one chip (his ruling: "Change everything to filters … not all these
  // words in the main page") — the same drawer the player database opens.
  const [filtering, setFiltering] = useState(false)
  // …and inside the drawer only ONE category's options are on screen at a time (his ruling: "when
  // pressing filters, dont show all the options … you hover over(or press to lock) playstyle and
  // the playstyle list opens"). A tap locks a category open — that is the phone's whole story. A
  // mouse may also just hover one to peek at it; the lock is what it falls back to on the way out.
  const [locked, setLocked] = useState<Cat | null>(null)
  const [hovered, setHovered] = useState<Cat | null>(null)
  const [canHover] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches)
  const openCat = hovered ?? locked
  const tapCat = (k: Cat) => {
    setHovered(null)
    setLocked((c) => (c === k ? null : k))
  }
  const peekCat = (k: Cat) => canHover && setHovered(k)
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

  /**
   * WHAT THE HERO'S PILL SAYS (board 1d's own tag, re-thought — see `TeamHero`). 1d writes "BEST
   * RECORD · 1980–2026" because its list has one order; this one has five sorts and both
   * directions of each, so the pill names the order that actually put this season at the top.
   */
  const heroTag = (
    sort === 'az' ? `${flip ? 'LAST' : 'FIRST'} BY NAME` : `${flip ? 'LOWEST' : 'BEST'} ${sort === 'rec' ? 'RECORD' : sort.toUpperCase()}`
  ) + ` · ${spanLabel(span)}`
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

  /** One shut category inside the drawer: its name, what it is set to right now, and — only when it
   *  is the open one — its options under it. A plain function, not a component, so the year boxes
   *  inside a body keep their focus across a keystroke. */
  const group = (k: Cat, name: string, hint: string, on: boolean, body: ReactNode) => (
    <div className={`fcat ${openCat === k ? 'open' : ''}`} onMouseEnter={() => peekCat(k)}>
      <button className="fcat-head" onClick={() => tapCat(k)} aria-expanded={openCat === k}>
        <span className="fcat-name">{name}</span>
        <span className={`fcat-val ${on ? 'on' : ''}`}>{hint}</span>
        <i aria-hidden="true">{openCat === k ? '▴' : '▾'}</i>
      </button>
      {openCat === k ? <div className="fcat-body">{body}</div> : null}
    </div>
  )

  /** How many bounds are narrowing the list right now — the number on the FILTERS chip. */
  const anyYears = from === YMIN && to === YMAX
  const activeFilters = [!anyYears, !!conf, !!tactic, !!(minQ.trim() || maxQ.trim())].filter(Boolean).length
  /** Clear means no bound at all: the whole book, both conferences, every shape, no rating floor. */
  const clearFilters = () => {
    setSpan([YMIN, YMAX])
    setConf(null)
    setTactic(null)
    setMinQ('')
    setMaxQ('')
  }

  /**
   * HIS RULING: "I want to still be able to filter even after searching team". The query used to
   * TAKE OVER the list — all years, newest first, the sort row gone. It is a filter like the
   * others now: name, then years, then conference, then the sort, all at once.
   */
  const query = q.trim().toLowerCase()
  const teams = useMemo(() => {
    const pool = WHEEL.filter((t) => inSpan(t.y, span) && (!conf || t.c === conf) && (!tactic || tacticOf(t) === tactic) && named(t, query))
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
  }, [query, from, to, conf, tactic, sort, rating, ranked, flip, minQ, maxQ])

  // A wide range is 1,300 team-seasons and 3,900 dials — more DOM than a phone will paint in one
  // go — so the list lays down a page at a time and grows as the bottom comes near. The SORT still
  // runs over the whole range: what you see is the true top of the list, just not all of its tail.
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [teams])
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
    // The same gauges the list card is painted from. The head used to read its numbers off
    // `ratings100` and the list off these, so one team had two verdicts depending which screen you
    // were on; both now say the same thing, on the scale whose middle is 50.
    return { roster, five, bench, gauges: fielded.length === 5 ? seasonGauges(fielded, picked.y) : null, fielded }
  }, [picked])

  return (
    // The list is a two-across grid and wants the desk's width; the team it opens is a court and a
    // roster, and those keep the app's own column. So the widening rides on the LIST, not the sheet.
    <div className={`sheetcard tdb-sheet${picked ? '' : ' tdb-list'}`}>
      <div className="topbar">
        <span>Team database</span>
        <button onClick={() => (picked ? setPicked(null) : onBack())}>{picked ? '← Teams' : '← Back'}</button>
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
          {/* ONE LINE OF CONTROLS (his ruling: "Put everything under filters"): the years, the
              conference, the playstyle, the rating bounds AND the sort all live behind FILTERS now.
              Only the search box and the list are always on the page — and the caption under them
              says in words which bounds are on and which way the list is ordered. */}
          <div className="filterbar">
            <button className={`sortb pick ${filtering || activeFilters ? 'on' : ''}`} onClick={() => setFiltering((f) => !f)} aria-expanded={filtering}>
              Filters{activeFilters ? ` · ${activeFilters}` : ''} {filtering ? '▴' : '▾'}
            </button>
            {activeFilters ? (
              <button className="sortb pick" onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </div>
          {filtering ? (
            <div className="filters" onMouseLeave={() => setHovered(null)}>
              {group(
                'seasons',
                'Seasons',
                anyYears ? 'All' : spanLabel(span),
                !anyYears,
                <label className="filt">
                  <span className="filt-pair">
                    <input
                      inputMode="numeric"
                      placeholder={String(YMIN)}
                      value={fromQ}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => editFrom(e.target.value)}
                      onBlur={() => setFromQ(String(from))}
                      autoComplete="off"
                      aria-label="From year"
                    />
                    <i>to</i>
                    <input
                      inputMode="numeric"
                      placeholder={String(YMAX)}
                      value={toQ}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => editTo(e.target.value)}
                      onBlur={() => setToQ(String(to))}
                      autoComplete="off"
                      aria-label="To year"
                    />
                    <button className={`sortb pick ${anyYears ? 'on' : ''}`} onClick={() => setSpan([YMIN, YMAX])}>
                      All
                    </button>
                  </span>
                </label>,
              )}
              {group(
                'conf',
                'Conference',
                conf === 'E' ? 'East' : conf === 'W' ? 'West' : 'Both',
                !!conf,
                <span className="filt-chips">
                  <button className={`sortb pick ${!conf ? 'on' : ''}`} onClick={() => setConf(null)}>
                    Both
                  </button>
                  <button className={`sortb pick ${conf === 'E' ? 'on' : ''}`} onClick={() => setConf(conf === 'E' ? null : 'E')}>
                    East
                  </button>
                  <button className={`sortb pick ${conf === 'W' ? 'on' : ''}`} onClick={() => setConf(conf === 'W' ? null : 'W')}>
                    West
                  </button>
                </span>,
              )}
              {/* best tactic fit — the same read the floor infers a scouted five's shape from
                  (bestStyle), offered as a filter so a set can be found by how it actually plays */}
              {group(
                'style',
                'Playstyle',
                tactic ? tacticLabel(tactic) : 'Any',
                !!tactic,
                <span className="filt-chips">
                  <button className={`sortb pick ${!tactic ? 'on' : ''}`} onClick={() => setTactic(null)}>
                    Any
                  </button>
                  {STYLES.map((s) => (
                    <button key={s.key} className={`sortb pick ${tactic === s.key ? 'on' : ''}`} onClick={() => setTactic(tactic === s.key ? null : s.key)}>
                      {s.label}
                    </button>
                  ))}
                </span>,
              )}
              {/* HIS RULING: "Add sort by option" — the five sorts came off the page and became a
                  category like the rest. A second tap on the one that is on still flips the order,
                  and the rating bounds ride under it, because they bind whichever ranked sort is on. */}
              {group(
                'sort',
                'Sort by',
                sortHint(sort, flip),
                false,
                <>
                  <span className="filt-chips">
                    <button className={chip('rec')} onClick={() => pickSort('rec')}>
                      Record
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
                  </span>
                  {ranked ? (
                    <label className="filt">
                      <span>{sort.toUpperCase()} between</span>
                      <span className="filt-pair">
                        <input type="number" min={1} max={99} placeholder="1" value={minQ} onChange={(e) => setMinQ(e.target.value)} aria-label="Lowest rating" />
                        <i>and</i>
                        <input type="number" min={1} max={99} placeholder="99" value={maxQ} onChange={(e) => setMaxQ(e.target.value)} aria-label="Highest rating" />
                      </span>
                    </label>
                  ) : null}
                  <div className="filt-note">Tap the sort that is already on to turn it around.</div>
                </>,
              )}
            </div>
          ) : null}

            <div className="section-rule">
              <span>{listCaption({ query, span, n: teams.length, sort, flip, conf, tactic })}</span>
              <i />
            </div>
            {/* BOARD 1d: ONE SPOTLIGHT OVER A TICKER (his ruling: "Use 1d. The englarged team will
                only be the first one and the rest will be pressable"). The hero is `teams[0]` and
                nothing else — it follows the sort rather than being pinned to a rank of its own —
                and every other season is a pressable row. Both open the same team. */}
            <div className="tdb-board">
              {teams.length ? (
                <TeamHero
                  key={teams[0].t.team + teams[0].t.y}
                  t={teams[0].t}
                  sorted={rating ?? (sort === 'ovr' ? 'ovr' : null)}
                  tag={heroTag}
                  onPick={() => pick(teams[0].t)}
                  span={span}
                />
              ) : null}
              {teams.slice(1, shown).map(({ t }, i) => (
                <TeamTick
                  key={t.team + t.y}
                  t={t}
                  at={i + 1}
                  sorted={rating ?? (sort === 'ovr' ? 'ovr' : null)}
                  onPick={() => pick(t)}
                  span={span}
                />
              ))}
            </div>
            {teams.length > shown ? (
              <button ref={more} className="morebtn" onClick={() => setShown((s) => s + PAGE)}>
                {(teams.length - shown).toLocaleString()} more seasons · show {Math.min(PAGE, teams.length - shown)}
              </button>
            ) : null}
            {teams.length === 0 ? (
              <div className="cap hint">{query ? 'No team by that name inside those bounds.' : 'No team inside those bounds.'}</div>
            ) : null}
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
              <span className="cap">Best five</span>
            </div>
            {/* HIS RULING: "Also change the design here of the team to have their colors in it and
                green red white on the ovr/off/def" — the same two moves the list's cards make, on
                the team those cards open. The club's short name in its own chip, and 1b's lit rule
                under the title redrawn as the club's second colour under the team's name. */}
            <div className="tdb-club" style={clubChip(picked.ab) as React.CSSProperties}>
              <span className="tcard-ab">{picked.ab}</span>
              <span className="tdb-clubwho">
                <span className="opp-name">{picked.team}</span>
                <i className="tdb-clubrule" />
              </span>
              {/* THE VERDICT STANDS WITH THE NAME — his ruling, 2026-09-22: "Move 93 OVR all-time
                  scale 88 OFF all-time scale 98 next to the name(above the years)". The three dials
                  opened the left column, under the season strip, which put the page's headline
                  numbers below the row of years and left the club line carrying a name and nothing
                  else. Chip, name, verdict: one line, and the years run under all of it.
                  Same scale the cards use — white at 50, green above, red below — and OVR is one of
                  the three rather than a caption in the head, which is what it was before the floor
                  and the line took the page in two. */}
              {detail.gauges ? (
                <div className="dials tdb-scale tdb-clubdials">
                  {(
                    [
                      ['OVR', ovrOf(picked) ?? 0],
                      ['OFF', detail.gauges.off],
                      ['DEF', detail.gauges.def],
                    ] as const
                  ).map(([l, v]) => (
                    <Dial key={l} label={l} value={v} tone="scale" color={ratingTone(v)} sub={detail.gauges!.basis} />
                  ))}
                </div>
              ) : null}
            </div>
            {stripYears.length > 1 ? <SeasonStrip years={stripYears} cur={seasonId(picked)} go={step} mark="best" /> : null}
            {/* TWO COLUMNS ON A DESK (his ruling, 2026-09-21: "Make everything bigger here"). The
                page was the app's 660px column standing in the middle of a 3,840px screen, so
                everything on it was as small as a phone's and surrounded by black. The floor and
                its verdict take one side now and the team's own line and its roster the other,
                which is what lets both of them be drawn at size. One wrapper, one grid, and on a
                phone it is the column it always was. */}
            <div className="tdb-detail">
            <div className="tdb-left">
            {/* his ruling: the five stands on a floor, not in a list — tap a spot for the full card */}
            <CourtFive
              /* His ruling: the team db's five stands in that club's colours, the same way the
                 campaign's opponent does — this floor is always somebody else's team, never yours.
                 BOTH MODES NOW, with the draft's: the club chip two lines above this floor has
                 always worn the club in user mode, so the floor under it was the odd one out. */
              club={teamColor(picked.ab)}
              spots={detail.five.map((p, i) => ({
                p,
                slot: POSITIONS[i],
                tag: p ? (user ? POSITIONS[i] : `${POSITIONS[i]} · ${p.ovr}`) : '',
                onTap: p ? () => openCard(p) : undefined,
              }))}
            />
            </div>
            <div className="tdb-right">
            {/* THE TEAM'S OWN LINE (his ruling: "add more(as many as possible) real (basic, not
                advanced) stats on the team from basketball ref"). Nineteen cells of Basketball
                Reference's per-game table, summed from its own player totals — see
                scripts/teamstats.ts — and nothing modelled: what they scored, what they allowed,
                the three splits with their makes and attempts, the boards, and the four counting
                stats. The app's verdict on this five is two inches to the left and is a different
                question; this block is the record. */}
            <TeamLineBlock t={picked} />
            {detail.bench.length ? (
              <>
                <div className={`rowhead dr tdb${user ? ' blind' : ''}`}>
                  <span>The rest of the roster · {detail.bench.length}</span>
                  <StatHead />
                  {user ? null : <span className="gcap">OVR · O · D</span>}
                </div>
                {detail.bench.map((p) => (
                  <RosterRow key={p.name} p={p} slot={eligible(LINES[p.name]?.pos).join(' · ')} />
                ))}
              </>
            ) : null}
            </div>
            </div>
          </div>
          <div className="cap hint">Only men in the card pool appear — a season the pipeline never rated is not here.</div>
        </>
      ) : null}
    </div>
  )
}
