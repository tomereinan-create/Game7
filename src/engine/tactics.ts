import { GAMBLER_SIGMA, SIGMA } from '../config'
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
  /** Where the shots come from. Priced by the five's own zone balance. */
  style: 'inside' | 'balanced' | 'outside'
  /** Send men to the offensive glass. Pays with rebounders, leaks transition without them. */
  crashOff: boolean
  /** Gang the defensive glass. Pays with rebounders, costs a little rim-running offense. */
  crashDef: boolean
}

export const DEFAULT_TACTICS: Tactics = {
  scorer: null,
  playmaker: null,
  tempo: 'normal',
  style: 'balanced',
  crashOff: false,
  crashDef: false,
}

/** Tempo is a RISK knob, not a value knob: it moves sigma for both teams and nothing else. */
export const TEMPO_SIGMA: Record<Tactics['tempo'], number> = { slow: 8, normal: SIGMA, fast: GAMBLER_SIGMA }

/** A saved plan can name men who have since left the five. The plan survives; the names reset. */
export function reconcileTactics(t: Tactics, roster: string[] | null): Tactics {
  const names = roster ?? []
  return {
    ...t,
    scorer: t.scorer && names.includes(t.scorer) ? t.scorer : null,
    playmaker: t.playmaker && names.includes(t.playmaker) ? t.playmaker : null,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const mean = (five: Player[], f: (p: Player) => number) => (five.length ? five.reduce((t, p) => t + f(p), 0) / five.length : 50)

/** Each tactic's worth in points of spread, itemised so the screen can show its work. */
export function tacticsParts(t: Tactics, five: Player[]): { label: string; pts: number }[] {
  const parts: { label: string; pts: number }[] = []
  const s = five.find((p) => p.name === t.scorer)
  if (s) parts.push({ label: 'main scorer', pts: clamp((s.attrs.volume - 70) / 40, -0.75, 0.75) })
  const pm = five.find((p) => p.name === t.playmaker)
  if (pm) parts.push({ label: 'main playmaker', pts: clamp((pm.attrs.playvol - 65) / 40, -0.75, 0.75) })
  if (t.style !== 'balanced') {
    const lean = mean(five, (p) => Math.max(p.attrs.rim, p.attrs.mid)) - mean(five, (p) => p.attrs['3pt'])
    parts.push({ label: `${t.style} game`, pts: clamp((t.style === 'inside' ? lean : -lean) * 0.02, -0.75, 0.75) })
  }
  if (t.crashOff) parts.push({ label: 'crash the offensive glass', pts: clamp((mean(five, (p) => p.attrs.orb) - 55) * 0.02, -0.5, 0.5) })
  if (t.crashDef) parts.push({ label: 'crash the defensive glass', pts: clamp((mean(five, (p) => p.attrs.drb) - 55) * 0.015, -0.4, 0.4) })
  return parts
}

/** The whole plan as a lineup modifier — the sum of the parts, in the margin's own currency. */
export function tacticsMod(t: Tactics, five: Player[]): Partial<Lineup> {
  return { bonus: tacticsParts(t, five).reduce((a, x) => a + x.pts, 0) }
}
