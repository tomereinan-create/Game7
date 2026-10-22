import { decompose } from '../engine/resolver'
import type { Lineup, SeriesResult } from '../engine/types'

/**
 * CHALLENGE LINKS (P11). Every shared result is also a playable link: `#c=<code>` carries both fives,
 * the two rated lineups exactly as the night was priced (a plan or a pace call included), the noise
 * and the series' seed. The engine is deterministic, so the recipient can call the winner, watch the
 * very series that was shared play out game by game, and then take their own spin at the same
 * opponent — "your turn: beat it".
 *
 * In the HASH, not the query: a hash never reaches the server, so every challenge link is the same
 * static page to a CDN, and nothing about a run lands in a request log.
 *
 * The code is base64url of a compact JSON, synchronous (the share sheet builds it while it renders).
 * About 700 characters for two fives — well inside any link a chat app will carry.
 */
export interface ChallengeSide {
  /** The name over the five. */
  n: string
  /** The scorebug's three letters. */
  ab: string
  /** The five, by card name, PG to C. */
  p: string[]
  /** A real opponent's season, for "Chicago Bulls '96". */
  y?: number
}
export interface Challenge {
  v: 1
  a: ChallengeSide
  b: ChallengeSide
  /** The two lineups, each as [talent, in, out, id, pd, off, drtg, net, bonus]. */
  m: number[]
  t: number[]
  /** The noise the series was simmed at. */
  g: number
  /** The series' seed. */
  s: number
  /** Games to win (4 = best of seven). */
  w: number
  /** The sender's result, so a tampered or stale code can be caught: the score as "4-3". */
  r: string
}

const KEYS = ['talent', 'in', 'out', 'id', 'pd', 'off', 'drtg', 'net', 'bonus'] as const
const round = (x: number) => Math.round(x * 1e9) / 1e9
export const packLineup = (l: Lineup) => KEYS.map((k) => round(l[k]))
export const unpackLineup = (a: number[]): Lineup => Object.fromEntries(KEYS.map((k, i) => [k, Number(a[i]) || 0])) as unknown as Lineup

const enc = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const dec = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '==='.slice((t.length + 3) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeChallenge(c: Challenge): string {
  return enc(JSON.stringify(c))
}

/**
 * THE BOUNDS A REAL NIGHT LIVES IN (the live check, 2026-10-22: a hand-made code with g=1e308 froze
 * the tab — Game 7's tape loops once per made basket — g=1000 played Game 7 at 12–354, and nine 1e308s
 * printed "7.25e+307" chips). Measured over the pool: every packed number sits inside 0..141 or
 * -12..31, the most lopsided five against the least is a 31-point spread, and the noise is 10 times
 * a plan's 0.94..1.08 (the slow death-match night is 10.8). Each bound is about twice the real one.
 */
const MAX_VALUE = 500
const MAX_SPREAD = 60
const SIGMA_RANGE = [5, 20] as const

export function decodeChallenge(code: string): Challenge | null {
  try {
    const c = JSON.parse(dec(decodeURIComponent(code))) as Challenge
    const side = (x: ChallengeSide) =>
      x &&
      typeof x.n === 'string' &&
      x.n.length <= 60 &&
      typeof x.ab === 'string' &&
      x.ab.length <= 5 &&
      Array.isArray(x.p) &&
      x.p.length === 5 &&
      x.p.every((n) => typeof n === 'string') &&
      (x.y === undefined || (Number.isInteger(x.y) && x.y > 1900 && x.y < 2200))
    const lineup = (a: unknown) => Array.isArray(a) && a.length === 9 && a.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= MAX_VALUE)
    if (c.v !== 1 || !side(c.a) || !side(c.b) || !lineup(c.m) || !lineup(c.t)) return null
    if (!Number.isInteger(c.s) || c.s <= 0 || c.s > 0xffffffff || !Number.isInteger(c.w) || c.w < 1 || c.w > 4) return null
    if (typeof c.g !== 'number' || !(c.g >= SIGMA_RANGE[0] && c.g <= SIGMA_RANGE[1])) return null
    if (Math.abs(decompose(unpackLineup(c.m), unpackLineup(c.t)).total) > MAX_SPREAD) return null
    return c
  } catch {
    return null
  }
}

/** The challenge a settled series makes, or null when it cannot be replayed (no seed). */
export function challengeOf(x: {
  teamName: string
  teamAb: string
  five: { name: string }[]
  opponent: { team: string; ab?: string; season?: number; players: { name: string }[] }
  mine: Lineup
  theirs: Lineup
  sigma: number
  seed: number
  result: SeriesResult
}): Challenge | null {
  if (!x.seed || x.five.length !== 5 || x.opponent.players.length !== 5) return null
  return {
    v: 1,
    a: { n: x.teamName, ab: x.teamAb, p: x.five.map((p) => p.name) },
    b: { n: x.opponent.team, ab: x.opponent.ab ?? x.opponent.team.slice(0, 3).toUpperCase(), p: x.opponent.players.map((p) => p.name), ...(x.opponent.season ? { y: x.opponent.season } : {}) },
    m: packLineup(x.mine),
    t: packLineup(x.theirs),
    g: x.sigma,
    s: x.seed >>> 0,
    w: x.result.toWin,
    r: `${x.result.wins}-${x.result.losses}`,
  }
}

/** The challenge in this address (`#c=`, or `?c=` from an older link), read once. */
export function challengeFromUrl(href: string): Challenge | null {
  const u = new URL(href)
  const h = /(?:^#|&)c=([^&]+)/.exec(u.hash)
  const code = h ? h[1] : u.searchParams.get('c')
  return code ? decodeChallenge(code) : null
}
