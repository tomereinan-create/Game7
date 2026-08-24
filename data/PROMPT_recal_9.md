# game7 — recal round 9: five fixes (defense band, inference sanity, size)

Attached: build_ratings.py, compute_ovr.py, players_stats.json (regenerated). Regenerate ALL season-versions through
both steps — several fixes target non-peak versions and only appear after regeneration.

1. GRADED voted-band entry (perdef): membership weight w = min(1, drep/0.35) for drep > 0.05, blending the no-vote
   composite with the voted-band position. Kills two artifacts at once: the fading-legend cliff (Kawhi '26 was 99->60;
   now lands ~70s) and the empty 60-82 band. ACCEPTANCE: 2026 ORV vote-getters (Draymond 0.20, Amen Thompson 0.23,
   Stephon Castle 0.23 shares) must land in the 60-75 range, not the 50s. Trace votes <= 0.05 still buy nothing.
   (Requires the 2026 awards data from recal_5 Fix 2 — basketball-reference.com/awards/awards_2026.html now exists.)
2. Inferred zones are VOLUME-FIRST: pre-1997 rim/mid = 0.75 x model + 0.25 x 2P-volume percentile. Elite-percentage
   low-volume post players stop reading 96-98 (the Steve Johnson '83 shape: 10.8 att/100 -> ~81).
3. Inferred low-2P% clamp: if 2P% percentile < 0.40, inferred zones cap at 0.45 + 0.55 x that percentile. FT%-as-touch
   can no longer carry a 43.7% shooter to mid 99 (the Calvin Murphy '83 shape -> ~49). Peak seasons with healthy 2P%
   are unaffected. Side effect of #2 (intended): inferred-era legends with elite volume rise slightly (MJ paint ~98).
4. SIZE modifier on perimeter d_ovr: x min(1.0, 0.94 + 0.06 x (height-71)/7). Bites only truly small defenders —
   CP3 99 -> ~94 (guard-quota All-D selections are real evidence but size caps the ceiling); Jrue/Payton -2, wings unchanged.
   attrs now include `height` (inches) — also show it on the card header.
5. Carry-forward enforcement from recal_8 Fix 0 still applies: single source of truth, print verification profiles.
