# game7 — three rating fixes, one package (supersedes prior pending display bundles)

Attached: build_ratings.py, compute_ovr.py, team_rating.py, players_stats.json (fully regenerated — includes ALL prior
pipeline fixes: defense scale, ballsec). Resolver untouched. Regenerate multi-season versions through build_ratings -> compute_ovr.

## Fix 1 — Team dials: empirical anchors (was: everyone OFF-heavy)
DEF's 50-point was anchored to a synthetic no-weak-link reference; every real roster read as bad defense. Anchors now =
median of sampled plausible fives: _REF_OFF=132.0, _REF_DRTG=113.1, K_OFF=3.0, K_DEF=8.0 (team_rating.py). Typical teams
now cluster around 50/50; walls ~90+ DEF. Bad-defense extremes compress upward slightly (accepted trade-off).

## Fix 2 — Per-player o_ovr / d_ovr (skill sub-ratings)
Top-level fields, attribute composites (weights in compute_ovr.py): Curry 99/69, LeBron 96/97, Gobert 58/88, Trae 93/37,
Rodman 45/95. UI: show O and D beside OVR on cards; draft list sortable by either. OVR stays the validated value blend —
do NOT recompute it from o/d.

## Fix 3 — Inferred superstar zones (the Jordan fix)
Pre-1997 megastars' paint/mid were regression-compressed. NOTE: the fitted superstar residual is ~ZERO — the measured era
does not support extra zone credit for volume x efficiency, so this is a DECLARED DESIGN KNOB (UPLIFT_RIM=0.11,
UPLIFT_MID=0.09 in build_ratings.py), bounded and ramped by the measured usage x efficiency signal, applied to INFERRED
seasons only. Jordan '88 paint -> ~93, mid -> ~89; Kareem paint -> ~97. Measured-era players and role players untouched.
The asterisk on inferred rim/mid stays. Do not extend this uplift to measured seasons or to any other attribute.

## Acceptance
- Team dials: median in-game opponent within 45-58 on BOTH dials across a 10-level sample.
- o_ovr/d_ovr present for every player; sanity anchors above within +-3.
- Superstar uplift never applies to measured seasons; Battier/Lively values unchanged.
- Resolver byte-identical; update pinned display numbers, never orderings.
