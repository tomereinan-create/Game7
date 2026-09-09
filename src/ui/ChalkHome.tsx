import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { DEFAULT_ORDER, PLAYERS } from '../engine/pool'
import { ROUNDS } from '../config'
import { currentLevel, type Progress, type CampaignMode } from '../state/campaign'
import { setUserMode } from '../state/viewmode'
import { achCount } from '../state/achievements'
import { Ball } from './Ball'
import { Trophy } from './Trophy'
import { useLayout } from './useLayout'
import type { Mode } from './Home'

/**
 * THE FRONT DOOR, AND SINCE 2026-09-09 IT IS BOTH MODES' — Claude Design "Game7 Menu Concepts",
 * turn 4, board 4a (CHALK PLAYBOOK · the floor as a coach's slate · chalk on green slate).
 *
 * His ruling: "Change the user mode main screen to look like the scout mode." So the slate that
 * was drawn for scout mode under his earlier ruling ("I want scout mode home screen to be 4a.
 * Only scout mode") is what BOTH modes open on now, and `UserHome` — the hero, the mode question,
 * tonight's slate of cards — is deleted rather than kept beside it. See the head of Home.tsx for
 * why the two-door split it replaced was reversed rather than duplicated.
 *
 * THE MODE IS ONE PROP AND IT IS SPENT IN THREE PLACES, marked where they are rendered below and
 * nowhere else, so scout's board is the board it was:
 *   1. the chip that is lit in the head — USER or SCOUT;
 *   2. the foot of the board — the record book in scout, the sign-off in user;
 *   3. the cup standing in a finished ladder's mark, which is user mode's alone.
 *
 * HIS EARLIER RULINGS ON THE BOARD: no PLAYBOOK in the title and no PRACTICE SLATE line under it —
 * the mark and the wordmark — and the slate is the screen rather than a card propped in the
 * middle of one.
 *
 * WHAT 4a IS: a green slate — drawn in a wood frame, and full screen without one since his ruling
 * of 2026-09-08 ("Remove all the brown and black from the scout mode main page, should be full
 * screen green"), so the green now runs to every edge of the window. Half a court drawn
 * left-handed in dashed chalk, with the six ways to play standing on it as six chalk rings where a
 * coach would put them — the campaign at the top of the key, the two other ladders on the wings,
 * the three side modes in the corners and out top. Press one and the slate's right side reads it
 * out: its number, its name under a wavy chalk underline, what it is, what you have banked, and
 * the one chip that starts it.
 *
 * THE MARKS ARE SIX CHALK DABS AND THERE IS NO RING ON THE FLOOR. Three rulings got them here and
 * the last one reverses the middle one, so all three are worth having in order:
 *   1. "Remove the X\O from both home screens." The board drew three O's for the ladders and three
 *      X's for the side modes. The letters went, and the marks became six dashed rings — the ring
 *      had carried a TRANSPARENT border with the letter inside it, so an empty one would have been
 *      invisible and it had to be chalked in for all six.
 *   2. "Instead of an orange circle in the home screen make it a bullet." Only the PRESSED mark
 *      was filled in; the other five kept their rings, on the argument that a dab that small
 *      cannot read as chalk.
 *   3. "You made only 1 bullet, instead all. Find a way to do it." He read that on the board and
 *      overruled it. All six are dabs now, at rest and pressed, cup or no cup, and the ring is
 *      gone from the screen entirely. See `.ck-glyph::before` in the stylesheet for what a dab is
 *      made of and why a lump of soft-edged chalk is not a radio button.
 *
 * WHAT 4a DID NOT HAVE, and had to be given, because this is the only screen that carries them:
 *   · THE MODE SWITCH. The old front door asked "how do you want to see the game?" in the middle
 *     of itself; on the slate it is two chalk chips in the header, because a player who cannot get
 *     from one mode to the other is stuck in the one he is in.
 *   · THE RECORD BOOK, IN SCOUT MODE ONLY. Database / Archetypes / Teams / Trophies are scout-only
 *     and would have had no door at all. They are the coach's margin notes along the foot of the
 *     slate. User mode has no doors to them by his standing ruling, so its slate closes on the
 *     sign-off instead.
 *   · THE CUP, IN USER MODE ONLY (his ruling: "Add a trophy for EVERY mode at 150 wins(An actual
 *     golden trophy at the end)"). It stood on the old user-mode cards because that was the one
 *     screen where all three ladders were on view at once; the six marks on this floor are that
 *     screen now. It stood IN the mark for one day — the room the letter had just left — and it
 *     stands BESIDE THE NAME under the mark since his "You made only 1 bullet, instead all",
 *     because a dab has no inside to put it in. See `.ck-cup` in the stylesheet.
 * Everything else — the geometry, the copy, the six positions, the palette — is the board's.
 *
 * HIS RULING OF 2026-09-08, and it is two things: "In the scout home page, when pressing on
 * something instead of a yellow circle make it orange circle. Also, have a player with a
 * basketball, running towards where you pressed." So the pressed mark is chalked in orange rather
 * than the slate's yellow — see --ck-orange in the stylesheet, which stands BESIDE the yellow and
 * does not replace it, because the yellow is also the 7 in the wordmark, the lit mode chip and the
 * whole read down the right.
 *
 * HIS SECOND RULING OF THAT DAY THREW THE RUNNER OUT: "Instead of a man running, with the ball,
 * have a player on the field for each mode, and have them passing the ball. But please, make the
 * animation good, 3d esque. This animation was disrespect." So the one figure who skated between
 * the marks is gone — head, back line and four swinging limbs, deleted, not rescued — and in his
 * place SIX players stand on the floor, one at every mark, and the ball is thrown from the man
 * who has it to the man whose mark you pressed. See `ChalkFloor`, `ChalkAir` and `ChalkFigure` at
 * the foot of this file, and the play section of the stylesheet for the flight itself.
 */

/**
 * THE COURT IS A PLAN, SO THE DEPTH HAS TO BE MANUFACTURED — his ruling: "make the animation good,
 * 3d esque." A half court seen from above has no eye level to hang a figure off, so the drawing
 * borrows five things at once, and none of them on its own would be enough:
 *
 *   1. THE BALL LEAVES THE PLANE. A pass is a parabola in the air, and the ball SCALES UP toward
 *      the apex and back down as it arrives, because a thing coming nearer the eye gets bigger.
 *   2. ITS SHADOW STAYS ON THE FLOOR. The shadow keeps the ground path while the ball rises off
 *      it; the gap between the two IS the height. It spreads and fades as the ball climbs and
 *      draws back in and darkens as it drops into the hands.
 *   3. THE FIGURES STAND ON THE FLOOR RATHER THAN IN IT. Each is drawn upright in three-quarter
 *      view, anchored at the FEET, with its own contact smudge under it.
 *   4. THE FLOOR RECEDES. A mark high on the plan is far away, so the man on it is drawn smaller
 *      and fainter — see `depthOf` — and one at the baseline is nearer, bigger and brighter.
 *   5. NOTHING IS LINEAR. Wind-up, release, flight, catch and settle each get their own curve.
 *
 * EVERY NUMBER BELOW IS A PERCENTAGE OF THE COURT — cqw across, cqh down, which is what the two
 * play layers are size containers for — so the whole play is one drawing at 331px of floor and at
 * 761, and it survives a resize mid-flight because both ends of the throw are percentages.
 */
/* The court's own aspect-ratio, off `.ck-court` in the stylesheet. Only the ARC and the FLIGHT
   TIME read it, to turn a drop down the floor into the same unit as a step across it; every
   position is placed in the court's own units and needs no ratio at all. */
const COURT_RATIO = 20 / 29
/* The players stand a step to one side of their mark rather than in it — an O with a man in it is
   not a play. The real gap is a clamp in the stylesheet (--ck-fig-gap), because the marks have a
   pixel floor on a phone and the gap has to clear them, so it is 9.1cqw on a desk and about 11
   on a phone. This is the middle of that range, and it is used ONLY in the two places where an
   approximation cannot be wrong: which way a man is turned, which needs the SIGN of a difference
   and never its size, and how far a throw is, which sets the arc and the clock and would not be
   felt a per cent either way. Nothing that has to LAND anywhere reads it — both ends of the
   flight are built in the stylesheet out of the same expression that places the man. */
const GAP_CQW = 9.5
const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * ONE OF THE SIX WAYS TO PLAY, as it is chalked on the floor and as it is read out on the right.
 *
 * `mark` USED TO BE HERE AND IS GONE — his ruling of 2026-09-09: "Remove the X\O from both home
 * screens." It held the 'O' or the 'X' that was printed inside the ring, and nothing else in the
 * app ever read it, so it is deleted rather than left standing unused.
 *
 * `cup` IS USER MODE'S ALONE and is `false` on every mark in scout mode — see the head of this
 * file. It is true on a ladder with all 150 cleared, and it stands a gold trophy at the head of
 * the name chalked under the mark. (It used to stand INSIDE the mark; his ruling of 2026-09-09,
 * "You made only 1 bullet, instead all", left no inside to stand it in.)
 */
type Zone = { pick: Mode; cup: boolean; x: string; y: string; side: 1 | -1; label: string; tag: string; desc: string; meta: string; cta: string }

/** where a man actually stands, across the floor: his mark, plus the step he takes off it. */
const groundX = (z: Zone) => parseFloat(z.x) + z.side * GAP_CQW

/**
 * HOW FAR DOWN THE FLOOR HE IS, AS A SIZE. The plan is read the way the drawing is drawn — the
 * rim is at the foot of it, so the baseline is the near edge and the backcourt is away up the
 * floor. A man at the top of the plan is therefore further from the eye: he is drawn smaller and,
 * because air greys out distance, a little fainter. It is worth 22% between the man in the corner
 * and the man out top, which is not much on its own and is a great deal alongside a ball that
 * arcs and a shadow that opens under it.
 */
const depthOf = (z: Zone) => +(0.86 + (parseFloat(z.y) / 100) * 0.3).toFixed(3)

/**
 * WHICH WAY A MAN IS TURNED: at whoever has the ball. That is the whole rule, and it is what makes
 * six figures read as a team rather than as six cones — press a corner and the floor turns to
 * look at it. The man WITH the ball is the exception, since he cannot look at himself; he is
 * handed `hold`, which is the line the ball came in on.
 */
const faceOf = (z: Zone, holder: Zone, hold: 1 | -1): 1 | -1 =>
  z === holder ? hold : groundX(holder) >= groundX(z) ? 1 : -1

export function ChalkHome({
  user,
  progress,
  onPick,
}: {
  user: boolean
  progress: Record<CampaignMode, Progress>
  onPick: (m: Mode) => void
}) {
  const [sel, setSel] = useState(0)
  const banked = (p: Progress) => p.stars.reduce((a, b) => a + b, 0)
  const cur = currentLevel(progress.campaign)
  /**
   * A LADDER IS FINISHED WHEN THERE IS NO LEVEL LEFT TO PLAY — `currentLevel` is null exactly
   * then, which is the same question the campaign's own read asks two lines down. The cup it
   * earns is user mode's, on the mode prop, because scout's board must come out of his ruling of
   * 2026-09-09 the board it already was but for the letters.
   */
  const cup = (p: Progress) => user && currentLevel(p) === null

  /**
   * The six, in the board's own order and at its own coordinates — the x/y are percentages of the
   * court, so the floor can be any size and the play keeps its shape.
   *
   * THE BOARD DREW THE THREE LADDERS AS O'S AND THE THREE SIDE MODES AS X'S. His ruling of
   * 2026-09-09 — "Remove the X\O from both home screens" — takes the letters off both boards, so
   * all six are the same ring now and the only thing that tells a ladder from a side mode is
   * where it stands and what the read says about it. Which is how a coach's slate works anyway:
   * the six spots are six spots.
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
   *
   * `side` IS WHICH SHOULDER OF HIS MARK THE MAN STANDS ON, since his ruling of 2026-09-08 put a
   * player on each of them: -1 is a step to the left of it, +1 a step to the right. Four of the
   * six are decided for them — a man at a wing or in a corner has to stand INBOARD or he is off
   * the floor, and the name chalked under the mark runs the other way — so salary cap and custom
   * take +1, death match and vs friend take -1. The campaign and the 1v1 bid are both chalked on
   * the middle of the floor and could take either; they are given opposite shoulders so the two
   * men in the middle are not stacked in one column.
   */
  const zones: Zone[] = [
    {
      pick: 'campaign',
      cup: cup(progress.campaign),
      x: '50%',
      y: '56%',
      side: -1,
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
      cup: cup(progress.salary),
      x: '17%',
      y: '36%',
      side: 1,
      label: 'SALARY CAP',
      tag: '02 · TIGHT MONEY',
      desc: `The same ${ROUNDS} levels — every card priced that year, the five held under the cap.`,
      meta: `★ ${banked(progress.salary)} / ${ROUNDS * 3} BANKED`,
      cta: 'PLAY →',
    },
    {
      pick: 'death',
      cup: cup(progress.death),
      x: '83%',
      y: '36%',
      side: -1,
      label: 'DEATH MATCH',
      tag: '03 · ONE LIFE',
      desc: 'One five, carried the whole way — change a single man before each level. Lose and the run is over.',
      meta: `★ ${banked(progress.death)} / ${ROUNDS * 3} BANKED`,
      cta: 'PLAY →',
    },
    {
      pick: 'custom',
      cup: false,
      x: '8.5%',
      y: '82%',
      side: 1,
      label: 'CUSTOM',
      tag: 'ANY ERA',
      desc: 'Pick the season, pick the opponent — any team from 1980 to 2026, best of seven.',
      meta: 'EVERY TEAM · 1980–2026',
      cta: 'SET IT UP →',
    },
    {
      pick: 'versus',
      cup: false,
      x: '91.5%',
      y: '82%',
      side: -1,
      label: 'VS FRIEND',
      tag: 'SAME PHONE',
      desc: 'Pass the phone. Two benches, alternating picks, one winner.',
      meta: 'LOCAL · NO ACCOUNT',
      cta: 'TIP OFF →',
    },
    {
      pick: 'auction',
      cup: false,
      x: '50%',
      y: '16%',
      side: 1,
      label: '1V1 BID',
      tag: '$20 EACH',
      desc: 'Blind-bid the level with the table — twenty a head, winner takes the pot.',
      meta: 'HOUSE RULES',
      cta: 'ANTE UP →',
    },
  ]
  const z = zones[sel]

  /**
   * THE PASS — his ruling: "have a player on the field for each mode, and have them passing the
   * ball." Nobody moves off his mark. The only thing that travels is the ball, and the board only
   * has to remember two things about it: WHO has it (that is `sel`, the pressed play, so the ball
   * always sits with the mode the read is describing) and, while a throw is in the air, who threw
   * it. That second one is `pass`, and it is cleared the moment the catch is over so the ball is
   * simply resting in the new man's hands with nothing animating.
   *
   * `id` counts the throws. It is the React key on the ball and on the two men involved, which is
   * how a CSS animation is made to run again from the top: press a fourth mark while the third
   * throw is still up and the key changes, those nodes are remade, and the new throw starts clean
   * from wherever the ball happens to be — nothing is left half-swung.
   */
  const [pass, setPass] = useState<{ from: number; id: number } | null>(null)
  /**
   * WHICH WAY THE MAN HOLDING THE BALL IS TURNED. Everyone else is turned toward him — that is
   * `faceOf` below — but he cannot look at himself, so he keeps looking back down the line the
   * ball came in on. On the first paint nobody has thrown yet, so the campaign's man is turned
   * toward the middle of the floor, which is where a player with the ball looks.
   */
  const [holdFace, setHoldFace] = useState<1 | -1>(1)
  const passId = useRef(1)
  function press(i: number) {
    if (i === sel) return
    setHoldFace(groundX(zones[sel]) >= groundX(zones[i]) ? 1 : -1)
    setPass({ from: sel, id: passId.current++ })
    setSel(i)
  }

  /* The flight, in numbers the stylesheet does the rest of the arithmetic on. Distance is measured
     in ONE unit — a step across the floor — so a drop down it is converted by the court's ratio;
     everything else is a function of that distance, because a long pass is thrown higher, is up
     longer, and a short one has to be a zip rather than a lob. */
  const air = (() => {
    const a = zones[pass ? pass.from : sel]
    const b = zones[sel]
    const dx = groundX(b) - groundX(a)
    const dy = (parseFloat(b.y) - parseFloat(a.y)) * COURT_RATIO
    const dist = Math.hypot(dx, dy)
    /* The apex, as a share of the floor's width. Held between 6 and 12 so the shortest throw still
       leaves the floor and the longest does not sail off the top of the slate on a phone — the
       1v1 bid stands 16% down the court and there is not much sky above him. */
    const arc = clamp(6, dist * 0.16, 12)
    /* Time in the air, and then the whole gesture. The wind-up is a fifth of the flight, which is
       what makes 17% of the total the moment of release in every keyframe list in the stylesheet
       no matter how far the ball is going. */
    const fly = clamp(430, 300 + dist * 3.2, 660)
    return { arc: +arc.toFixed(2), ms: Math.round(fly * 1.2), dir: dx >= 0 ? 1 : -1 }
  })()

  /* The throw is over when the catcher has finished absorbing it — the catch runs a third longer
     than the flight, so that it can still be giving with the ball after the ball has arrived. Then
     `pass` is cleared and the ball is simply at rest in the new man's hands. Press again before
     that and this timer is thrown away and a fresh one starts, which is what the cleanup is for. */
  useEffect(() => {
    if (!pass) return
    const t = window.setTimeout(() => setPass(null), air.ms * 1.35)
    return () => window.clearTimeout(t)
  }, [pass, air.ms])

  /** The book, along the foot — the four scout-only rooms, with what is in each one. Read by the
      scout branch at the foot of the board and by nothing else; user mode never opens these. */
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
          {/* THE MODE IS SPENT HERE (1 of 3): the question the old user-mode front door asked in
              the middle of itself — "How do you want to see the game?" — said the way a coach
              would write it in the corner of the slate, with the mode you are in lit. It is the
              same pair of chips on both boards; only which one is lit changes, because a player
              who cannot get from one mode to the other is stuck in the one he is in. */}
          <div className="ck-modes" role="group" aria-label="How do you want to see the game?">
            <button className={`ck-mode${user ? ' on' : ''}`} onClick={() => setUserMode(true)} aria-pressed={user}>
              USER
            </button>
            <button className={`ck-mode${user ? '' : ' on'}`} onClick={() => setUserMode(false)} aria-pressed={!user}>
              SCOUT
            </button>
          </div>
        </div>

        <div className="ck-body">
          {/* HALF A COURT IN DASHED CHALK — sideline box, the arc swung off the rim, the paint,
              the free-throw circle and the rim itself. Every measure is a percentage of the box,
              and the round things carry aspect-ratio rather than a percentage height, so a circle
              is still a circle when the floor is 320px wide instead of 560. */}
          {/* THE PASS IS HANDED TO THE STYLESHEET AS NUMBERS, not as pixels: the two ends of the
              throw as the marks' own percentages, which shoulder each man is on, how far each of
              them is down the floor (so the ball shrinks as it goes away and grows as it comes
              back), the apex, the spin and how long the whole gesture runs. The court is where
              they are set because BOTH play layers have to read them — the men on the floor and
              the ball in the air are two separate stacking layers, either side of the marks. */}
          <div
            className="ck-court"
            style={
              {
                '--pfx': parseFloat(zones[pass ? pass.from : sel].x),
                '--pfy': parseFloat(zones[pass ? pass.from : sel].y),
                '--pfs': zones[pass ? pass.from : sel].side,
                '--pfd': depthOf(zones[pass ? pass.from : sel]),
                '--ptx': parseFloat(z.x),
                '--pty': parseFloat(z.y),
                '--pts': z.side,
                '--ptd': depthOf(z),
                '--parc': air.arc,
                '--pspin': air.dir * -320,
                '--pdur': `${air.ms}ms`,
              } as CSSProperties
            }
          >
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
            {/* the six men, on the floor and UNDER the marks, so no head ever covers a dab, a cup
                or a name — and then the ball, in its own layer OVER them, because a ball in the
                air passes over everything the floor is carrying */}
            <ChalkFloor zones={zones} sel={sel} pass={pass} holdFace={holdFace} />
            <ChalkAir pass={pass} />
            {/* THE SIX MARKS, AND EVERY ONE OF THEM IS A BULLET — his ruling of 2026-09-09, on a
                board where only the pressed one had become one: "You made only 1 bullet, instead
                all. Find a way to do it." So the mark is a chalk dab at rest and the same dab in
                orange when pressed, and there is no ring left anywhere on the floor. The two
                rulings this lands on top of: "Remove the X\O from both home screens" took the
                letters out, and "Instead of an orange circle in the home screen make it a bullet"
                turned the pressed one. See `.ck-glyph::before` in the stylesheet for how a 19px
                dab was made to read as chalk rather than as a radio button.

                THE MARK IS NOW A DRAWING AND NOTHING ELSE — `aria-hidden`, empty, with no class
                left on it that says anything — because everything that used to be announced from
                inside it has moved out to the line below. The button's name is the name chalked
                under it, which is what it always was.
                THE MODE IS SPENT HERE (3 of 3): the cup, and only in user mode. */}
            {zones.map((s, i) => (
              <button
                key={s.pick}
                className={`ck-spot ${i === sel ? 'on' : ''}`}
                style={{ left: s.x, top: s.y }}
                onClick={() => press(i)}
                aria-pressed={i === sel}
                /* the cup is a drawing and says nothing on its own, so the mark that carries one
                   is named in full and in the order it should be heard — "Campaign, all 150
                   cleared" rather than the cup first and the play after it. Every other mark
                   takes its name from the word chalked under it, which is what it always did. */
                aria-label={s.cup ? `${s.label}, all ${ROUNDS} cleared` : undefined}
              >
                <span className="ck-glyph" aria-hidden />
                {/* THE CUP CAME OUT OF THE MARK AND STANDS AT THE HEAD OF THE NAME. It used to sit
                    inside the ring, and a mark with a cup in it was the one mark that did NOT fill
                    in when pressed — which is exactly the "only 1 bullet" he threw out, and it was
                    live on his own save, since his campaign is 150/150 and CAMPAIGN is what the
                    board opens on. A dab has no inside, so the cup moves to the line under the
                    mark and every mark is the same dab again. His standing ruling — "Add a trophy
                    for EVERY mode at 150 wins" — is kept; only where the cup stands has changed.
                    See `.ck-cup` in the stylesheet for why this costs the row no height. */}
                <span className="ck-under">
                  {s.cup ? (
                    <span className="ck-cup" aria-hidden>
                      <Trophy size={22} />
                    </span>
                  ) : null}
                  <span className="ck-label">{s.label}</span>
                </span>
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
            {/* THE SIGN-OFF STANDS AT THE FOOT OF THE READ IN SCOUT MODE and at the foot of the
                BOARD in user mode — see below. It is one line of chalk either way; what moves it
                is that user mode has no record book to close the slate with. */}
            {user ? null : (
              <div className="ck-foot">
                EVERY NUMBER FROM REAL 1980—2026 STATS.
                <br />
                RUN THE PLAY. ERASE. RUN IT AGAIN.
              </div>
            )}
          </div>
        </div>

        {/* THE MODE IS SPENT HERE (2 of 3): WHAT CLOSES THE SLATE.
            In scout mode it is the record book — four rooms of engine ratings, which user mode has
            no doors to by his standing ruling, so user mode cannot have this row.
            In user mode the board would otherwise stop dead under the read, which reads as a page
            cut off rather than a board that ends. It keeps the BOOK'S OWN RULE — the dashed line
            that has always drawn the foot of the slate — and the slate's sign-off is written
            under it, centred, instead of being tucked at the bottom of the read column. Same two
            sentences, same chalk, one line of the board's furniture doing the closing. */}
        {user ? (
          <div className="ck-close">
            EVERY NUMBER FROM REAL 1980—2026 STATS. RUN THE PLAY. ERASE. RUN IT AGAIN.
          </div>
        ) : (
          <div className="ck-book">
            {book.map((b) => (
              <button key={b.pick} className="ck-bookrow" onClick={() => onPick(b.pick)}>
                <b>{b.label}</b>
                <i>{b.note} →</i>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


/**
 * THE SIX ON THE FLOOR — his ruling: "have a player on the field for each mode." One man to a
 * mark, none of them ever moving off it, all of them under the marks in the stacking order so
 * that no head can cover an O and no shoulder can cover a name.
 *
 * EACH MAN IS FOUR NESTED SPANS AND THAT IS DELIBERATE, because a CSS element can carry exactly
 * one transform and each of these is a different question:
 *   · .ck-p       WHERE he stands. Placed at his mark's own percentages plus the step off it, and
 *                 anchored at the FEET (translate -100% of his own height), which is the whole of
 *                 what makes him stand ON the plan instead of lying in it.
 *   · .ck-p-idle  BREATHING. A slow lean and a rise off the heel, pivoting at the feet, every man
 *                 on his own period and his own phase so six of them never pulse together.
 *   · .ck-p-act   THROWING or CATCHING — the weight. A thrower sinks and coils back, drives
 *                 through and rides forward on the follow-through; a catcher rises to meet the
 *                 ball, takes it, and gives at the knees. This is the layer the last attempt did
 *                 not have at all, and it is what he meant by a figure that never shifts weight.
 *   · .ck-p-turn  FACING. He is drawn facing right; turned round he is the same drawing mirrored.
 *
 * The act wrapper is the only one keyed on the throw, so remaking it to restart its animation
 * never disturbs the breathing above it — the breath is on a different node and keeps its phase.
 */
function ChalkFloor({
  zones,
  sel,
  pass,
  holdFace,
}: {
  zones: Zone[]
  sel: number
  pass: { from: number; id: number } | null
  holdFace: 1 | -1
}) {
  /**
   * THE TURN NEEDS TWO VALUES, not one. A man is drawn facing right and turned round he is the
   * same drawing mirrored — but a mirror animated straight through is a figure that becomes a
   * VERTICAL LINE half way round, which is what a scaleX from 1 to -1 does and it looks like a
   * paper doll on a spindle. The fix is the oldest one in hand-drawn animation: squash him toward
   * the turn, CUT on the narrowest frame, and open him out the other way. The cut needs the face
   * he had as well as the face he is taking, so the previous one is kept here and handed to the
   * stylesheet as --face0; `prev` is written after the paint, so during a render it still holds
   * the frame before.
   */
  const faces = zones.map((z) => faceOf(z, zones[sel], holdFace))
  const prev = useRef(faces)
  useEffect(() => {
    prev.current = faces
  })
  return (
    <span className="ck-floor" aria-hidden>
      {/* ONE GRADIENT FOR ALL SIX, defined once here rather than six times inside six SVGs, which
          would be six copies of the same id in one document. It is in user space — the figure's
          own 0..100 — so a leg and a torso that overlap take the SAME cream at the same height
          and the join between them cannot be seen. That is what lets a man be built out of loose
          strokes and still read as one solid body. */}
      <svg className="ck-figdefs" aria-hidden focusable="false">
        <defs>
          <linearGradient id="ck-fig-chalk" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
            {/* the stop colours are set in the stylesheet rather than here: a var() inside an SVG
                presentation attribute is not reliably substituted, and these three are the
                board's own creams and must stay tied to the tokens. */}
            <stop className="s0" offset="0" />
            <stop className="s1" offset="0.44" />
            <stop className="s2" offset="1" />
          </linearGradient>
        </defs>
      </svg>
      {zones.map((z, i) => {
        const act = pass ? (i === pass.from ? 'throw' : i === sel ? 'catch' : '') : ''
        /* Which way he was turned BEFORE this render, so the turn has somewhere to come from.
           Where the two agree — which is most men on most presses — the turn does not run. */
        const was = prev.current[i]
        return (
          <span
            key={z.pick}
            className={`ck-p ${act}`}
            style={
              {
                '--x': parseFloat(z.x),
                '--y': parseFloat(z.y),
                '--side': z.side,
                '--dep': depthOf(z),
                '--face': faces[i],
                '--face0': was,
                '--i': i,
                /* nearer men are painted over farther ones. They do not overlap today; this is
                   what keeps that true if a mark is ever moved. */
                zIndex: Math.round(parseFloat(z.y)),
              } as CSSProperties
            }
          >
            <span className="ck-p-shade" />
            <span className="ck-p-idle">
              <span className="ck-p-act" key={act ? `t${pass!.id}` : 'still'}>
                <span className={`ck-p-turn ${was === faces[i] ? '' : 'spin'}`} key={`f${faces[i]}`}>
                  <ChalkFigure />
                </span>
              </span>
            </span>
          </span>
        )
      })}
    </span>
  )
}

/**
 * THE BALL, AND THE ONLY THING ON THIS SCREEN THAT TRAVELS — his ruling: "have them passing the
 * ball ... make the animation good, 3d esque."
 *
 * THREE NESTED SPANS, AND EACH ONE IS ONE OF THE THREE DIMENSIONS:
 *   · .ck-ball-rig   is the ball's GROUND position — where it would be if it never left the
 *                    floor. It slides from the thrower's hands to the catcher's, and it carries
 *                    the depth scale of the two ends with it, so a ball thrown up the floor
 *                    shrinks on the way and one thrown back down grows.
 *   · .ck-cast       is the SHADOW, and it stays on the ground because it is a child of the rig
 *                    and never lifts. It slides out from under the ball as the ball climbs, opens
 *                    and pales at the apex, and draws back in and darkens as the ball drops into
 *                    the hands. The gap between it and the ball is the only reading of height
 *                    this drawing has, and it is the strongest thing in it.
 *   · .ck-lift       is HEIGHT. It carries the ball up the parabola and scales it up at the same
 *                    time, because a thing nearer the eye is bigger — which is the trick that
 *                    does more for depth here than anything else.
 *
 * The whole rig is keyed on the throw so that every press starts the flight from the top; there
 * is no rest position to restore afterwards, because the rig's own untouched transform IS the
 * catcher's hands and the animation simply lands on it.
 */
function ChalkAir({ pass }: { pass: { from: number; id: number } | null }) {
  return (
    <span className="ck-air" aria-hidden>
      <span key={pass ? pass.id : 'rest'} className={`ck-ball-rig ${pass ? 'go' : ''}`}>
        <span className="ck-cast" />
        <span className="ck-lift">
          <span className="ck-ball">
            {/* A COACH'S BALL, NOT A PHOTOGRAPH. The house `Ball` is leather and a gradient and
                the 7 through the middle of it, which is mud at the fourteen pixels this one
                measures on a phone; a ring and its seams is what a coach draws and it is still a
                basketball that small. In the pressed mark's own orange, so the thing being thrown
                and the thing you pressed are one colour. */}
            <svg viewBox="-10 -10 20 20" focusable="false">
              <circle className="ck-ball-skin" cx="0" cy="0" r="8" />
              <circle className="ck-ball-line" cx="0" cy="0" r="8" />
              <path className="ck-ball-line" d="M0 -8 L0 8" />
              <path className="ck-ball-line" d="M-8 0 C-4.4 -3.6 4.4 -3.6 8 0" />
              <path className="ck-ball-line" d="M-8 0 C-4.4 3.6 4.4 3.6 8 0" />
            </svg>
          </span>
        </span>
      </span>
    </span>
  )
}

/**
 * ONE MAN, DRAWN THE WAY THE REST OF THE SLATE IS DRAWN — and specifically NOT the way the runner
 * was. His ruling on that drawing: "This animation was disrespect."
 *
 * WHY IT IS A SILHOUETTE AND NOT A STICK FIGURE. The old man was five hairlines: a head, the line
 * of a back, and four limbs at two units of stroke, which is a diagram of a person rather than a
 * person. A coach filling a man in with the side of the chalk gets MASS — so this one is a filled
 * torso with a shoulder line and a waist, and limbs drawn as strokes eight and six units thick
 * with round ends, which is a capsule and reads as an arm with a thickness rather than a wire.
 * Everything is filled from the one shared gradient, brightest at the shoulders and dropping to
 * the board's own --ck-faint at the shoes, so the figure has a top and a bottom the way a thing
 * lit from above the slate does — the slate's own light comes from its upper left, which is the
 * radial highlight on .ck-board. The far arm and far leg are held back to two thirds, which is
 * the oldest depth trick there is and costs one attribute.
 *
 * WHY THREE QUARTER VIEW. Straight on he is a symmetrical paper doll and lies flat on the plan.
 * Turned, one leg leads and one arm is nearer than the other, and a shoulder line that is not
 * square to the eye is the difference between a body in a room and a decal.
 *
 * THE ARMS ARE THE ONLY THINGS THAT ARTICULATE, and each is an outer group carried to the
 * shoulder with an inner group rotating about its own 0,0 — the only way to swing a limb about a
 * joint in CSS, and the translate is a presentation attribute on purpose because a CSS transform
 * on the same element would overwrite it. --amp is how far each arm goes: the near one all the
 * way, the far one a little under three quarters, so the pair never looks like one arm drawn
 * twice. A stride's worth of leg swing is deliberately absent — nobody on this floor is running
 * any more.
 */
function ChalkFigure() {
  return (
    <svg viewBox="0 0 44 100" focusable="false">
      <g className="ck-fig">
        {/* far arm and far leg first, held back, so the near side of the body covers their joints */}
        <g transform="translate(12.6 26)">
          <g className="ck-arm b" style={{ '--amp': 0.72 } as CSSProperties}>
            <path className="ck-limb up" d="M0 0 L-3.6 14" />
            <path className="ck-limb lo" d="M-3.6 14 L-1.6 26.5" />
          </g>
        </g>
        <g className="ck-far">
          <path className="ck-limb th" d="M18.6 55 L16.8 76" />
          <path className="ck-limb sh" d="M16.8 76 L16 94" />
          <path className="ck-limb ft" d="M16 95 L21.2 97.2" />
        </g>
        {/* the body: shoulders wider than the hips, a waist between them, and a round cap on each
            shoulder so the arms have something to hang off */}
        <path
          className="ck-solid"
          d="M11.6 27 C11.4 21.6 14.8 18.4 19.6 17.9 L27.2 17.9 C32.2 18.4 34.4 21.6 34.2 27 L32.6 38 L30.4 49 L30.9 57.8 L14.4 57.8 L14.1 49 L12.6 38 Z"
        />
        <circle className="ck-solid" cx="12.9" cy="26.2" r="5.1" />
        <circle className="ck-solid" cx="32.9" cy="26.2" r="5.3" />
        {/* the near leg over the body, so the hip joint disappears into it */}
        <path className="ck-limb th" d="M26 55 L28.4 76" />
        <path className="ck-limb sh" d="M28.4 76 L29.4 94" />
        <path className="ck-limb ft" d="M29.4 95 L35 97.2" />
        {/* head set a little toward the way he is facing — that offset is the three-quarter turn */}
        <path className="ck-limb nk" d="M22.6 15 L23.4 20" />
        <circle className="ck-solid" cx="23.6" cy="10.4" r="7.1" />
        <g transform="translate(32.9 26)">
          <g className="ck-arm f" style={{ '--amp': 1 } as CSSProperties}>
            <path className="ck-limb up" d="M0 0 L3.4 14" />
            <path className="ck-limb lo" d="M3.4 14 L1.8 26.5" />
          </g>
        </g>
      </g>
    </svg>
  )
}
