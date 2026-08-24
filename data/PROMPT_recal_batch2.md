# game7 — recalibration batch 2 (five fixes + archetype vocabulary)

Attached: compute_ovr.py + regenerated players_stats.json. Display-only; resolver untouched. Regenerate all versions.

## Formula fixes (from 5 blind-sheet calibration rounds with Tomer)
1. o_ovr: ORB now counts (0.03 — second chances ARE offense); fouldraw scores only through FT (0.05 × fouldraw×ft/100,
   multiplicative — the clank tax); passing weights eased so scoring bigs aren't taxed for a skill their shape never
   used; and a USAGE×EFFICIENCY interaction term (0.08 × usg×eff/100) — sustaining elite efficiency at max load is a
   signature the additive form couldn't see (this is also what restores Curry's O to 99).
2. d_ovr is CLASS-DEPENDENT: bigs 0.40 perdef + 0.46 rimprot + 0.11 drb + 0.03 discipline (their votes route to
   rimprot by design, perdef understates them); perimeter keeps 0.70/0.15/0.08/0.07. Fouling rim gods cap ~94 below
   flawless anchors (~97) — discipline must keep meaning something on the card.
3. is_big is now COMPOUND: (rimprot>=55 AND out<45) or (rim>=60 AND out<40) — long-armed 3&D wings no longer
   classify as bigs (Bowen was getting graded on rim protection).
4. OVR now includes the skill mix: 0.50 talent + 0.30 marginal + 0.22 × (0.55 o_ovr + 0.45 d_ovr).
   Why: BPM-based talent overpaid empty-calorie profiles — an elite-assist/bad-efficiency guard read 83 while the
   engine punished him every possession; he now reads ~77.
## Verified anchors (after ALL fixes incl. the usage x efficiency interaction)
LeBron 99 (O95/D96) · Kawhi 99 (O92/D99) · Giannis 99 (O91/D93) · Shaq 99 (O90/D89) · Curry 97 (O99/D62) ·
Dwight 97 (O75/D97) · Gobert 92 (O61/D96) · Trae 87 (O91/D35) · Rodman ~86 · Rondo 76 (O60/D65).
Ordering rules these encode: two-way kings own the summit; flawless anchors (Gobert D96) outrank fouling rim gods
(Giannis-shape D93) — discipline must keep meaning something; Curry's O99 comes from the interaction term.
## Archetype vocabulary (labeler updates)
- DEFENSIVE PLAYMAKER: elite passqual/playvol + voted perdef + weak scoring (the pass-first stopper shape).
- CONNECTOR: low-usage + good out + passqual>=~85 + strong perdef (replaces 3-AND-D for this shape).
- FREIGHT TRAIN (or similar): max-usage paint-dominant downhill hub — playvol high with passqual modest, elite fouldraw.
- Rule of taxonomy: names describe STYLE/SHAPE, never tier — quality is OVR's job.
