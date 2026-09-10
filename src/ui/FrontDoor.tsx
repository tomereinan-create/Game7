import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { DEFAULT_ORDER, PLAYERS } from '../engine/pool'
import { ROUNDS } from '../config'
import { currentLevel, totalStars, clearedCount, type Progress, type CampaignMode } from '../state/campaign'
import { setUserMode } from '../state/viewmode'
import { achCount } from '../state/achievements'
import { myColor } from './teamColors'
import { Ball } from './Ball'
import { Trophy } from './Trophy'
import { useLayout } from './useLayout'
import type { Mode } from './Home'

/**
 * THE FRONT DOOR — both modes', and since 2026-09-10 it is the arena's own door rather than a
 * coach's slate.
 *
 * HIS RULING, verbatim: "Use this design for the main page, but keep our logic and things we made.
 * Meaning - locations outside the 3pt line, the jersey above the location and not to the side. Fix
 * it logically but copy the design."
 *
 * The design is the door screen of the Game7 flow board: a top rail, an identity row with the ball,
 * the wordmark, the club badge and the two counters, a court panel beside a read pane, and one
 * navy band along the foot. It was drawn in this app's OWN bundle — every hex in it is a token in
 * styles.css and both faces are already loaded — so this is not a new palette, it is the front door
 * rejoining the house. Block 4a was the only screen that ever left it (green slate, Courier Prime,
 * dashed everything); every --ck-* colour is deleted rather than translated.
 *
 * THE TWO THINGS HIS RULING OVERRIDES IN THE DESIGN, and they are the whole of "fix it logically":
 *   1. OUR COORDINATES, NOT THE MOCKUP'S. The six positions stand where four of his rulings put
 *      them, the three-point line keeps its STRAIGHTS at 14%/86% with the arc clipped between them
 *      (the mockup draws them at 5%/95%, which puts custom and vs friend INSIDE the line), and the
 *      floor stays 29:20. See `zones` below and `.fd-corner` in the stylesheet.
 *   2. THE JERSEY STANDS ABOVE ITS NAME PLATE, never beside it. The mockup parks the shirt a step
 *      to one side of the chip; his ruling puts it over the plate, so `GAP_CQW` — the step off the
 *      mark, live since 2026-09-08 — retires here and the man stands ON his mark's x.
 *
 * THE MODE IS ONE PROP AND IT IS SPENT IN THREE PLACES, marked where they are rendered below and
 * nowhere else, so the two boards stay one board:
 *   1. which chip is lit in the header — USER or SCOUT;
 *   2. the foot band — the record book in scout, the sign-off in user;
 *   3. the cup standing on a finished ladder's mark, which is user mode's alone.
 *
 * HIS EARLIER RULINGS THAT STILL BIND THIS SCREEN:
 *   · "Change the user mode main screen to look like the scout mode" — one component for both
 *     modes. `UserHome` was deleted rather than kept beside it; see the head of Home.tsx for why a
 *     second copy of a court, six men and a pass in the air is the thing that must not exist.
 *   · No PLAYBOOK in the title and NO LINE UNDER THE WORDMARK. The mockup's own front-page artboard
 *     sets `Six ways to play. Pick a spot on the floor.` directly under GAME7; that is the exact
 *     shape he struck, so it is not reinstated. The door screen we are building carries the same
 *     sentence in the TOP RAIL instead, right-aligned, a band away from the wordmark.
 *   · "Make everything full screen" — the bands run to the window's own edges. The mockup caps its
 *     artboard at 1440 with the ground showing either side; that is the card with gutters his
 *     ruling took away, so the cap is dropped rather than copied.
 *   · "make the court way bigger, to fit proportionally to the screen. Same for the logo, and for
 *     every font there in general" — --fd-u and the court's own cq units, see the stylesheet.
 *
 * TOMBSTONES — what this design supersedes, kept so a later pass cannot re-make the decision:
 *   · THE ORANGE BULLET AND ITS FIVE BARE SPOTS. Four rulings got the mark there and each reversed
 *     part of the one before it: "Remove the X\O from both home screens" (six dashed rings) →
 *     "Instead of an orange circle in the home screen make it a bullet" (one filled, five ringed) →
 *     "You made only 1 bullet, instead all. Find a way to do it" (all six dabs, no rings) → "Your
 *     bullets are messed up. Have only 1 bullet on wherever I am like before and remove the
 *     circles" (one dab, five blank). THE COUNT is what that last ruling was about, and the count
 *     survives: the selected plate lights gold with a gold ring and the other five draw no mark of
 *     their own — one lit, five bare, in the new design's language. The DAB does not survive: its
 *     seven-gradient recipe exists solely to make a small mark read as chalk on a green slate, and
 *     there is no chalk and no slate left to read it against.
 *   · `.ck-glyph`, THE EMPTY BOX RESERVED AT ALL SIX. It was a footprint, not a drawing — "the box
 *     was giving every mark its height. Take it away and six tap targets fall to the height of one
 *     line of type." The jersey and the button's own min-height inherit that job; see the measured
 *     target recorded on `.fd-mark` in the stylesheet.
 *   · THE JERSEY NUMERAL 1-6 ON THE CHEST is drawn but hidden under a 460px court: on a phone the
 *     torso is nine pixels across and a numeral there is a smudge. The plate carries 01-06 either
 *     way, which is where the number is actually read.
 *   · THE CHALK RUNNER. "Instead of a man running, with the ball, have a player on the field for
 *     each mode, and have them passing the ball. But please, make the animation good, 3d esque.
 *     This animation was disrespect." He is still deleted, and the six men who replaced him are
 *     still here — dressed in the mockup's kit rather than replaced by it. The mockup's figure is a
 *     shirt and nothing else: no head, no arms, no legs. A shirt cannot throw, and adopting it
 *     would delete the throw, the catch, the turn and the breath in favour of a flat 620ms tween —
 *     which is strictly less than the animation he already sent back once.
 */

/* The court's own aspect-ratio, off `.fd-court` in the stylesheet. Only the ARC and the FLIGHT
   TIME read it, to turn a drop down the floor into the same unit as a step across it; every
   position is placed in the court's own units and needs no ratio at all. */
const COURT_RATIO = 20 / 29
const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * ONE OF THE SIX WAYS TO PLAY, as it stands on the floor and as it is read out on the right.
 *
 * `mark` USED TO BE HERE AND IS GONE — his ruling of 2026-09-09: "Remove the X\O from both home
 * screens." It held the 'O' or the 'X' printed inside the ring, and nothing else in the app ever
 * read it, so it was deleted rather than left standing unused.
 *
 * EVERY DISPLAY STRING BELOW IS AUTHORED IN SENTENCE CASE and shouted by `text-transform` in the
 * stylesheet, which is the design's own convention and the old block's reversed. It matters for
 * more than tidiness: `aria-label` reads "Campaign, all 150 cleared" rather than a shout.
 *
 * `cup` IS USER MODE'S ALONE and is `false` on every mark in scout mode. It is true on a ladder
 * with all 150 cleared.
 */
type Zone = {
  pick: Mode
  cup: boolean
  x: string
  y: string
  side: 1 | -1
  no: string
  jersey: string
  label: string
  tag: string
  desc: string
  metaKey: string
  meta: string
  cta: string
}

/**
 * WHICH WAY A MAN IS TURNED: at whoever has the ball. That is the whole rule, and it is what makes
 * six figures read as a team rather than as six cones — press a corner and the floor turns to look
 * at it. The man WITH the ball is the exception, since he cannot look at himself; he is handed
 * `hold`, which is the line the ball came in on.
 *
 * `side` NO LONGER PLACES ANYTHING — his ruling put the jersey above the plate, so nobody stands a
 * step off his mark any more — BUT IT IS STILL LOAD-BEARING, as the tiebreak here. The campaign and
 * the 1v1 bid share x: 50%, so a pass between them has dx = 0 and there is no sign to read; the
 * thousandth of a per cent below is what decides which shoulder each of them looks over, and it is
 * the same answer `side` gave when it was a real step. Delete it and two of the six freeze facing
 * the wrong way on the one pass that runs straight up the floor.
 */
const faceX = (z: Zone) => parseFloat(z.x) + z.side * 0.001
const faceOf = (z: Zone, holder: Zone, hold: 1 | -1): 1 | -1 => (z === holder ? hold : faceX(holder) >= faceX(z) ? 1 : -1)

/**
 * HOW FAR DOWN THE FLOOR HE IS, AS A SIZE. The plan is read the way the drawing is drawn — the rim
 * is at the foot of it, so the baseline is the near edge and the backcourt is away up the floor. A
 * man at the top of the plan is further from the eye: he is drawn smaller and, because air greys
 * out distance, a little fainter. It is worth 22% between the man in the corner and the man out
 * top, which is not much on its own and a great deal alongside a ball that arcs and a shadow that
 * opens under it. Identical in the mockup and here, and unchanged by the move above the plate.
 */
const depthOf = (z: Zone) => +(0.86 + (parseFloat(z.y) / 100) * 0.3).toFixed(3)

export function FrontDoor({
  user,
  progress,
  onPick,
}: {
  user: boolean
  progress: Record<CampaignMode, Progress>
  onPick: (m: Mode) => void
}) {
  const [sel, setSel] = useState(0)
  /**
   * THE READ PANE'S OWN STAR COUNT, AND IT IS NOT THE HEADER'S. This one is denominated — ROUNDS*3
   * is every star the ladder can give — so it counts the stars on the map and nothing else.
   * `totalStars` (the header's Rafters) adds `credit`, which is stars won on a ladder whose levels
   * are gone; adding it here could push the numerator past its own denominator. Two questions, two
   * formulas, and they must not be unified.
   */
  const banked = (p: Progress) => p.stars.reduce((a, b) => a + b, 0)
  const cur = currentLevel(progress.campaign)
  /**
   * A LADDER IS FINISHED WHEN THERE IS NO LEVEL LEFT TO PLAY — `currentLevel` is null exactly then,
   * which is the same question the campaign's own read asks two lines down. The cup it earns is
   * user mode's, on the mode prop. THE MODE IS SPENT HERE (3 of 3).
   */
  const cup = (p: Progress) => user && currentLevel(p) === null

  /**
   * The six, in the board's own order and at ITS OWN COORDINATES — his override #1. x/y are
   * percentages of the court, so the floor can be any size and the play keeps its shape, and y is
   * `top`, so y: 82% is near the hoop.
   *
   * HIS RULINGS ON WHERE THEY STAND: "move custom and vs friend to outside the 3pt line", then
   * "move vs friend and custom to the corners", and "move the O of the campaign a bit lower so it
   * won't be right on the circle line."
   *
   * THE CORNERS ONLY EXIST BECAUSE THE LINE GAINED ITS STRAIGHTS. A circle swung off the rim and
   * run all the way down to the baseline leaves no corner to stand in — the corner of the floor is
   * 50% of the width out from that circle's centre against the circle's own 44.65%, a strip five
   * points wide where a mark is nine. A real line is cut by two STRAIGHTS instead, and the ground
   * between a straight and the sideline is where a corner three is taken. Drawing those straights
   * is what made his ruling possible, so the floor has them — see `.fd-corner` and the arc's own
   * clip in the stylesheet — and the two side modes stand in the corners behind them. THE MOCKUP
   * DRAWS ITS STRAIGHTS AT 5% AND 95%, and at 5% these two would stand INSIDE the three-point line.
   * That is the one place the design is overruled on the floor itself.
   *
   * The campaign's O sat where the free-throw circle's top passes; it is inside the circle now.
   *
   * Every y is read against a floor that is WIDER than the one the board first drew (his ruling:
   * "make the court bigger and wider" — 29:20 where it was 56:47), so the backcourt above the arc
   * is shallower and the three marks up there come down to meet it. CHANGING THE ASPECT RATIO
   * SILENTLY INVALIDATES ALL SIX.
   */
  const zones: Zone[] = [
    {
      pick: 'campaign',
      cup: cup(progress.campaign),
      x: '50%',
      y: '56%',
      side: -1,
      no: '01',
      jersey: '1',
      label: 'Campaign',
      tag: '01 · The gauntlet',
      desc: cur
        ? `${ROUNDS} levels against every team in the league, best of seven each. Level ${cur} is up next.`
        : `${ROUNDS} levels against every team in the league, best of seven each. Every rung of it is cleared.`,
      metaKey: 'Banked',
      meta: `★ ${banked(progress.campaign)} / ${ROUNDS * 3}`,
      cta: cur ? 'Continue →' : 'Run it again →',
    },
    {
      pick: 'salary',
      cup: cup(progress.salary),
      x: '17%',
      y: '36%',
      side: 1,
      no: '02',
      jersey: '2',
      label: 'Salary cap',
      tag: '02 · Tight money',
      desc: `The same ${ROUNDS} levels — every card priced that year, the five held under the cap.`,
      metaKey: 'Banked',
      meta: `★ ${banked(progress.salary)} / ${ROUNDS * 3}`,
      cta: 'Play →',
    },
    {
      pick: 'death',
      cup: cup(progress.death),
      x: '83%',
      y: '36%',
      side: -1,
      no: '03',
      jersey: '3',
      label: 'Death match',
      tag: '03 · One life',
      desc: 'One five, carried the whole way — change a single man before each level. Lose and the run is over.',
      metaKey: 'Banked',
      meta: `★ ${banked(progress.death)} / ${ROUNDS * 3}`,
      cta: 'Play →',
    },
    {
      pick: 'custom',
      cup: false,
      x: '8.5%',
      y: '82%',
      side: 1,
      no: '04',
      jersey: '4',
      label: 'Custom',
      /* the three ladders are numbered and the three side modes are not — do not normalise it */
      tag: 'Any era',
      desc: 'Pick the season, pick the opponent — any team from 1980 to 2026, best of seven.',
      /* our own string, split at its own middot into the design's key/value pair — "EVERY TEAM"
         becomes the key rather than being dropped for the mockup's invented "Pool". The dash here
         is an EN dash; the sign-off and the top rail use an EM dash. */
      metaKey: 'Every team',
      meta: '1980–2026',
      cta: 'Set it up →',
    },
    {
      pick: 'versus',
      cup: false,
      x: '91.5%',
      y: '82%',
      side: -1,
      no: '05',
      jersey: '5',
      label: 'Vs friend',
      tag: 'Same phone',
      desc: 'Pass the phone. Two benches, alternating picks, one winner.',
      metaKey: 'Local',
      meta: 'No account',
      cta: 'Tip off →',
    },
    {
      pick: 'auction',
      cup: false,
      x: '50%',
      y: '16%',
      side: 1,
      no: '06',
      jersey: '6',
      label: '1v1 bid',
      tag: '$20 each',
      desc: 'Blind-bid the level with the table — twenty a head, winner takes the pot.',
      /* THE ONE META WITH NO KEY. Ours reads HOUSE RULES and has no middot to split at, and the
         mockup's answer — key "House rules", value "$20" — invents a number that appears nowhere in
         the data and says the kicker's "$20 each" twice. So the string stays whole in the value and
         the key is empty: the row keeps its gold at all six, and nothing is invented. */
      metaKey: '',
      meta: 'House rules',
      cta: 'Ante up →',
    },
  ]
  const z = zones[sel]

  /**
   * THE PASS — his ruling: "have a player on the field for each mode, and have them passing the
   * ball." Nobody moves off his mark. The only thing that travels is the ball, and the board only
   * has to remember two things about it: WHO has it (that is `sel`, the pressed play, so the ball
   * always sits with the mode the read is describing) and, while a throw is in the air, who threw
   * it. That second one is `pass`, cleared the moment the catch is over so the ball is simply
   * resting in the new man's hands with nothing animating.
   *
   * `id` counts the throws. It is the React key on the ball and on the two men involved, which is
   * how a CSS animation is made to run again from the top: press a fourth mark while the third
   * throw is still up and the key changes, those nodes are remade, and the new throw starts clean
   * from wherever the ball happens to be — nothing is left half-swung.
   */
  const [pass, setPass] = useState<{ from: number; id: number } | null>(null)
  /**
   * WHICH WAY THE MAN HOLDING THE BALL IS TURNED. Everyone else is turned toward him — that is
   * `faceOf` above — but he cannot look at himself, so he keeps looking back down the line the ball
   * came in on. On the first paint nobody has thrown yet, so the campaign's man is turned toward the
   * middle of the floor, which is where a player with the ball looks.
   */
  const [holdFace, setHoldFace] = useState<1 | -1>(1)
  const passId = useRef(1)
  function press(i: number) {
    /* pressing the mark you are already on does nothing. THE MARK PRESS SELECTS AND READS; THE CTA
       IS THE ONLY THING THAT ENTERS A MODE. That two-step is the whole interaction model, and both
       boards agree on it. */
    if (i === sel) return
    setHoldFace(faceX(zones[sel]) >= faceX(zones[i]) ? 1 : -1)
    setPass({ from: sel, id: passId.current++ })
    setSel(i)
  }

  /* The flight, in numbers the stylesheet does the rest of the arithmetic on. Distance is measured
     in ONE unit — a step across the floor — so a drop down it is converted by the court's ratio;
     everything else is a function of that distance, because a long pass is thrown higher, is up
     longer, and a short one has to be a zip rather than a lob. The step off the mark used to be
     added here (GAP_CQW); his ruling put the man on his mark, so the marks' own x is the distance. */
  const air = (() => {
    const a = zones[pass ? pass.from : sel]
    const b = zones[sel]
    const dx = parseFloat(b.x) - parseFloat(a.x)
    const dy = (parseFloat(b.y) - parseFloat(a.y)) * COURT_RATIO
    const dist = Math.hypot(dx, dy)
    /* The apex, as a share of the floor's width. Held between 6 and 12 so the shortest throw still
       leaves the floor and the longest does not sail off the top of the floor on a phone — the 1v1
       bid stands 16% down the court and there is not much sky above him. */
    const arc = clamp(6, dist * 0.16, 12)
    /* Time in the air, and then the whole gesture. The wind-up is a fifth of the flight, which is
       what makes 17% of the total the moment of release in every keyframe list in the stylesheet no
       matter how far the ball is going. */
    const fly = clamp(430, 300 + dist * 3.2, 660)
    return { arc: +arc.toFixed(2), ms: Math.round(fly * 1.2), dir: dx >= 0 ? 1 : -1 }
  })()

  /* The throw is over when the catcher has finished absorbing it — the catch runs a third longer
     than the flight, so it can still be giving with the ball after the ball has arrived. Then
     `pass` is cleared and the ball is simply at rest in the new man's hands. Press again before
     that and this timer is thrown away and a fresh one starts, which is what the cleanup is for. */
  useEffect(() => {
    if (!pass) return
    const t = window.setTimeout(() => setPass(null), air.ms * 1.35)
    return () => window.clearTimeout(t)
  }, [pass, air.ms])

  /**
   * THE TURN NEEDS TWO VALUES, not one. A man is drawn facing right and turned round he is the same
   * drawing mirrored — but a mirror animated straight through is a figure that becomes a VERTICAL
   * LINE half way round, which is what a scaleX from 1 to -1 does and it looks like a paper doll on
   * a spindle. The fix is the oldest one in hand-drawn animation: squash him toward the turn, CUT on
   * the narrowest frame, and open him out the other way. The cut needs the face he had as well as
   * the face he is taking, so the previous one is kept here and handed to the stylesheet as
   * --face0; `prev` is written after the paint, so during a render it still holds the frame before.
   */
  const faces = zones.map((q) => faceOf(q, zones[sel], holdFace))
  const prev = useRef(faces)
  useEffect(() => {
    prev.current = faces
  })

  /**
   * THE KIT THE SELECTED MAN WEARS — his ruling: "Allow me to pick my team colors when starting a
   * campaign", and the mockup dresses the pressed mark's shirt in the franchise's colour. `myColor`
   * → `kitColor` already returns the triple this needs ({primary, accent, ink}) with `ink` flipped
   * to near-black on a primary bright enough that cream would vanish on it. The mockup cycles five
   * demo kits on a 2.6s timer because a mockup has no franchise; we have one, so there is no
   * interval here and the read pane's rule stays --mine — navy is the design's STRUCTURAL blue (the
   * number tags, the rule, the foot band) and the kit appears on the jersey alone.
   *
   * The campaign is asked first and the other two ladders after it, because a player who named a
   * team in the salary cap and never opened the campaign still has a club.
   */
  const kit = myColor(progress.campaign.team) ?? myColor(progress.salary.team) ?? myColor(progress.death.team)
  /* The badge is gated on the campaign's own team: it says what THIS franchise is called and where
     it stands on the ladder, and neither question has an answer before he has named one. With it
     null the identity row is the mockup's row minus the badge, which is a layout that has to work
     anyway (a fresh install opens on it). */
  const team = progress.campaign.team
  /* DERIVED, NOT STORED — nothing in the app computes a club's initials. Guard the empty and the
     one-word case rather than indexing blind. */
  const initials = team ? ((team.city[0] ?? '') + (team.name[0] ?? '')).toUpperCase() : ''

  /** The book along the foot — the four scout-only rooms, with what is in each one. */
  const book: { pick: Mode; label: string; note: string }[] = [
    { pick: 'database', label: 'Database', note: PLAYERS.length.toLocaleString() },
    { pick: 'archetypes', label: 'Archetypes', note: String(DEFAULT_ORDER.length) },
    { pick: 'teams', label: 'Teams', note: 'Every season' },
    { pick: 'achievements', label: 'Trophies', note: `${achCount().done} / ${achCount().total}` },
  ]

  /**
   * THE DOOR IS THE ROOM. The class reaches the page's own ground, which is outside anything this
   * component renders, and comes off on the way out.
   *
   * `tunnel` USED TO RIDE ALONG WITH IT AND MUST NOT. It was borrowed for one rule — it is what
   * takes #root off its 390px column on a desk — but `body.tunnel:not(.um)` re-points --you to cream
   * and --mine to near-black, and it does so in SCOUT MODE ONLY. A screen built on the house tokens
   * would therefore have rendered gold-on-navy in user mode and cream-on-black in scout: a total
   * repaint, and a fourth per-mode difference nobody ruled. `body.door #root { max-width: none }`
   * does the one job `tunnel` was here for, on its own weight.
   */
  useLayout(() => {
    document.body.classList.add('door')
    return () => document.body.classList.remove('door')
  }, [])

  return (
    <div className="fd">
      {/* ---------- the rail across the top ---------- */}
      <div className="fd-rail">
        <span className="fd-years">1980—2026</span>
        {/* THE SENTENCE THAT MAY NOT GO UNDER THE WORDMARK. His ruling struck a second line under
            GAME7; the door screen carries it up here in the rail instead, a band away and
            right-aligned, which is where the design puts it. */}
        <span className="fd-cap">Six ways to play · pick a spot on the floor</span>
        {/* the crowd, two cameras deep in the dark. These are the house's own `.flashbulb` rules,
            which already rest at opacity 0 — so the reduced-motion kill leaves nothing burning. */}
        <span className="flashbulb one" aria-hidden />
        <span className="flashbulb two" aria-hidden />
      </div>

      {/* ---------- the identity row ---------- */}
      <div className="fd-id">
        {/* the mark is handed a CSS length rather than a number, his ruling "same for the logo", so
            mark and wordmark grow with the window together. `plain` drops the 7: this ball is the
            header's and keeps it — see the court ball below for the one that does not. */}
        <Ball size="clamp(34px, calc(var(--fd-u) * 2.6), 68px)" dribble />
        <b className="fd-word">
          Game<em>7</em>
        </b>
        {team ? <span className="fd-div" aria-hidden /> : null}
        {team ? (
          <span className="fd-badge">
            <span
              className="fd-crest"
              aria-hidden
              style={
                { '--crest': kit?.primary ?? 'var(--mine)', '--trim': kit?.accent ?? 'var(--you)', '--crest-ink': kit?.ink ?? '#fff' } as CSSProperties
              }
            >
              {initials}
            </span>
            <span className="fd-club">
              <b>{`${team.city} ${team.name}`}</b>
              {/* `Progress.record` is optional by design — every save written before that ruling has
                  none — so the standing line is built from `currentLevel`, which every save has. */}
              <i>{cur ? `Campaign · level ${cur} of ${ROUNDS}` : `Campaign · all ${ROUNDS} cleared`}</i>
            </span>
          </span>
        ) : null}
        {/* RAFTERS TAKES `credit` AND THE READ PANE'S BANKED DOES NOT — see `banked` above. This is
            the franchise's real banner count across all three ladders; that one is the map's own
            stars against the map's own denominator. */}
        <span className="fd-stat first">
          <i>Rafters</i>
          <b className="gold">{totalStars(progress.campaign) + totalStars(progress.salary) + totalStars(progress.death)} ★</b>
        </span>
        <span className="fd-stat">
          <i>Cleared</i>
          {/* ROUNDS is computed from the campaign config. Never type 150. */}
          <b>
            {clearedCount(progress.campaign)}
            <em>/{ROUNDS}</em>
          </b>
        </span>
        {/* THE MODE IS SPENT HERE (1 of 3): the question the old user-mode front door asked in the
            middle of itself survives as this group's accessible name. It is the same pair of chips
            on both boards; only which one is lit changes, because a player who cannot get from one
            mode to the other is stuck in the one he is in. */}
        <span className="fd-modes" role="group" aria-label="How do you want to see the game?">
          <button className={`fd-mode${user ? ' on' : ''}`} onClick={() => setUserMode(true)} aria-pressed={user}>
            User
          </button>
          <button className={`fd-mode${user ? '' : ' on'}`} onClick={() => setUserMode(false)} aria-pressed={!user}>
            Scout
          </button>
        </span>
        {/* the wrap point on a phone: everything above this runs on line one, everything below it on
            line two. Display:none above 640px, where the row is the single line the design draws. */}
        <span className="fd-idbr" aria-hidden />
      </div>

      {/* ---------- the floor and the read beside it ---------- */}
      <div className="fd-band">
        <div className="fd-panel">
          <span className="fd-glow" aria-hidden />
          {/* THE PASS IS HANDED TO THE STYLESHEET AS NUMBERS, not as pixels: the two ends of the
              throw as the marks' own percentages, how far each man is down the floor (so the ball
              shrinks as it goes away and grows as it comes back), the apex, the spin and how long
              the whole gesture runs. They are set on the court because the ball's layer reads them
              and the court is what both are measured against. */}
          <div
            className="fd-court"
            style={
              {
                '--pfx': parseFloat(zones[pass ? pass.from : sel].x),
                '--pfy': parseFloat(zones[pass ? pass.from : sel].y),
                '--pfd': depthOf(zones[pass ? pass.from : sel]),
                '--ptx': parseFloat(z.x),
                '--pty': parseFloat(z.y),
                '--ptd': depthOf(z),
                '--parc': air.arc,
                '--pspin': air.dir * -320,
                '--pdur': `${air.ms}ms`,
              } as CSSProperties
            }
          >
            {/* THE SIDELINE CLIPS THE LINES AND NOTHING ELSE. The arc is swung off the rim and half
                of it falls below the floor, so it has to be cut; the marks stand OUTSIDE that clip,
                so a plate in a corner can run a little past the sideline onto the panel rather than
                losing its last letters to it — which is what happened the moment his ruling made the
                names bigger and moved two of them into the corners. */}
            <span className="fd-lines" aria-hidden>
              {/* the arc lives in a box cut to the width between the two straights, so the circle
                  ENDS where they begin rather than sweeping on down to the baseline */}
              <span className="fd-arcbox">
                <span className="fd-arc" />
              </span>
              <span className="fd-corner l" />
              <span className="fd-corner r" />
              <span className="fd-key" />
              <span className="fd-ftc" />
              <span className="fd-board" />
              <span className="fd-post" />
            </span>
            {/* ONE GRADIENT FOR ALL SIX, defined once here rather than six times inside six SVGs,
                which would be six copies of the same id in one document. It is in user space — the
                figure's own 0..100 — so a leg and a torso that overlap take the SAME cream at the
                same height and the join between them cannot be seen. DELETING THIS SVG SILENTLY
                BLANKS ALL SIX MEN down to the flat fallback after each url(). */}
            <svg className="fd-figdefs" aria-hidden focusable="false">
              <defs>
                <linearGradient id="fd-fig-ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
                  {/* the stop colours are set in the stylesheet rather than here: a var() inside an
                      SVG presentation attribute is not reliably substituted. */}
                  <stop className="s0" offset="0" />
                  <stop className="s1" offset="0.44" />
                  <stop className="s2" offset="1" />
                </linearGradient>
              </defs>
            </svg>
            {/**
             * THE SIX MARKS. The layer is z-index 3 and takes no pointer of its own, so it can hold
             * the six buttons in one stacking context and still let the ball pass over them: inside
             * it each mark takes z-index off its own y, which is what keeps nearer men painted over
             * farther ones if a mark is ever moved. Put that z-index on the buttons WITHOUT this
             * layer and it orders each mark against its own children only, and the six fall back to
             * DOM order.
             *
             * THE JERSEY STANDS ABOVE THE PLATE — his override #2 — and the plate is centred on
             * (x, y), which is what keeps his ruled positions meaning what they meant.
             */}
            <span className="fd-marks">
              {zones.map((s, i) => (
                <button
                  key={s.pick}
                  className={`fd-mark${i === sel ? ' on' : ''}`}
                  style={
                    {
                      left: s.x,
                      top: s.y,
                      zIndex: Math.round(parseFloat(s.y)),
                      '--dep': depthOf(s),
                      '--face': faces[i],
                      '--face0': prev.current[i],
                      '--i': i,
                      ...(i === sel
                        ? {
                            '--fd-shirt': kit?.primary ?? 'var(--mine)',
                            '--fd-shirt-ink': kit?.ink ?? '#fff',
                            '--fd-hem': kit?.accent ?? 'var(--you)',
                          }
                        : null),
                    } as CSSProperties
                  }
                  onClick={() => press(i)}
                  aria-pressed={i === sel}
                  /* the cup is a drawing and says nothing on its own, so the mark that carries one
                     is named in full and in the order it should be heard — "Campaign, all 150
                     cleared" rather than the cup first and the play after it. Every other mark takes
                     its name from the plate, which is what it always did. */
                  aria-label={s.cup ? `${s.label}, all ${ROUNDS} cleared` : undefined}
                >
                  {/* THE CUP STANDS ABOVE THE JERSEY — his standing ruling: "Add a trophy for EVERY
                      mode at 150 wins(An actual golden trophy at the end)". It used to stand beside
                      the name; on this floor the name is a GOLD PLATE when it is the one you are on,
                      and gold on gold is not a trophy. Above the jersey it keeps the near-black
                      court behind it in both plate states, costs the plate no width (a tight
                      two-cell lockup widened would move the mark itself), and only the three ladders
                      can carry one — all three stand at y >= 36%, and the mark with the least sky
                      above it (the 1v1 bid, y: 16%) can never have one. See `.fd-cup` for the size,
                      which is measured off the floor and not off an inherited font. */}
                  {s.cup ? (
                    <span className="fd-cup" aria-hidden>
                      <Trophy />
                    </span>
                  ) : null}
                  <FrontDoorMan
                    act={pass ? (i === pass.from ? 'throw' : i === sel ? 'catch' : '') : ''}
                    face={faces[i]}
                    spin={prev.current[i] !== faces[i]}
                    jersey={s.jersey}
                    passId={pass?.id}
                  />
                  <span className="fd-plate">
                    <span className="fd-no">{s.no}</span>
                    <span className="fd-label">{s.label}</span>
                  </span>
                </button>
              ))}
            </span>
            <FrontDoorAir pass={pass} />
            <Hoop />
          </div>
        </div>

        {/* ---------- what the read says about the play you are on ---------- */}
        <div className="fd-read">
          <div className="fd-tag">{z.tag}</div>
          <div className="fd-name">{z.label}</div>
          <div className="fd-rule" aria-hidden />
          <p className="fd-desc">{z.desc}</p>
          <div className="fd-meta">
            {z.metaKey ? <span className="fd-metak">{z.metaKey}</span> : null}
            <span className="fd-metav">{z.meta}</span>
          </div>
          <button className="fd-cta" onClick={() => onPick(z.pick)}>
            {z.cta}
          </button>
          {/* THE SIGN-OFF STANDS AT THE FOOT OF THE READ IN SCOUT MODE and across the foot BAND in
              user mode — see below. What moves it is that user mode has no record book to close the
              board with. */}
          {user ? null : (
            <div className="fd-signoff">
              Every number from real 1980—2026 stats.
              <br />
              Run the play. Erase. Run it again.
            </div>
          )}
        </div>
      </div>

      {/* THE MODE IS SPENT HERE (2 of 3): WHAT CLOSES THE BOARD.
          In scout mode the navy band is four doors — Database, Archetypes, Teams and Trophies show
          engine ratings, and user mode has no doors to them by his standing ruling, so user mode
          cannot have this row. In user mode the band is still drawn, because a board that simply
          stops under the read reads as a page cut off rather than as a board that ends; it carries
          the sign-off across it instead, which is the same two sentences on one line.
          The mockup dims the four cells to 40% in user mode and leaves them inert. That draws three
          things that look like doors and are not, which is worse than not drawing them. */}
      <div className="fd-foot">
        {user ? (
          <span className="fd-close">Every number from real 1980—2026 stats. Run the play. Erase. Run it again.</span>
        ) : (
          book.map((b) => (
            <button key={b.pick} className="fd-bookrow" onClick={() => onPick(b.pick)}>
              <b>{b.label}</b>
              {/* the arrow is part of the gold half's own string in the markup, not a pseudo-element */}
              <i>{b.note} →</i>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * ONE MAN ON HIS MARK, and the whole of what he does survives his ruling's move above the plate.
 *
 * FOUR NESTED SPANS BECAUSE AN ELEMENT CARRIES ONE TRANSFORM, and where he stands, how he breathes,
 * how he throws and which way he is turned are four different questions:
 *   · .fd-fig     WHERE. Absolutely placed off the MARK'S OWN CENTRE — bottom: 50% of a button that
 *                 is itself centred on (x, y) — so his feet land one lift above the mark whatever
 *                 height the plate turns out to be. That is what lets the ball's two ends be built
 *                 from the same expression in the stylesheet; a figure hung off the plate's height
 *                 could not be, because a plate's height is content and CSS cannot read it back.
 *   · .fd-p-idle  BREATHING. A slow lean and a rise off the heel, pivoting at the feet, every man on
 *                 his own period and his own phase so six of them never pulse together.
 *   · .fd-p-act   THROWING or CATCHING — the weight. A thrower sinks and coils back, drives through
 *                 and rides forward on the follow-through; a catcher rises to meet the ball, takes
 *                 it, and gives at the knees. This is the layer the runner did not have at all.
 *   · .fd-p-turn  FACING. He is drawn facing right; turned round he is the same drawing mirrored.
 *
 * The act wrapper is the only one keyed on the throw, so remaking it to restart its animation never
 * disturbs the breathing above it — the breath is on a different node and keeps its phase.
 *
 * THE JERSEY NUMERAL SITS OUTSIDE `.fd-p-turn` ON PURPOSE. Everything inside that span is mirrored,
 * which is right for a body and for the arms and WRONG for a glyph: a man facing left would wear a
 * backwards digit. Hung one level up it never mirrors, and it still throws and catches with him.
 */
function FrontDoorMan({
  act,
  face,
  spin,
  jersey,
  passId,
}: {
  act: string
  face: 1 | -1
  spin: boolean
  jersey: string
  passId?: number
}) {
  return (
    <span className={`fd-fig ${act}`} aria-hidden>
      <span className="fd-p-shade" />
      <span className="fd-p-idle">
        <span className="fd-p-act" key={act ? `t${passId}` : 'still'}>
          {/* keyed on the FACE, so a man who turns is a new node and the cut runs from the top */}
          <span className={`fd-p-turn${spin ? ' spin' : ''}`} key={`f${face}`}>
            <FigureSvg />
          </span>
          <span className="fd-jnum">{jersey}</span>
        </span>
      </span>
    </span>
  )
}

/**
 * THE BALL, AND THE ONLY THING ON THIS SCREEN THAT TRAVELS — his ruling: "have them passing the
 * ball ... make the animation good, 3d esque."
 *
 * THREE NESTED SPANS, AND EACH ONE IS ONE OF THE THREE DIMENSIONS:
 *   · .fd-ball-rig   is the ball's GROUND position — where it would be if it never left the floor.
 *                    It slides from the thrower's hands to the catcher's and carries the depth scale
 *                    of the two ends with it, so a ball thrown up the floor shrinks on the way and
 *                    one thrown back down grows.
 *   · .fd-cast       is the SHADOW, and it stays on the ground because it is a child of the rig and
 *                    never lifts. The gap between it and the ball is the only reading of height this
 *                    drawing has, and it is the strongest thing in it.
 *   · .fd-lift       is HEIGHT. It carries the ball up the parabola and scales it up at the same
 *                    time, because a thing nearer the eye is bigger.
 *
 * THE DRAWING CHANGES AND THE PHYSICS DOES NOT. The chalk ring in --ck-orange was chalk on a slate
 * and there is neither; this is the house `Ball` — the same leather the header's mark is drawn in —
 * with its 7 dropped, because at fourteen pixels a numeral is mud and because this ball SPINS,
 * which the mark must never do. The mockup's own ball is a flat 620ms tween with a fixed 54px lift
 * and a fixed shadow whatever the distance; that is the thing he already sent back.
 */
function FrontDoorAir({ pass }: { pass: { from: number; id: number } | null }) {
  return (
    <span className="fd-air" aria-hidden>
      <span key={pass ? pass.id : 'rest'} className={`fd-ball-rig ${pass ? 'go' : ''}`}>
        <span className="fd-cast" />
        <span className="fd-lift">
          <Ball className="fd-ball" size="var(--fd-ball-d)" plain />
        </span>
      </span>
    </span>
  )
}

/**
 * THE RIM ASSEMBLY, copied from the design. Ours was one solid bar; the mockup draws a backboard, a
 * stanchion and a net seen from directly above — twelve strands, four rings fading inward, the rim
 * in two concentric strokes and one highlight arc along its lit side. It is the drawing on the
 * screen he approved, and it is the only place on this floor where the design's geometry wins
 * outright, because ours had none to defend.
 *
 * The 40x40 viewBox is the mockup's; width and height are 100% so the stylesheet's clamp drives the
 * size and the net scales with the floor instead of being 40 pixels on every screen.
 */
function Hoop() {
  return (
    <span className="fd-hoop" aria-hidden>
      <svg viewBox="0 0 40 40" width="100%" height="100%" focusable="false">
        <circle cx="20" cy="20" r="6.6" fill="rgba(6,6,5,0.55)" />
        <g fill="none" stroke="#f4efe4" strokeWidth="0.75" strokeLinecap="round">
          <path d="M20 3.4 C20.5 8.6 20.4 13.4 20 17" />
          <path d="M28.4 5.6 C26.9 10.4 25.3 14.4 23.4 16.4" />
          <path d="M34.4 11.6 C30.6 14.6 27.2 16.6 24.6 17.6" />
          <path d="M36.6 20 C31.4 20.5 26.6 20.4 23 20" />
          <path d="M34.4 28.4 C29.6 26.9 25.6 25.3 23.6 23.4" />
          <path d="M28.4 34.4 C25.4 30.6 23.4 27.2 22.4 24.6" />
          <path d="M20 36.6 C19.5 31.4 19.6 26.6 20 23" />
          <path d="M11.6 34.4 C13.1 29.6 14.7 25.6 16.6 23.6" />
          <path d="M5.6 28.4 C9.4 25.4 12.8 23.4 15.4 22.4" />
          <path d="M3.4 20 C8.6 19.5 13.4 19.6 17 20" />
          <path d="M5.6 11.6 C10.4 13.1 14.4 14.7 16.4 16.6" />
          <path d="M11.6 5.6 C14.6 9.4 16.6 12.8 17.6 15.4" />
        </g>
        <g fill="none" stroke="#f4efe4" strokeLinecap="round">
          <circle cx="20" cy="20" r="15.1" strokeWidth="0.8" opacity="0.95" />
          <circle cx="20" cy="20" r="11.6" strokeWidth="0.75" opacity="0.85" />
          <circle cx="20" cy="20" r="8.6" strokeWidth="0.7" opacity="0.7" />
          <circle cx="20" cy="20" r="6.3" strokeWidth="0.65" opacity="0.55" />
        </g>
        <circle cx="20" cy="20" r="17.6" fill="none" stroke="#8a3d12" strokeWidth="3.6" />
        <circle cx="20" cy="20" r="17.6" fill="none" stroke="#de4a26" strokeWidth="2.4" />
        <path d="M6.6 9.2 A17.6 17.6 0 0 1 24.4 3" fill="none" stroke="rgba(255,196,150,0.9)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/**
 * ONE MAN, DRESSED IN THE KIT. His ruling of 2026-09-08 on the figure that came before this one:
 * "This animation was disrespect."
 *
 * WHY IT IS A SILHOUETTE AND NOT A STICK FIGURE. The man before was five hairlines: a head, the line
 * of a back, and four limbs at two units of stroke, which is a diagram of a person rather than a
 * person. Filling a man in gets MASS — so this one is a filled torso with a shoulder line and a
 * waist, and limbs drawn as strokes eight and six units thick with round ends, which is a capsule
 * and reads as an arm with a thickness rather than a wire.
 *
 * WHERE THE KIT GOES, AND IT IS THREE ELEMENTS AND NOT FOUR. `.fd-kit` is the TORSO AND THE TWO
 * SHOULDER CAPS — the caps read as the sleeve, so they join the shirt — and the head keeps the
 * shared cream gradient, which is the whole reason the torso needed a class of its own: the old
 * `.ck-solid` carried the head as well, and filling it with the kit would have painted his face
 * navy. The arms and legs stay cream against a coloured torso, which is a basketball jersey.
 *
 * THE HEM IS A PATH INSIDE THE TORSO'S OWN GEOMETRY, not a bar laid over it. The torso's foot is the
 * straight run from (14.4, 57.8) to (30.9, 57.8) and its sides at y = 54.5 are x = 14.3 and 30.7, so
 * the band below is inset two units either side and cannot poke out of the silhouette at any size.
 *
 * WHY THREE QUARTER VIEW. Straight on he is a symmetrical paper doll and lies flat on the plan.
 * Turned, one leg leads and one arm is nearer than the other, and a shoulder line that is not square
 * to the eye is the difference between a body in a room and a decal.
 *
 * THE ARMS ARE THE ONLY THINGS THAT ARTICULATE, and each is an outer group carried to the shoulder
 * with an inner group rotating about its own 0,0 — the only way to swing a limb about a joint in
 * CSS, and the translate is a presentation attribute on purpose because a CSS transform on the same
 * element would overwrite it. --amp is how far each arm goes: the near one all the way, the far one
 * a little under three quarters, so the pair never looks like one arm drawn twice. A stride's worth
 * of leg swing is deliberately absent — nobody on this floor is running any more.
 */
function FigureSvg() {
  return (
    <svg viewBox="0 0 44 100" focusable="false">
      <g className="fd-fig-g">
        {/* far arm and far leg first, held back, so the near side of the body covers their joints */}
        <g transform="translate(12.6 26)">
          <g className="fd-arm b" style={{ '--amp': 0.72 } as CSSProperties}>
            <path className="fd-limb up" d="M0 0 L-3.6 14" />
            <path className="fd-limb lo" d="M-3.6 14 L-1.6 26.5" />
          </g>
        </g>
        <g className="fd-far">
          <path className="fd-limb th" d="M18.6 55 L16.8 76" />
          <path className="fd-limb sh" d="M16.8 76 L16 94" />
          <path className="fd-limb ft" d="M16 95 L21.2 97.2" />
        </g>
        {/* the shirt: shoulders wider than the hips, a waist between them, and a round cap on each
            shoulder so the arms have something to hang off */}
        <path
          className="fd-kit"
          d="M11.6 27 C11.4 21.6 14.8 18.4 19.6 17.9 L27.2 17.9 C32.2 18.4 34.4 21.6 34.2 27 L32.6 38 L30.4 49 L30.9 57.8 L14.4 57.8 L14.1 49 L12.6 38 Z"
        />
        <circle className="fd-kit" cx="12.9" cy="26.2" r="5.1" />
        <circle className="fd-kit" cx="32.9" cy="26.2" r="5.3" />
        <rect className="fd-hem" x="16.4" y="53.9" width="12.2" height="2.6" />
        {/* the near leg over the body, so the hip joint disappears into it */}
        <path className="fd-limb th" d="M26 55 L28.4 76" />
        <path className="fd-limb sh" d="M28.4 76 L29.4 94" />
        <path className="fd-limb ft" d="M29.4 95 L35 97.2" />
        {/* head set a little toward the way he is facing — that offset is the three-quarter turn */}
        <path className="fd-limb nk" d="M22.6 15 L23.4 20" />
        <circle className="fd-solid" cx="23.6" cy="10.4" r="7.1" />
        <g transform="translate(32.9 26)">
          <g className="fd-arm f" style={{ '--amp': 1 } as CSSProperties}>
            <path className="fd-limb up" d="M0 0 L3.4 14" />
            <path className="fd-limb lo" d="M3.4 14 L1.8 26.5" />
          </g>
        </g>
      </g>
    </svg>
  )
}
