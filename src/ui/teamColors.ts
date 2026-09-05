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
