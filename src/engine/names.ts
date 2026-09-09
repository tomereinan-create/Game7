/**
 * How a card's name is shortened, in one place.
 *
 * A card is a man AND a season — "Marvin Bagley III '26" — so every screen that wants a surname has
 * to drop the season first and then take the family name. Both halves were being got wrong, in two
 * different ways, by four separate copies of the logic:
 *
 *   E16 (2026-09-09)  the jersey, the scorebug and the tactics panel took the LAST token, so a
 *                     generational suffix became the whole name: Marvin Bagley III ran out with
 *                     "III" on his back. 105 cards across 27 men are affected — every Porter Jr.,
 *                     Jackson Jr., Payton II, Murphy III, Nance Jr., Hardaway Jr.
 *   the Game 7 tape   took everything after the FIRST token, which keeps the season: the ticker
 *                     read "Maxey '26 boards it".
 *
 * `surname` answers both: strip the season, strip a trailing suffix, take what is left of the
 * family name — and keep the suffix attached when it is all that separates two men.
 */

/** Generational suffixes that are not a family name. */
const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i

/** "Marvin Bagley III '26" -> "Marvin Bagley III". The season leaves; the man does not. */
export const bareName = (name: string) => name.replace(/ '\d\d( \([a-z]\))?$/, '')

/**
 * The name a jersey, a scorebug or a play-by-play line wears.
 *
 * "Marvin Bagley III '26" -> "Bagley III"    (not "III")
 * "Shai Gilgeous-Alexander '25" -> "Gilgeous-Alexander"
 * "Tyrese Maxey '26" -> "Maxey"              (not "Maxey '26")
 * "Nenê '13" -> "Nenê"                       (a one-word name is the whole of it)
 */
export function surname(name: string): string {
  const parts = bareName(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? name
  const tail = parts[parts.length - 1]
  if (!SUFFIX.test(tail)) return tail
  // a suffix rides with the family name in front of it, and is never the name on its own
  const family = parts[parts.length - 2]
  return family ? `${family} ${tail}` : tail
}

/** The same, upper-cased, for a shirt back or a scorebug. */
export const surnameCaps = (name: string) => surname(name).toUpperCase()
