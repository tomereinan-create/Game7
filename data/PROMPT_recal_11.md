# game7 — recal round 11: harder mid + harder efficiency + creator boost (+ Wemby verification)

Attached: build_ratings.py, compute_ovr.py, players_stats.json. Regenerate all versions.
1. MID hardened globally: final mid = mid^1.15 (0-1 scale, applied to measured and inferred alike, before display
   scaling). "A little harder for everyone" — top barely moves, the 60-85 band compresses ~3-6 points.
2. EFFICIENCY hardened globally: percentile^1.30. Median player now reads ~40 instead of 50; elite stays elite.
   Downstream note (intended): the empty-volume tax catches slightly more players; o_ovr eases ~1-2 globally.
3. CREATOR floor boosted (his "massive engine, carries role players" ruling, second pass): 0.34 playvol + 0.14 usage
   + 0.13 passqual + 0.18 best zone + 0.05 efficiency + 0.05 fd*ft. Calibration: the Isiah-shape sheet (playvol 98,
   usage 94, mid 88, eff 31) -> OFF ~84 (was 81); the Westbrook-'17 sheet rises to ~79.
4. WEMBY (no code change): pipeline value is rimprot 99. If the app shows less, the recal_7/9 rimprot regeneration
   has not been applied to his versions — verify after regenerating, and remember the 2026 All-D data (recal_5/9)
   further raises his perdef when appended.
