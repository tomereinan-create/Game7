/**
 * Balance knobs — the resolver formula, verbatim from the integration fix:
 *   margin = A_TAL × (avg talent A − avg talent B)   talent first, by design
 *          + K_MATCH × matchup_margin(A, B)           fit is a modifier
 *          + coach / level modifiers (points of spread)
 *          + N(0, SIGMA)
 * Do not scatter copies of these numbers anywhere else.
 */
/**
 * Weight on the average-talent gap — BAND-DERIVED, ratified and re-locked by the
 * audit verdict. The integration spec wrote 0.25, but at σ 10 that makes a
 * 10-point gap 2.5 points of spread (60% a game) and no σ reaches the doctrinal
 * 66–70% band without breaking the spread table (it would need σ ≈ 5.5). The band
 * is doctrine; the coefficient was instrumental, so the band sets it: 0.45 makes a
 * 10-point gap 4.5 points (67.3%) and satisfies every acceptance band with the
 * 0.20 fit weight. Do not change without re-deriving from the bands.
 */
export const A_TAL = 0.45
/**
 * Top-heavy talent: the margin reads talent_eff = W1×best + W2×second + W3×mean(other three),
 * not the plain mean — the one compile improvement the 930-season SRS backtest paid rent for.
 * Weights sum to 1, so five equal talents give exactly the mean.
 */
export const TAL_W = { W1: 0.34, W2: 0.24, W3: 0.42 } as const
export const K_MATCH = 0.2 // weight on the matchup margin (pairing-conditional NET gap)
/** A coach's +5 on two axes is worth this many points of spread, added straight to the margin. */
export const COACH_NET = 1.5
/**
 * Per-game noise. The resolver spec says 14; 10 was fitted to the spread table
 * Tomer supplied (-3 57.5%, -5 65.6%, -7 74.6%, -10 85.1%, -13 89.4%, -15 94.9%,
 * least squares 9.8) and is kept: a point of spread must still mean a point.
 */
export const SIGMA = 10

/** The Gambler coach raises noise for BOTH teams. */
export const GAMBLER_SIGMA = 13

export const SERIES_WINS = 4 // best-of-7
export const DRAFT_SIZE = 5
/** Salary Cap campaign: the five's combined share of that season's cap may not pass this. */
export const CAP_LIMIT = 75
/** Salary Cap campaign: room held back for every slot still to fill, so a five never ends up short. */
export const CAP_RESERVE = 5
/** One campaign: 30 levels from last season, then the 2020s, the 2010s, the 2000s — 120 in all. */
export const ROUNDS = 120
/** Levels per era block. */
export const ERA_LEVELS = 30

