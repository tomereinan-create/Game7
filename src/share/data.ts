import { ROUNDS } from '../config'
import { bareName, surname, teamCode } from '../engine/names'
import { odds } from '../engine/odds'
import { maxStars, starsFor } from '../engine/resolver'
import type { Lineup, Opponent, Player, SeriesResult } from '../engine/types'
import { SITE } from '../site'
import { printedUrl } from './link'

/**
 * WHAT THE SHARE CARD SAYS (P10), as plain data and plain text — no DOM, so every word of it is
 * pinned by tests/share.test.ts. The canvas (card.ts) draws a `ShareData`; the sheet (ui/ShareSheet)
 * posts the text built here.
 *
 * THE WORDING RULE: nothing on the card or in the text may look like a betting slip. The words
 * "odds", "bet", "lock", "spread", "line", "pot" and "ante" never appear; the pre-series figure is
 * a WIN CHANCE, and it is not printed at all — it only decides whether the UPSET stamp is earned.
 *
 * THE NAME RULE: the product is `SITE.name`, never "Game 7". "Game 7" is only ever the deciding
 * game of a series, which is how it is used below ("Game 7 by 1 point").
 */

/** What the result screen hands over: the Series props this card is built from. */
export interface ShareInput {
  opponent: Pick<Opponent, 'round' | 'team' | 'season' | 'ab'> & { players: Pick<Player, 'name'>[] }
  five: Pick<Player, 'name'>[]
  /** The two rated fives, for the pre-series win chance. */
  mine: Lineup
  theirs: Lineup
  teamName: string
  /** Our scorebug code; `teamCode(teamName)` when absent, as on the screen. */
  teamAb?: string
  result: SeriesResult
  /**
   * The score of each game AS THE SCREEN SHOWS IT. Game 7's final comes off its own tape, so a
   * card that read `result.games` alone could disagree with the filmstrip it was shared from.
   */
  scores?: { us: number; them: number }[]
  sigma?: number
  /** A one-off (Custom, Vs friend, 1v1 bid): no level, no stars. */
  exhibition?: boolean
  /** The screen's own kicker ("1v1 Bid", "Player vs Friend"), when it has one. */
  kicker?: string
}

export type Stamp = 'upset' | 'comeback' | 'by1'

export interface ShareSide {
  /** The name over the five: the club's name, or the opponent's name with its season. */
  name: string
  /** Three-ish characters, as on the scorebug. */
  code: string
  /** "Jordan '96" — a surname and the card's season tag, PG to C as the five was handed over. */
  five: string[]
}

export interface ShareGame {
  n: number
  us: number
  them: number
  won: boolean
}

export interface ShareData {
  /** "Level 42 of 150", "Exhibition", "1v1 Bid". */
  kicker: string
  /** "Best of seven". */
  bestOf: string
  exhibition: boolean
  us: ShareSide
  /** `prose` is the name as a sentence says it: "the 1996 Chicago Bulls". */
  them: ShareSide & { prose: string }
  wins: number
  losses: number
  won: boolean
  toWin: number
  games: ShareGame[]
  /** Stars banked — a campaign win only; null on an exhibition and on a loss, as on the screen. */
  stars: number | null
  maxStars: number
  stamps: Stamp[]
  /** The pre-series win chance, 0..1. Decides UPSET; never printed. */
  winChance: number
  /** The address printed on the card ("buzzerdraft.com"): no share ID, no ref. */
  url: string
}

/** A card's season tag: "Michael Jordan '96" -> "96", "Tony Mitchell '14 (a)" -> "14". */
const TAG = /'(\d\d)(?: \([a-z]\))?$/

/**
 * The names on the card: a surname and the season, "Jordan '96". Two men in one five who share a
 * surname take an initial each ("J. Smith", "D. Smith"), and when the initials are the same too
 * (Jalen and Jaylin Williams) the whole first name, so the card never prints one name twice.
 */
export function cardNames(names: string[]): string[] {
  const rows = names.map((n) => {
    const sur = surname(n)
    const first = bareName(n).trim().split(/\s+/)[0] ?? ''
    return { sur, first: first === sur ? '' : first, tag: n.match(TAG)?.[1] ?? null }
  })
  const many = (xs: string[], x: string) => xs.filter((o) => o === x).length > 1
  const surnames = rows.map((r) => r.sur)
  const initial = rows.map((r) => (r.first ? `${Array.from(r.first)[0]}. ${r.sur}` : r.sur))
  return rows.map((r, i) => {
    const who = !many(surnames, r.sur) ? r.sur : !many(initial, initial[i]) ? initial[i] : r.first ? `${r.first} ${r.sur}` : r.sur
    return r.tag ? `${who} '${r.tag}` : who
  })
}

const YEAR_TAIL = /\s*['’](\d\d)$/
const YEAR_HEAD = /^['’](\d\d)\s+/
const century = (yy: string) => (Number(yy) >= 47 ? 1900 : 2000) + Number(yy)

/**
 * The opponent's name as it heads its five — the season said ONCE, the way the draft says it
 * (`seasonName` in Draft.tsx): The League's levels are a bare club with a `season` beside them and
 * get it stamped on; The Champions' carry the year in the name already and are left alone.
 */
export function teamLabel(team: string, season?: number | null): string {
  const t = team.trim()
  return !season || YEAR_TAIL.test(t) || YEAR_HEAD.test(t) ? t : `${t} '${String(season).slice(2)}`
}

/**
 * The opponent's name as a sentence says it. A team-season reads with its full year in front —
 * "the 1996 Chicago Bulls", whether the year came as a field (The League), on the tail of the name
 * (The Champions, "Denver Nuggets '23") or on its head (Custom, "'96 Chicago Bulls"). A campaign
 * five with no season is still a "the" ("the All-time Lakers"); an exhibition's chair is named as
 * it was typed ("Player 2", "The Machine").
 */
export function proseName(team: string, season?: number | null, exhibition = false): string {
  const t = team.trim()
  const yy = t.match(YEAR_TAIL)?.[1] ?? t.match(YEAR_HEAD)?.[1]
  const bare = t.replace(YEAR_TAIL, '').replace(YEAR_HEAD, '')
  const year = season ?? (yy ? century(yy) : null)
  if (year) return `the ${year} ${bare}`
  if (exhibition || /^the\s/i.test(t)) return t
  return `the ${t}`
}

const BEST_OF: Record<number, string> = { 2: 'three', 3: 'five', 4: 'seven', 5: 'nine' }
/** "Best of seven" for a first-to-four. */
export const bestOfLabel = (toWin: number) => (toWin <= 1 ? 'One game' : `Best of ${BEST_OF[toWin] ?? toWin * 2 - 1}`)

/** Everything the card and the text say, off the result screen's own props. Pure. */
export function shareData(input: ShareInput, url: string = printedUrl()): ShareData {
  const { result: r, opponent, exhibition = false } = input
  const scores = input.scores ?? r.games.map((g) => ({ us: g.us, them: g.them }))
  const games: ShareGame[] = r.games.map((g, i) => ({ n: i + 1, us: scores[i]?.us ?? g.us, them: scores[i]?.them ?? g.them, won: g.won }))
  const winChance = odds(input.mine, input.theirs, input.sigma, r.toWin).series
  return {
    kicker: input.kicker ?? (exhibition ? 'Exhibition' : `Level ${opponent.round} of ${ROUNDS}`),
    bestOf: bestOfLabel(r.toWin),
    exhibition,
    us: { name: input.teamName, code: input.teamAb ?? teamCode(input.teamName), five: cardNames(input.five.map((p) => p.name)) },
    them: {
      name: teamLabel(opponent.team, opponent.season),
      code: opponent.ab ?? teamCode(opponent.team),
      five: cardNames(opponent.players.map((p) => p.name)),
      prose: proseName(opponent.team, opponent.season, exhibition),
    },
    wins: r.wins,
    losses: r.losses,
    won: r.won,
    toWin: r.toWin,
    games,
    stars: !exhibition && r.won ? starsFor(r) : null,
    maxStars: maxStars(r),
    stamps: stampsFor(games, r.won, r.toWin, winChance),
    winChance,
    url,
  }
}

/**
 * THE STAMPS, each earned only by a series that was WON:
 *   UPSET        the pre-series win chance was under 50%
 *   0–3 COMEBACK every game before the last possible elimination was lost (0–3 in a best of
 *                seven, 0–2 in a five) — a best of three has no comeback worth the stamp
 *   WON BY 1     the last game, the one that settled it, was won by a single point
 */
export function stampsFor(games: ShareGame[], won: boolean, toWin: number, winChance: number): Stamp[] {
  if (!won || !games.length) return []
  const out: Stamp[] = []
  if (winChance < 0.5) out.push('upset')
  if (toWin >= 3 && games.length >= toWin - 1 && games.slice(0, toWin - 1).every((g) => !g.won)) out.push('comeback')
  const last = games[games.length - 1]
  if (last.won && last.us - last.them === 1) out.push('by1')
  return out
}

/** The words on a stamp. */
export function stampLabel(s: Stamp, toWin: number): string {
  return s === 'upset' ? 'UPSET' : s === 'comeback' ? `0–${toWin - 1} COMEBACK` : 'WON BY 1'
}

/** ★★☆ */
export const starString = (stars: number, max: number) => '★'.repeat(stars) + '☆'.repeat(Math.max(0, max - stars))

/**
 * THE GRID, COLOUR-BLIND SAFE: blue for a game we won, orange for one we lost — the pair that
 * survives every common colour-vision deficiency, never red against green — and a letter on every
 * square so the colour is never the only thing saying it. "🟦W 🟧L 🟦W 🟦W 🟦W · 4–1"
 */
export function emojiGrid(d: Pick<ShareData, 'games' | 'wins' | 'losses'>): string {
  return `${d.games.map((g) => (g.won ? '🟦W' : '🟧L')).join(' ')} · ${d.wins}–${d.losses}`
}

/** The sentence both texts are built on: "Won 4–3 against the 1996 Chicago Bulls, from 0–3 down — Game 7 by 1 point." */
function sentence(d: ShareData): string {
  const score = `${d.wins}–${d.losses}`
  let s = d.won ? `Won ${score} against ${d.them.prose}` : `Lost ${score} to ${d.them.prose}`
  if (d.stamps.includes('comeback')) s += `, from 0–${d.toWin - 1} down`
  if (d.stamps.includes('by1')) s += ` — Game ${d.games.length} by 1 point`
  return `${s}.`
}

/** The share's first line: "Upset! Won 4–3 against the 1996 Chicago Bulls — Game 7 by 1 point. ★☆☆" */
export function headline(d: ShareData): string {
  const stars = d.stars === null ? '' : ` ${starString(d.stars, d.maxStars)}`
  return `${d.stamps.includes('upset') ? 'Upset! ' : ''}${sentence(d)}${stars}`
}

/**
 * ONE LINE OF PLAIN TEXT for the picture's alt, a screen reader, or a plain copy. The stars are
 * said in words, because "black star, black star, white star" is what a reader makes of ★★☆.
 */
export function altText(d: ShareData): string {
  const upset = d.stamps.includes('upset') ? ' An upset.' : ''
  const stars = d.stars === null ? '' : ` ${d.stars} of ${d.maxStars} stars.`
  return `${sentence(d)}${upset}${stars}`
}

/**
 * THE SHARE TEXT: the headline, the grid, the invitation, the link. `link: false` leaves the link
 * off for a target that carries it separately (the native sheet's `url`, X's `url=`), so it is
 * never posted twice.
 */
export function shareText(d: ShareData, link: string, withLink = true): string {
  return [headline(d), emojiGrid(d), `Play me in ${SITE.name}`, ...(withLink ? [link] : [])].join('\n')
}

/** X's post composer, pre-filled: the text without the link, and the link as X's own url. */
export function xIntent(d: ShareData, link: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(shareText(d, link, false))}&url=${encodeURIComponent(link)}`
}

/** "buzzer-draft-4-3-story.png" */
export function fileName(d: Pick<ShareData, 'wins' | 'losses'>, format: 'story' | 'wide'): string {
  const slug = SITE.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'share'
  return `${slug}-${d.wins}-${d.losses}-${format}.png`
}
