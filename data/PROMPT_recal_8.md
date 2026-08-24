# game7 — recal round 8: deployment enforcement + archetype decision tree + volume premium + rename

Attached: build_ratings.py, compute_ovr.py, team_rating.py, players_stats.json (regenerated). Regenerate all versions.

## Fix 0 — ENFORCEMENT (read first — two round-7 fixes are visibly NOT live in the app)
A 98-playvol/98-usage sheet still labels POST SCORER, and a 99-rimprot stretch big still shows DEF 70. Both were fixed
in recal_7. Diagnosis: either the labeler item was skipped, or THE APP HAS ITS OWN DUPLICATE COPY of the rating formulas
that has drifted from compute_ovr.py.
ACTION: (a) find and DELETE any duplicated o_ovr/d_ovr/OVR/is_big logic in the app — the ported compute_ovr.py functions
are the single source of truth, imported/called from one module only; (b) after regeneration, verify these two exact
profiles: [playvol 98, usage 98, paint 75, mid 76] must label ENGINE with OFF in the mid-70s; [rimprot 99, 3pt 62,
usage 96] must classify BIG and show DEF ~90-92. Print both to me before closing the task.

## Fix 1 — Archetype decision tree (authoritative ORDER; thresholds tunable, order is law)
Evaluate top-down, first match wins. Creation tags come BEFORE all scoring-diet tags — that is the rule that kills
POST-SCORER-for-playmakers permanently.
1. DEFENSIVE PLAYMAKER: passqual>=85 AND playvol>=70 AND perdef>=80 AND best zone < 55
2. ENGINE: playvol>=95 AND usage>=90
3. FLOOR GENERAL: playvol>=85 AND passqual>=85 AND usage<90
4. TWO-WAY STAR: o_ovr>=85 AND d_ovr>=85
5. MIDRANGE MAESTRO: mid>=85 AND 3pt<40 AND usage>=90
6. FREIGHT TRAIN: paint>=90 AND usage>=90 AND 3pt<40
7. SNIPER: 3pt>=90 AND usage<40
8. CONNECTOR: usage<55 AND 3pt>=70 AND passqual>=80 AND perdef>=75
9. ANCHOR: rimprot>=90 AND usage<55
10. POST SCORER: paint>=70 AND mid>=65 AND 3pt<40 AND playvol<60   <- diet tags LAST
11. ALL-AROUND: no attribute >= 88 AND at least 4 of {scoring zone, playmaking, perdef/rimprot, rebounding} >= 60
12. Fallback: BALANCED
## Fix 2 — HIGH-VOLUME PREMIUM (in build_ratings.py): each scoring zone (paint/mid/3pt) gains up to +7 points,
ramping only above the 70th volume percentile. STRICTLY ADDITIVE — low-volume ratings are byte-identical (verified:
Battier 73 unchanged; Korver 3pt 99, DeRozan mid 94). Stored attributes only, never inference targets.
## Fix 3 — RENAME: attribute `out` -> `3pt` everywhere (attrs key, UI labels, sort chips, tooltips, matchup reads).
Name change only; values identical. Engine files attached already read a['3pt'].
