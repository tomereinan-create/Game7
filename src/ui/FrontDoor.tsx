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
 *   · THE JERSEY NUMERAL 1-6 ON THE CHEST used to be drawn and then hidden under a 460px court,
 *     because on a phone the torso it sat on was nine pixels across and a numeral there was a
 *     smudge. THE TORSO IS THE WHOLE MARK NOW, so the numeral is 14px at 375 and it is shown at
 *     every width. See `.fd-jnum`.
 *   · THE CHALK RUNNER. "Instead of a man running, with the ball, have a player on the field for
 *     each mode, and have them passing the ball. But please, make the animation good, 3d esque.
 *     This animation was disrespect." He is deleted and so are the six men who replaced him; see
 *     the tombstone on `Jersey` below for what those six did and on whose ruling it went.
 *
 * ==========================================================================================
 * TOMBSTONE — THE SIX MEN, 2026-09-08 to 2026-09-10.
 *
 * HIS RULING, verbatim: "I want no players only jerseys, and the jerseys to have this orange
 * collor(unless the user picked otherwise). I want the numbers to have the same color as well(as
 * the jerseys)."
 *
 * IT REVERSES A DECISION HE TOOK THAT SAME MORNING — keep the man, dress him — and he took it
 * knowingly, having seen the man on the floor. So the man goes, not the drawing of him softened.
 *
 * WHAT STOOD HERE AND IS GONE: a filled three-quarter figure — head, neck, near and far arms each
 * an outer group carried to the shoulder with an inner group rotating about its own joint, near
 * and far legs in thigh/shin/foot strokes, feet, and a torso in the kit with two shoulder caps and
 * a hem inside its own geometry. With the arms went everything the arms did: THE THROW (a coil, a
 * drive and a follow-through), THE CATCH (a rise to meet the ball and a give at the knees), THE
 * TURN — six men facing whoever had the ball, mirrored with a squash-and-cut so nobody swept
 * through a vertical line — and THE IDLE BREATH, six phases so they never pulsed together. With
 * the turn went `faceX`/`faceOf` and the hold-facing state; with the throw went the hand-height
 * rig, the arc and the wind-up. Everything above is in the file's history at c11b844.
 *
 * WHAT REPLACES IT is the mockup's own mark: a shirt and nothing else, standing on its plate.
 * ==========================================================================================
 */

/* The court's own aspect-ratio, off `.fd-court` in the stylesheet. Only the ARC and the FLIGHT
   TIME read it, to turn a drop down the floor into the same unit as a step across it; every
   position is placed in the court's own units and needs no ratio at all. */
const COURT_RATIO = 20 / 29
const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * WCAG RELATIVE LUMINANCE AND THE RATIO BETWEEN TWO HEXES. Six lines, and they are here rather
 * than imported because teamColors keeps its own copy private and this screen has exactly one
 * question for it — see `litTag` below, where a picked kit that is itself near-black has to be
 * caught before it is printed on a near-black tag. Both arguments are always #rrggbb: one is a
 * literal in this file and the other is `Kit.primary`, which the colour input writes in that form.
 */
const relLum = (hex: string) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a: string, b: string) => (Math.max(relLum(a), relLum(b)) + 0.05) / (Math.min(relLum(a), relLum(b)) + 0.05)

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
 *
 * `side` IS BACK TO ITS ORIGINAL JOB and it is the only thing on this screen that still reads it.
 * It was the step off the mark until his ruling put the jersey above the plate, and then it was the
 * tiebreak that told two men who share x: 50% which shoulder to look over. There is nobody left to
 * look: the turn died with the arms. What it does now is say WHICH SIDE OF THE SHIRT THE BALL RESTS
 * ON — the mockup parks the ball beside the selected mark, and these six signs already point INWARD
 * at every mark on an edge (custom at 8.5% takes +1, vs friend at 91.5% takes -1), which is what
 * keeps the ball on the floor instead of off the side of it.
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
   * THE BALL, AND IT IS CARRIED NOW RATHER THAN THROWN — the second half of his ruling of
   * 2026-09-10. There is nobody left on this floor to throw it: a shirt has no arms. But the ball
   * KEEPS ITS PLACE and keeps its journey — the mockup draws it beside the selected mark, and it
   * still has to get there when you press a play, or the mark you pressed and the ball would say
   * two different things.
   *
   * WHAT THE MOTION IS NOW, and it is the simplest honest reading of a floor with no hands on it:
   * THE BALL ROLLS. It travels along the ground from the mark you left to the mark you pressed —
   * a straight line on the floor, no arc, no hang, no lift — turning as it goes at the rate its own
   * circumference says it should, and slowing into the arrival the way a rolled ball loses speed to
   * friction. The mockup's own is a flat 620ms tween of left and top with a fixed 54px hop; a roll
   * is that same flat travel with the one thing the drawing can honestly claim added back, which is
   * that a ball crossing a floor is turning. See `.fd-roll` and `fd-spin` in the stylesheet, which
   * share one easing curve on purpose: seams that turn faster or slower than the ground goes by are
   * a ball skidding, and nothing here is skidding.
   *
   * The board remembers two things: WHO has it (that is `sel`, the pressed play, so the ball always
   * rests beside the mode the read is describing) and, while it is travelling, where it set off
   * from. That second one is `pass`, cleared the moment it arrives so the ball is simply at rest
   * beside the new mark with nothing animating.
   *
   * `id` counts the trips. It is the React key on the ball, which is how a CSS animation is made to
   * run again from the top: press a fourth mark while the third roll is still running and the key
   * changes, the node is remade, and the new roll starts clean.
   */
  const [pass, setPass] = useState<{ from: number; id: number } | null>(null)
  const passId = useRef(1)
  function press(i: number) {
    /* pressing the mark you are already on does nothing. THE MARK PRESS SELECTS AND READS; THE CTA
       IS THE ONLY THING THAT ENTERS A MODE. That two-step is the whole interaction model, and both
       boards agree on it. */
    if (i === sel) return
    setPass({ from: sel, id: passId.current++ })
    setSel(i)
  }

  /* The roll, in numbers the stylesheet does the rest of the arithmetic on. Distance is measured in
     ONE unit — a step across the floor — so a drop down it is converted by the court's ratio.
     THE ARC AND THE WIND-UP ARE GONE with the arms that made them: an arc is what a thrown ball
     does and a wind-up is a thrower's anticipation, so the clock loses the fifth of itself that was
     the coil and the ball simply sets off. What is left is a distance, a time and a turn. */
  const roll = (() => {
    const a = zones[pass ? pass.from : sel]
    const b = zones[sel]
    const dx = parseFloat(b.x) - parseFloat(a.x)
    const dy = (parseFloat(b.y) - parseFloat(a.y)) * COURT_RATIO
    const dist = Math.hypot(dx, dy)
    /* Held between 430ms and 660: the shortest trip still reads as a journey and the longest never
       becomes something you wait for. */
    const ms = Math.round(clamp(430, 300 + dist * 3.2, 660))
    /* HOW FAR IT TURNS IS NOT A TASTE, IT IS THE ARITHMETIC OF A ROLL. The ball is --fd-ball-d
       across, which is 3.2% of the floor's width, so one full turn carries it pi * 3.2 = 10.05% of
       the way across, and the trip is worth as many of those as it is long. Rolling to the right
       turns clockwise, which is the sign.
       IT IS ROUNDED TO THE WHOLE TURN, and that is not a fudge of the arithmetic — it is what makes
       the arithmetic survive the end of the animation. When the trip is over the ball's node is
       remade at rest with no transform on it, so a spin that finished on 269 degrees would SNAP
       back to nought on the frame after it landed. On a whole turn the two are the same picture and
       there is nothing to snap. The price is at most half a turn spread over four to six of them,
       which is under eight per cent of the rate; the alternative is a visible jolt on every press.
       Never less than one turn: the shortest trip on this floor is worth three and a half. */
    const turns = Math.max(1, Math.round(dist / (Math.PI * 3.2)))
    return { ms, spin: turns * 360 * (dx >= 0 ? 1 : -1) }
  })()

  /* The trip is over when the ball arrives, and then `pass` is cleared. Nothing needs a hand-off:
     the resting rule under the animation states the same transform its last keyframe does, so the
     ball does not move on the frame the animation comes off. The sixty milliseconds are slack
     against timer jitter, not a pause. Press again before that and this timer is thrown away and a
     fresh one starts, which is what the cleanup is for. */
  useEffect(() => {
    if (!pass) return
    const t = window.setTimeout(() => setPass(null), roll.ms + 60)
    return () => window.clearTimeout(t)
  }, [pass, roll.ms])

  /**
   * THE KIT ALL SIX JERSEYS WEAR — his ruling of 2026-09-10: "the jerseys to have this orange
   * collor(unless the user picked otherwise)". "Otherwise" is the club he named, and that wiring
   * was already here: `myColor` → `kitColor` returns the triple these three variables want
   * ({primary, accent, ink}), with `ink` flipped to near-black on a primary bright enough that
   * cream would vanish on it. Two things changed under this ruling and no more:
   *   1. THE FALLBACK IS THE ORANGE, not the house navy. It is set on `.fd` in the stylesheet.
   *   2. IT DRESSES ALL SIX, not the pressed one. It used to be an inline override on the selected
   *      mark alone, five smoke-grey shirts around one coloured one, because that is how the mockup
   *      says "this is the one you are on". His ruling wants every jersey the one colour, so the
   *      three variables are set ONCE on the marks layer and the five bare shirts are gone.
   *      SELECTION IS STILL SAID, by the plate: the mark you are on lights gold with a gold ring and
   *      a halo, and the ball rests beside it. Nothing lost its only signal.
   *
   * The campaign is asked first and the other two ladders after it, because a player who named a
   * team in the salary cap and never opened the campaign still has a club.
   */
  const kit = myColor(progress.campaign.team) ?? myColor(progress.salary.team) ?? myColor(progress.death.team)
  /**
   * THE 01-06 TAG ON THE PLATE YOU ARE ON — his ruling: "I want the numbers to have the same color
   * as well(as the jerseys)". Everywhere else the tag simply IS A LITTLE JERSEY: the shirt's colour
   * behind the shirt's own ink, so a tag and the shirt standing over it are the same two colours.
   * The lit plate is the one place that can fail, because it is GOLD, and there are two ways to put
   * a tag on it. Both were measured on all twelve pickable kits and on the default orange:
   *
   *   A · THE LITTLE JERSEY, unchanged: a block of the shirt's colour laid on the gold. The NUMBER
   *       is the shirt's own ink on the shirt's own colour, which `kitColor` already guarantees
   *       reads — 5.2:1 at the worst kit. What can fail is the BLOCK'S OWN EDGE against the plate.
   *   B · INVERTED: the near-black block the lit tag already had (9.3:1 on the gold, so the tag
   *       always keeps its shape) with the SHIRT'S COLOUR printed on it. The tag still says the
   *       shirt. What can fail here is the NUMBER, because half the pickable kits are near-black by
   *       design and a near-black numeral on a near-black block is not a numeral.
   *
   * THE RULE IS: TAKE B ONLY WHEN A'S EDGE FAILS AND B'S NUMBER DOES NOT. A number you cannot read
   * is worse than a block whose edge is soft, so legibility is the first clause and the edge is the
   * second. 3:1 is the bar for a boundary that is not text, 4.5:1 for one that is.
   *
   * WHAT IT DECIDES, measured:
   *   · the default ORANGE — the case his ruling is about — is 1.70:1 on the gold, no edge at all,
   *     and 5.81:1 on the near-black. It INVERTS.
   *   · the Orange kit (1.85 / 5.31) and the Gold kit (1.29 / 7.65) invert for the same reason.
   *   · Forest, Crimson and Teal are mid-tones that fail A's edge narrowly (2.92 / 2.96 / 2.79) and
   *     would only reach 3.3-3.5 inverted, so they KEEP A: the number stays at 5.2-5.6 and the soft
   *     edge is accepted, because it is a boundary between two blocks and not a word.
   *   · the other seven kits pass A's edge outright (5.1 to 9.6) and never come here.
   */
  const shirtNow = kit?.primary ?? '#de7326'
  const litFlip = contrast(shirtNow, '#f0b323') < 3 && contrast(shirtNow, '#16130f') >= 4.5
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
          {/* THE ROLL IS HANDED TO THE STYLESHEET AS NUMBERS, not as pixels: the two ends of the
              trip as the marks' own percentages, which shoulder of each mark the ball sits on, how
              far each of them is down the floor (so the ball shrinks as it goes away and grows as
              it comes back), how far it turns and how long it takes. They are set on the court
              because the ball's layer reads them and the court is what both are measured against.
              --parc IS GONE with the arms: an arc is what a THROWN ball does. */}
          <div
            className="fd-court"
            style={
              {
                '--pfx': parseFloat(zones[pass ? pass.from : sel].x),
                '--pfy': parseFloat(zones[pass ? pass.from : sel].y),
                '--pfd': depthOf(zones[pass ? pass.from : sel]),
                '--pfs': zones[pass ? pass.from : sel].side,
                '--ptx': parseFloat(z.x),
                '--pty': parseFloat(z.y),
                '--ptd': depthOf(z),
                '--pts': z.side,
                '--pspin': roll.spin,
                '--pdur': `${roll.ms}ms`,
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
            {/* TOMBSTONE. A LINEAR GRADIENT IN THE FIGURE'S OWN USER SPACE stood here, defined once
                for all six rather than six times inside six SVGs. It was the cream a head, a neck,
                four limbs and two feet were all painted in, at the same value at the same height, so
                the joins between loose strokes could not be seen. There is no cream left on this
                floor: his ruling of 2026-09-10 took the body away and the shirt it dressed is a
                flat fill. It went with `.fd-figdefs`, `.fd-fig-g` and `FigureSvg`. */}
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
             *
             * THE KIT IS SET ONCE, HERE, AND DRESSES ALL SIX. It used to be an inline override on
             * the selected mark alone; his ruling of 2026-09-10 wants every jersey the one colour,
             * so it is hung on the layer that contains every shirt, every shirt numeral and every
             * 01-06 tag, and nothing outside this layer reads it. With no club named the three
             * variables are simply not written and the stylesheet's own values stand, which is the
             * orange his ruling made the default.
             */}
            <span
              className={`fd-marks${litFlip ? ' litflip' : ''}`}
              style={
                (kit
                  ? { '--fd-shirt': kit.primary, '--fd-shirt-ink': kit.ink, '--fd-hem': kit.accent }
                  : undefined) as CSSProperties | undefined
              }
            >
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
                  <Jersey no={s.jersey} />
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
 * ONE JERSEY ON ITS MARK — his ruling of 2026-09-10, verbatim: "I want no players only jerseys, and
 * the jerseys to have this orange collor(unless the user picked otherwise). I want the numbers to
 * have the same color as well(as the jerseys)."
 *
 * FOUR FLAT SPANS AND NOT ONE NESTED TRANSFORM, WHICH IS THE WHOLE OF WHAT CHANGED. The man who
 * stood here needed four wrappers because where he stood, how he breathed, how he threw and which
 * way he was turned are four different questions and an element carries one transform. A shirt on a
 * hook asks one question — where — so the wrappers went with the answers:
 *   · .fd-p-idle  BREATHING. Gone. A shirt does not breathe; without shoulders under it the lean
 *                 read as a flag, not a body.
 *   · .fd-p-act   THROWING and CATCHING. Gone with the arms that did them.
 *   · .fd-p-turn  FACING. Gone with the eyes. There is nothing in a front-on shirt to mirror, so
 *                 the squash-and-cut that kept a turning man from sweeping through a vertical line
 *                 has nothing left to protect, and `--face`/`--face0` are not written any more.
 *
 * WHAT SURVIVES, and it is what the mockup draws:
 *   · .fd-fig       WHERE. Absolutely placed off the MARK'S OWN CENTRE — bottom: 50% of a button
 *                   that is itself centred on (x, y) — so the shirt's foot lands one lift above the
 *                   mark whatever height the plate turns out to be. That is what lets the ball's
 *                   two ends be built from the same expression in the stylesheet; a figure hung off
 *                   the plate's height could not be, because a plate's height is content and CSS
 *                   cannot read it back. It also carries --dep, the floor's recession.
 *   · .fd-p-shade   the contact smudge on the floor under it.
 *   · .fd-kit       THE SHIRT. One span and a clip-path — the mockup's own polygon, shoulders with
 *                   a neck notch, sleeves flaring out and a straight body — filled with --fd-shirt.
 *   · .fd-jnum      THE NUMERAL, in --fd-shirt-ink, which his ruling keeps DARK on the orange so it
 *                   can still be read. It never had to be counter-mirrored out of a turn again.
 *   · .fd-hem       the trim band across the foot of the shirt.
 */
function Jersey({ no }: { no: string }) {
  return (
    <span className="fd-fig" aria-hidden>
      <span className="fd-p-shade" />
      <span className="fd-kit" />
      <span className="fd-jnum">{no}</span>
      <span className="fd-hem" />
    </span>
  )
}

/**
 * THE BALL, AND THE ONLY THING ON THIS SCREEN THAT MOVES AT ALL — his standing ruling put it in the
 * play ("have them passing the ball"), and his ruling of 2026-09-10 took the hands off the floor
 * without taking the ball off it. It rests beside the mark you are on and rolls to the next one.
 *
 * TWO SPANS NOW, AND THE THIRD IS A TOMBSTONE:
 *   · .fd-ball-rig   is the ball's position on the floor. It slides from the mark you left to the
 *                    mark you pressed and carries the depth scale of the two ends with it, so a ball
 *                    that rolls up the floor shrinks on the way and one that comes back down grows.
 *   · .fd-cast       is the SHADOW. It is a child of the rig, so it goes where the ball goes, and it
 *                    stays tucked under it because the ball never leaves the floor now.
 *   · .fd-lift       IS DELETED. It was HEIGHT — it carried the ball up a parabola and scaled it up
 *                    toward the apex, and the widening gap between it and its shadow was the whole
 *                    reading of depth on a plan that has no eye level. It went with the arms: a lob
 *                    needs somebody to lob it. Its hand-height rig (--p-fh / --p-th, the ball
 *                    leaving a near man's hand further up the screen than a far man's) went with it.
 *
 * THE DRAWING IS UNCHANGED. This is the house `Ball` — the same leather the header's mark is drawn
 * in — with its 7 dropped, because at fourteen pixels a numeral is mud and because this ball TURNS,
 * which the mark must never do. The 7 is also what makes the turn honest rather than decorative:
 * with nothing written on it there is nothing that has to stay upright, so the seams can say the
 * thing is rolling.
 */
function FrontDoorAir({ pass }: { pass: { from: number; id: number } | null }) {
  return (
    <span className="fd-air" aria-hidden>
      <span key={pass ? pass.id : 'rest'} className={`fd-ball-rig ${pass ? 'go' : ''}`}>
        <span className="fd-cast" />
        <Ball className="fd-ball" size="var(--fd-ball-d)" plain />
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

