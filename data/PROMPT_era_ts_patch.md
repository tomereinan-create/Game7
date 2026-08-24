# game7 — era-relative efficiency patch (bug fix, apply immediately)

## The bug
The team offense engine consumed RAW TS%. League-average TS was ~.519 in 1999-2005 and ~.584 in 2023-26,
so modern-era players carried a ~6-point era subsidy on every possession — era stars were systematically
underpriced (this is why a 2026 role-player team out-rated a superstar lineup on offense). Same error class
as the 3PT era multiplier, now fixed at the efficiency layer.

## The fix (attached)
- build_ratings.py: every player now carries `attrs.ts_rel = ts_raw − leagueTS(season) + 0.570` (league mean per season, mp≥800 qualified). Examples: Marion '03 .538→.592 (he was ABOVE his league), Larsson '26 .605→.591, Shaq '00 .578→.628.
- players_stats.json: regenerated with ts_rel. Regenerate all multi-season versions through this pipeline.
- team_rating.py: offense consumes ts_rel (fallback ts_raw); shed-refund gate recentered .530→.545 for the new scale.

## After applying
1. Re-run ALL acceptance tests (offense, defense, resolver). Archetype ORDERING must hold; absolute OFF values shift slightly — update pinned numbers, not the assertions.
2. The pre-sim panel's TS arrows should display ts_rel so the UI matches what the engine actually uses.
3. Expect era-star lineups to gain ~3-6 OFF vs modern role squads. That is the fix working, not a regression.
