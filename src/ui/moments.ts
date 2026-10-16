import SHEET from '../data/moments.json'

/**
 * THE ICONIC MOMENTS — posters hung in the gutters beside the campaign ladder (his ask,
 * 2026-10-16: iconic moments "on the side of the campaign to decorate it", made with Higgsfield).
 *
 * The prompt sheet in src/data/moments.json is the one list: scripts/moments/generate.mjs reads it
 * to make the pictures and this file reads it to hang them. Every moment names the TIER it
 * belongs to, and the tier decides two things — where on the trail the poster hangs (inside that
 * tier's band, spread evenly up it, oldest moment lowest) and when it lights up.
 *
 * SEALED UNTIL THE BLOCK FALLS (his ruling, 2026-10-16: "Unlock with progress" — a poster is dark
 * until the player clears its block, then lights up). A poster hangs dark the whole way up its
 * tier and is unveiled the moment the last level of that tier is cleared. Decoration, not a door:
 * nothing here is tappable.
 */
export type Moment = { slug: string; tier: string; era: string; title: string; prompt: string }
export const MOMENTS: readonly Moment[] = SHEET.moments

/**
 * The sheet's tier keys in LADDER ORDER — the order of src/data/campaigns.json, which is the order
 * the `eras` prop reaches the map in. tests/moments.test.ts holds the two lists together.
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
  /** the tier's own name, for the sealed caption ("clear The Champions") */
  eraName: string
  /** which gutter — alternates up the whole trail so no two neighbours share a wall */
  side: 'left' | 'right'
  /** the poster's centre, in the trail's own px (0 is the head of the trail) */
  top: number
  /** the first level of the tier, so the map can give the poster that block's skin */
  first: number
  lit: boolean
}

/** "1998" before "2016"; a moment with no year ("mythical") hangs last, at the top of its tier. */
const yearOf = (era: string) => {
  const n = Number.parseInt(era, 10)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/**
 * Where every poster hangs and whether it is lit. `seam(level)` is the map's own seam (halfway
 * between a level's row and the one below), `height` the trail's full height, so a tier's band is
 * exactly the band its floor paints: the bottom tier runs to the foot, the top one to the head.
 */
export function postersFor(
  eras: readonly { name: string; first: number }[],
  rounds: number,
  stars: readonly number[],
  seam: (level: number) => number,
  height: number,
): Poster[] {
  const out: Poster[] = []
  let side: Poster['side'] = 'left'
  eras.forEach((e, ti) => {
    const key = TIER_KEYS[ti]
    if (!key || e.first > rounds) return
    const next = eras[ti + 1]
    const hasNext = !!next && next.first <= rounds
    const last = hasNext ? next.first - 1 : rounds
    const bottom = ti === 0 ? height : seam(e.first)
    const top = hasNext ? seam(next.first) : 0
    const lit = Array.from({ length: last - e.first + 1 }, (_, k) => stars[e.first - 1 + k] ?? 0).every((s) => s > 0)
    const mine = MOMENTS.filter((m) => m.tier === key).sort((a, b) => yearOf(a.era) - yearOf(b.era))
    mine.forEach((m, k) => {
      // evenly up the band, a gap's worth in from each seam, oldest lowest
      const y = bottom - ((bottom - top) * (k + 1)) / (mine.length + 1)
      out.push({ slug: m.slug, title: m.title, era: m.era, tier: m.tier, eraName: e.name, side, top: y, first: e.first, lit })
      side = side === 'left' ? 'right' : 'left'
    })
  })
  return out
}
