# game7 — recal round 10: superstar tag hole, tracking-data expansion, tax threshold, maestro rework

Attached: compute_ovr.py + regenerated players_stats.json. Regenerate all versions.

1. TREE FIX: insert before ALL-AROUND: THREE-LEVEL — usage>=90 AND efficiency>=75 AND paint/mid/3pt all >=55.
   (An offensive-superstar sheet — mid 99, usage 98, eff 90 — was falling through every rule to the BALANCED fallback.)
2. DATA EXPANSION (big one, doctrine-pure): ingest NBA tracking DEFENDED FG% from stats.nba.com (available 2014+):
   per player-season, opponent FG% as closest defender vs expected (DIFF%), overall and <6ft. Blend into perdef for
   NO-VOTE players (2014+ seasons only): measured on-ball evidence replaces shrinkage — the Jaylen Brown/Tatum-class
   fix. Voted players unchanged (selections remain the stronger evidence). Cache the data; do not fabricate values if
   the endpoint fails — skip and report. Propose the blend weights before applying; show me Brown/Tatum/White before-after.
3. Empty-volume tax threshold: usage 80 -> 72 (a 79-usage/48-eff rebounding star was dodging it by one point -> ~86, was 91).
4. MAESTRO floor reworked: gate z0>=82 (was 85), floor = 0.40 zone + 0.12 usage + 0.10 ballsec + 0.08 fd*ft + 0.05
   playvol + 0.20 EFFICIENCY. Calibration pair (Tomer-ratified): Bernard-King shape (mid 83, eff 67) -> OFF ~84, ABOVE
   the DeRozan shape (mid 87, eff 52) -> OFF ~83. Same craft, better conversion, one point of daylight.
Also answered in-session: Jaylen Brown's 2026 defensive votes = 0.035 share (7 of 200) — below the trace gate, not a
selection; his rating is correct pending item 2's measured evidence.
