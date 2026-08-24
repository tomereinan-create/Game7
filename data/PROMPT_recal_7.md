# game7 — recal round 7: the positional-fairness batch (5 fixes + labeler rule)

Attached: build_ratings.py, compute_ovr.py, players_stats.json (regenerated). Regenerate all versions through both steps.
One principle applied across the batch: RATES ARE POSITIONAL — global percentiles systematically misprice classes.

1. rimprot two-stage deterrent scale: composite >= 0.60 percentiled WITHIN the rim-protector class onto 55-99; below
   caps at 54. Tall+decent-blocks centers no longer ride global percentiles into the high 80s. Verified: Gobert/Wallace/
   Embiid/Duncan/Giannis 99; Capela 89, KAT 88, Jarrett Allen 80 (real separation); the 3.5blk/6'10/no-votes shape ~75.
   ANCHOR MATH SHARPENS: protection capacity scales anchor/99, so ordinary centers now cover proportionally less.
2. is_big gains: OR rimprot >= 80 — stretch bigs (KAT/Embiid shapes) and Draymond classify correctly regardless of range.
3. discipline is now WITHIN SIZE CLASS (top-quartile height vs rest, per season): bigs' jobs generate fouls; "disciplined
   for his role" is the meaningful question. Verified: Duncan 94, Ben Wallace 83 among bigs; Giannis still 33 (bad even
   for a big); guard baseline recalibrated. Team free-points term now reads "fouls beyond role" — intended.
4. o_ovr CREATOR branch: playvol >= 95 AND usage >= 90 -> floor = 0.32 playvol + 0.13 usage + 0.12 passqual + 0.18 best
   zone + 0.06 efficiency + 0.05 (fouldraw x ft / 100). Creation at load carries teams; the Westbrook-'17 sheet reads
   OFF ~75 (was 66). Efficiency still taxes him everywhere else, including the empty-volume OVR tax.
5. LABELER RULE (app-side): creation checks BEFORE shot-diet checks. A 98-playvol/96-usage player is never POST SCORER.
   New tag for that shape: ENGINE. (MIDRANGE MAESTRO from round 6 still pending if not yet applied.)
Parked design question (no action): durability currently affects nothing — decide someday whether injuries matter in-campaign.
