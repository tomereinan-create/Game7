import { usageSurplus } from './offense'
import type { Lineup, Player } from './types'

/**
 * DEATH MATCH TACTICS, picked on the My team screen. Every choice is priced the way the engine
 * prices everything: points of spread, added to the margin as `bonus` (the same term the coach
 * personas and the era handicap use — lineup axes are display, bonus is what the sim feels).
 *
 * THE HOUSE RULES APPLY. No cliffs: every price is a LINE through the personnel, so calling
 * "inside" with an inside five pays and calling it with a shooting five costs, continuously.
 * And nothing here is free: each pick is a fit question, not a stat stick — the whole set
 * ranges about ±3 points of spread between a five coached with the grain and one against it.
 */
export interface Tactics {
  /** The offense runs through him. Pays for a real number one, costs for a man who does not shoot. */
  scorer: string | null
  /** The ball is in his hands. Pays for a lead creator, costs for a finisher miscast as one. */
  playmaker: string | null
  /** Possessions, not quality: fast raises the night's noise for BOTH teams, slow lowers it. */
  tempo: 'slow' | 'normal' | 'fast'
  /**
   * PLAYSTYLES v2 (recal_58). Each style scores a FIT 0-100 from the chosen five, and the price is
   * 0.06 x (fit - 60), clamped +-2.5 — forcing a style the roster cannot run HURTS. Balanced is the
   * free default: no call, no fit, no price.
   */
  style: Style
  /**
   * How the five defends. Matchup is the default and free. Drop pays with a tower behind it and an
   * opponent who cannot shoot; switch is only as good as the worst man caught in it.
   */
  scheme: 'matchup' | 'drop' | 'switch'
  /** Attack their worst defender. Needs a creator to run it, and a victim to point him at. */
  hunt: boolean
  /** Send men to the offensive glass. Pays with rebounders, leaks transition without them. */
  crashOff: boolean
  /** Gang the defensive glass. Pays with rebounders, costs a little rim-running offense. */
  crashDef: boolean
}

export type Style = 'balanced' | 'fiveout' | 'pnr' | 'motion' | 'postup' | 'helio' | 'transition'
export const STYLES: { key: Style; label: string }[] = [
  { key: 'balanced', label: 'balanced' },
  { key: 'fiveout', label: 'five-out' },
  { key: 'pnr', label: 'pick-and-roll' },
  { key: 'motion', label: 'motion' },
  { key: 'postup', label: 'post-up' },
  { key: 'helio', label: 'helio' },
  { key: 'transition', label: 'transition' },
]

export const DEFAULT_TACTICS: Tactics = {
  scorer: null,
  playmaker: null,
  tempo: 'normal',
  style: 'balanced',
  scheme: 'matchup',
  hunt: false,
  crashOff: false,
  crashDef: false,
}

/**
 * PACE (recal_57, Tomer's design ratified) — tempo is a VOLUME-SURPLUS mechanic, replacing the old
 * flat sigma map. Both teams pick; the night's pace is their average. A surplus five has starved
 * shot-takers, so possessions feed it; a deficit five stretches role players, so possessions hurt.
 * It is RELATIVE — fast against a higher-surplus opponent helps THEM — and the margin term is
 * capped at +-2.5 points of spread. Fast also shrinks the night's variance (the favorite's friend);
 * slow adds chaos, the underdog's weapon even at volume parity.
 */
const TEMPO_LVL: Record<Tactics['tempo'], number> = { fast: 1, normal: 0, slow: -1 }
export function pace(self: Tactics['tempo'], opp: Tactics['tempo'], five: Player[], theirs: Player[]) {
  const lvl = (TEMPO_LVL[self] + TEMPO_LVL[opp]) / 2
  const ours = usageSurplus(five)
  const others = usageSurplus(theirs)
  return {
    lvl,
    ours,
    theirs: others,
    margin: clamp(lvl * 0.045 * (ours - others), -2.5, 2.5),
    sigmaMult: lvl > 0 ? 0.94 : lvl < 0 ? 1.08 : 1.0,
  }
}
/** The AI's call: fast when pace favors it, slow when it hurts, and slow at parity as the underdog. */
export function aiTempo(theirs: Player[], five: Player[], underdog: boolean): Tactics['tempo'] {
  const d = usageSurplus(theirs) - usageSurplus(five)
  return d > 2 ? 'fast' : d < -2 ? 'slow' : underdog ? 'slow' : 'normal'
}

/** A saved plan can name men who have since left the five. The plan survives; the names reset. */
export function reconcileTactics(t: Tactics, roster: string[] | null): Tactics {
  const names = roster ?? []
  return {
    ...t,
    scorer: t.scorer && names.includes(t.scorer) ? t.scorer : null,
    playmaker: t.playmaker && names.includes(t.playmaker) ? t.playmaker : null,
    // a save from the inside/outside era carries a style that no longer exists
    style: STYLES.some((x) => x.key === t.style) ? t.style : 'balanced',
  }
}

/**
 * THE PLAYBOOK GATE (his ruling: the Coach branch allows the tactics). Rank 1 opens the men and the
 * tempo, rank 2 the shot diet and the glass, rank 3 the scheme and the hunt. A call beyond the rank
 * is priced as if it were never made — a saved plan survives a respec, it just stops being heard.
 */
export function gateTactics(t: Tactics, rank: number): Tactics {
  return {
    ...t,
    scorer: rank >= 1 ? t.scorer : null,
    playmaker: rank >= 1 ? t.playmaker : null,
    tempo: rank >= 1 ? t.tempo : 'normal',
    style: rank >= 2 ? t.style : 'balanced',
    crashOff: rank >= 2 ? t.crashOff : false,
    crashDef: rank >= 2 ? t.crashDef : false,
    scheme: rank >= 3 ? t.scheme : 'matchup',
    hunt: rank >= 3 ? t.hunt : false,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const mean = (five: Player[], f: (p: Player) => number) => (five.length ? five.reduce((t, p) => t + f(p), 0) / five.length : 50)

/**
 * THE FIT of a style on a five, 0-100, his formulas verbatim (recal_58). Two gaps the round left
 * open are filled here and documented: motion's ball-stopper subtraction is -12 per ISO-shaped star
 * (volume >= 90 with playvol < 50), and post-up's "dominance-bonus presence" is proxied by
 * min(rim, volume) — the same two facts the o_score bonus keys on. Transition's opponent term
 * (their ball security, inverted) needs the matchup, so without one that quarter reads neutral (50).
 */
export function styleFit(style: Style, five: Player[], theirs?: Player[]): number {
  if (!five.length || style === 'balanced') return 60 // priced to zero
  const a = five.map((p) => p.attrs)
  const avg = (f: (x: Player['attrs']) => number) => a.reduce((t, x) => t + f(x), 0) / a.length
  switch (style) {
    case 'fiveout':
      return Math.min(...a.map((x) => x['3pt'])) * 0.6 + avg((x) => x['3pt']) * 0.4
    case 'pnr': {
      const handlers = five.filter((p) => p.attrs.playvol >= 70 && p.attrs.height <= 78)
      const handler = Math.max(0, ...handlers.map((p) => Math.min(p.attrs.playvol, p.attrs.volume)))
      const bigs = five.filter((p) => p.attrs.height >= 80)
      const dive = Math.max(0, ...bigs.map((p) => Math.min(p.attrs.rim, p.attrs.efficiency)))
      const hName = handlers.sort((x, y) => Math.min(y.attrs.playvol, y.attrs.volume) - Math.min(x.attrs.playvol, x.attrs.volume))[0]?.name
      const dName = bigs.sort((x, y) => Math.min(y.attrs.rim, y.attrs.efficiency) - Math.min(x.attrs.rim, x.attrs.efficiency))[0]?.name
      const rest = five.filter((p) => p.name !== hName && p.name !== dName)
      return 0.4 * handler + 0.35 * dive + 0.25 * mean(rest, (p) => p.attrs['3pt'])
    }
    case 'motion': {
      const stoppers = a.filter((x) => x.volume >= 90 && x.playvol < 50).length
      return 0.5 * avg((x) => x.ballsec) + 0.3 * avg((x) => x.playvol) + 0.2 * a.filter((x) => x['3pt'] >= 60).length * 20 - 12 * stoppers
    }
    case 'postup': {
      const bigs = five.filter((p) => p.attrs.height >= 81)
      const post = Math.max(0, ...bigs.map((p) => Math.min(p.attrs.rim, p.attrs.volume)))
      const pName = bigs.sort((x, y) => Math.min(y.attrs.rim, y.attrs.volume) - Math.min(x.attrs.rim, x.attrs.volume))[0]?.name
      return post * 0.7 + mean(five.filter((p) => p.name !== pName), (p) => p.attrs['3pt']) * 0.3
    }
    case 'helio': {
      const star = Math.max(0, ...a.map((x) => Math.min(x.volume, x.playvol)))
      return star * 0.8 + Math.min(...a.map((x) => x.ballsec)) * 0.2
    }
    case 'transition': {
      const opp = theirs?.length ? 100 - mean(theirs, (p) => p.attrs.ballsec) : 50
      return 0.45 * avg((x) => x.perimdisrupt) + 0.3 * avg((x) => x.durability) + 0.25 * opp
    }
  }
}

/** The style's worth: 0.06 x (fit - 60), clamped +-2.5, plus the tempo synergies the round names. */
export function stylePts(t: Tactics, five: Player[], theirs?: Player[]): number {
  if (t.style === 'balanced') return 0
  let pts = clamp(0.06 * (styleFit(t.style, five, theirs) - 60), -2.5, 2.5)
  if (t.style === 'postup' && t.tempo === 'slow') pts += 0.5 // the post grinds best at a crawl
  if (t.style === 'transition') {
    if (t.tempo === 'fast') pts += 0.5 // the run game and the fast night are one call
    if (t.tempo === 'slow') pts /= 2 // calling slow against your own run game halves it
  }
  return pts
}

/**
 * Each tactic's worth in points of spread, itemised so the screen can show its work.
 *
 * The defensive scheme and the hunt are the two calls priced against the OPPONENT as well as the
 * five: drop concedes the arc, so their shooting is half its price; the hunt needs their worst
 * defender to be worth attacking. On the My team screen no opponent is known yet, so those terms
 * are omitted and the full price lands at the draft, where the sim uses it.
 */
export function tacticsParts(t: Tactics, five: Player[], theirs?: Player[]): { label: string; pts: number }[] {
  const parts: { label: string; pts: number }[] = []
  const s = five.find((p) => p.name === t.scorer)
  if (s) parts.push({ label: 'main scorer', pts: clamp((s.attrs.volume - 70) / 40, -0.75, 0.75) })
  const pm = five.find((p) => p.name === t.playmaker)
  if (pm) parts.push({ label: 'main playmaker', pts: clamp((pm.attrs.playvol - 65) / 40, -0.75, 0.75) })
  if (t.style !== 'balanced')
    parts.push({ label: `${STYLES.find((x) => x.key === t.style)?.label ?? t.style} (fit ${Math.round(styleFit(t.style, five, theirs))})`, pts: stylePts(t, five, theirs) })
  if (t.scheme === 'drop') {
    let pts = clamp((Math.max(...five.map((p) => p.attrs.rimprot)) - 75) * 0.02, -0.75, 0.75)
    if (theirs?.length) pts += clamp((55 - mean(theirs, (p) => p.attrs['3pt'])) * 0.02, -0.75, 0.75)
    parts.push({ label: 'drop coverage', pts: clamp(pts, -0.75, 0.75) })
  }
  if (t.scheme === 'switch')
    parts.push({ label: 'switch everything', pts: clamp((Math.min(...five.map((p) => p.attrs.perdef)) - 50) * 0.025, -0.75, 0.75) })
  if (t.hunt) {
    let pts = clamp((Math.max(...five.map((p) => p.attrs.playvol)) - 55) * 0.02, -0.75, 0.4)
    if (theirs?.length) pts += clamp((60 - Math.min(...theirs.map((p) => p.attrs.perdef))) * 0.02, -0.4, 0.4)
    parts.push({ label: 'hunt the mismatch', pts: clamp(pts, -0.75, 0.75) })
  }
  if (t.crashOff) parts.push({ label: 'crash the offensive glass', pts: clamp((mean(five, (p) => p.attrs.orb) - 55) * 0.02, -0.5, 0.5) })
  if (t.crashDef) parts.push({ label: 'crash the defensive glass', pts: clamp((mean(five, (p) => p.attrs.drb) - 55) * 0.015, -0.4, 0.4) })
  return parts
}

/** The whole plan as a lineup modifier — the sum of the parts, in the margin's own currency. */
export function tacticsMod(t: Tactics, five: Player[], theirs?: Player[]): Partial<Lineup> {
  return { bonus: tacticsParts(t, five, theirs).reduce((a, x) => a + x.pts, 0) }
}
