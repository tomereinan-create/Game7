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

/**
 * THE CODE ON THE SCOREBUG — three characters, off a team's name and nothing else.
 *
 * Every real team on the wheel carries a written `ab` (ORL, GSW, BKN) and that always wins. This is
 * for the teams that have none, and all of them are named by hand: the franchise HE names on the
 * team screen — any of 34,099 cities plus a nickname he types — and the two sides of a custom
 * matchup. Both were falling back to "the last word of the name, upper-cased", which puts the
 * NICKNAME on the bug: Salt Lake City Sevens read SEVENS, and every team he ever names in Boston
 * reads the same as every other. A scoreboard code is the CITY. That is the whole rule here.
 *
 * The first version of this took an initial off every word, and it was measured and thrown out:
 * 78% of the world's cities are one word, so it returned two-letter codes for four names in five —
 * BS for Boston Sevens, DN for Denver Nine. So:
 *
 *   one or two words   the first three characters, running on into the second word if the first
 *                      is shorter than three (18 cities are: Bo, Ho, Wa, Of…) — Boston Celtics
 *                      BOS, Portland Trail Blazers POR, Bo Sevens BOS, Dnipropetrovsk W… DNI
 *   three or more      an initial from each of the first three — Los Angeles Lakers LAL, Golden
 *                      State Warriors GSW, New York Knicks NYK, Rio de Janeiro Sevens RDJ
 *
 * Measured over all 34,099 cities against three nicknames: no code shorter than three characters.
 *
 * THE SEASON COMES OFF BOTH ENDS. A card writes it behind the name ("Orlando Magic '26") and the
 * custom-matchup screen writes it in front ("'96 Chicago Bulls"), and a code built out of an
 * apostrophe and two digits names nothing. Punctuation and combining marks are dropped with it, so
 * 's-Hertogenbosch gives SHE and H̱olon gives HOL rather than a mark that renders as half a glyph.
 */
export function teamCode(name: string): string {
  const bare = bareName(name)
    // "'96 Chicago Bulls" — the season written in FRONT, which is how Custom names a loaded team
    .replace(/^\s*'\d\d\s+/, '')
    .trim()
  const words = bare
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (!words.length) return name.trim().toUpperCase()
  const code = words.length >= 3 ? words.slice(0, 3).map((w) => [...w][0]).join('') : [...words.join('')].slice(0, 3).join('')
  return code.toUpperCase()
}
