# game7 — recalibration round 1: dOVR/oOVR weights (+ archetype vocabulary note)

Attached: compute_ovr.py + regenerated players_stats.json. Display-only; resolver untouched. Regenerate versions through compute_ovr.
1. d_ovr: perdef weight 0.55 → 0.70 (perdef is the complete defensive verdict; the steals term was re-taxing
   disciplined non-gamblers — Bowen read DEF 81 at perdef 95, now ~90). spec 0.15, drb 0.08, discipline 0.07.
2. o_ovr: usage 0.14 → 0.11, passqual 0.08 → 0.11 (connectors' elite passing was underpriced; volume still matters).
3. Archetype vocabulary: for the low-usage / good-shooting / high-passqual / elite-perdef shape currently tagged
   "3-AND-D", prefer the tag CONNECTOR when passqual ≥ ~85. (Pending Tomer's final ruling on style-vs-tier naming.)
