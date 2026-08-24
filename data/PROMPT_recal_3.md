# game7 — recalibration round 3: offense-gated OVR + defensive floor + vocabulary

Attached: compute_ovr.py + regenerated players_stats.json. Display-only; regenerate all versions.
1. OVR ceiling/floor (perimeter class): OVR = min(raw, max(o_ovr + 10, 0.80 × d_ovr)).
   A defense-first perimeter player caps near his offense (he stops one man), but elite defense holds a floor.
   Bigs: cap = o_ovr + 40 (an elite anchor is a defensive SYSTEM — effectively exempt).
   Calibration points (Tomer-ratified): OFF78/DEF95 shape → 88; Jrue 83; Smart 75; Bowen 74; Payton 93; two-way kings 99 untouched.
2. Archetype: ALL-AROUND for the balanced multi-skill both-ends shape (no dominant zone). Style-never-tier rule holds.
3. Known quirk (logged, not fixed): post-defending no-jumper guards (Tony Allen type) classify as bigs and dodge the
   perimeter cap. Rare; revisit only if it misleads drafting.
