import { useEffect, useMemo, useRef, useState } from 'react'
import type { TeamSeason } from '../data/wheel'

/**
 * THE WHEEL, AS TWO REELS (his ruling, with a picture of Hearthstone's Finding Opponent screen:
 * "I want 2 wheels, one for team, and one for year. Pressing spin will spin both (unless selected
 * to spin 1 only), and the team will show first, then the year. But instead of a wheel like
 * roullete, it will be like the picture").
 *
 * The picture is not a roulette and not a slot machine either: it is a LIST running past a fixed
 * marker — rows stacked in a window, the one in the middle lit and pinched between two arrows,
 * everything above and below it falling away into the dark. So that is what this is. A strip of
 * rows behind a five-row window, travelling upward and easing to a stop with the answer under the
 * arrows.
 *
 * TWO REELS, AND THE SECOND ONE WAITS. The wheel has always landed on a team-SEASON — one row of
 * the WHEEL, a franchise and a year together — and splitting it in two is what makes it readable:
 * the team stops first and the year keeps running for another second, so you learn which club you
 * got before you learn which of its teams. The year reel is loaded with the seasons that franchise
 * actually has on the wheel, so the two never disagree and the second stop is a real narrowing
 * rather than a decoration.
 *
 * THE RESULT IS STILL DECIDED BEFORE ANYTHING MOVES, exactly as it was with the disc and with the
 * flicker before it — `landOn` picks, and the reels are then run to it. A wheel that decided by
 * where it stopped could stop on a man you cannot field or afford, which is the whole reason
 * `landOn` takes the taken men, the open slots and the afford test.
 */

/** Row height in px. The maths needs it as a number, so it is stated here and not in the CSS. */
const H = 30
/** Rows visible in the window: two above the answer, two below. */
const WINDOW = 5
/** How many times the list is laid end to end, so the strip has somewhere to travel from. */
const COPIES = 9
/** Which copy the strip starts in, and which one it lands in. */
const FROM_COPY = 1
const TO_COPY = COPIES - 2

/** The team stops first; the year runs on for another beat, which is the point of two reels. */
export const REEL_TEAM_MS = 2200
export const REEL_YEAR_MS = 3300

export interface ReelSpin {
  team: { rows: string[]; at: number }
  year: { rows: string[]; at: number }
  /** Bumped on every spin, so landing on the same row twice still runs the reel. */
  nonce: number
  /** Which reel was held still for this spin, if either. */
  held: Hold
}

/** Nothing held spins both; holding one is his "spin 1 only". */
export type Hold = 'team' | 'year' | null

/** Enough rows for the window to look like a list rather than a label. */
const MIN_ROWS = 7

/**
 * Load the two reels so that both land on the team-season `landOn` chose.
 *
 * The team reel is that franchise plus a dozen others; the year reel is the seasons THAT franchise
 * has on the wheel, which is why the year can only be read after the team has stopped.
 */
export function buildReels(landed: TeamSeason, pool: TeamSeason[], rnd: () => number, nonce: number, held: Hold = null, prev?: ReelSpin | null): ReelSpin {
  const teams: string[] = [landed.team]
  const seen = new Set([landed.team])
  let guard = 0
  while (teams.length < 13 && guard++ < 900) {
    const t = pool[Math.floor(rnd() * pool.length)]
    if (!t || seen.has(t.team)) continue
    seen.add(t.team)
    teams.push(t.team)
  }
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[teams[i], teams[j]] = [teams[j], teams[i]]
  }

  const years = [...new Set(pool.filter((t) => t.team === landed.team).map((t) => t.y))].sort((a, b) => a - b)
  // a franchise the wheel holds three seasons of gives a three-row reel; repeat it rather than
  // invent years it never played, so the strip is long enough to read as a list
  const rows: number[] = []
  while (rows.length < MIN_ROWS && years.length) rows.push(...years)
  const yearRows = (rows.length ? rows : [landed.y]).map(String)

  const built = {
    team: { rows: teams, at: Math.max(0, teams.indexOf(landed.team)) },
    year: { rows: yearRows, at: Math.max(0, yearRows.indexOf(String(landed.y))) },
  }
  // A HELD REEL IS HELD, not rebuilt: it keeps the rows it was already showing, so the one thing
  // that did not spin does not quietly reshuffle its neighbours underneath the answer.
  return {
    team: held === 'team' && prev ? prev.team : built.team,
    year: held === 'year' && prev ? prev.year : built.year,
    nonce,
    held,
  }
}

/** Where the strip must finish so that row `at` sits under the arrows. */
export function landingOffset(rows: number, at: number, copy: number): number {
  return -((copy * rows + at) * H) + Math.floor(WINDOW / 2) * H
}

function Reel({
  label,
  rows,
  at,
  ms,
  spinning,
  frozen,
  held,
  onHold,
  nonce,
  wide,
}: {
  label: string
  rows: string[]
  at: number
  ms: number
  spinning: boolean
  /** Was this reel held for the spin now running — i.e. must it stay where it is? */
  frozen: boolean
  /** Is it held for the NEXT one? That is a live choice and lights up the moment it is made. */
  held: boolean
  onHold?: () => void
  nonce: number
  wide?: boolean
}) {
  const [y, setY] = useState(() => landingOffset(rows.length, at, TO_COPY))
  const [live, setLive] = useState(false)
  /**
   * EACH REEL LIGHTS WHEN IT STOPS, not when the pair does — that is the whole point of the team
   * running two-thirds as long as the year. `spinning` belongs to the spin; this belongs to the
   * reel.
   */
  const [done, setDone] = useState(true)

  /** Read at effect time and not depended on, so only a NEW spin starts the strip moving. */
  const moving = useRef(spinning)
  moving.current = spinning

  useEffect(() => {
    const end = landingOffset(rows.length, at, TO_COPY)
    if (!moving.current || frozen) {
      // held, or reduced motion, or a reel rendered already landed: just be there
      setLive(false)
      setDone(true)
      setY(end)
      return
    }
    setLive(false)
    setDone(false)
    setY(landingOffset(rows.length, at, FROM_COPY))
    const stops = window.setTimeout(() => setDone(true), ms + 60)
    const raf = requestAnimationFrame(() => {
      setLive(true)
      setY(end)
    })
    // a page that is not being painted never fires a frame, and the spin lands on a timer
    // regardless — so the strip is released on a timer too rather than being snapped round after
    const late = window.setTimeout(() => {
      setLive(true)
      setY(end)
    }, 140)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(late)
      window.clearTimeout(stops)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  const strip = useMemo(() => Array.from({ length: COPIES }, () => rows).flat(), [rows])
  const running = spinning && !frozen && !done

  return (
    <div className={`reel ${wide ? 'wide' : ''} ${running ? 'live' : 'set'} ${held ? 'held' : ''}`}>
      <div className="reel-cap">
        <span>{label}</span>
        {onHold ? (
          <button className="reel-hold" onClick={onHold} aria-pressed={held}>
            {held ? 'held' : 'hold'}
          </button>
        ) : null}
      </div>
      <div className="reel-win" style={{ height: WINDOW * H }}>
        <div className="reel-strip" style={{ transform: `translateY(${y}px)`, transitionDuration: live ? `${ms}ms` : '0ms' }}>
          {strip.map((r, i) => (
            <div className="reel-row" style={{ height: H }} key={i}>
              {r}
            </div>
          ))}
        </div>
        {/* the marker does not move: the list runs past it, and the answer is whatever is under it */}
        <div className="reel-mark" style={{ height: H, top: Math.floor(WINDOW / 2) * H }} aria-hidden>
          <i className="reel-arrow l" />
          <i className="reel-arrow r" />
        </div>
      </div>
    </div>
  )
}

/**
 * `spin.held` is what was held for the spin now running; `hold` is what is held for the NEXT one.
 * They are different questions and were briefly the same prop, which made the toggle look dead
 * until the following spin rebuilt the reels.
 */
export function SpinReels({ spin, spinning, hold = null, onHold }: { spin: ReelSpin; spinning: boolean; hold?: Hold; onHold?: (h: Hold) => void }) {
  return (
    <div className="reels">
      <Reel
        wide
        label="Team"
        rows={spin.team.rows}
        at={spin.team.at}
        ms={REEL_TEAM_MS}
        spinning={spinning}
        frozen={spin.held === 'team'}
        held={hold === 'team'}
        onHold={onHold ? () => onHold(hold === 'team' ? null : 'team') : undefined}
        nonce={spin.nonce}
      />
      <Reel
        label="Year"
        rows={spin.year.rows}
        at={spin.year.at}
        ms={REEL_YEAR_MS}
        spinning={spinning}
        frozen={spin.held === 'year'}
        held={hold === 'year'}
        onHold={onHold ? () => onHold(hold === 'year' ? null : 'year') : undefined}
        nonce={spin.nonce}
      />
    </div>
  )
}
