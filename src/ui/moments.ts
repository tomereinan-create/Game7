import SHEET from '../data/moments.json'

/**
 * THE ICONIC MOMENTS — posters hung in the gutters beside the campaign ladder (his ask,
 * 2026-10-16: iconic moments "on the side of the campaign to decorate it", made with Higgsfield).
 *
 * The prompt sheet in src/data/moments.json is the one list: scripts/moments/generate.mjs reads it
 * to make the pictures and this file reads it to hang them.
 *
 * HIS THREE RULINGS OF 2026-10-19 — "put in the correct place on the campaign. Have each campaign
 * have its own images. Images only unlock as you get to the stage." — are the three fields this
 * file reads off a moment:
 *
 *   · `at`   THE CORRECT PLACE is the level the moment belongs to: the team, in the season, it
 *            happened in — The Block beside Cleveland Cavaliers '16, The Last Shot beside Chicago
 *            Bulls '98; for a moment with no such team on the ladder, the five that carries it
 *            (One Hundred beside the All-time Warriors, the Stepover beside the All-MVPs). It is a
 *            team NAME, not a level number, because the ladder is ordered weakest-first and a
 *            regeneration re-deals it: the poster follows its team wherever the team lands.
 *   · `mode` EACH CAMPAIGN ITS OWN SET: one of the three ladders (Campaign, Salary cap, Death
 *            match). The ladders are the same 150 levels, so a moment hangs on one of them only.
 *   · lit    UNLOCKED ON REACHING THE STAGE: a poster lights the moment its level is open to
 *            play — the level he is on, or any he has already cleared — not when the whole tier
 *            behind it has fallen.
 *
 * A moment with no `at` or no `mode` is on the sheet but not yet on a wall. Decoration, not a door:
 * nothing here is tappable.
 */
export type Mode = 'campaign' | 'salary' | 'death'
export const MODES: readonly Mode[] = ['campaign', 'salary', 'death']
export type Moment = { slug: string; tier: string; era: string; title: string; prompt: string; mode?: string; at?: string }
export const MOMENTS: readonly Moment[] = SHEET.moments

/**
 * The sheet's tier keys in LADDER ORDER — the order of src/data/campaigns.json. A moment's tier is
 * the generator's grouping now, not where it hangs (that is `at`); tests/moments.test.ts still
 * holds the two lists together.
 */
export const TIER_KEYS = ['league', 'champions', 'all-time', 'customs'] as const

/**
 * What the generator leaves behind: public/moments/manifest.json, one entry per moment it has
 * made, with the file it saved. The map reads it once and hangs only the pictures that exist;
 * a moment with no entry wears its typographic face instead (see moments.css).
 */
export type Manifest = Record<string, { status?: string; file?: string }>
export const fileOf = (manifest: Manifest | null, slug: string): string | null => {
  const m = manifest?.[slug]
  return m && m.status === 'completed' && m.file ? m.file : null
}

export type Poster = {
  slug: string
  title: string
  era: string
  tier: string
  /** the level it hangs beside — its skin, its height on the trail, and what unseals it */
  level: number
  /** which gutter — the wall nearer its ticket, unless a poster already stands too close there */
  side: 'left' | 'right'
  /** the poster's centre, in the trail's own px (0 is the head of the trail): its level's ticket */
  top: number
  lit: boolean
}

/**
 * The posters one ladder hangs. `levelOf(team)` is the map's own opponents list (null for a team
 * the ladder does not carry, or carries past `rounds`); `yAt(level)` the y of that level's ticket,
 * so a poster stands level with the stage it belongs to.
 *
 * THE WALL: the gutter NEARER ITS TICKET (`xAt` against the trail's `width`), so the poster is
 * beside its stage and not across the floor from it — unless the last poster on that wall is under
 * `minGap` away, when it takes the other wall if that one is clearer. Without an `xAt` the walls
 * simply alternate up the trail.
 */
export function postersFor(
  mode: Mode,
  levelOf: (team: string) => number | null,
  rounds: number,
  stars: readonly number[],
  yAt: (level: number) => number,
  xAt?: (level: number) => number,
  width = 0,
  /** about one poster's height plus air, in the trail's px */
  minGap = 600,
): Poster[] {
  const first = stars.findIndex((s) => s === 0)
  // the level he is on; past the top of the ladder, everything is reached
  const reached = first === -1 ? Number.POSITIVE_INFINITY : first + 1
  const placed = MOMENTS.flatMap((m) => {
    if (m.mode !== mode || !m.at) return []
    const level = levelOf(m.at)
    return level !== null && level >= 1 && level <= rounds ? [{ m, level }] : []
  }).sort((a, b) => a.level - b.level)
  const last: Record<Poster['side'], number | null> = { left: null, right: null }
  let prev: Poster['side'] = 'right'
  return placed.map(({ m, level }) => {
    const top = yAt(level)
    const gap = (s: Poster['side']) => (last[s] === null ? Number.POSITIVE_INFINITY : Math.abs(last[s]! - top))
    const flip = (s: Poster['side']): Poster['side'] => (s === 'left' ? 'right' : 'left')
    const want: Poster['side'] = xAt && width > 0 ? (xAt(level) < width / 2 ? 'left' : 'right') : flip(prev)
    const side: Poster['side'] = gap(want) < minGap && gap(flip(want)) > gap(want) ? flip(want) : want
    last[side] = top
    prev = side
    return { slug: m.slug, title: m.title, era: m.era, tier: m.tier, level, side, top, lit: level <= reached }
  })
}
