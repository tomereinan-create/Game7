import { archetype } from '../engine/pool'
import TEAMSEASONS from '../data/teamseasons.json'
import { ROUNDS } from '../config'
import { gameBoxes, splitBox, type BoxCtx, type PlayerBox } from '../engine/boxstats'
import type { Assignment } from '../engine/offense'
import { makeRng } from '../engine/rng'
import { styleFit, stylePts, STYLES, type Tactics } from '../engine/tactics'
import { balance, NODES, type Branch } from '../engine/tree'
import { LINES } from '../ui/Stat'
import type { Opponent, Player, SeriesResult } from '../engine/types'
import type { CampaignMode, Progress } from './campaign'

/**
 * ACHIEVEMENTS (design round 63): 60 of them (57 at r63; the Machine trio
 * 58-60 added by his ruling), every condition read from state the game
 * already tracks — series results, pre-series odds, the r61 box lines, the
 * r58 fits, the star economy, the campaign map. Hidden ones reveal only on
 * unlock. Four of the 57 name hooks the game does not have (there is no
 * Hack-a-X, no opponent draft AI, no offensive-rebound column, no "best
 * counter" rating on the draft) — they are DEFINED and shown, their detectors
 * never fire, and the receipts name each one for a design-side re-aim. The
 * Sergeant trio was re-aimed at the map's champion teams by his ruling.
 */

export type AchTier = 'common' | 'rare' | 'legendary'
export interface AchDef {
  id: number
  key: string
  name: string
  desc: string
  tier: AchTier
  hidden?: boolean
  /** The condition names state the game does not track — shown, never fires; receipts carry the list. */
  nohook?: string
}

export const ACHIEVEMENTS: AchDef[] = [
  // ---- series drama ----
  { id: 1, key: 'underdog', name: 'Underdog', desc: 'Win a series with a pre-series win probability under 40%', tier: 'common' },
  { id: 2, key: 'dogs-out', name: 'Who Let the Dogs Out', desc: 'Sweep a series with a pre-series win probability under 40%', tier: 'rare' },
  { id: 3, key: 'never-give-up', name: 'Never Give Up', desc: 'Win a series after trailing 0–3', tier: 'legendary' },
  { id: 4, key: 'heart-attack', name: 'Heart Attack', desc: 'Win three Game 7s in one campaign', tier: 'rare' },
  { id: 5, key: 'cold-blooded', name: 'Cold Blooded', desc: 'Win a Game 7 by one point', tier: 'rare' },
  { id: 6, key: 'demolition', name: 'Demolition', desc: 'Win a series with every game by 15 or more', tier: 'rare' },
  { id: 7, key: 'the-long-way', name: 'The Long Way', desc: 'Finish a campaign where every series went six games or more', tier: 'legendary' },
  { id: 8, key: 'gentlemans-sweep', name: "Gentleman's Sweep", desc: 'Win 4–1 three times in one campaign', tier: 'common' },
  { id: 9, key: 'houdini', name: 'Houdini', desc: 'Save three elimination games in one series and win it', tier: 'legendary' },
  { id: 10, key: 'cursed', name: 'Cursed', desc: 'Lose a series after leading 3–0', tier: 'legendary', hidden: true },
  // ---- draft & roster ----
  { id: 11, key: 'bargain-bin', name: 'Bargain Bin', desc: "Win a series with an average OVR 8+ below the opponent's", tier: 'rare' },
  { id: 12, key: 'stars-and-scrubs', name: 'Stars and Scrubs', desc: 'Win with one 95+ card and four below 75', tier: 'rare' },
  { id: 13, key: 'no-stars-needed', name: 'No Stars Needed', desc: 'Win a series with no player above OVR 84', tier: 'common' },
  { id: 14, key: 'the-collector', name: 'The Collector', desc: 'Field 25 different archetypes across this profile', tier: 'common' },
  { id: 15, key: 'twin-towers', name: 'Twin Towers', desc: 'Win with two 7-footers in the five', tier: 'common' },
  { id: 16, key: 'small-ball', name: 'Small Ball', desc: 'Win with no player above 6′8″', tier: 'rare' },
  { id: 17, key: 'glass-house', name: 'Glass House', desc: 'Win with all five at 80+ combined rebounding attributes', tier: 'rare' },
  { id: 18, key: 'shooters-shoot', name: 'Shooters Shoot', desc: 'Win with all five at 3PT 75 or better', tier: 'rare' },
  { id: 19, key: 'brick-city', name: 'Brick City', desc: 'Win with all five below 3PT 45', tier: 'rare' },
  { id: 20, key: 'old-heads', name: 'Old Heads', desc: 'Win with five players from seasons before 1995', tier: 'common' },
  { id: 21, key: 'modern-problems', name: 'Modern Problems', desc: 'Win with five players from 2020 or later', tier: 'common' },
  { id: 22, key: 'one-franchise', name: 'One Franchise', desc: 'Win with five men who shared one real team-season', tier: 'legendary' },
  { id: 23, key: 'the-one-who-got-away', name: 'The One Who Got Away', desc: "Draft a player the opponent's AI would have picked next", tier: 'legendary', hidden: true, nohook: 'the opponent has no draft AI — its fives are historical rosters' },
  // ---- tactics mastery ----
  { id: 24, key: 'read-the-room', name: 'Read the Room', desc: 'Win five series where your playstyle fit was 75+', tier: 'common' },
  { id: 25, key: 'wrong-book', name: 'Wrong Book', desc: 'Win a series with a called playstyle fit below 45', tier: 'rare' },
  { id: 26, key: 'pace-yourself', name: 'Pace Yourself', desc: 'Win as the slow team against a faster-surplus opponent', tier: 'common' },
  { id: 27, key: 'track-meet', name: 'Track Meet', desc: 'Win a game with 115+ possessions', tier: 'legendary' },
  { id: 28, key: 'rock-fight', name: 'Rock Fight', desc: 'Win a game where both teams scored under 85', tier: 'legendary' },
  { id: 29, key: 'hunted', name: 'Hunted', desc: 'Win a series where the hunted pairing produced 30+ extra points', tier: 'legendary' },
  { id: 30, key: 'switch-everything', name: 'Switch Everything', desc: 'Win playing switch coverage with all five defenders at PERDEF 70+', tier: 'rare' },
  { id: 31, key: 'mastermind', name: 'Mastermind', desc: 'Beat a higher-OVR team while winning every tactical category', tier: 'rare' },
  { id: 32, key: 'hack-job', name: 'Hack Job', desc: 'Win a game using Hack-a-X where it saved 6+ points', tier: 'rare', nohook: 'there is no Hack-a-X tactic in the engine' },
  { id: 33, key: 'galaxy-brain', name: 'Galaxy Brain', desc: 'Win as favorites after calling the worst-fit style and the slow night', tier: 'rare', hidden: true },
  // ---- box score feats ----
  { id: 34, key: 'fifty-piece', name: 'Fifty Piece', desc: 'Any player scores 50 in a game', tier: 'common' },
  { id: 35, key: 'triple-crown', name: 'Triple Crown', desc: 'A player triple-doubles in a Game 7', tier: 'rare' },
  { id: 36, key: 'locksmith', name: 'Locksmith', desc: 'Hold their main scorer under 12 in a game', tier: 'common' },
  { id: 37, key: 'sharing-is-caring', name: 'Sharing Is Caring', desc: '35+ team assists in a game', tier: 'common' },
  { id: 38, key: 'stocks-up', name: 'Stocks Up', desc: '15+ combined steals and blocks in a game', tier: 'common' },
  { id: 39, key: 'perfect-storm', name: 'Perfect Storm', desc: 'Win a game shooting 55/45/85 or better as a team', tier: 'rare' },
  { id: 40, key: 'starved', name: 'Starved', desc: 'Win while their star takes 30+ shots for under 25 points', tier: 'legendary' },
  { id: 41, key: 'glass-eaters', name: 'Glass Eaters', desc: '20+ offensive rebounds in a game', tier: 'rare', nohook: 'the box has no offensive-rebound column (REB is total, r61 shape)' },
  { id: 42, key: 'kobe', name: 'Kobe', desc: 'A player scores 40+ on under 35% shooting — and you win anyway', tier: 'legendary', hidden: true },
  // ---- the champions & campaign (his ruling: the Sergeant trio re-aimed at the CHAMP teams) ----
  { id: 43, key: 'giant-slayer', name: 'Giant Slayer', desc: 'Beat a champion team', tier: 'common' },
  { id: 44, key: 'ring-thief', name: 'Ring Thief', desc: 'Beat a champion team as an underdog', tier: 'rare' },
  { id: 45, key: 'dynasty-denied', name: 'Dynasty Denied', desc: 'Sweep a champion team', tier: 'rare' },
  { id: 46, key: 'the-gauntlet', name: 'The Gauntlet', desc: 'Clear 30 levels of a campaign', tier: 'common' },
  { id: 47, key: 'marathon', name: 'Marathon', desc: 'Finish the 120-level campaign', tier: 'rare' },
  { id: 48, key: 'flawless', name: 'Flawless', desc: 'Finish a campaign without losing a series', tier: 'legendary' },
  { id: 49, key: 'iron-five', name: 'Iron Five', desc: 'Win a death-match series owning nothing in the Survival branch', tier: 'common' },
  { id: 50, key: 'speedrun', name: 'Speedrun', desc: 'Clear 30 levels in under 45 minutes', tier: 'rare' },
  // ---- economy & meta ----
  { id: 51, key: 'star-gazer', name: 'Star Gazer', desc: 'Bank 30 stars in one campaign', tier: 'common' },
  { id: 52, key: 'spendthrift', name: 'Spendthrift', desc: 'Finish a campaign having spent every star it earned', tier: 'rare' },
  { id: 53, key: 'scouts-honor', name: "Scout's Honor", desc: 'Max the Scout branch', tier: 'common' },
  { id: 54, key: 'front-office', name: 'Front Office', desc: 'Max the Front office branch', tier: 'common' },
  { id: 55, key: 'coachs-son', name: "Coach's Son", desc: 'Max the Coach branch', tier: 'common' },
  { id: 56, key: 'renaissance', name: 'Renaissance', desc: 'Own a node in Scout, Front office and Coach in one campaign', tier: 'common' },
  { id: 57, key: 'the-eye', name: 'The Eye', desc: 'Draft the rated best counter, ten times', tier: 'legendary', hidden: true, nohook: 'no screen rates a draftable player as "the best counter"' },
  // ---- the Machine (1v1 Bid sims inline, so these fire from achMachineWin, not the settlement) ----
  { id: 58, key: 'training-wheels', name: 'Training Wheels', desc: 'Beat The Machine on Rookie in 1v1 Bid', tier: 'common' },
  { id: 59, key: 'turing-test', name: 'Turing Test', desc: 'Beat The Machine on Pro in 1v1 Bid', tier: 'rare' },
  { id: 60, key: 'shark-hunter', name: 'Shark Hunter', desc: 'Beat The Machine on Shark in 1v1 Bid', tier: 'legendary' },
]

export interface Unlock {
  /** ISO date of the unlock. */
  date: string
  /** Campaign attribution: team and mode at the moment it fired. */
  campaign: string
}

interface CampCounters {
  g7Wins: number
  gent: number
  losses: number
  /** Poisoned the moment any series ends in fewer than six games (The Long Way). */
  short: boolean
  /** Wall-clock of the campaign's first settled series (Speedrun measures from here). */
  startTs: number | null
}

interface AchState {
  unlocked: Record<number, Unlock>
  /** Every archetype ever fielded on this profile (The Collector). */
  collector: string[]
  /** Profile-wide count of series wins at fit 75+ (Read the Room). */
  readRoom: number
  camp: Partial<Record<CampaignMode, CampCounters>>
}

const KEY = 'game7.ach.v1'
const freshCamp = (): CampCounters => ({ g7Wins: 0, gent: 0, losses: 0, short: false, startTs: null })
const freshState = (): AchState => ({ unlocked: {}, collector: [], readRoom: 0, camp: {} })

/** In-memory fallback: node (receipts, tests) has no localStorage; the store still works. */
let mem: AchState | null = null
function load(): AchState {
  if (mem) return mem
  try {
    const raw = localStorage.getItem(KEY)
    mem = raw ? { ...freshState(), ...(JSON.parse(raw) as AchState) } : freshState()
  } catch {
    mem = freshState()
  }
  return mem
}
function save(s: AchState) {
  mem = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: the session still counts */
  }
}
/** Receipts/tests only: wipe the in-memory store. */
export function _reset() {
  mem = freshState()
}

type UnlockListener = (def: AchDef) => void
const listeners = new Set<UnlockListener>()
export function onUnlocked(cb: UnlockListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function unlock(s: AchState, id: number, campaign: string): boolean {
  if (s.unlocked[id]) return false
  const def = ACHIEVEMENTS.find((a) => a.id === id)
  if (!def || def.nohook) return false
  s.unlocked[id] = { date: new Date().toISOString(), campaign }
  for (const cb of listeners) cb(def)
  return true
}

export const achState = (): AchState => load()
export const achCount = (): { done: number; total: number } => ({ done: Object.keys(load().unlocked).length, total: ACHIEVEMENTS.length })

/** A campaign reset wipes its counters — unlocks and the profile-wide collector stay. */
export function achResetCampaign(mode: CampaignMode) {
  const s = load()
  delete s.camp[mode]
  save(s)
}

// ---------------------------------------------------------------------------

const WHEEL_P: string[][] = (TEAMSEASONS as { p: string[] }[]).map((t) => t.p)
const avgOvr = (five: Player[]) => five.reduce((a, p) => a + p.ovr, 0) / five.length
const ppgOf = (n: string) => LINES[n]?.ppg ?? 0

/** Everything the detectors read, captured at the moment the series settles. */
export interface SeriesEvent {
  mode: CampaignMode
  /** Attribution label, e.g. "Indiana Clash · death". */
  team: string
  level: number
  five: Player[]
  opponent: Opponent
  result: SeriesResult
  seed: number
  /** Pre-series win probability from the resolver, 0..1 (NaN when unknown). */
  pre: number
  /** The gated plan (death match); null elsewhere. */
  plan: Tactics | null
  /** The pace surpluses and the priced pace margin at sim time (death match). */
  pc: { ours: number; theirs: number; margin: number } | null
  boxCtx: { us: BoxCtx; them: BoxCtx } | null
  assignment: Assignment
  prevProg: Progress
  nextProg: Progress
}

/** The same per-game boxes the Series screen derives — same seed stream, same ctx (r61). */
function perGame(ev: SeriesEvent) {
  const rng = makeRng(ev.seed ^ 0x2545f491)
  const games: { us: ReturnType<typeof gameBoxes>['us']; them: ReturnType<typeof gameBoxes>['them']; usP: PlayerBox[]; themP: PlayerBox[] }[] = []
  for (const g of ev.result.games) {
    const b = gameBoxes(ev.five, ev.opponent.players, LINES, g.us, g.them, rng, ev.boxCtx?.us, ev.boxCtx?.them)
    games.push({ us: b.us, them: b.them, usP: splitBox(ev.five, b.us, ev.boxCtx?.us), themP: splitBox(ev.opponent.players, b.them, ev.boxCtx?.them) })
  }
  return games
}

/** Series settlement: the one moment every detector reads. Called from App.finish(). */
export function achSettleSeries(ev: SeriesEvent) {
  const s = load()
  const camp = (s.camp[ev.mode] ??= freshCamp())
  if (camp.startTs === null) camp.startTs = Date.now()
  const u = (id: number) => unlock(s, id, ev.team)

  const g = ev.result.games
  const won = ev.result.won
  const swept = won && ev.result.losses === 0
  const clearedBefore = ev.prevProg.stars.filter((x) => x > 0).length
  const clearedAfter = ev.nextProg.stars.filter((x) => x > 0).length
  const finished = clearedAfter === ROUNDS
  if (!won) camp.losses++
  if (g.length < 6) camp.short = true

  // ---- the collector counts every man fielded, win or lose ----
  for (const p of ev.five) if (!s.collector.includes(archetype(p))) s.collector.push(archetype(p))
  if (s.collector.length >= 25) u(14)

  // ---- series drama ----
  if (won && ev.pre < 0.4) u(1)
  if (swept && ev.pre < 0.4) u(2)
  if (won && g.length >= 3 && !g[0].won && !g[1].won && !g[2].won) u(3)
  if (won && g.length === 7) {
    camp.g7Wins++
    if (camp.g7Wins >= 3) u(4)
    if (g[6].us - g[6].them === 1) u(5)
  }
  if (won && g.every((x) => x.won && x.us - x.them >= 15)) u(6)
  if (won && ev.result.losses === 1) {
    camp.gent++
    if (camp.gent >= 3) u(8)
  }
  {
    // elimination saves: games we won while the opponent already had three
    let theirWins = 0
    let saves = 0
    for (const x of g) {
      if (theirWins === 3 && x.won) saves++
      if (!x.won) theirWins++
    }
    if (won && saves >= 3) u(9)
  }
  if (!won && g.length >= 3 && g[0].won && g[1].won && g[2].won) u(10)

  // ---- the champions (the map's CHAMP-flagged 26) ----
  if (won && ev.opponent.champion) {
    u(43)
    if (ev.pre < 0.4) u(44)
    if (swept) u(45)
  }

  // ---- draft & roster (all "win with...") ----
  if (won) {
    if (avgOvr(ev.opponent.players) - avgOvr(ev.five) >= 8) u(11)
    if (ev.five.some((p) => p.ovr >= 95) && ev.five.filter((p) => p.ovr < 75).length === 4) u(12)
    if (ev.five.every((p) => p.ovr <= 84)) u(13)
    if (ev.five.filter((p) => p.attrs.height >= 84).length >= 2) u(15)
    if (ev.five.every((p) => p.attrs.height <= 80)) u(16)
    if (ev.five.every((p) => p.attrs.orb + p.attrs.drb >= 80)) u(17)
    if (ev.five.every((p) => p.attrs['3pt'] >= 75)) u(18)
    if (ev.five.every((p) => p.attrs['3pt'] < 45)) u(19)
    if (ev.five.every((p) => p.peak_season < 1995)) u(20)
    if (ev.five.every((p) => p.peak_season >= 2020)) u(21)
    const names = ev.five.map((p) => p.name)
    if (WHEEL_P.some((roster) => names.every((n) => roster.includes(n)))) u(22)
  }

  // ---- tactics mastery (a called plan exists only in the death match) ----
  if (ev.plan) {
    const fit = ev.plan.style === 'balanced' ? null : styleFit(ev.plan.style, ev.five, ev.opponent.players)
    if (won && fit !== null && fit >= 75) {
      s.readRoom++
      if (s.readRoom >= 5) u(24)
    }
    if (won && fit !== null && fit < 45) u(25)
    if (won && ev.plan.tempo === 'slow' && ev.pc && ev.pc.theirs > ev.pc.ours) u(26)
    if (won && ev.plan.scheme === 'switch' && ev.five.every((p) => p.attrs.perdef >= 70)) u(30)
    // MASTERMIND's three categories, as measurable state: the pace call priced positive, the
    // style call priced positive, and the board played was not the naive one.
    if (won && avgOvr(ev.opponent.players) > avgOvr(ev.five) && ev.pc && ev.pc.margin > 0 && stylePts(ev.plan, ev.five, ev.opponent.players) > 0 && ev.assignment !== 'naive') u(31)
    if (won && ev.pre >= 0.5 && ev.plan.tempo === 'slow' && fit !== null) {
      const fits = STYLES.filter((x) => x.key !== 'balanced').map((x) => styleFit(x.key, ev.five, ev.opponent.players))
      if (fit <= Math.min(...fits)) u(33)
    }
  }

  // ---- box score feats (the r61 lines, regenerated on the Series screen's own seed) ----
  {
    const boxes = perGame(ev)
    const theirStar = ev.opponent.players.reduce((a, b) => (ppgOf(b.name) >= ppgOf(a.name) ? b : a))
    const starIdx = ev.opponent.players.indexOf(theirStar)
    // HUNTED: the extra points the board edge paid the hunted attacker, summed over the series
    if (won && ev.plan?.hunt && ev.boxCtx?.us.edges) {
      const e = ev.boxCtx.us.edges
      const hi = e.indexOf(Math.max(...e))
      const extra = boxes.reduce((a, b) => a + b.usP[hi].pts * (1 - 1 / (1 + 0.06 * Math.max(0, e[hi]))), 0)
      if (extra >= 30) u(29)
    }
    boxes.forEach((b, k) => {
      const gameWon = g[k].won
      if (b.usP.some((l) => l.pts >= 50) || b.themP.some((l) => l.pts >= 50)) u(34)
      if (k === 6 && b.usP.some((l) => l.pts >= 10 && l.reb >= 10 && l.ast >= 10)) u(35)
      if (b.themP[starIdx].pts < 12) u(36)
      if (b.us.ast >= 35) u(37)
      if (b.us.stl + b.us.blk >= 15) u(38)
      if (gameWon && b.us.fgm / b.us.fga >= 0.55 && b.us.tpm / Math.max(1, b.us.tpa) >= 0.45 && b.us.ftm / Math.max(1, b.us.fta) >= 0.85) u(39)
      if (gameWon && b.themP[starIdx].fga >= 30 && b.themP[starIdx].pts < 25) u(40)
      if (gameWon && b.usP.some((l) => l.pts >= 40 && l.fga > 0 && l.fgm / l.fga < 0.35)) u(42)
      if (gameWon && b.us.poss >= 115) u(27)
      if (gameWon && g[k].us < 85 && g[k].them < 85) u(28)
    })
  }

  // ---- campaign & economy ----
  if (clearedAfter >= 30 && clearedBefore < 30) {
    u(46)
    if (camp.startTs && Date.now() - camp.startTs <= 45 * 60 * 1000) u(50)
  }
  if (finished) {
    u(47)
    if (camp.losses === 0) u(48)
    if (!camp.short) u(7)
    if (balance(ev.nextProg) === 0 && ev.nextProg.spent > 0) u(52)
  }
  if (won && ev.mode === 'death' && !NODES.some((n) => n.branch === 'Survival' && (ev.nextProg.nodes[n.id] ?? 0) > 0)) u(49)
  metaChecks(s, ev.nextProg, ev.team)

  save(s)
}

/** The cheap checks that can also fire from the staff tree: stars banked, branches owned. */
function metaChecks(s: AchState, prog: Progress, team: string) {
  const u = (id: number) => unlock(s, id, team)
  if (balance(prog) >= 30) u(51)
  const maxed = (b: Branch) => NODES.filter((n) => n.branch === b).every((n) => (prog.nodes[n.id] ?? 0) >= n.ranks)
  if (maxed('Scout')) u(53)
  if (maxed('Front office')) u(54)
  if (maxed('Coach')) u(55)
  const has = (b: Branch) => NODES.some((n) => n.branch === b && (prog.nodes[n.id] ?? 0) > 0)
  if (has('Scout') && has('Front office') && has('Coach')) u(56)
}

/** 1v1 Bid: the human chair beats The Machine. The auction sims inline (no series settlement passes through). */
export function achMachineWin(level: 'rookie' | 'pro' | 'shark') {
  const s = load()
  unlock(s, level === 'rookie' ? 58 : level === 'pro' ? 59 : 60, '1v1 Bid · The Machine')
  save(s)
}

/** Called on every campaign progress commit (staff buys included). */
export function achCheckMeta(prog: Progress, team: string) {
  const s = load()
  metaChecks(s, prog, team)
  save(s)
}
