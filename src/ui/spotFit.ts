import { PLAYERS } from '../engine/pool'
import {
  elbowSkill,
  heliEngineScore,
  hornsHandler,
  hubScore,
  isoScore,
  pinScore,
  popFit,
  popHandler,
  postFit,
  rollHandler,
  screenFit,
} from '../engine/tactics'
import type { Attrs, Player } from '../engine/types'

/**
 * WHAT A MAN IS WORTH AT EVERY OFFENSIVE SPOT — his ruling, 2026-09-28: "In each player page, add
 * his fit offensive at each spot from the team rating system chat."
 *
 * THE SPOTS ARE THE TEAM-RATING SIDE'S OWN, and so are the numbers: every one of these twelve is a
 * function exported by engine/tactics.ts and read here unchanged. Nothing in this file decides
 * what a good roller is — it asks the same question the offence asks when it puts a man in that
 * action, and it asks it about one card instead of about a five. That is the whole point of it
 * living beside the engine rather than inside it: a formula change in a tactics round moves these
 * grades the same day, with nothing here to update. It is also why this file is in `ui/` and not
 * in `engine/` — it adds no rule, it only reads them, and the engine is another session's lane.
 *
 * THE GRADE IS A PERCENTILE OVER THE WHOLE POOL and not the raw number, because the raw numbers
 * are not on one scale: `postFit` is a product of two bars and tops out near 99, `pinScore` is a
 * product of five terms and its 99th percentile is nowhere near it. "87" means nothing on a card
 * until you know what 87 is worth at that spot; "A" means he is in the top tenth of ten thousand
 * seasons at it, at every spot, which is the only reading that survives being put in a column
 * beside eleven others. The bands are the ones the Every Spot, Every Grade page already uses, so
 * the card and that page cannot disagree.
 */
export type Spot = { key: string; name: string; f: (x: Attrs) => number }

export const SPOTS: Spot[] = [
  /* NO SECOND LINE ON THE TWO HANDLERS. They carried "the roll" and "the pop", which is what
     PnR and PnP already say, and they were the two longest strings in the block — long enough to
     ellipsise every cell on a tall narrow window. The names are the note. */
  { key: 'pnr', name: 'PnR handler', f: rollHandler },
  { key: 'pnp', name: 'PnP handler', f: popHandler },
  { key: 'roll', name: 'Roller', f: screenFit },
  { key: 'pop', name: 'Popper', f: popFit },
  { key: 'wing', name: 'Corner / wing', f: (x) => x['3pt'] },
  { key: 'post', name: 'Post hub', f: postFit },
  { key: 'helio', name: 'Helio engine', f: heliEngineScore },
  { key: 'iso', name: 'Iso man', f: isoScore },
  { key: 'elbow', name: 'Horns elbow', f: elbowSkill },
  { key: 'hhand', name: 'Horns handler', f: hornsHandler },
  { key: 'pin', name: 'Pin-down man', f: pinScore },
  { key: 'dho', name: 'DHO hub', f: hubScore },
]

/**
 * ONE SORTED COLUMN PER SPOT, BUILT ONCE AND ONLY IF SOMEBODY ASKS. Twelve functions over ten
 * thousand cards is 120,000 evaluations — nothing on a modern machine, and far too much to repeat
 * per card, per render. `lazy` rather than module scope so that opening the app does not pay for a
 * screen nobody has opened yet.
 */
let dist: number[][] | null = null
const columns = () => (dist ??= SPOTS.map((s) => PLAYERS.map((p) => s.f(p.attrs)).sort((a, b) => a - b)))

/** The share of the pool this man is above, 0–100. Binary search on the sorted column. */
const percentile = (col: number[], v: number) => {
  let lo = 0
  let hi = col.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (col[mid] < v) lo = mid + 1
    else hi = mid
  }
  return (100 * lo) / col.length
}

/** The bands the Every Spot, Every Grade page uses. Kept in step with it on purpose. */
export const gradeOf = (pct: number) =>
  pct >= 97 ? 'A+' : pct >= 90 ? 'A' : pct >= 80 ? 'B+' : pct >= 65 ? 'B' : pct >= 45 ? 'C' : pct >= 25 ? 'D' : pct >= 10 ? 'E' : 'F'

export interface SpotGrade {
  key: string
  name: string
  /** the engine's own number for this man at this spot, on that spot's own scale */
  fit: number
  /** where that number stands in the pool, 0–100 */
  pct: number
  grade: string
}

/** Every spot, in the order above, for one card. */
export function spotGrades(p: Player): SpotGrade[] {
  const cols = columns()
  return SPOTS.map((s, i) => {
    const fit = s.f(p.attrs)
    const pct = percentile(cols[i], fit)
    return { key: s.key, name: s.name, fit, pct, grade: gradeOf(pct) }
  })
}
