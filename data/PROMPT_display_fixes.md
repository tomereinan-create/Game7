# game7 — two display fixes: team rating scale + box-score shape

Both are PURE PRESENTATION. Resolver outputs, margins, and series results must be byte-identical before/after.
Attached: team_rating.py (contains the new ratings_100 — port it as-is).

## Fix 1 — Team ratings re-anchor (teams were reading 20s-40s)
The 0-100 dials spanned the full theoretical lineup space, so real drafted teams landed in the 30s. Re-anchored:
- 50 = a league-average five (REF_FIVE, already in team_rating.py). Anchors _REF_OFF and _REF_DRTG are computed at load.
- OFF display = clamp(50 + (teamOFF − _REF_OFF) × 1.67, 1, 99)
- DEF display = clamp(50 + (_REF_DRTG − teamDRtg_vs_REF) × 13.0, 1, 99)
  (DEF multiplier is deliberately larger — the 60/40 offense/defense ruling compresses defense's raw spread; do not "normalize" the two multipliers.)
- Expected feel after the fix: typical drafted teams 60-85, all-time extremes 95-99, league-average 50, genuinely bad units still below 40 (that is information, keep it).
- Update any pinned dial values in tests to the new scale; the ORDERING assertions must not change.

## Fix 2 — Box scores (FG% sub-40 every series)
Root cause is arithmetic: the generator uses ~96 possessions (~86 FGA) while this engine's scores run 95-105, so bricks are the only way the ledger balances. Possessions must DERIVE FROM THE SCORE:

1. P = clamp(round(game_PTS / 1.13 × 100), 82, 104). Compute per team, then both teams use the AVERAGE (possessions are shared). 1.13 is a single knob (TARGET_ORTG). Era flavor ±3 allowed on top.
2. FTA = clamp(P × fouldraw_index, 16, 30); fouldraw_index maps team avg fouldraw 0-99 → 0.17-0.31. FTM = FTA × team FT%.
3. TSA = P × 0.99 (+ small ORB add-back). FGA = TSA − 0.44 × FTA  (now lands ~72-84, tracking the score).
4. 3PA = FGA × out_share (usage-weighted out vs paint+mid split of the lineup, range 0.25-0.48).
5. 3P% from the lineup's usage-weighted out quality, mapped into 32-41%. 3PM = 3PA × 3P%.
6. 2PM = (PTS − FTM − 3×3PM) / 2; FG% = (2PM+3PM)/FGA. If FG% leaves 41-53%, re-solve by nudging 3P% and FTA inside their bands. The resolver's PTS is NEVER changed.
7. Rebounds from misses: TRB = opp missed FG × DRB-strength (0.68-0.78) + own missed FG × ORB-strength (0.20-0.32).
8. TOV from team ballsec (usage-weighted, inverted) → 10-16; opponent steals ≤ your TOV × 0.55.
9. Player lines split team totals by reconciled usage (scoring) and attribute shares (REB by orb/drb, AST by playvol, STL/BLK by perimdisrupt/rimprot). Round AFTER splitting so team totals stay exact.

## Acceptance
- 200 simmed games: means inside FG% 44-50, 3P% 33-39, FTA 16-26, TRB 36-46, TOV 10-16.
- Explicit tail check: a 92-point game AND a 112-point game must BOTH land inside the FG% band.
- Every game: PTS == 2×2PM + 3×3PM + FTM exactly.
- Shooting-heavy lineups show visibly more 3PA than paint lineups — shape follows identity.
- ratings_100: opponent changes never move a team's dials; only the matchup panel moves.
- Resolver byte-identical before/after both fixes.
