import { useState } from 'react'
import { DEFAULT_ORDER, PLAYERS } from '../engine/pool'
import { ROUNDS } from '../config'
import { currentLevel, type Progress, type CampaignMode } from '../state/campaign'
import { setUserMode } from '../state/viewmode'
import { achCount } from '../state/achievements'
import { Ball } from './Ball'
import { useLayout } from './useLayout'
import type { Mode } from './Home'

/**
 * THE SCOUT MODE FRONT DOOR — Claude Design "Game7 Menu Concepts", turn 4, board 4a
 * (CHALK PLAYBOOK · the floor as a coach's slate, X's and O's · chalk yellow on green slate).
 *
 * His ruling: "I want scout mode home screen to be 4a. Only scout mode." User mode keeps the
 * slate of cards it got from the Game Design Overhaul bundle — see `UserHome` in Home.tsx — and
 * nothing shared moves, so the two front doors are two components rather than one with a fork
 * running through it.
 *
 * HIS LATER RULINGS ON THE BOARD: no PLAYBOOK in the title and no PRACTICE SLATE line under it —
 * the mark and the wordmark, the same pair user mode's front door opens with — and the slate is
 * the screen rather than a card propped in the middle of one.
 *
 * WHAT 4a IS: a wood-framed green slate. Half a court drawn left-handed in dashed chalk, with the
 * six ways to play standing on it as three O's and three X's where a coach would put them — the
 * campaign at the top of the key, the two other ladders on the wings, the three side modes in the
 * corners and out top. Press one and the slate's right side reads it out: its number, its name
 * under a wavy chalk underline, what it is, what you have banked, and the one chip that starts it.
 *
 * WHAT 4a DID NOT HAVE, and had to be given, because this is the only screen that carries them:
 *   · THE MODE SWITCH. The old front door asked "how do you want to see the game?" in the middle
 *     of itself; on the slate it is two chalk chips in the header, because a scout who cannot get
 *     back to user mode is stuck in scout mode.
 *   · THE RECORD BOOK. Database / Archetypes / Teams / Trophies are scout-only and would have had
 *     no door at all. They are the coach's margin notes along the foot of the slate.
 * Everything else — the geometry, the copy, the six positions, the palette — is the board's.
 */
export function ChalkHome({ progress, onPick }: { progress: Record<CampaignMode, Progress>; onPick: (m: Mode) => void }) {
  const [sel, setSel] = useState(0)
  const banked = (p: Progress) => p.stars.reduce((a, b) => a + b, 0)
  const cur = currentLevel(progress.campaign)

  /**
   * The six, in the board's own order and at its own coordinates — the x/y are percentages of the
   * court, so the floor can be any size and the play keeps its shape. The marks are the board's
   * too: the three ladders are the offense (O), the three side modes are what you draw against.
   */
  const zones: { pick: Mode; mark: string; x: string; y: string; label: string; tag: string; desc: string; meta: string; cta: string }[] = [
    {
      pick: 'campaign',
      mark: 'O',
      x: '50%',
      y: '58%',
      label: 'CAMPAIGN',
      tag: '01 · THE GAUNTLET',
      desc: cur
        ? `${ROUNDS} levels against every team in the league, best of seven each. Level ${cur} is up next.`
        : `${ROUNDS} levels against every team in the league, best of seven each. Every rung of it is cleared.`,
      meta: `★ ${banked(progress.campaign)} / ${ROUNDS * 3} BANKED`,
      cta: cur ? 'CONTINUE →' : 'RUN IT AGAIN →',
    },
    {
      pick: 'salary',
      mark: 'O',
      x: '20%',
      y: '42%',
      label: 'SALARY CAP',
      tag: '02 · TIGHT MONEY',
      desc: `The same ${ROUNDS} levels — every card priced that year, the five held under the cap.`,
      meta: `★ ${banked(progress.salary)} / ${ROUNDS * 3} BANKED`,
      cta: 'PLAY →',
    },
    {
      pick: 'death',
      mark: 'O',
      x: '80%',
      y: '42%',
      label: 'DEATH MATCH',
      tag: '03 · ONE LIFE',
      desc: 'One five, carried the whole way — change a single man before each level. Lose and the run is over.',
      meta: `★ ${banked(progress.death)} / ${ROUNDS * 3} BANKED`,
      cta: 'PLAY →',
    },
    {
      pick: 'custom',
      mark: 'X',
      x: '12%',
      y: '84%',
      label: 'CUSTOM',
      tag: 'ANY ERA',
      desc: 'Pick the season, pick the opponent — any team from 1980 to 2026, best of seven.',
      meta: 'EVERY TEAM · 1980–2026',
      cta: 'SET IT UP →',
    },
    {
      pick: 'versus',
      mark: 'X',
      x: '88%',
      y: '84%',
      label: 'VS FRIEND',
      tag: 'SAME PHONE',
      desc: 'Pass the phone. Two benches, alternating picks, one winner.',
      meta: 'LOCAL · NO ACCOUNT',
      cta: 'TIP OFF →',
    },
    {
      pick: 'auction',
      mark: 'X',
      x: '50%',
      y: '14%',
      label: '1V1 BID',
      tag: '$20 EACH',
      desc: 'Blind-bid the level with the table — twenty a head, winner takes the pot.',
      meta: 'HOUSE RULES',
      cta: 'ANTE UP →',
    },
  ]
  const z = zones[sel]

  /** The book, along the foot — the four scout-only rooms, with what is in each one. */
  const book: { pick: Mode; label: string; note: string }[] = [
    { pick: 'database', label: 'DATABASE', note: PLAYERS.length.toLocaleString() },
    { pick: 'archetypes', label: 'ARCHETYPES', note: String(DEFAULT_ORDER.length) },
    { pick: 'teams', label: 'TEAMS', note: 'EVERY SEASON' },
    { pick: 'achievements', label: 'TROPHIES', note: `${achCount().done} / ${achCount().total}` },
  ]

  /* The slate is the room, the same way the tunnel is user mode's — the class reaches the page's
     own ground, which is outside anything this component renders, and comes off on the way out.
     `tunnel` rides along for one rule only: it is what takes #root off its 390px column on a
     desk, and the board is drawn 1240 wide. */
  useLayout(() => {
    document.body.classList.add('chalk', 'tunnel')
    return () => document.body.classList.remove('chalk', 'tunnel')
  }, [])

  return (
    <div className="ck">
      <div className="ck-board">
        <div className="ck-head">
          {/* his ruling: no PLAYBOOK, no practice slate — the mark and the name, the way the
              other front door wears them, with the 7 in the slate's own chalk yellow. The mark
              is sized off the slate's own fluid unit rather than at a fixed 44, so it grows with
              the wordmark beside it — his ruling: "same for the logo". */}
          <div className="ck-lockup">
            <Ball size="clamp(30px, calc(var(--ck-u) * 3.6), 84px)" dribble />
            <b>
              GAME<em>7</em>
            </b>
          </div>
          {/* the mode question, said the way a coach would write it in the corner of the slate */}
          <div className="ck-modes" role="group" aria-label="How do you want to see the game?">
            <button className="ck-mode" onClick={() => setUserMode(true)} aria-pressed={false}>
              USER
            </button>
            <button className="ck-mode on" onClick={() => setUserMode(false)} aria-pressed>
              SCOUT
            </button>
          </div>
        </div>

        <div className="ck-body">
          {/* HALF A COURT IN DASHED CHALK — sideline box, the arc swung off the rim, the paint,
              the free-throw circle and the rim itself. Every measure is a percentage of the box,
              and the round things carry aspect-ratio rather than a percentage height, so a circle
              is still a circle when the floor is 320px wide instead of 560. */}
          <div className="ck-court">
            <span className="ck-arc" aria-hidden />
            <span className="ck-key" aria-hidden />
            <span className="ck-ftc" aria-hidden />
            <span className="ck-rim" aria-hidden />
            {zones.map((s, i) => (
              <button
                key={s.pick}
                className={`ck-spot ${i === sel ? 'on' : ''}`}
                style={{ left: s.x, top: s.y }}
                onClick={() => setSel(i)}
                aria-pressed={i === sel}
              >
                <span className="ck-glyph">{s.mark}</span>
                <span className="ck-label">{s.label}</span>
              </button>
            ))}
          </div>

          {/* THE READ — what the coach says about the play under the chalk. */}
          <div className="ck-read">
            <div className="ck-tag">{z.tag}</div>
            <div className="ck-name">{z.label}</div>
            <p className="ck-desc">{z.desc}</p>
            <div className="ck-meta">{z.meta}</div>
            <button className="ck-cta" onClick={() => onPick(z.pick)}>
              {z.cta}
            </button>
            <div className="ck-foot">
              EVERY NUMBER FROM REAL 1980—2026 STATS.
              <br />
              RUN THE PLAY. ERASE. RUN IT AGAIN.
            </div>
          </div>
        </div>

        <div className="ck-book">
          {book.map((b) => (
            <button key={b.pick} className="ck-bookrow" onClick={() => onPick(b.pick)}>
              <b>{b.label}</b>
              <i>{b.note} →</i>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
