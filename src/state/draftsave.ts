import { WHEEL, type TeamSeason } from '../data/wheel'
import { POSITIONS, type Pos } from '../engine/positions'
import { makeRng, type Rng } from '../engine/rng'
import { BOOST_MAX, isBoost, NODE, type BoostId, type NodeId } from '../engine/tree'
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
 * WHICH LADDERS KEEP A DRAFT: ALL THREE. The death match was left out of 167d3ad by design ("another
 * session's lane"), so a reload there still re-dealt the same five landings onto an empty board and
 * a walk out with men in cost no life and dealt a brand-new wheel. His word, 2026-10-24, on the
 * coordinator's item ("fix it the same way, save the draft in progress"; nobody else holds the death
 * match now): it keeps its draft exactly as the ladders do, under its own key, with its own state
 * read against it — the carried five it was seated from (`DraftMeta.carry`, re-read against My team
 * by Draft.tsx `reseat`), cleared at the sim like any other, and all of the ladder's drafts cleared
 * when a run ends (`clearDrafts`). Wear, lives, the bench and the round's changes live in the save,
 * not here, and are banked at the sim as before; nothing kept here can take one of them back.
 */
export const keepsDraft = (_m: CampaignMode) => true

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
 * What false gave up, said plainly: walking out used to spend the attempt so that nobody could see a
 * landing, buy a node on the map (the Staff tree lives there) and come back to the same spin — the
 * anti-peek rule, in the code since the v41 snapshot. A kept draft comes back to the same spin, so
 * that peek was open again — and is closed the other way since 2026-10-24: a draft keeps the staff it
 * began with (`DraftMeta.ranks`, `begun`), so a rank bought on the way out starts with the next draft.
 *
 * The death match reads the same rule since 2026-10-24 (it used to spend the attempt on a walk out
 * with men in, and its Home asked twice): its draft is kept and Home leaves in one tap.
 */
export const LEAVE_SPENDS_ATTEMPT = false

/** Whether walking out of this ladder's draft with men on the board throws them away (Home asks twice). */
export const leaveLoses = (m: CampaignMode, spends = LEAVE_SPENDS_ATTEMPT) => !keepsDraft(m) || spends

/**
 * The save after walking out of a draft, and whether the draft is kept. `ended` is the wheel running
 * dry ("No legal team left") — that attempt is over whatever the rule says, so it is counted and the
 * draft goes, or the level would reopen on a dead wheel forever.
 *
 * A DEATH-MATCH LOSS IS NOT A WALK OUT, and nothing here touches one. Results are banked at the sim
 * (state/campaign.ts `settledProgress`), and the sim clears the level's draft before the night is
 * committed — so a reload after a loss finds the life spent (or the run over, and every draft of it
 * gone) and no draft to resume.
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
  /** The landing after that — drawn only while a Film session boost is in the attempt, which shows it. */
  after: TeamSeason | null
  reels: ReelSpin | null
  hold: Hold
  /** Per-draft charges spent: Extra spin (with Extra spin+ and a Timeout on top), Version respin, Same roster again, Scout's pick. */
  used: Partial<Record<NodeId, number>>
  dead: boolean
  wide: Wide
  board: number[] | null
  /**
   * The boosts bought for this attempt (engine/tree.ts BOOSTS). Kept here, with the draft, so a reload
   * or a walk out and back neither refunds nor repeats them; they go when the series is simmed and
   * the draft is cleared. Their stars are already in the save's `boosted`.
   */
  boosts: BoostId[]
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

/**
 * What App writes beside the draft screen's own state — things the draft is played WITH rather than
 * things it does. Absent on a draft kept before them; it reads back as null.
 */
export interface DraftMeta {
  /**
   * THE STAFF THIS DRAFT PLAYS WITH (his word, 2026-10-24: a node bought during a draft in progress
   * applies from the NEXT draft). The tree's ranks as they stood while the draft was opened, taken
   * again each time it is opened until it has BEGUN (`begun`) and kept from then on; the draft and its
   * sim read engine/tree.ts `staffAt(save, ranks)`. Null: not taken yet — the live tree.
   */
  ranks?: Partial<Record<NodeId, number>> | null
  /**
   * Death match: the carried five the board was seated from, by card name in slot order — null for a
   * draft dealt onto an empty board. My team can change the five while the draft is kept; Draft.tsx
   * `reseat` reads the kept board against the five it carries now.
   */
  carry?: string[] | null
}

export type DraftSave = DraftAttempt & DraftState & DraftMeta

/** The attempt a draft opened NOW would be dealt in. */
export const draftAttempt = (p: Progress, level: number): DraftAttempt => ({ level, base: p.seed, plays: p.plays, seed: levelSeed(p, level) })

/** A team-season by name and year — the same row in any build that still has it. */
const ID = (t: TeamSeason) => `${t.ab}|${t.y}`
const BY_ID = new Map(WHEEL.map((t) => [ID(t), t]))

/**
 * As written. `after` and `boosts` came in after the first drafts were kept (2026-10-23, the boosts and
 * the Dynasty branch), `ranks` and `carry` the day after (the next-draft rule, the death match); a draft
 * written without them reads back with none — the shape is the same v1.
 */
interface Stored extends DraftAttempt, Omit<DraftState, 'landed' | 'last' | 'upcoming' | 'after' | 'boosts'> {
  v: 1
  landed: string | null
  last: string | null
  upcoming: string | null
  after?: string | null
  boosts?: BoostId[]
  ranks?: Partial<Record<NodeId, number>> | null
  carry?: string[] | null
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
  const s: Stored = {
    ...d,
    v: 1,
    landed: d.landed && ID(d.landed),
    last: d.last && ID(d.last),
    upcoming: d.upcoming && ID(d.upcoming),
    after: d.after && ID(d.after),
    boosts: [...d.boosts],
    ranks: d.ranks ? { ...d.ranks } : null,
    carry: d.carry ? [...d.carry] : null,
  }
  writeAll(m, { ...readAll(m), [d.level]: s })
}

/** The night was simmed (or the attempt otherwise ended): this level's draft is over. */
export function clearDraft(m: CampaignMode, level: number) {
  const all = readAll(m)
  if (!(level in all)) return
  delete all[level]
  writeAll(m, all)
}

/**
 * EVERY DRAFT THIS LADDER KEEPS, GONE — a death-match run that ended. `die` hands back a fresh ladder
 * (a new seed, or the Saving point's rung on one), so no draft of the dead run would match it anyway;
 * they are dropped outright rather than left to be ignored.
 */
export function clearDrafts(m: CampaignMode) {
  writeAll(m, {})
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
  const [landed, last, upcoming, after] = [ts(s.landed), ts(s.last), ts(s.upcoming), s.after === undefined ? null : ts(s.after)]
  // a team-season this build no longer has: the draft cannot be put back as it was
  if (landed === undefined || last === undefined || upcoming === undefined || after === undefined) return null
  // the boosts were paid for: a list that does not read back exactly is not guessed at
  const boosts = s.boosts === undefined ? [] : s.boosts
  if (!Array.isArray(boosts) || boosts.length > BOOST_MAX || !boosts.every(isBoost) || new Set(boosts).size !== boosts.length) return null
  const reels = s.reels && isReel(s.reels.team) && isReel(s.reels.year) && isHold(s.reels.held) && typeof s.reels.nonce === 'number' ? s.reels : null
  const used = s.used && typeof s.used === 'object' && Object.values(s.used).every((n) => isInt(n)) ? s.used : {}
  const board = Array.isArray(s.board) && s.board.length === POSITIONS.length && s.board.every((n) => isInt(n)) ? s.board : null
  // the staff it plays with: a list that does not read back exactly is the one thing here that is not
  // thrown away whole — it is taken again from the live tree (null), which is what a draft kept before
  // the rule reads as too
  const ranks =
    s.ranks && typeof s.ranks === 'object' && !Array.isArray(s.ranks) && Object.entries(s.ranks).every(([k, n]) => k in NODE && isInt(n))
      ? (s.ranks as Partial<Record<NodeId, number>>)
      : null
  // the five it was seated from: five card names, or none. Anything else cannot be read against My team
  if (s.carry !== undefined && s.carry !== null && !(Array.isArray(s.carry) && s.carry.length === POSITIONS.length && s.carry.every((n) => typeof n === 'string'))) return null
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
    after,
    reels,
    hold: isHold(s.hold) ? s.hold : null,
    used,
    dead: s.dead === true,
    wide: WIDES.includes(s.wide as Wide) ? (s.wide as Wide) : 'team',
    board,
    boosts: [...boosts],
    ranks: ranks ? { ...ranks } : null,
    carry: s.carry ? [...s.carry] : null,
  }
}

/**
 * WHETHER THE ATTEMPT HAS SPUN YET — the line the boosts are bought behind ("bought with stars before
 * the draft's first spin"). The reels exist from the first spin on and are kept with the draft, and a
 * man on the board means a spin landed whatever the reels say, so either one closes the shop; a draft
 * that has only had its first landing DRAWN (the idle wheel draws one for Sight seeing) has not spun.
 */
export const hasSpun = (d: Pick<DraftState, 'reels' | 'slots' | 'landed' | 'last'>) =>
  !!d.reels || !!d.landed || !!d.last || Object.keys(d.slots).length > 0

/**
 * WHETHER THE DRAFT HAS BEGUN — the line a rank bought on the map stops reaching it (his word,
 * 2026-10-24: a node bought during a draft in progress applies from the NEXT draft).
 *
 * A draft dealt onto an empty board begins at its first spin: the line the boosts are bought behind
 * (`hasSpun`), and the moment the wheel starts giving anything away. Until then nothing has landed,
 * so a rank bought before it — the level opened, the map visited, a node bought — is a rank this
 * draft was always going to have. A carried five (the death match after level 1) is on the board
 * from the start and turns no wheel; it begins the first time it spends a charge (a Version respin's
 * season), which is the only thing on it a rank could be bought to answer.
 */
export const begun = (d: Pick<DraftState, 'reels' | 'slots' | 'landed' | 'last' | 'used'> & Partial<Pick<DraftMeta, 'carry'>>) =>
  d.carry ? Object.values(d.used).some((n) => (n ?? 0) > 0) : hasSpun(d)

/**
 * THE RANKS A DRAFT OPENED NOW PLAYS WITH: a kept draft's own, once it has begun; otherwise the tree as
 * it stands (taken again every time the draft opens until it begins — the tree cannot change while the
 * draft is on the screen, so what is taken at the opening of the visit it begins in is what it began
 * with). Handed to engine/tree.ts `staffAt` and written back with the draft.
 */
export const draftStaff = (d: Pick<DraftSave, 'reels' | 'slots' | 'landed' | 'last' | 'used' | 'carry' | 'ranks'> | null, live: Partial<Record<NodeId, number>>) =>
  d && d.ranks && begun(d) ? { ...d.ranks } : { ...live }

/** The levels of this ladder with a kept draft that has begun — the staff tree names them (Tree.tsx). */
export function draftsUnderway(m: CampaignMode, p: Progress): number[] {
  return Object.keys(readAll(m))
    .map(Number)
    .filter((l) => Number.isInteger(l) && l >= 1)
    .filter((l) => {
      const d = loadDraft(m, l, p)
      return !!d && begun(d)
    })
    .sort((a, b) => a - b)
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
