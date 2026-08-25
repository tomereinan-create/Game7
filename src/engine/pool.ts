import RAW from '../data/players_stats.json'
import STATS from '../data/stats.json'
import { eligible, type Pos } from './positions'
import type { Player } from './types'

/**
 * The pool: data/build_ratings.py output, loaded verbatim. `name` is the game's
 * identity, so the handful of real same-name players (two Eddie Johnsons, …)
 * get their peak year appended — the only edit made to the data, and it never
 * touches a rating.
 */
/**
 * The pool: data/build_ratings.py output, loaded verbatim. One entry per
 * player-SEASON ("LeBron James '13"); the pipeline guarantees unique names.
 */
export const PLAYERS: Player[] = RAW as Player[]

/**
 * Short readable archetype, derived purely from the ratings.
 *
 * Ordered most specific first. Every rule that names a strength requires that
 * strength to be good in absolute terms, never merely better than the same
 * player's other numbers — otherwise a 62-inside, 18-outside centre reads as a
 * "post scorer" because he is even worse from range, and a guard with 60
 * perimeter D reads as a stopper because his rim protection is worse still.
 */
/**
 * Tag thresholds are relaxed by RELAX points before matching: every "at least"
 * floor drops by RELAX and every "under" ceiling rises by it. The audit's
 * relaxation pass sweeps this in steps of 3 until the BALANCED fallback holds
 * under 12% of the pool, with the rule ORDER untouched and the canonical
 * player checks still passing. Set by `npm run tags -- --sweep`.
 */
export const RELAX = 0

/**
 * THE TREE, as data. Each rule is a tag and a test; the list is walked in order and the first match
 * wins — exactly the if-chain this replaces. The order used to BE the source code, which meant only
 * an edit could change it; now it is a list, so it can be ranked in the app and reset to this default.
 * The default order shipped here is the ratified law.
 */
/**
 * THE NUMERIC LAW (recal_22 #5). Every condition in the tree is a number against a threshold. Two
 * pieces of vocabulary that used to be words are defined here, in numbers, and nowhere else:
 *
 *   BIG — a SHAPE, read from the sheet, not the card's `big` flag:
 *         (rimprot >= 55 AND 3pt < 45) OR (rim >= 60 AND 3pt < 40) OR rimprot >= 80
 *   HEIGHT CLASSES — guard <= 76, wing 77-80, big >= 81 inches.
 *
 * The flag stays where it belongs (compute_ovr, for d_score weights and the OVR cap, where a lifetime
 * guard is excluded by position). The tree judges the sheet in front of it.
 */
export const GUARD_HT = 76
export const WING_HT = 77
export const BIG_HT = 81
export const isBigShape = (a: Player['attrs']) =>
  (a.rimprot >= 55 && a['3pt'] < 45) || (a.rim >= 60 && a['3pt'] < 40) || a.rimprot >= 80

export interface Rule {
  tag: string
  test: (c: Ctx) => boolean
}
/** Everything a rule may read: the sheet, the derived zones, and the relaxation-aware comparators. */
export interface Ctx {
  p: Player
  a: Player['attrs']
  paint: number
  mid: number
  three: number
  zone: number
  /** The numeric BIG SHAPE above — never the card's flag. */
  big: boolean
  h: number
  /** at least: the floor drops by `relax`. */
  ge: (v: number, t: number) => boolean
  /** under: the ceiling rises by `relax`. */
  lt: (v: number, t: number) => boolean
  /** height comparators — never relaxed, because height is inches, not a 0-99 rating. */
  geH: (v: number, t: number) => boolean
  ltH: (v: number, t: number) => boolean
  solid: number
  /**
   * The positions Basketball-Reference ever listed for this man — the SAME list the draft slots him
   * with, so the labeler and the floor cannot disagree about what he is. Not a rating: the numeric law
   * governs everything else, and this is the one fact that is a fact.
   */
  pos: Pos[]
}

export const RULES: Rule[] = [
  // Tree v2, 43 rules. Evaluated top-down, FIRST MATCH WINS. Names describe style,
  // never tier — quality is OVR's job. Thresholds are tunable; the order is law.
  { tag: 'Defensive playmaker', test: (c) => c.ge(c.a.playvol, 80) && c.ge(c.a.perdef, 80) && c.lt(c.zone, 55) },
  { tag: 'Point god', test: (c) => c.ge(c.a.playvol, 97) && c.lt(c.a.volume, 83) && !c.big && c.ltH(c.h, 79) },
  { tag: 'Offensive engine', test: (c) => c.ge(c.a.playvol, 85) && c.ge(c.a.volume, 90) },
  { tag: 'Triple-double threat', test: (c) => c.ge(c.a.playvol, 85) && c.ge(c.a.drb, 80) && c.ge(c.a.volume, 88) },
  { tag: 'Point forward', test: (c) => c.geH(c.h, 79) && c.ltH(c.h, 83) && c.ge(c.a.playvol, 70) && c.lt(c.a.volume, 92) && !c.big },
  { tag: 'Floor general', test: (c) => c.ge(c.a.playvol, 88) && c.lt(c.a.volume, 88) },
  { tag: 'Floor raiser', test: (c) => c.ge(c.a.playvol, 90) && c.lt(c.a.efficiency, 45) && c.ge(c.a.volume, 85) },
  { tag: 'Two-way anchor', test: (c) => c.big && c.ge(c.a.rimprot, 90) && c.ge(c.p.o_ovr, 78) },
  { tag: 'Unicorn', test: (c) => c.big && c.ge(c.three, 50) && c.ge(c.a.rimprot, 85) && c.geH(c.h, 86) && c.p.ovr >= 70 },
  { tag: 'Two-way star', test: (c) => c.ge(c.p.o_ovr, 85) && c.ge(c.p.d_ovr, 85) },
  // the tier below the two-way star: good at BOTH ends without being elite at either. Placed here so
  // the three two-way claims read in order — 85/85 star, 80/80 all-around star, 78/85 wing.
  { tag: 'All-around star', test: (c) => c.ge(c.p.o_ovr, 80) && c.ge(c.p.d_ovr, 80) },
  { tag: 'Two-way wing', test: (c) => !c.big && c.ge(c.p.o_ovr, 78) && c.ge(c.p.d_ovr, 85) },
  // THE ONE-END TIERS. Every claim about a man being good at both ends has been made by now, so these
  // two catch the men who are only good at one — and they sit above the diet tags because "elite
  // defender" says more about a 90-defence card than "enforcer" does.
  { tag: 'Offensive superstar', test: (c) => c.ge(c.p.o_ovr, 85) && c.lt(c.p.d_ovr, 70) },
  { tag: 'Elite defender', test: (c) => c.ge(c.p.d_ovr, 90) && c.lt(c.p.o_ovr, 70) },
  { tag: 'Three-level scorer', test: (c) => c.ge(c.a.volume, 80) && c.ge(c.a.efficiency, 75) && c.ge(c.paint, 65) && c.ge(c.mid, 65) && c.ge(c.three, 55) },
  { tag: 'Midrange maestro', test: (c) => c.ge(c.mid, 85) && c.lt(c.three, 40) && c.ge(c.a.volume, 90) },
  { tag: 'Slasher', test: (c) => !c.big && c.ge(c.paint, 80) && c.ge(c.a.fouldraw, 85) && c.lt(c.three, 45) },
  { tag: 'Paint beast', test: (c) => c.ge(c.paint, 90) && c.ge(c.a.volume, 90) && c.lt(c.three, 25) && c.geH(c.h, 81) },
  { tag: 'Freight train', test: (c) => c.ge(c.paint, 90) && c.ge(c.a.volume, 90) && c.lt(c.three, 40) && c.lt(c.mid, 60) },
  { tag: 'Tank', test: (c) => c.big && c.ge(c.paint, 80) && c.ge(c.a.fouldraw, 80) && c.lt(c.a.ft, 60) },
  { tag: 'Foul merchant', test: (c) => c.ge(c.a.fouldraw, 90) && c.ge(c.a.ft, 85) },
  { tag: 'Spark plug', test: (c) => c.ltH(c.h, 75) && c.ge(c.a.volume, 80) && c.p.o_ovr < 85 },
  { tag: 'Flamethrower', test: (c) => c.ge(c.three, 90) && c.ge(c.a.volume, 70) },
  { tag: 'Sniper', test: (c) => c.ge(c.three, 90) && c.lt(c.a.volume, 40) },
  { tag: 'Deadeye', test: (c) => c.ge(c.a.ft, 80) && c.ge(c.three, 80) && c.lt(c.a.volume, 50) && c.lt(c.p.o_ovr, 80) && c.lt(c.p.d_ovr, 70) },
  { tag: 'Catch-and-shoot wing', test: (c) => c.ge(c.three, 80) && c.lt(c.a.playvol, 40) && c.lt(c.a.volume, 55) && c.geH(c.h, 77) && c.ltH(c.h, 83) },
  { tag: 'Stretch big', test: (c) => c.big && c.ge(c.three, 70) && c.geH(c.h, 82) },
  // the complete seven-footer: he scores at the rim, has a jumper, and cleans the defensive glass.
  // Placed with the big diets and ABOVE the rebounding and energy claims, so a big who does all three
  // is named for that rather than for the one of them a later rule notices first.
  { tag: 'All-around big', test: (c) => c.ge(c.paint, 70) && c.ge(c.mid, 60) && c.ge(c.a.drb, 70) && c.geH(c.h, 83) },
  { tag: 'Glass cleaner', test: (c) => c.ge(c.a.orb, 90) && c.ge(c.a.drb, 90) },
  { tag: 'Energy big', test: (c) => c.big && c.ge(c.a.orb, 85) && c.lt(c.a.volume, 40) },
  { tag: 'Enforcer', test: (c) => c.big && c.ge(c.a.rimprot, 70) && c.lt(c.a.discipline, 35) },
  { tag: 'Anchor', test: (c) => c.ge(c.a.rimprot, 90) },
  // ELITE ROLE PLAYER is a TIER name, not a style — the one exception to the law above, added on
  // Tomer's explicit repeated order. It sits above Stopper because a shooter who defends is not a
  // stopper who happens to shoot, and Stopper now says so itself with a 3pt ceiling.
  { tag: 'Elite role player', test: (c) => c.lt(c.a.volume, 60) && c.lt(c.a.playvol, 60) && c.ge(c.three, 50) && c.p.o_ovr > 60 && c.p.d_ovr > 75 },
  // 3&D catches the rest of the shape: the shooting and the defending, without the passing or the
  // offensive standard that make an ELITE role player.
  { tag: '3&D', test: (c) => c.ge(c.three, 75) && c.ge(c.a.perdef, 70) && c.lt(c.a.volume, 60) },
  // guards several spots without being a one-end specialist — neither number is allowed to be elite
  { tag: 'Versatile defender', test: (c) => c.ge(Math.min(c.a.perdef, c.a.rimprot), 68) && c.p.d_ovr >= 78 && c.p.o_ovr < 80 },
  { tag: 'Stopper', test: (c) => c.ge(c.a.perdef, 90) && c.lt(c.a.volume, 60) && c.lt(c.p.o_ovr, 70) && c.lt(c.three, 60) },
  { tag: 'Pest', test: (c) => c.ltH(c.h, 76) && c.ge(c.a.perimdisrupt, 90) },
  // the guard who does some of both and neither at a lead handler's rate. Height is a physical fact and
  // never relaxes, so geH/ltH; the two windows are ordinary floors and ceilings.
  { tag: 'Combo guard', test: (c) => c.geH(c.h, 72) && c.ltH(c.h, 77) && c.ge(c.a.playvol, 50) && c.lt(c.a.playvol, 75) && c.ge(c.a.volume, 60) && c.lt(c.a.volume, 85) },
  { tag: 'Throwback', test: (c) => c.ge(c.mid, 75) && c.lt(c.three, 20) },
  { tag: 'Post scorer', test: (c) => c.ge(c.paint, 70) && c.ge(c.mid, 65) && c.lt(c.three, 40) && c.lt(c.a.playvol, 60) && (c.pos.includes('PF') || c.pos.includes('C')) },
  // r29's two tags, defined on this side because the round never arrived. Both sit LATE, under every
  // specific diet: a Paint beast, a Flamethrower or a Foul merchant is a better answer than "he scores",
  // so the generic pair only catches the men no diet described. Machine first — it is the stronger claim.
  { tag: 'Scoring machine', test: (c) => c.ge(c.a.volume, 90) && c.ge(c.zone, 88) && c.ge(c.a.efficiency, 50) && c.ge(c.a.volume - c.a.playvol, 20) },
  // the machine's inefficient twin: he takes everything and does not convert. Placed directly under it,
  // so a man with an elite zone AND a scoring gap is still named for the diet first. ">90" is ge(91).
  { tag: 'Volume shooter', test: (c) => c.lt(c.a.efficiency, 75) && c.ge(c.a.volume, 91) },
  { tag: 'Scorer', test: (c) => c.ge(c.a.volume, 75) && c.ge(c.zone, 75) && c.lt(c.a.playvol, 45) && c.ltH(c.h, 81) },
  { tag: 'All-around', test: (c) => c.lt(Math.max(c.zone, c.a.playvol, c.a.perdef, c.a.rimprot, c.a.orb, c.a.drb), 88) && c.solid >= 4 },
]

/** The shipped order — the ratified law, and what "reset" returns to. */
export const DEFAULT_ORDER: string[] = RULES.map((r) => r.tag)

/**
 * A rule as the arithmetic it actually is: `ge(x, 80)` reads `x >= 80`. Derived from the rule
 * function itself, so it can never drift from what the labeler runs.
 *
 * Two things this has to survive. A comparator may WRAP a call — ge(Math.min(perdef, rimprot), 68) —
 * so the arguments split on the top-level comma, not the first one; and a production build RENAMES
 * the parameter, so its real name is read from the source rather than assumed.
 */
const OPS: Record<string, string> = { ge: '>=', lt: '<', geH: '>=', ltH: '<' }
export function ruleText(tag: string): string {
  const rule = BY_TAG.get(tag)
  if (!rule) return tag === 'Balanced' ? 'no rule above matched — the fallback' : ''
  const src = rule.test.toString()
  const param = /^\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/.exec(src)?.[1] ?? 'c'
  const q = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let s = src
    .replace(/^\(?\s*[A-Za-z_$][\w$]*\s*\)?\s*=>\s*/, '')
    .replace(new RegExp(`${q}\\.a\\['3pt'\\]`, 'g'), '3pt')
    .replace(new RegExp(`${q}\\.a\\.`, 'g'), '')
    .replace(new RegExp(`${q}\\.p\\.`, 'g'), '')
    .replace(new RegExp(`${q}\\.`, 'g'), '')
    .replace(/Math\./g, '')
  for (;;) {
    const m = /\b(geH|ltH|ge|lt)\(/.exec(s)
    if (!m) return tidy(s)
    const open = m.index + m[0].length - 1
    let depth = 0
    let comma = -1
    let close = -1
    for (let i = open; i < s.length; i++) {
      if (s[i] === '(') depth++
      else if (s[i] === ')') {
        depth--
        if (depth === 0) {
          close = i
          break
        }
      } else if (s[i] === ',' && depth === 1 && comma < 0) comma = i
    }
    if (close < 0 || comma < 0) return tidy(s)
    s = `${s.slice(0, m.index)}${s.slice(open + 1, comma).trim()} ${OPS[m[1]]} ${s.slice(comma + 1, close).trim()}${s.slice(close + 1)}`
  }
}
/**
 * A production build strips the spaces around operators, so the printed rule puts them back. The
 * two-character ones go first, or `>=` would be split by the bare `>` pass.
 */
const tidy = (s: string) =>
  s
    .replace(/\s*(&&|\|\||>=|<=|===|!==)\s*/g, ' $1 ')
    .replace(/\s*([<>])\s*(?![=\s])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
/** The numeric definition every `big` in the tree stands for. */
export const BIG_RULE = '(rimprot >= 55 AND 3pt < 45) OR (rim >= 60 AND 3pt < 40) OR rimprot >= 80'
const BY_TAG = new Map(RULES.map((r) => [r.tag, r]))
/** Every tag the tree can return, the fallback included. */
export const ALL_TAGS: string[] = [...DEFAULT_ORDER, 'Balanced', 'Unclassified']

const ORDER_KEY = 'game7.tagorder.v1'
/** The order the tree is being READ at right now — a draft while the ranking screen is open. */
let order: string[] = DEFAULT_ORDER
/** The order that is WRITTEN DOWN. A draft is only law once it is saved. */
let saved: string[] = DEFAULT_ORDER
/** A stored ranking has to be a list of unique tag names. Whether they are the CURRENT tags is not its
 *  problem — see reconcile. */
const sane = (o: unknown): o is string[] =>
  Array.isArray(o) && o.every((t) => typeof t === 'string') && new Set(o).size === o.length
/**
 * A SAVED RANKING SURVIVES THE TREE CHANGING (his ruling: "I want those to save").
 *
 * The old check honoured a stored order only if it named exactly the tags of the build reading it, so
 * every round that added, deleted or renamed a rule silently threw his ranking away. This keeps what
 * he decided and repairs the rest: tags he ranked that still exist hold their relative order, tags
 * that no longer exist drop out, and a tag he has never seen is inserted where the shipped law puts
 * it — immediately before the first tag that follows it in DEFAULT_ORDER.
 */
const reconcile = (stored: string[]): string[] => {
  const out = stored.filter((t) => BY_TAG.has(t))
  for (const t of DEFAULT_ORDER) {
    if (out.includes(t)) continue
    let at = out.length
    for (let i = DEFAULT_ORDER.indexOf(t) + 1; i < DEFAULT_ORDER.length; i++) {
      const j = out.indexOf(DEFAULT_ORDER[i])
      if (j !== -1) {
        at = j
        break
      }
    }
    out.splice(at, 0, t)
  }
  return out
}
try {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(ORDER_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (sane(parsed)) {
        order = reconcile(parsed)
        saved = order
        // heal the stored copy, so a ranking does not decay a little more with every round
        if (order.length !== parsed.length || order.some((t, i) => t !== parsed[i])) {
          localStorage.setItem(ORDER_KEY, JSON.stringify(order))
        }
      }
    }
  }
} catch {
  /* a corrupt ranking is not worth a crash; the law stands */
}
export const tagOrder = (): string[] => order
/** The last SAVED ranking — what the app comes back to on its own. */
export const savedTagOrder = (): string[] => saved
export const isDefaultOrder = () => order.every((t, i) => t === DEFAULT_ORDER[i])
/** True when the order being read is the one on disk: nothing to save. */
export const isSavedOrder = () => order.every((t, i) => t === saved[i])
/**
 * Rank the tree. Pass null to go back to the shipped law.
 *
 * `persist` is the save. Without it the new order is applied to the live tree — so the lists re-tag
 * and you can SEE what the move did — but nothing is written down, and Discard or a reload restores
 * the saved ranking.
 */
export function setTagOrder(next: string[] | null, persist = true) {
  order = next && sane(next) ? reconcile(next) : DEFAULT_ORDER
  if (!persist) return
  saved = [...order]
  try {
    if (typeof localStorage !== 'undefined') {
      if (next && sane(next)) localStorage.setItem(ORDER_KEY, JSON.stringify(order))
      else localStorage.removeItem(ORDER_KEY)
    }
  } catch {
    /* ranking is a preference, not state worth failing over */
  }
}

/**
 * NOBODY IS SOFTENED INTO A FIT (his ruling, superseding the recal_15 rescue).
 *
 * The rescue used to re-read the tree for any 80+ card it could not name, with every floor dropped
 * by 10, and gave him whatever then matched. That is not a label, it is a lowered bar: Kobe '05 wore
 * TWO-WAY STAR because 85/85 became 75/75. Worse, it hid the one thing a tree-builder needs to see —
 * which good players the tree has no rule for.
 *
 * So the tree speaks at its own thresholds and nowhere else. A card it cannot name is:
 *   UNCLASSIFIED  above the cap — a good player with no rule. He is REPORTED, not dressed.
 *   BALANCED      at or below it — nothing distinctive to say, which for a role player is the truth.
 *
 * `npm run unfit` prints every Unclassified card with his sheet. That list is the work queue for the
 * tree: each name on it is either a missing rule or a threshold set too high.
 */
export const BALANCED_CAP = 79
/** Kept at 0 so any caller that still passes a relaxation gets the tree's own thresholds. */
export const FALLBACK_RELAX = 0
export const UNCLASSIFIED = 'Unclassified'

export function archetype(p: Player, relax: number = RELAX): string {
  const first = strictTag(p, relax)
  if (first !== 'Balanced') return first
  return p.ovr > BALANCED_CAP ? UNCLASSIFIED : 'Balanced'
}

/**
 * The tree itself: 44 rules, top-down, first match wins. Exported so callers (and the
 * pinned tests) can ask what the tree says at its OWN thresholds, before the OVR-79
 * rescue relaxes them.
 */
/**
 * THE EVALUATION CONTEXT, built in ONE place. The audit and the unfit report used to construct this by
 * hand, so a change to the tree's vocabulary broke them — and, worse, let the audit drift away from the
 * labeler it exists to check. Everything reads a card through this function now.
 */
export function ctxFor(p: Player, relax: number = RELAX): Ctx {
  const a = p.attrs
  const paint = a.rim
  const mid = a.mid
  const three = a['3pt']
  const zone = Math.max(three, paint, mid)
  const big = isBigShape(a)   // numeric law: the shape, from this sheet's own numbers
  const h = a.height
  /** at least: the floor drops by `relax`. Being generous about DEGREE. */
  const ge = (v: number, t: number) => v >= t - relax
  /**
   * under: a CEILING, and it never relaxes. A floor says "he must be at least this good at it", so
   * easing it credits a near miss. A ceiling says "this tag is not for that kind of player" — easing
   * it admits exactly who the rule exists to exclude. Relaxing `volume < 88` to `< 98` put Lillard,
   * Booker and Brunson in FLOOR GENERAL: 27-point scorers on 32 usage wearing a tag whose whole point
   * is that he sets the table rather than eating. Same lesson as the height gates, now general.
   */
  const lt = (v: number, t: number) => v < t
  // HEIGHT IS NEVER RELAXED. Every other gate reads a 0-99 rating, where 10 points is a nudge;
  // height is INCHES, where 10 is most of a foot. Relaxing it made a 7-foot centre pass "under 6'3\""
  // and come back tagged Spark plug. A physical fact stays a physical fact at any relaxation.
  const geH = (v: number, t: number) => v >= t
  const ltH = (v: number, t: number) => v < t
  return {
    p, a, paint, mid, three, zone, big, h, ge, lt, geH, ltH,
    pos: eligible((STATS as Record<string, { pos?: string[] } | null>)[p.name]?.pos),
    solid: [zone, a.playvol, Math.max(a.perdef, a.rimprot), Math.max(a.orb, a.drb)].filter((v) => ge(v, 60)).length,
  }
}

export function strictTag(p: Player, relax: number = RELAX): string {
  const c = ctxFor(p, relax)
  for (const tag of order) {
    const rule = BY_TAG.get(tag)
    if (rule && rule.test(c)) return tag
  }
  return 'Balanced'
}
