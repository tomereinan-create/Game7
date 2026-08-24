# game7 — recal round 5: two-way wing perdef bias + MISSING 2026 AWARDS DATA

Attached: build_ratings.py + regenerated players_stats.json (+ current compute_ovr.py unchanged). Regenerate all versions.

## Fix 1 — formula: the SG/SF two-way star discount
Three mechanisms stacked against high-usage wings (Brown/Tatum/Gordon class): the coach-trust term zeroed out at high
usage (built to catch low-usage stoppers, it punished stars for scoring), plus the no-vote cap+shrink. Changed:
- trust = minutes x (1 − 0.6 x usage-pctile) — usage discounts trust, never zeroes it.
- no-vote perdef cap 54 → 58 (shrinkage unchanged — gamblers still can't buy amplitude).
Voted defenders (Jrue/Bowen tier) unchanged by construction.

## Fix 2 — DATA GAP (do this, it's bigger than the formula): 2025-26 defensive awards are ABSENT
The Basketball-Reference dataset snapshot predates the May 2026 announcements: zero 2026 All-Defense rows, zero 2026
DPOY shares. Every 2025-26 season-version is missing its newest defensive evidence, and the career-window can't reach
forward for players whose first selection was 2026.
ACTION: fetch the official 2025-26 All-Defensive First/Second Teams and DPOY voting shares (basketball-reference.com
awards pages) and append them to "End of Season Teams.csv" (rows: 2026,NBA,All-Defense,1st/2nd,player,player_id,NA)
and "Player Award Shares.csv" (2026 dpoy rows) using existing player_ids, then regenerate. IMPORTANT: exact selections
only — All-NBA is a different award and must NOT be added as defensive credit.
## Note for the UI
If any 2026 selection contradicts a displayed perdef after regeneration, that's the fix working, not a bug.
