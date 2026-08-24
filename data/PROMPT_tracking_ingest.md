# game7 — tracking-defense ingestion (executes recal_10 item 2)

Attached: fetch_tracking_defense.py + updated build_ratings.py. The blend formula lives in build_ratings.py and is
INERT until the CSV exists — do not reimplement it.
1. pip install nba_api pandas, run fetch_tracking_defense.py (fetches defended-FG% 2013-14 through 2025-26 from
   stats.nba.com; skips failed seasons rather than fabricating). Place tracking_defense.csv next to build_ratings.py.
2. Regenerate everything. The pipeline auto-blends for NO-VOTE players in 2014+ seasons: measured defended-FG% diff
   (inverted, within-season percentile) widens their band to ~78 max. Voted players and pre-2014 seasons unchanged.
3. Name matching is normalized-name based; the pipeline prints load count. Report any season with zero matches.
4. Show me before-after for: Jaylen Brown '26, Jayson Tatum, Derrick White, Aaron Gordon '23, Dyson Daniels, plus
   Trae Young and Luka (they should move LITTLE — bad tracking numbers keep them low; that's the point of measurement).
