import { WHEEL, type TeamSeason } from '../data/wheel'
import { POSITIONS, type Pos } from '../engine/positions'
import { makeRng, type Rng } from '../engine/rng'
import type { NodeId } from '../engine/tree'
import type { Hold, ReelSpin } from '../ui/SpinReels'
import { draftKey, levelSeed, type CampaignMode, type Progress } from './campaign'

/**
 * THE DRAFT IN PROGRESS IS KEPT (his report, 2026-10-23: "Reloading lets you see the whole draft
 * before you make it ... A player can spin through all five, reload, and draft knowing exactly
 * what's coming"; his fix: "save the draft in progress (picks plus which spin you're on), so a
 * reload or re-entry continues the same draft").
 *
 * The wheel is one seeded stream per attempt (`levelSeed`), and until now only the seed was kept
 * (c9e87b2), never the picks — so a reload dealt the same five landings again onto an empty board,
 * and walking out with a man drafted spent the attempt and dealt a brand-new wheel. Both turned the
 * wheel into a menu. Now everything the draft's behaviour depends on is written here at every change
 * that matters, and read back when the same level is opened again: the men and their rings, the
 * landing on the reels (a spin caught mid-animation comes back landed), the landing already drawn
 * for the next spin, how far the wheel's stream has been drawn, the held reel, the Front office
 * charges spent, how wide the wheel opens, the matchup board, and whether the wheel ran dry. Nothing
 * about a coming landing can be learned without spinning for it, and every spin is kept.
 *
 * ONE DRAFT PER LEVEL, kept until it is simmed. It belongs to the attempt it was dealt in — the
 * ladder's seed and the play count of that moment — and it keeps its own seed when a series at
 * ANOTHER level moves the play count on, because a draft that was thrown away by a night elsewhere
 * would be a new wheel here for the price of any series. Stale (another ladder, a reset, a save that
 * went backwards, a data change that dropped the team-season it stood on) is ignored, never trusted.
 *
 * Under the save's own key (`draftKey` → `game7.campaign.v2.draft`, `game7.tut.campaign.v2.draft`),
 * so the tutorial keeps its own, a Reset wipes it, a save code carries it, and creator mode's
 * in-memory storage holds it for the length of the page and no longer.
 */

/**
 * WHICH LADDERS KEEP A DRAFT. The death match does not, by design of this change rather than by
 * accident: it carries one five level to level and is another session's lane ("Death Match permadeath
 * exploits"), so its draft, its leave rule and its two-tap Home are exactly as they were.
 */
export const keepsDraft = (m: CampaignMode) => m !== 'death'

/**
 * WALKING OUT OF A DRAFT — HIS CALL, AND THIS IS THE ONE PLACE IT IS MADE.
 *
 * false (shipped): the Home button and the map button leave, the draft is kept as it stands, and
 * opening the level again carries on with it. Leaving is not an attempt.
 *
 * true: leaving with a man on the board spends the attempt (`plays` + 1) and throws the kept draft
 * away, so the level deals a brand-new wheel on the way back in — the instant reroll of his report
 * ("Philly '03 became Dallas '92"). A reload still continues the draft either way.
 *
 * What false gives up, said plainly: walking out used to spend the attempt so that nobody could see a
 * landing, buy a node on the map (the Staff tree lives there) and come back to the same spin — the
 * anti-peek rule, in the code since the v41 snapshot. A kept draft comes back to the same spin, so
 * that peek is open again for a draft with men in it (it always was for one with none).
 */
export const LEAVE_SPENDS_ATTEMPT = false

/** Whether walking out of this ladder's draft with men on the board throws them away (Home asks twice). */
export const leaveLoses = (m: CampaignMode, spends = LEAVE_SPENDS_ATTEMPT) => !keepsDraft(m) || spends

/**
 * The save after walking out of a draft, and whether the draft is kept. `ended` is the wheel running
 * dry ("No legal team left") — that attempt is over whatever the rule says, so it is counted and the
 * draft goes, or the level would reopen on a dead wheel forever.
 */
export function afterLeave(
  m: CampaignMode,
  p: Progress,
  started: boolean,
  ended = false,
  spends = LEAVE_SPENDS_ATTEMPT,
): { progress: Progress; keep: boolean } {
  const spend = ended || (started && leaveLoses(m, spends))
  return { progress: spend ? { ...p, plays: p.plays + 1 } : p, keep: keepsDraft(m) && !spend }
}

/** How wide the wheel's landing opens (the Decade / Division nodes). */
export type Wide = 'team' | 'decade' | 'decade3' | 'division' | 'conference'
const WIDES: Wide[] = ['team', 'decade', 'decade3', 'division', 'conference']

/** What the draft screen hands over to be kept, and is handed back when the level opens again. */
export interface DraftState {
  /** How many numbers the wheel's stream has given out. The stream is replayed this far on the way back. */
  draws: number
  slots: Partial<Record<Pos, string>>
  /** On the reels now (landed, or still spinning — it comes back landed). */
  landed: TeamSeason | null
  /** What the reels last stopped on: the half a held reel keeps for the next spin. */
  last: TeamSeason | null
  /** The next landing, already drawn (Sight seeing shows it). */
  upcoming: TeamSeason | null
  reels: ReelSpin | null
  hold: Hold
  used: Partial<Record<NodeId, number>>
  dead: boolean
  wide: Wide
  board: number[] | null
}

/** The attempt a draft belongs to. */
export interface DraftAttempt {
  level: number
  /** The ladder's own seed (`Progress.seed`): a Reset or another ladder never matches. */
  base: number
  /** The play count the wheel was dealt at. */
  plays: number
  /** The wheel's seed, `levelSeed` of the two above. */
  seed: number
}

export type DraftSave = DraftAttempt & DraftState

/** The attempt a draft opened NOW would be dealt in. */
export const draftAttempt = (p: Progress, level: number): DraftAttempt => ({ level, base: p.seed, plays: p.plays, seed: levelSeed(p, level) })

/** A team-season by name and year — the same row in any build that still has it. */
const ID = (t: TeamSeason) => `${t.ab}|${t.y}`
const BY_ID = new Map(WHEEL.map((t) => [ID(t), t]))

interface Stored extends DraftAttempt, Omit<DraftState, 'landed' | 'last' | 'upcoming'> {
  v: 1
  landed: string | null
  last: string | null
  upcoming: string | null
}

const readAll = (m: CampaignMode): Record<string, unknown> => {
  try {
    const raw = localStorage.getItem(draftKey(m))
    const all = raw ? (JSON.parse(raw) as unknown) : null
    return all && typeof all === 'object' && !Array.isArray(all) ? (all as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const writeAll = (m: CampaignMode, all: Record<string, unknown>) => {
  try {
    if (Object.keys(all).length) localStorage.setItem(draftKey(m), JSON.stringify(all))
    else localStorage.removeItem(draftKey(m))
  } catch {
    /* storage blocked or full: the draft plays on, it just is not kept */
  }
}

export function saveDraft(m: CampaignMode, d: DraftSave) {
  if (!keepsDraft(m)) return
  const s: Stored = { ...d, v: 1, landed: d.landed && ID(d.landed), last: d.last && ID(d.last), upcoming: d.upcoming && ID(d.upcoming) }
  writeAll(m, { ...readAll(m), [d.level]: s })
}

/** The night was simmed (or the attempt otherwise ended): this level's draft is over. */
export function clearDraft(m: CampaignMode, level: number) {
  const all = readAll(m)
  if (!(level in all)) return
  delete all[level]
  writeAll(m, all)
}

const isInt = (n: unknown, lo = 0): n is number => Number.isInteger(n) && (n as number) >= lo
const isReel = (r: unknown) => {
  const x = r as { rows?: unknown; at?: unknown } | null
  return !!x && Array.isArray(x.rows) && x.rows.every((s) => typeof s === 'string') && isInt(x.at)
}
const isHold = (h: unknown): h is Hold => h === null || h === 'team' || h === 'year'

/**
 * This level's draft, if one is in progress for this ladder — else null, and the level deals afresh.
 * Everything is checked: a value that does not read back exactly is not half-restored.
 */
export function loadDraft(m: CampaignMode, level: number, p: Progress): DraftSave | null {
  if (!keepsDraft(m)) return null
  const s = readAll(m)[level] as Partial<Stored> | undefined
  if (!s || typeof s !== 'object' || s.v !== 1) return null
  // the attempt: this ladder, a play count it has reached, and the seed those two deal
  if (s.level !== level || s.base !== p.seed || !isInt(s.plays) || s.plays > p.plays) return null
  if (s.seed !== levelSeed({ ...p, plays: s.plays }, level) || !isInt(s.draws) || s.draws > 1e7) return null
  const slots = s.slots
  if (!slots || typeof slots !== 'object' || Object.entries(slots).some(([k, v]) => !(POSITIONS as readonly string[]).includes(k) || typeof v !== 'string')) return null
  const ts = (id: unknown): TeamSeason | null | undefined => (id === null ? null : typeof id === 'string' ? BY_ID.get(id) : undefined)
  const [landed, last, upcoming] = [ts(s.landed), ts(s.last), ts(s.upcoming)]
  // a team-season this build no longer has: the draft cannot be put back as it was
  if (landed === undefined || last === undefined || upcoming === undefined) return null
  const reels = s.reels && isReel(s.reels.team) && isReel(s.reels.year) && isHold(s.reels.held) && typeof s.reels.nonce === 'number' ? s.reels : null
  const used = s.used && typeof s.used === 'object' && Object.values(s.used).every((n) => isInt(n)) ? s.used : {}
  const board = Array.isArray(s.board) && s.board.length === POSITIONS.length && s.board.every((n) => isInt(n)) ? s.board : null
  return {
    level,
    base: s.base,
    plays: s.plays,
    seed: s.seed,
    draws: s.draws,
    slots: slots as Partial<Record<Pos, string>>,
    landed,
    last,
    upcoming,
    reels,
    hold: isHold(s.hold) ? s.hold : null,
    used,
    dead: s.dead === true,
    wide: WIDES.includes(s.wide as Wide) ? (s.wide as Wide) : 'team',
    board,
  }
}

/**
 * THE WHEEL'S STREAM, COUNTED. The same numbers `makeRng(seed)` gives, in the same order — the
 * landings a seed deals do not move — with a count of how many have been drawn, so a kept draft can
 * replay its stream to exactly where it stood. Every helper is built on the counted draw, so no use
 * of this rng can move it without the count knowing.
 */
export function countedRng(seed: number, from = 0): Rng & { draws(): number } {
  const base = makeRng(seed)
  for (let i = 0; i < from; i++) base.next()
  let n = from
  const next = () => {
    n++
    return base.next()
  }
  let spare: number | null = null
  return {
    draws: () => n,
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (k) => Math.floor(next() * k),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle(xs) {
      for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[xs[i], xs[j]] = [xs[j], xs[i]]
      }
      return xs
    },
    gaussian(mean, sd) {
      if (spare !== null) {
        const s = spare
        spare = null
        return mean + sd * s
      }
      let u = 0
      let v = 0
      let s = 0
      do {
        u = next() * 2 - 1
        v = next() * 2 - 1
        s = u * u + v * v
      } while (s === 0 || s >= 1)
      const f = Math.sqrt((-2 * Math.log(s)) / s)
      spare = v * f
      return mean + sd * u * f
    },
  }
}
