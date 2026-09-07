/**
 * Team colours for the campaign map's tickets.
 *
 * Both map skins are built from the SAME four values per team, so a colour is stated once:
 *   - Arena Nights (the first tier) paints the whole ticket `linear-gradient(150deg, primary,
 *     deep)` and runs `accent` down the stub's left edge.
 *   - Hardwood Prime (every tier after) keeps the ticket cream paper and gives it a
 *     `linear-gradient(90deg, primary, deep)` header band, lettered in `ink`.
 *
 * `deep` is the same hue driven down to near-black — it is what gives the ticket its rake under
 * the lights. `accent` is the second club colour (the stripe); `ink` is whatever reads on `primary`.
 */
export interface TeamColor {
  primary: string
  deep: string
  accent: string
  ink: string
}

/** The fallback: the app's own ice-blue, for any abbreviation not named below. */
const NEUTRAL: TeamColor = { primary: '#2b3550', deep: '#10141f', accent: '#a6cbe9', ink: '#ffffff' }

/**
 * The 31 franchises the ladder reaches (SEA included — the champion tier still plays the Sonics),
 * then the concept fives of the All-Time and Customs tiers. WAS, IND, BRK and SAC are lifted
 * verbatim from the artboard; the rest are club colours.
 */
const TEAMS: Record<string, TeamColor> = {
  ATL: { primary: '#e03a3e', deep: '#4c0f11', accent: '#c1d32f', ink: '#ffffff' },
  BOS: { primary: '#007a33', deep: '#02240f', accent: '#bb9753', ink: '#ffffff' },
  BRK: { primary: '#2b2f36', deep: '#0c0d10', accent: '#f2f3f5', ink: '#ffffff' },
  CHI: { primary: '#ce1141', deep: '#3f0512', accent: '#111111', ink: '#ffffff' },
  CHO: { primary: '#1d1160', deep: '#0a0524', accent: '#00788c', ink: '#ffffff' },
  CLE: { primary: '#860038', deep: '#2c0012', accent: '#fdbb30', ink: '#ffffff' },
  DAL: { primary: '#00538c', deep: '#00182a', accent: '#b8c4ca', ink: '#ffffff' },
  DEN: { primary: '#0e2240', deep: '#050b16', accent: '#fec524', ink: '#fec524' },
  DET: { primary: '#c8102e', deep: '#3d0510', accent: '#1d42ba', ink: '#ffffff' },
  GSW: { primary: '#1d428a', deep: '#08152e', accent: '#ffc72c', ink: '#ffc72c' },
  HOU: { primary: '#ce1141', deep: '#3f0512', accent: '#c4ced4', ink: '#ffffff' },
  IND: { primary: '#1c3f8f', deep: '#0b1c44', accent: '#fdbb30', ink: '#fdbb30' },
  LAC: { primary: '#c8102e', deep: '#3d0510', accent: '#1d428a', ink: '#ffffff' },
  LAL: { primary: '#552583', deep: '#1c0b2c', accent: '#fdb927', ink: '#fdb927' },
  MEM: { primary: '#5d76a9', deep: '#12173f', accent: '#f5b112', ink: '#ffffff' },
  MIA: { primary: '#98002e', deep: '#2f0010', accent: '#f9a01b', ink: '#ffffff' },
  MIL: { primary: '#00471b', deep: '#001709', accent: '#eee1c6', ink: '#eee1c6' },
  MIN: { primary: '#0c2340', deep: '#040b16', accent: '#78be20', ink: '#ffffff' },
  NOP: { primary: '#0c2340', deep: '#040b16', accent: '#c8102e', ink: '#ffffff' },
  NYK: { primary: '#006bb6', deep: '#00223a', accent: '#f58426', ink: '#ffffff' },
  OKC: { primary: '#007ac1', deep: '#00263d', accent: '#ef3b24', ink: '#ffffff' },
  ORL: { primary: '#0077c0', deep: '#00253d', accent: '#c4ced4', ink: '#ffffff' },
  PHI: { primary: '#006bb6', deep: '#00223a', accent: '#ed174c', ink: '#ffffff' },
  PHO: { primary: '#1d1160', deep: '#0a0524', accent: '#e56020', ink: '#ffffff' },
  POR: { primary: '#e03a3e', deep: '#4c0f11', accent: '#f0f1f2', ink: '#ffffff' },
  SAC: { primary: '#5a2d81', deep: '#3a1c55', accent: '#c9b3e6', ink: '#ffffff' },
  SAS: { primary: '#8a949b', deep: '#1c1f22', accent: '#000000', ink: '#0c0d10' },
  SEA: { primary: '#00653a', deep: '#001f12', accent: '#ffc200', ink: '#ffc200' },
  TOR: { primary: '#ce1141', deep: '#3f0512', accent: '#b4975a', ink: '#ffffff' },
  UTA: { primary: '#002b5c', deep: '#000d1c', accent: '#f9a01b', ink: '#ffffff' },
  WAS: { primary: '#c8102e', deep: '#4a0812', accent: '#e8ecf1', ink: '#ffffff' },

  /* The clubs that moved or were renamed. The pool's stat lines carry the abbreviation the man
     actually played under (NJN, WSB, CHH, VAN...), and so do 103 of the wheel's team-seasons, so
     without these the '96 Nets and the '78 Bullets were both painted the fallback ice-blue. Each
     one is its OWN club, not its successor's: the Bullets are not the Wizards. */
  NJN: { primary: '#002a60', deep: '#000d1f', accent: '#c8102e', ink: '#ffffff' },
  WSB: { primary: '#002b5c', deep: '#000d1c', accent: '#e31837', ink: '#ffffff' },
  CHH: { primary: '#00778b', deep: '#00252b', accent: '#280071', ink: '#ffffff' },
  CHA: { primary: '#2f598c', deep: '#0f1d2e', accent: '#f26532', ink: '#ffffff' },
  NOH: { primary: '#00778b', deep: '#00252b', accent: '#b4975a', ink: '#ffffff' },
  NOK: { primary: '#00778b', deep: '#00252b', accent: '#b4975a', ink: '#ffffff' },
  KCK: { primary: '#0b3d91', deep: '#04142f', accent: '#e6b325', ink: '#ffffff' },
  VAN: { primary: '#00677e', deep: '#001f26', accent: '#bc7844', ink: '#ffffff' },
  SDC: { primary: '#c8102e', deep: '#3d0510', accent: '#f2a900', ink: '#ffffff' },

  /* All-Time — the decade fives read as their decade, the honour fives as metal. */
  '80s': { primary: '#b5651d', deep: '#391e08', accent: '#ffcf7d', ink: '#ffffff' },
  '90s': { primary: '#7b2d8e', deep: '#270d2e', accent: '#f2c14e', ink: '#ffffff' },
  '00s': { primary: '#2a6f8f', deep: '#0c222c', accent: '#9fd6ea', ink: '#ffffff' },
  '10s': { primary: '#1f7a5a', deep: '#08261c', accent: '#8fe0c0', ink: '#ffffff' },
  ANBA: { primary: '#8a6a1f', deep: '#2c2109', accent: '#ffd97a', ink: '#ffffff' },
  '1ST': { primary: '#9a7b23', deep: '#2f250a', accent: '#ffe08a', ink: '#ffffff' },
  '2ND': { primary: '#6f7378', deep: '#212326', accent: '#d9dde1', ink: '#ffffff' },
  ADEF: { primary: '#2f4a6b', deep: '#0e1722', accent: '#a6cbe9', ink: '#ffffff' },
  HOF: { primary: '#7a5c12', deep: '#261c05', accent: '#f6d47a', ink: '#ffffff' },
  EAST: { primary: '#123d7a', deep: '#061428', accent: '#7fb2f0', ink: '#ffffff' },
  WEST: { primary: '#8f2320', deep: '#2d0b0a', accent: '#f0a08a', ink: '#ffffff' },
  INTL: { primary: '#1c6b6b', deep: '#082222', accent: '#8ee0e0', ink: '#ffffff' },

  /* Customs — the skill and award fives take the colour of the thing they are best at. */
  OFF: { primary: '#c05a1e', deep: '#3d1a08', accent: '#ffb36b', ink: '#ffffff' },
  DEF: { primary: '#26506e', deep: '#0c1a24', accent: '#a6cbe9', ink: '#ffffff' },
  RIM: { primary: '#a33224', deep: '#33100b', accent: '#ffab8f', ink: '#ffffff' },
  MID: { primary: '#8a6a2f', deep: '#2c210f', accent: '#f0cf94', ink: '#ffffff' },
  '3PT': { primary: '#2e5fa3', deep: '#0f1e34', accent: '#9dc0f0', ink: '#ffffff' },
  PASS: { primary: '#3f7a4a', deep: '#142718', accent: '#a8e0b4', ink: '#ffffff' },
  EFF: { primary: '#6b3f8a', deep: '#22142c', accent: '#cfa8e6', ink: '#ffffff' },
  BLK: { primary: '#2b3550', deep: '#0e1220', accent: '#9fb4e0', ink: '#ffffff' },
  STOP: { primary: '#1f5c52', deep: '#0a1e1a', accent: '#8ed6c8', ink: '#ffffff' },
  GLAS: { primary: '#5a6270', deep: '#1c2027', accent: '#c9d2de', ink: '#ffffff' },
  IRON: { primary: '#6e5a3f', deep: '#231d14', accent: '#d6c19a', ink: '#ffffff' },
  DPOY: { primary: '#2f4a6b', deep: '#0e1722', accent: '#a6cbe9', ink: '#ffffff' },
  ROOK: { primary: '#4a7a2f', deep: '#17270f', accent: '#b8e08e', ink: '#ffffff' },
  SOPH: { primary: '#3f6b7a', deep: '#142228', accent: '#a8d2e0', ink: '#ffffff' },
  ROY: { primary: '#4a7a2f', deep: '#17270f', accent: '#b8e08e', ink: '#ffffff' },
  MIP: { primary: '#8a5a1f', deep: '#2c1d09', accent: '#e6bb7a', ink: '#ffffff' },
  '6MOY': { primary: '#7a3f5a', deep: '#27141d', accent: '#e0a8c2', ink: '#ffffff' },
}

/** The ticket's colours, by the abbreviation the level map already prints on the stub. */
export const teamColor = (ab: string | undefined): TeamColor => (ab ? (TEAMS[ab] ?? NEUTRAL) : NEUTRAL)

/**
 * Relative luminance of a #rrggbb, 0 (black) to 1 (white). Only ever asked about club colours,
 * so the sRGB gamma step is skipped: the two questions below are "is this near-black", and a
 * linear ramp answers that as well as the exact curve does.
 */
const lum = (hex: string) => {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const v = parseInt(n, 16)
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255
}

/**
 * USER MODE'S CLUB CARD (the design bundle's option B): the whole ticket is the club gradient, so
 * the two things printed on it — the lettering and the stripe down its edge — have to survive
 * clubs whose own colours are near-black.
 *
 * `darkInk` is a club that letters in near-black (San Antonio). Its card flips to a LIGHT scrim
 * with ink type instead of the dark scrim with cream type every other club takes.
 * `edge` is the stripe. A near-black accent (Chicago's `#111`, San Antonio's `#000`) is invisible
 * against the floor and against its own deep, so it swaps to cream — or, on a light-scrim card,
 * to the same near-black the type is set in.
 */
export function cardInk(c: TeamColor): { darkInk: boolean; edge: string } {
  const darkInk = lum(c.ink) < 0.35
  const edge = lum(c.accent) < 0.06 ? (darkInk ? '#0c0d10' : '#f2ece0') : c.accent
  return { darkInk, edge }
}

/* ==========================================================================
   THE PLAYER CARD'S TERMINAL (Claude Design direction 1b, "Scout terminal"),
   lit in the man's own club — his ruling: "Use 1b, but for each player his
   team colors."

   1b was drawn once, in phosphor green: a near-black ground, three lightnesses
   of one hue for the type, and a second colour (amber) reserved for the things
   that are LOCKED — the peak season, the OVR box, [ESC]. That is not a green
   design; it is a TWO-COLOUR design that happened to be drawn in green. Every
   club in the table already has exactly those two colours, so the card takes
   the ramp from `primary` and the highlight from `accent`, and Milwaukee reads
   in green, Utah in navy, the Lakers in purple and gold.

   The ramp is built in HSL rather than by mixing the hex, because the clubs
   are not equally bright: Milwaukee's #00471b is nearly black and San
   Antonio's #8a949b is nearly white, and mixing either one toward the ground
   gives type you cannot read. Fixing the HUE and STATING the lightness gives
   every club the same legibility — the caption step sits at 56% on a 5% ground
   (about 7:1) whatever club it belongs to.
   ========================================================================== */

/** #rrggbb (or #rgb) to HSL, h in 0–360 and s/l in 0–100. */
function toHsl(hex: string): { h: number; s: number; l: number } {
  const raw = hex.replace('#', '')
  const n = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const v = parseInt(n, 16)
  const r = ((v >> 16) & 255) / 255
  const g = ((v >> 8) & 255) / 255
  const b = (v & 255) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  const l = (mx + mn) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = h * 60
    if (h < 0) h += 360
  }
  return { h, s: s * 100, l: l * 100 }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The card's local token override: the app's OWN variable names, restated in the club's hue.
 *
 * Naming the app's tokens rather than inventing a parallel set is what makes this cheap — the
 * season strip, the heat hexagon, the CLOSE button and every hairline inside the card are already
 * written against `--line`, `--ink`, `--you`; redefining those on the card element re-lights all
 * of them at once and none of those components had to learn about clubs. (The court floor does
 * the same trick with `--mine` / `--you` for a scouted five.)
 *
 * `--you` is the club's PRIMARY family — the phosphor: the readouts, the attribute bars, the hex.
 * `--pct-acc` is the SECOND colour, and it is spent only on what 1b spends amber on: the peak
 * chip, the OVR box, [ESC], the status word.
 */
export function terminalSkin(c: TeamColor): Record<string, string> {
  const P = toHsl(c.primary)
  const A0 = toHsl(c.accent)
  // An achromatic near-black second colour (Chicago's #111, San Antonio's #000) has no hue to
  // lift into a highlight, so it falls back to the app's cream — the same escape `cardInk` makes
  // for the ticket stripe, decided for a dark ground instead of a club gradient.
  const A = A0.s < 12 && A0.l < 25 ? toHsl('#e8e2d6') : A0
  // A club whose colour is a grey (San Antonio, Brooklyn) still gets a hue, just a quiet one, so
  // its terminal reads as steel rather than as a bug; a neon club is pulled back off the ceiling.
  const s = clamp(P.s, 20, 68)
  const as = clamp(A.s, 34, 88)
  const g = (sat: number, l: number) => `hsl(${P.h.toFixed(0)} ${Math.min(sat, s).toFixed(0)}% ${l}%)`
  const a = (l: number) => `hsl(${A.h.toFixed(0)} ${as.toFixed(0)}% ${l}%)`
  return {
    /* the room */
    '--bg': g(45, 5),
    '--panel': g(42, 7),
    '--surface': g(42, 8.5),
    '--surface-2': g(40, 12),
    '--line': g(38, 17),
    '--line-2': g(38, 23),
    '--line-3': g(34, 34),
    '--divider': g(38, 14),
    /* the ink — three steps of the one hue, exactly as 1b prints it */
    '--faint': g(26, 56),
    '--muted-2': g(26, 56),
    '--muted': g(28, 63),
    '--ink-2': g(34, 80),
    '--ink': g(30, 91),
    /* the phosphor */
    '--you': g(72, 62),
    '--you-hi': g(72, 74),
    '--you-tint': g(45, 13),
    '--you-line': g(45, 38),
    '--you-ink': g(45, 7),
    /* what is locked */
    '--pct-acc': a(66),
    '--pct-acc-hi': a(78),
    '--pct-acc-line': a(42),
    '--pct-acc-tint': a(13),
  }
}

/* ==========================================================================
   YOUR OWN CLUB (his ruling: "Allow me to pick my team colors when starting
   a campaign").

   Every side on the ladder has worn its own two colours since the tickets
   were painted; YOUR five stood on franchise blue whoever you said you were.
   The campaign carries a KIT now — two colours picked on the name screen —
   and it is turned into the SAME `TeamColor` the table above hands out, so
   every surface that already knows how to wear a club (the court's busts and
   rings, the ticket, the terminal) takes yours without learning a new type.

   Two colours are picked and the other two are derived, exactly as the table
   states them: `deep` is the primary driven down to near-black, which is what
   gives a club its rake under the lights, and `ink` is whatever reads on the
   primary. Asking for four would be asking him to art-direct a gradient.
   ========================================================================== */

/** What the campaign stores: the two colours a kit is actually chosen as. */
export interface Kit {
  primary: string
  accent: string
}

/** The kits offered on the name screen. Ice is the app's own, and the default — a save that never picked reads as it always did. */
export const KITS: { name: string; kit: Kit }[] = [
  { name: 'Ice', kit: { primary: '#2b3550', accent: '#a6cbe9' } },
  { name: 'Royal', kit: { primary: '#1d428a', accent: '#ffc72c' } },
  { name: 'Forest', kit: { primary: '#007a33', accent: '#bb9753' } },
  { name: 'Crimson', kit: { primary: '#ce1141', accent: '#f2ece0' } },
  { name: 'Purple', kit: { primary: '#552583', accent: '#fdb927' } },
  { name: 'Teal', kit: { primary: '#00778b', accent: '#f2c14e' } },
  { name: 'Orange', kit: { primary: '#e56020', accent: '#141821' } },
  { name: 'Navy', kit: { primary: '#0c2340', accent: '#78be20' } },
  { name: 'Wine', kit: { primary: '#7b1d3a', accent: '#d9b26b' } },
  { name: 'Steel', kit: { primary: '#55606e', accent: '#e8ecf1' } },
  { name: 'Midnight', kit: { primary: '#14161c', accent: '#d64545' } },
  { name: 'Gold', kit: { primary: '#c9a227', accent: '#14161c' } },
]

/** The kit a fresh campaign starts in — the app's own ice-blue, which is what an unpainted team already wore. */
export const DEFAULT_KIT: Kit = KITS[0].kit

/**
 * A picked kit as a whole club. `deep` keeps the primary's hue and takes its lightness to the
 * floor — a fixed near-black would flatten every kit to the same gradient — and `ink` flips to
 * near-black on a primary bright enough that cream would disappear on it (Gold, Steel).
 */
export function kitColor(kit: Kit): TeamColor {
  const p = toHsl(kit.primary)
  const l = Math.min(9, Math.max(2.5, p.l * 0.22))
  return {
    primary: kit.primary,
    deep: `hsl(${p.h.toFixed(0)} ${Math.min(p.s, 60).toFixed(0)}% ${l.toFixed(1)}%)`,
    accent: kit.accent,
    ink: lum(kit.primary) > 0.6 ? '#0c0d10' : '#ffffff',
  }
}

/** The campaign's own colours, or null for a save from before the kit existed — those keep the blue floor. */
export const myColor = (team: { colors?: Kit } | null | undefined): TeamColor | null =>
  team?.colors ? kitColor(team.colors) : null
