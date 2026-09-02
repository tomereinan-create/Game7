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
 * EACH ERA IS READ AT ITS OWN LEVEL, from recal_100. His ruling, verbatim: "OKC at 59 DEF is wayyy
 * to low. Should be low 80's or very high 70's. In general, no 2026 team having more than 61 DEF is
 * insane." He was right, and the cause was not the defence formula: the league's own defensive level
 * on this index (DEF_LEVEL below) is flat at ~109.9 from 1980 to 2013 and then climbs every year to
 * 110.95 in 2026, and at ~19 dial points per raw point that is ~20 points of pure era. Every modern
 * five was reading two decades of card-pool drift as if it were bad defence: the decade means were
 * 80s 56.1 · 90s 56.2 · 00s 54.4 · 10s 47.2 · 20s 38.4 and the whole 2026 field topped out at 63.
 * After the subtraction the decade means are 51.2 · 51.3 · 51.3 · 51.3 · 50.9, the Thunder '26 read
 * 81, and the Bulls '96 are still the only five on the board at 99.
 *
 * WHY THE SCALE AND NOT THE ENGINE. 94% of the drift (0.92 of 0.98 DRtg points, 80s to 20s) is the
 * perdef channel, and it is the CARD POOL rather than the five: league-wide mean perdef falls 58.1
 * to 50.4 across all 9,665 rostered card-seasons, and its spread narrows with it. defenseVs reports
 * what the cards say and is untouched. Two other cures were measured and rejected (the table is in
 * data/rounds/100.json): an era term inside defenseVs would leak into the RESOLVER and hand a 2026
 * five a fake defensive bonus in a cross-era game — the dial's problem paid for out of the
 * simulation's pocket — and a per-decade gauge re-freeze gives every decade its own 99 (five fives
 * at 99, the Spurs '05 among them) and destroys exactly the cross-era comparability the ruling asks
 * for. Recentring is also the only one of the three that is monotone WITHIN a season by
 * construction, so the within-season fit cannot fall: 0.766 -> 0.767, and no era below its old value.
 *
 * THE OFF DIAL IS NOT TOUCHED. It drifts too — decade means 43.1 · 48.4 · 52.6 · 54.1 · 56.4, the
 * same card-pool effect with the opposite sign — and the same one-line subtraction would flatten it
 * to ~52.6 everywhere with the Warriors '17 still 99 and the fit unmoved. He has not ruled on it, so
 * it stands. That is the first thing to put to him after this round; recal_100's COST carries the
 * measurement, including the imbalance leaving it creates.
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
// DEF side RE-FROZEN by recal_100 on the ERA-RELATIVE index and RE-DERIVED by recal_101 (scripts/gauge100.ts re-derives this
// whole block, table included; re-run it after any change that moves drtgRef). The three anchors are
// quoted in DEF_LEVEL_REF's league, so they are ADJUSTED drtgRef, not raw drtgRef. The summit is
// still where recal_94's ruling put it ("Move the summit to Bulls '96") and is still the only five
// on the board that reads 99.
const DEF_WORST = 113.03 // the all-time worst defensive five, era-adjusted
const DEF_MID = 109.95 // the all-time median reads 50
const DEF_TOP = 107.36 // Chicago Bulls '96 (adjusted 107.3638) — the named DEF summit reads 99

/**
 * THE LEAGUE'S OWN DEFENSIVE LEVEL, season by season: the mean drtgRef of that season's fieldable
 * best-fives, frozen from the same 1,255-five sweep. Subtracting it is the whole of recal_100.
 * RE-DERIVED by recal_101: its perdef round lifted the tracked half of every modern card, so the
 * 2014+ levels fell by ~0.6 (2026 110.950 -> 110.246) and the pre-tracking seasons barely moved.
 * Flat at ~109.9 for thirty-four seasons, then a gentle climb from 2018 to 110.33.
 */
const DEF_LEVEL: Record<number, number> = {
  1980: 109.818, 1981: 110.026, 1982: 109.855, 1983: 109.852, 1984: 109.923, 1985: 109.913,
  1986: 109.777, 1987: 109.854, 1988: 109.778, 1989: 109.890, 1990: 109.802, 1991: 109.891,
  1992: 109.924, 1993: 109.698, 1994: 109.819, 1995: 109.794, 1996: 109.937, 1997: 109.925,
  1998: 109.964, 1999: 109.976, 2000: 109.957, 2001: 109.941, 2002: 109.918, 2003: 109.913,
  2004: 109.998, 2005: 110.056, 2006: 110.003, 2007: 109.953, 2008: 109.957, 2009: 109.968,
  2010: 109.951, 2011: 109.912, 2012: 109.978, 2013: 109.959, 2014: 109.905, 2015: 109.850,
  2016: 109.864, 2017: 109.959, 2018: 110.153, 2019: 110.096, 2020: 110.192, 2021: 110.315,
  2022: 110.194, 2023: 110.240, 2024: 110.197, 2025: 110.326, 2026: 110.246,
}
/** The league every DEF dial is quoted in: the mean of the 47 season levels. */
const DEF_LEVEL_REF = 109.9663
/** A five with no season of its own is a five in TODAY's league — the one the campaign is played in. */
const DEF_LEVEL_FIELD = DEF_LEVEL[2026]

/** drtgRef re-expressed in DEF_LEVEL_REF's league. An unknown season falls back to today's. */
const defAdj = (drtg: number, season?: number) =>
  drtg - (DEF_LEVEL[season ?? -1] ?? DEF_LEVEL_FIELD) + DEF_LEVEL_REF

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

const gauge = (five: Player[], season?: number): Gauge => {
  const r = ratings100(five)
  return {
    off: scale71(r.offRaw, OFF_MIN, OFF_MID, OFF_TOP),
    // lower drtg is better: negate so the two-slope map reads rising-is-better
    def: scale71(-defAdj(r.drtgRef, season), -DEF_WORST, -DEF_MID, -DEF_TOP),
    offRaw: r.offRaw,
    drtgRef: r.drtgRef,
    basis: 'all-time scale',
    n: ANCHOR_N,
  }
}

/**
 * A five with a season: ONE all-time scale, read in that season's own league (recal_100). The season
 * no longer picks the POOL — recal_71 settled that, and 99 is still an all-time 99 — it only says
 * which league the five defended in, so that the 2004 Pistons and the 2026 Thunder are comparable.
 */
export function seasonGauges(five: Player[], season: number): Gauge {
  return gauge(five, season)
}

/** A drafted five with no season of its own: the same scale — a drafted five and a wheel team read alike. */
export function fieldGauges(five: Player[]): Gauge {
  return gauge(five, undefined)
}
