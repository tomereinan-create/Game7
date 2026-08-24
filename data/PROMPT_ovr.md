# game7 — player OVR (overall rating)

## What it is
Every player now has `ovr` (top-level field in players_stats.json): OVR = 0.65 × talent + 0.35 × engine-derived marginal value.
The marginal term drops the player into a league-average five (best-fit slot) and measures added margin vs a league-average
opponent — so usage economy, spacing, anchor logic, and hunted-man all price into it — then is percentile-normalized WITHIN
position class (bigs vs perimeter) to remove the anchor-scarcity bias. Blend weights are knobs in compute_ovr.py.

## Apply
1. Replace players_stats.json (now contains ovr). Add compute_ovr.py to the repo as the FINAL pipeline step: build_ratings.py → compute_ovr.py. Regenerate all multi-season versions through both steps.
2. UI: OVR becomes THE headline number on player cards and draft lists (where talent currently shows). Talent moves to the detail view.
3. THE RESOLVER STILL USES talent, NOT ovr. OVR is display/draft guidance only — the sim's talent term is calibrated and pinned by tests; do not swap it.
4. Sorting: default draft-pool sort by OVR desc.

## Sanity anchors (verify after regeneration)
Curry '16 = 99 and #1 overall; top-12 mixes positions (CP3/Vince alongside Shaq/Jokic/Giannis); Gobert '19 ~93; Draymond ~91; Rodman ~88 (defense pays); Trae ~88; Lively ~80; Battier ~80.

## Known softness (do not "fix", just note)
Elite-efficiency role players (Kerr-types) land high-80s — the talent term's BPM basis loves them. If playtesting says it misleads drafting, the lever is the blend weights (0.65/0.35), not per-player edits.
