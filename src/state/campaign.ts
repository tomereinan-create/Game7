import { ROUNDS } from '../config'
import { DEFAULT_TACTICS, reconcileTactics, type Tactics } from '../engine/tactics'
import { migrate, type NodeId } from '../engine/tree'
import type { CoachId } from '../engine/types'

/** Three save slots: the campaign, its salary-cap variant, and the death match. */
export type CampaignMode = 'campaign' | 'salary' | 'death'
export const MODES: CampaignMode[] = ['campaign', 'salary', 'death']
/**
 * Death match wear: a man's durability falls by one for every GAME he plays, so a six-game series
 * costs six. At WEAR_OUT or less he is finished and has to be replaced — the run does not get to
 * ride a broken man to the end.
 */
export const WEAR_OUT = 7

/** Death match only: one five carried the whole way, one change a round, a loss ends the run. */
export const isDeath = (m: CampaignMode | null) => m === 'death'
/** How many men you may change before a level. Base one, plus the Extra sub ranks. */
export const SUBS_BASE = 1
export const clearedCount = (p: { stars: number[] }) => p.stars.filter((s) => s > 0).length

/**
 * Persistent campaign progress — a level map, not a run. Levels unlock in
 * order; any cleared level can be replayed for a better star rating; a loss
 * costs nothing but the attempt.
 */
export interface Team {
  city: string
  /** ISO 3166-1 alpha-2. */
  country: string
  name: string
}

export interface Progress {
  coach: CoachId | null
  /** City + nickname, chosen before the first coach. */
  team: Team | null
  /** Best stars per level (index = level - 1); 0 = never cleared. */
  stars: number[]
  /** Base seed for the wheel; each play mixes in the level and the play count. */
  seed: number
  /** Total plays so far — makes every attempt's wheel different. */
  plays: number
  /** Stars spent in the staff tree (balance = total stars − spent). */
  spent: number
  /** Nodes owned; consumables carry a charge count. */
  nodes: Partial<Record<NodeId, number>>
  /**
   * DEATH MATCH ONLY. The five you carry, by card name — drafted once at level 1, then changed one
   * man at a time. Null before the first draft, and again after a run ends.
   */
  roster: string[] | null
  /** Extra lives left in the run. A loss spends one; at zero the run is over. */
  lives: number
  /** The level a lost run restarts from — 0 means the very beginning. Bought in the Survival branch. */
  checkpoint: number
  /** Runs ended by a loss. Kept for the map's header; nothing else reads it. */
  deaths: number
  /** Death match: durability LEFT per carried man, by card name. Seeded from his card when he joins. */
  wear: Record<string, number>
  /** Death match: changes spent in My team since the last series settled. Reset when one does. */
  subsUsed: number
  /** Death match: the plan picked on the My team screen. The names must be men on the roster. */
  tactics: Tactics
  /** Death match: the sixth man, resting. He does not play, and resting heals (The bench node). */
  bench: string | null
}

/** What a series cost each man who played it: one point of durability per game. */
export function applyWear(wear: Record<string, number>, five: string[], games: number, dur: (name: string) => number): Record<string, number> {
  const next = { ...wear }
  for (const n of five) next[n] = (next[n] ?? dur(n)) - games
  return next
}
/** The men who can no longer take the floor. Each one forces a change, even beyond the round's allowance. */
export const wornOut = (wear: Record<string, number>, five: string[], dur: (name: string) => number) =>
  five.filter((n) => (wear[n] ?? dur(n)) <= WEAR_OUT)

const key = (m: CampaignMode) => `game7.${m}.v2`
/** The first 30 levels were briefly saved under their own era key. */
const legacyKey = (m: CampaignMode) => (m === 'campaign' ? 'game7.c2026.v2' : null)

const fresh = (): Progress => ({
  coach: null,
  team: null,
  stars: Array.from({ length: ROUNDS }, () => 0),
  seed: (Math.random() * 0xffffffff) >>> 0,
  plays: 0,
  spent: 0,
  nodes: {},
  roster: null,
  lives: 0,
  checkpoint: 0,
  deaths: 0,
  wear: {},
  subsUsed: 0,
  tactics: DEFAULT_TACTICS,
  bench: null,
})

/**
 * A death-match loss. An extra life absorbs it and the run continues; otherwise the run ends — every
 * level past the checkpoint is wiped, the five is gone, and the next draft starts over from there.
 * Stars already EARNED are kept: they were paid for in blood, and the tree is the only thing that
 * makes the next run different. `checkpoint` is bought in the Survival branch, so a fresh run loses
 * everything and a well-invested one loses the last stretch.
 */
export function die(p: Progress): Progress {
  if (p.lives > 0) return { ...p, lives: p.lives - 1 }
  const stars = p.stars.map((s, i) => (i < p.checkpoint ? s : 0))
  // The five is gone, so the named men reset; the plan itself (tempo, style, the glass) survives.
  return { ...p, stars, roster: null, wear: {}, subsUsed: 0, tactics: reconcileTactics(p.tactics, null), bench: null, deaths: p.deaths + 1 }
}

export function loadProgress(m: CampaignMode): Progress {
  try {
    const raw = localStorage.getItem(key(m)) ?? (legacyKey(m) ? localStorage.getItem(legacyKey(m)!) : null)
    if (!raw) return fresh()
    const p = JSON.parse(raw) as Partial<Progress>
    const stars = Array.isArray(p.stars) ? p.stars.slice(0, ROUNDS) : []
    while (stars.length < ROUNDS) stars.push(0)
    // A wallet saved before the tree was ranked can hold nodes that no longer exist.
    return migrate({
      coach: p.coach ?? null,
      team: p.team && typeof p.team.city === 'string' && typeof p.team.name === 'string' ? p.team : null,
      stars,
      seed: typeof p.seed === 'number' ? p.seed : (Math.random() * 0xffffffff) >>> 0,
      plays: typeof p.plays === 'number' ? p.plays : 0,
      spent: typeof p.spent === 'number' ? p.spent : 0,
      nodes: p.nodes && typeof p.nodes === 'object' ? p.nodes : {},
      roster: Array.isArray(p.roster) && p.roster.length ? p.roster.slice(0, 5) : null,
      lives: typeof p.lives === 'number' ? p.lives : 0,
      checkpoint: typeof p.checkpoint === 'number' ? p.checkpoint : 0,
      deaths: typeof p.deaths === 'number' ? p.deaths : 0,
      wear: p.wear && typeof p.wear === 'object' ? p.wear : {},
      subsUsed: typeof p.subsUsed === 'number' ? p.subsUsed : 0,
      tactics: reconcileTactics(
        p.tactics && typeof p.tactics === 'object' ? { ...DEFAULT_TACTICS, ...p.tactics } : DEFAULT_TACTICS,
        Array.isArray(p.roster) ? p.roster : null,
      ),
      bench: typeof p.bench === 'string' ? p.bench : null,
    })
  } catch {
    return fresh()
  }
}

export function saveProgress(m: CampaignMode, p: Progress) {
  try {
    localStorage.setItem(key(m), JSON.stringify(p))
  } catch {
    /* private mode — the game still plays, it just forgets */
  }
}

export function resetProgress(m: CampaignMode): Progress {
  const p = fresh()
  saveProgress(m, p)
  return p
}

/** The level to play next (1-based); null when all thirty are cleared. */
export function currentLevel(p: Progress): number | null {
  const i = p.stars.findIndex((s) => s === 0)
  return i === -1 ? null : i + 1
}

/** A level is playable if it's cleared (replay) or it's the next one up. */
export function playable(p: Progress, level: number): boolean {
  const cur = currentLevel(p)
  return p.stars[level - 1] > 0 || level === cur
}

export const totalStars = (p: Progress) => p.stars.reduce((a, b) => a + b, 0)

/** Deterministic per attempt: same level replayed spins a different wheel. */
export function levelSeed(p: Progress, level: number): number {
  return (Math.imul(p.seed ^ Math.imul(level, 0x9e3779b1) ^ Math.imul(p.plays + 1, 0x85ebca6b), 0xc2b2ae35) >>> 0) || 1
}
