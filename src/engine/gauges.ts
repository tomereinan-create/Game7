import { ratings100 } from './offense'
import type { Player } from './types'

/**
 * TEAM GAUGES on the ALL-TIME SCALE (recal_71, his ruling: "Instead of scale 1-99 make it more
 * balanced. 99 should be one of the greatest offense ever (2017 warriors)" — and, folded in,
 * "Do the same for DEF, 99 is 2004 pistons").
 *
 * THE DEF SUMMIT MOVED AT recal_94. His ruling, verbatim: "Move the summit to Bulls '96". It
 * supersedes the DEF half of recal_71 quoted above ("Do the same for DEF, 99 is 2004 pistons"),
 * which he had held since r71 and which recal_94 kept until he ruled. The reason it was put to
 * him: recal_94's defence reset (anchor capped at 99 inside didx, the `cover` refund and the
 * discipline penalty removed) moved drtgRef, and on the new scale the Pistons '04 five read 70th
 * of the 1,255 fieldable team-seasons, so pinning 99 to them flattened the top 5.5% of the dial —
 * 76 fives clamped there. With the summit on the Bulls '96, NOTHING clamps: the dial's top is a
 * single five again and the Pistons '04 read what the honest scale gives them (DEF 83).
 * The OFF half of recal_71 is untouched: 99 is still the 2017 Warriors.
 *
 * This supersedes recal_64's within-season percentile for BOTH dials: a team no longer reads 99
 * for being the best of a weak season — 99 is reserved for the all-time summits, and the owner
 * named them. OFF 99 = the 2017 Warriors' best legal five (offRaw 137.67; the one five above it,
 * Suns '07, clamps to 99, the same way the card band clamps past its summit). DEF 99 = the 1996
 * Bulls' best legal five (drtgRef 107.4739, the all-time best — nothing clamps).
 *
 * THE MAPPING is two-slope linear around the all-time median (the codebase's knee convention):
 * [min..median] -> [1..50], [median..summit] -> [50..99], clamped 1..99. "More balanced" is the
 * ruling's own word: the median five of 47 seasons reads 50 by construction, no era pins to a
 * rail (every era spans widely inside the global range), and the summit is occupied by exactly
 * the teams the owner named. Constants are FROZEN from the full 1,255-five wheel sweep
 * (scripts/gauge71.ts re-derives them; re-run it after any engine change that moves offRaw).
 *
 * LAYERS, kept decoupled on purpose: this is the display/gauge scale ONLY. The resolver and
 * defenseVs math are untouched. recal_60's REF_DRTG intercept and recal_67's card-side x1.03 /
 * DEF_TOP live in their own layers (ratings100's 0-100 ints and the d_ovr card band) and
 * survive there; the gauge simply no longer routes through either.
 */

// frozen anchors (scripts/gauge71.ts, v68 pool, r69 wheel; OFF side re-derived per the r71 law
// after recal_74's ORB-scale halving lowered the league level — GSW '17 rose to all-time rank 3
// and still reads 99 exactly; the DEF distribution did not move):
const OFF_MIN = 104.36 // the all-time worst wheel five
const OFF_MID = 123.32 // the all-time median five reads 50 (today's sweep reads 123.25 — see recal_94's COST)
const OFF_TOP = 137.67 // Golden State Warriors '17 — the named OFF summit reads 99
// DEF side RE-FROZEN by recal_94 (scripts/gauge71.ts / scripts/diag-team/gauge94.ts, same 1,255-five
// wheel sweep) after the defenseVs reset moved drtgRef: the anchor is capped at 99 inside didx, the
// `cover` refund and the discipline penalty are gone, and the weights are 0.55/0.13/0.12/0.12.
// Taken on the MERGED pool (recal_92/93/95's card-side DEF work landed first, which moved the median
// 109.99 -> 110.21 and every five's drtgRef with it). His ruling "Move the summit to Bulls '96" put
// DEF_TOP on the all-time best five, so unlike every DEF freeze since r71 nothing clamps.
const DEF_WORST = 112.92 // the all-time worst defensive five
const DEF_MID = 110.21 // the all-time median reads 50
const DEF_TOP = 107.47 // Chicago Bulls '96 (drtgRef 107.4739) — the named DEF summit reads 99
/** How many wheel fives froze the anchors (display only). */
const ANCHOR_N = 1255

const scale71 = (v: number, min: number, mid: number, top: number) =>
  Math.round(Math.max(1, Math.min(99, v <= mid ? 1 + (49 * (v - min)) / (mid - min) : 50 + (49 * (v - mid)) / (top - mid))))

export interface Gauge {
  off: number
  def: number
  offRaw: number
  drtgRef: number
  /** What the scale is anchored to, for the dial's label. */
  basis: string
  n: number
}

const gauge = (five: Player[]): Gauge => {
  const r = ratings100(five)
  return {
    off: scale71(r.offRaw, OFF_MIN, OFF_MID, OFF_TOP),
    // lower drtg is better: negate so the two-slope map reads rising-is-better
    def: scale71(-r.drtgRef, -DEF_WORST, -DEF_MID, -DEF_TOP),
    offRaw: r.offRaw,
    drtgRef: r.drtgRef,
    basis: 'all-time scale',
    n: ANCHOR_N,
  }
}

/** A five with a season: same all-time scale (the season no longer picks the pool — one scale for all). */
export function seasonGauges(five: Player[], _season: number): Gauge {
  return gauge(five)
}

/** A drafted five with no season of its own: the same scale — a drafted five and a wheel team read alike. */
export function fieldGauges(five: Player[]): Gauge {
  return gauge(five)
}
