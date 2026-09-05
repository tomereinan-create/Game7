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
 * BOTH DIALS NOW READ EVERY ERA AT ITS OWN LEVEL. recal_105 finished what recal_100 started, on his
 * ruling "Teams rating is still off. Bulls 96 only 75 OVR" — the Team DB's OVR is the plain mean of
 * these two dials, and a DEF dial recentred beside an OFF dial that was not is half a scale. OFF
 * decade means were 43.5 · 49.4 · 52.8 · 54.7 · 56.4 and are ~50 in every decade after. The 2017
 * Warriors are still 99.
 *
 * WHAT recal_105 COULD NOT REACH, recorded because it is the more important finding. The Bulls '96
 * came out at OFF 68 / DEF 95, an OVR of 82 against the ~92 the round was aiming at, and the scale
 * is not what is stopping it: teamOffense ranks that five EIGHTH of the 29 fieldable 1996 teams on
 * offence (offRaw 128.27, z +0.75) while the real 1996 board has them FIRST (ORtg 115.2). A
 * per-season shift is monotone inside a season, so no recentring can move them past the seven fives
 * the engine puts above them. Reaching OVR 92 needs OFF 89, which needs the offence engine to rank
 * them near the top of their own year. That is data/team_rating.py's team_offense, not this file.
 *
 * THE OLD NOTE, kept for the record:
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

// OFF side RE-FROZEN by recal_105 on the ERA-RELATIVE index, the treatment recal_100 gave DEF
// — RE-FROZEN AGAIN at the pipeline-113 integration: recal_109 and recal_112 moved 376 cards' OFF (0 DEF)
// under recal_110's table, so every five's offRaw moved with them. The DEF block below is untouched.
// — AND AGAIN BY recal_119, which added the possession-loss channel to team_offense: every one of
// the 1,255 fives' offRaw moved with it (the term is centred on the league's own mean turnover rate,
// so it redistributes rather than inflates, and the level barely moves). The Warriors '17 are still
// all-time rank 1 on the adjusted index and still the named summit; the Rockets '18 now round to 99
// beside them at 0.05 adjusted points behind, which is the constraint that sized recal_119's knob.
// THE DEF BLOCK IS UNTOUCHED — 0 of 1,255 DEF dials moved.
// (scripts/gauge105.ts re-derives this whole block, table included). His ruling: "Teams rating is
// still off. Bulls 96 only 75 OVR" — and the Team DB's OVR is the plain mean of these two dials, so
// a DEF dial read at each era's own level beside an OFF dial that was not is half a scale. The three
// anchors are quoted in OFF_LEVEL_REF's league: ADJUSTED offRaw, not raw offRaw. The summit is still
// where recal_71's ruling put it ("99 should be one of the greatest offense ever (2017 warriors)").
const OFF_MIN = 100.98 // the all-time worst offensive five, era-adjusted
const OFF_MID = 121.8 // the all-time median reads 50
const OFF_TOP = 138.38 // Golden State Warriors '17 (adjusted 138.3821, all-time rank 2) — the named OFF summit reads 99

/**
 * THE LEAGUE'S OWN OFFENSIVE LEVEL, season by season: the mean offRaw of that season's fieldable
 * best-fives, frozen from the same 1,255-five sweep. Subtracting it is the whole of recal_105.
 *
 * It climbs about five raw points from 1985 to 2019 — offence really did improve, and the card pool
 * says so twice over: the same era shift that made modern fives read WORSE on defence (recal_100's
 * DEF_LEVEL) makes them read BETTER here. RE-DERIVED by recal_110, whose creation-amplification fix
 * moved every five's offRaw by a point or two either way (the term is centred on the league's own
 * mean feed, so it redistributes rather than inflates). The Warriors '17 went from all-time rank 8
 * on the adjusted index to rank 1, so nothing clamps at the OFF summit any more (8 fives did).
 * RE-DERIVED AGAIN by recal_140 (scripts/gauge105.ts, per its own instruction: re-run after any
 * engine change that moves offRaw), whose received-feed amplification moved all 1,255. League ORtg
 * and league DRtg are the same number, so
 * recentring one and not the other was never self-consistent; this is the other half.
 */
const OFF_LEVEL: Record<number, number> = {
  1980: 120.386, 1981: 119.634, 1982: 119.694, 1983: 119.933, 1984: 120.172, 1985: 119.097,
  1986: 119.191, 1987: 119.853, 1988: 121.024, 1989: 121.951, 1990: 122.126, 1991: 121.919,
  1992: 121.049, 1993: 121.620, 1994: 121.079, 1995: 121.652, 1996: 122.044, 1997: 121.626,
  1998: 120.694, 1999: 118.476, 2000: 121.230, 2001: 121.349, 2002: 121.780, 2003: 121.898,
  2004: 122.171, 2005: 122.964, 2006: 122.260, 2007: 123.663, 2008: 123.699, 2009: 123.021,
  2010: 121.635, 2011: 122.526, 2012: 121.225, 2013: 122.343, 2014: 122.778, 2015: 122.553,
  2016: 123.037, 2017: 123.623, 2018: 122.267, 2019: 123.893, 2020: 122.045, 2021: 122.161,
  2022: 122.172, 2023: 123.633, 2024: 124.643, 2025: 123.424, 2026: 123.054,
}
/** The league every OFF dial is quoted in: the mean of the 47 season levels. */
const OFF_LEVEL_REF = 121.7929
/** A five with no season of its own is a five in TODAY's league, exactly as on the DEF side. */
const OFF_LEVEL_FIELD = OFF_LEVEL[2026]

/** offRaw re-expressed in OFF_LEVEL_REF's league. An unknown season falls back to today's. */
const offAdj = (off: number, season?: number) =>
  off - (OFF_LEVEL[season ?? -1] ?? OFF_LEVEL_FIELD) + OFF_LEVEL_REF
// DEF side RE-FROZEN by recal_100 on the ERA-RELATIVE index and RE-DERIVED by recal_101 (scripts/gauge100.ts re-derives this
// whole block, table included; re-run it after any change that moves drtgRef). The three anchors are
// quoted in DEF_LEVEL_REF's league, so they are ADJUSTED drtgRef, not raw drtgRef. The summit is
// still where recal_94's ruling put it ("Move the summit to Bulls '96") and is still the only five
// on the board that reads 99.
const DEF_WORST = 113 // the all-time worst defensive five, era-adjusted
const DEF_MID = 110.04 // the all-time median reads 50
const DEF_TOP = 107.58 // Chicago Bulls '96 (adjusted 107.5844) — the named DEF summit reads 99

/**
 * THE LEAGUE'S OWN DEFENSIVE LEVEL, season by season: the mean drtgRef of that season's fieldable
 * best-fives, frozen from the same 1,255-five sweep. Subtracting it is the whole of recal_100.
 * RE-DERIVED by recal_101 (its perdef round lifted the tracked half of every modern card) and again
 * by recal_105. The second re-derivation was NOT a choice: recal_104's OVR blend changed which five
 * the OVR-max picker takes for many teams — the Bulls '96 went from Ron Harper to Steve Kerr at the
 * one guard slot — so the table's own population moved under it and his recal_94 summit ruling had
 * silently stopped holding (the Bulls' CURRENT five read DEF 95, not 99). A gauge table frozen from
 * the picker's output has to be re-run whenever the picker's input moves, OVR included.
 * Flat at ~110.0 for thirty-eight seasons, then a gentle climb from 2018 to 110.35.
 */
const DEF_LEVEL: Record<number, number> = {
  1980: 109.962, 1981: 110.079, 1982: 109.953, 1983: 110.007, 1984: 110.010, 1985: 110.062,
  1986: 109.898, 1987: 109.909, 1988: 109.830, 1989: 109.980, 1990: 109.931, 1991: 109.981,
  1992: 110.031, 1993: 109.731, 1994: 109.890, 1995: 109.878, 1996: 110.012, 1997: 110.035,
  1998: 110.091, 1999: 109.976, 2000: 110.058, 2001: 109.972, 2002: 110.014, 2003: 109.971,
  2004: 110.020, 2005: 110.158, 2006: 110.078, 2007: 110.021, 2008: 110.037, 2009: 110.042,
  2010: 110.033, 2011: 110.006, 2012: 110.003, 2013: 110.017, 2014: 109.973, 2015: 109.877,
  2016: 109.899, 2017: 109.987, 2018: 110.173, 2019: 110.126, 2020: 110.198, 2021: 110.336,
  2022: 110.206, 2023: 110.245, 2024: 110.204, 2025: 110.347, 2026: 110.254,
}
/** The league every DEF dial is quoted in: the mean of the 47 season levels. */
const DEF_LEVEL_REF = 110.0319
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
    off: scale71(offAdj(r.offRaw, season), OFF_MIN, OFF_MID, OFF_TOP),
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
