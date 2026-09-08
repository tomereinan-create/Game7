import { useEffect, useState, type CSSProperties } from 'react'
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
 * WHAT 4a IS: a green slate — drawn in a wood frame, and full screen without one since his ruling
 * of 2026-09-08 ("Remove all the brown and black from the scout mode main page, should be full
 * screen green"), so the green now runs to every edge of the window. Half a court drawn
 * left-handed in dashed chalk, with the
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
 *
 * HIS RULING OF 2026-09-08, and it is two things: "In the scout home page, when pressing on
 * something instead of a yellow circle make it orange circle. Also, have a player with a
 * basketball, running towards where you pressed." So the pressed mark is chalked in orange rather
 * than the slate's yellow — see --ck-orange in the stylesheet, which stands BESIDE the yellow and
 * does not replace it, because the yellow is also the 7 in the wordmark, the SCOUT chip and the
 * whole read down the right — and a chalk figure with a ball under his arm now lives on the floor
 * and runs to whichever mark you press. See `ChalkRunner` at the foot of this file.
 */
/* How long the figure is on his way, in ms. The stylesheet transitions his left and top over the
   same number and cannot read this file, so it is written in both places and named in both. */
const RUN_MS = 640

export function ChalkHome({ progress, onPick }: { progress: Record<CampaignMode, Progress>; onPick: (m: Mode) => void }) {
  const [sel, setSel] = useState(0)
  const banked = (p: Progress) => p.stars.reduce((a, b) => a + b, 0)
  const cur = currentLevel(progress.campaign)

  /**
   * The six, in the board's own order and at its own coordinates — the x/y are percentages of the
   * court, so the floor can be any size and the play keeps its shape. The marks are the board's
   * too: the three ladders are the offense (O), the three side modes are what you draw against.
   *
   * HIS RULINGS ON WHERE THEY STAND: "move custom and vs friend to outside the 3pt line", then
   * "move vs friend and custom to the corners", and "move the O of the campaign a bit lower so it
   * won't be right on the circle line."
   *
   * THE CORNERS ONLY EXIST BECAUSE THE LINE GAINED ITS STRAIGHTS. A pure semicircle swung off the
   * rim — which is what the board drew — leaves no corner at all: the corner of the floor is 50%
   * of the width from the arc's centre against the arc's own 44.65%, a strip five points wide,
   * and a mark is nine. That is why the first pass could only put the two X's at the low wings.
   * A real three-point line is not a semicircle: it is cut by two straights running up from the
   * baseline, and the ground between a straight and the sideline is the corner three. Drawing
   * those straights is what makes his ruling possible, so the floor has them now — see `ck-corner`
   * and the arc's own clip in the stylesheet — and the two X's stand in the corners behind them.
   *
   * The campaign's O sat where the free-throw circle's top passes; it is inside the circle now.
   *
   * Every y below is read against a floor that is WIDER than the one the board drew (his ruling:
   * "make the court bigger and wider" — 29:20 where it was 56:47), so the backcourt above the arc
   * is shallower and the three marks that stand up there come down to meet it.
   */
  const zones: { pick: Mode; mark: string; x: string; y: string; label: string; tag: string; desc: string; meta: string; cta: string }[] = [
    {
      pick: 'campaign',
      mark: 'O',
      x: '50%',
      y: '56%',
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
      x: '17%',
      y: '36%',
      label: 'SALARY CAP',
      tag: '02 · TIGHT MONEY',
      desc: `The same ${ROUNDS} levels — every card priced that year, the five held under the cap.`,
      meta: `★ ${banked(progress.salary)} / ${ROUNDS * 3} BANKED`,
      cta: 'PLAY →',
    },
    {
      pick: 'death',
      mark: 'O',
      x: '83%',
      y: '36%',
      label: 'DEATH MATCH',
      tag: '03 · ONE LIFE',
      desc: 'One five, carried the whole way — change a single man before each level. Lose and the run is over.',
      meta: `★ ${banked(progress.death)} / ${ROUNDS * 3} BANKED`,
      cta: 'PLAY →',
    },
    {
      pick: 'custom',
      mark: 'X',
      x: '8.5%',
      y: '82%',
      label: 'CUSTOM',
      tag: 'ANY ERA',
      desc: 'Pick the season, pick the opponent — any team from 1980 to 2026, best of seven.',
      meta: 'EVERY TEAM · 1980–2026',
      cta: 'SET IT UP →',
    },
    {
      pick: 'versus',
      mark: 'X',
      x: '91.5%',
      y: '82%',
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
      y: '16%',
      label: '1V1 BID',
      tag: '$20 EACH',
      desc: 'Blind-bid the level with the table — twenty a head, winner takes the pot.',
      meta: 'HOUSE RULES',
      cta: 'ANTE UP →',
    },
  ]
  const z = zones[sel]

  /**
   * THE RUNNER'S ERRAND — his ruling: "have a player with a basketball, running towards where you
   * pressed." He is not a seventh mark. He is one figure who is always standing somewhere on the
   * floor, and pressing a play is what sends him there, so the only things the board has to
   * remember about him are which side of the mark he pulls up on and whether his legs are going.
   * WHERE he is going is just the pressed spot's own percentages, and the run between the old
   * mark and the new one is the transition on left/top — which is what keeps him honest when the
   * floor is resized mid-stride, because both ends of the run are percentages of the court.
   *
   * SIDE is the whole of his facing: -1 means he pulls up on the LEFT of the mark, which is where
   * a man running rightwards stops, and so he is drawn facing right. It is read off the x of the
   * two marks, because that is what "towards" means to an eye watching the floor. A move straight
   * up or down the middle — the campaign to the 1v1 bid, both chalked at 50% — is neither way, so
   * he keeps the face he had rather than snapping round to a default.
   *
   * He starts on the campaign's O with `moving` false: on first paint he is already standing
   * there, rather than sprinting in from a corner nobody pressed.
   */
  const [side, setSide] = useState<1 | -1>(-1)
  const [moving, setMoving] = useState(false)
  function press(i: number) {
    if (i === sel) return
    const from = parseFloat(zones[sel].x)
    const to = parseFloat(zones[i].x)
    if (to !== from) setSide(to > from ? -1 : 1)
    setMoving(true)
    setSel(i)
  }
  /* The legs stop when he arrives. Press again while he is still running and the timer is thrown
     away and restarted, which is what the cleanup is for — he does not stop half way across. */
  useEffect(() => {
    if (!moving) return
    const t = window.setTimeout(() => setMoving(false), RUN_MS)
    return () => window.clearTimeout(t)
  }, [moving, sel])

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
     desk, and the board is drawn 1240 wide. Everything ELSE the tunnel class paints — its
     near-black ground and the lamp on #root::before — is taken back off in the stylesheet, on his
     ruling that this page carry no black. */
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
            {/* The chalk lines are the only thing the sideline clips — the arc is swung off the
                rim and half of it falls below the floor. The marks stand OUTSIDE that clip, so a
                name at the low wing can run a little past the sideline onto the slate rather than
                losing its last letters to it, which is what happened the moment his ruling made
                the names bigger and moved two of them into the corners. */}
            <span className="ck-lines" aria-hidden>
              {/* the arc lives in a box cut to the width between the two straights, so the circle
                  ENDS where they begin rather than sweeping on down to the baseline */}
              <span className="ck-arcbox">
                <span className="ck-arc" />
              </span>
              <span className="ck-corner l" />
              <span className="ck-corner r" />
              <span className="ck-key" />
              <span className="ck-ftc" />
              <span className="ck-rim" />
            </span>
            <ChalkRunner x={z.x} y={z.y} side={side} moving={moving} />
            {zones.map((s, i) => (
              <button
                key={s.pick}
                className={`ck-spot ${i === sel ? 'on' : ''}`}
                style={{ left: s.x, top: s.y }}
                onClick={() => press(i)}
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

/**
 * THE MAN ON THE FLOOR — his ruling: "have a player with a basketball, running towards where you
 * pressed."
 *
 * DRAWN, NOT SHIPPED. Everything on this slate is chalk on a board — dashed lines, a hand-lettered
 * O, a wavy underline — so the player is line art in the same hand rather than a sprite or an
 * emoji, either of which would sit on the slate like a sticker. He is one inline SVG: a head, the
 * line of a back, two arms off the shoulder and two legs off the hip, in the slate's own chalk.
 *
 * THE BALL IS NOT THE `Ball` COMPONENT. That mark is leather, a radial gradient and the 7 through
 * the middle of it — beautiful at 62px and mud at seven, which is what the ball in his hand
 * measures on a phone. A chalk circle with one seam across it is what a coach draws, and it is
 * still a basketball at seven pixels. It is chalked in the pressed mark's own orange, so the thing
 * he carries and the thing he runs to are the one colour.
 *
 * EVERY LIMB IS A GROUP TRANSLATED TO ITS JOINT AND DRAWN FROM 0,0. That is the only way to swing
 * a limb about a shoulder or a hip in CSS: the stylesheet rotates the INNER group about its own
 * origin, which the outer group has already carried to the joint. The translate is a presentation
 * attribute on the outer group on purpose — a CSS transform would overwrite it on the same one.
 *
 * The pose he is drawn in is the pose he stands in once he has arrived. The run is the stylesheet
 * swinging these same limbs either side of it, so there is one drawing here and not two.
 */
function ChalkRunner({ x, y, side, moving }: { x: string; y: string; side: 1 | -1; moving: boolean }) {
  return (
    <span className={`ck-runner ${moving ? 'go' : ''}`} style={{ left: x, top: y, '--ck-run-side': side } as CSSProperties} aria-hidden>
      <svg viewBox="0 0 32 38" focusable="false">
        <circle cx="13.3" cy="5.9" r="4" />
        <path d="M12.7 10.1 L11.3 21.6" />
        {/* the shoulder. Arm A trails, arm B carries the ball — and B swings against the front
            leg, because that is how a person runs. */}
        <g transform="translate(12.5 12)">
          <g className="ck-run-limb arm a">
            <path d="M0 0 L-2.6 5.4 L-3.4 9.2" />
          </g>
          <g className="ck-run-limb arm b">
            <path d="M0 0 L2.8 5.8 L4.6 8.4" />
            <circle className="ck-run-ball" cx="7.2" cy="9.2" r="3.9" />
            {/* the one seam, kept inside the circle so it does not sprout whiskers at the round ends */}
            <path className="ck-run-ball" d="M4.4 9.2 L10 9.2" />
          </g>
        </g>
        {/* the hip. Leg B trails, leg A leads; both end in a foot pointing the way he is going. */}
        <g transform="translate(11.3 21.6)">
          <g className="ck-run-limb b">
            <path d="M0 0 L-2.4 6.4 L-3.2 12.2 L-1.4 13" />
          </g>
          <g className="ck-run-limb a">
            <path d="M0 0 L2.2 6.4 L2.8 12.2 L5 12.9" />
          </g>
        </g>
      </svg>
    </span>
  )
}
