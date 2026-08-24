# game7 — ratings update (drop-in)

## What to do
1. Replace the app's player data with the attached `players_stats.json` (1,854 players). Schema unchanged: `{ name, peak_season, talent, in, out, id, pd, attrs }`.
2. Replace `build_ratings.py` in the repo — it is the single source of truth for how every number is produced. Do not re-derive ratings anywhere else.
3. UI adjustments (small):
   - Relabel the `RIM` attribute to `PAINT` (or keep RIM with tooltip "paint scoring, 0–10 ft") — its definition widened to include the 3–10 ft post zone.
   - `FT` is now the player's literal free-throw percentage (e.g. 71 = 70.7%), not a percentile. No bar-scale change needed, but don't describe it as a percentile anywhere.
   - Keep the asterisk on rim/mid when `rim_mid_measured` is false (pre-1997 = model-inferred).
4. Nothing in the resolver/sim changes. It still reads only `talent, in, out, id, pd`.

## Final rating formulas (reference — implemented in build_ratings.py)
- **Season is the unit.** Every player = his peak season (best BPM, ≥1200 min, 1980+). No career averaging anywhere.
- **out (outside shooting)** = max of two paths:
  - GUNNER: 0.65 × era-adjusted 3PA volume percentile + 0.35 × 3P% percentile, chucker-gated (efficiency below season median discounts the score). Volume is always multiplied by (modern league 3PA-rate ÷ that season's league rate)^0.5, capped 3×.
  - DEADEYE: min(0.95, 0.88 × 3P% percentile + 0.12 × era-adjusted volume percentile), requires ≥3 era-adjusted attempts/100.
  - 1995–97 short-line seasons: 3P% discounted ×0.93 before percentiling.
- **rim (paint scoring, 0–10 ft)**: 0.65 × paint-volume percentile + 0.35 × volume-weighted paint FG% percentile. Volume is discounted by assisted share of 2P makes (up to −45%) — self-creators full credit, lob finishers partial — and ranked against the raw pool. Discount applies ONLY where assisted share is measured (1997+).
- **mid**: same structure over the 10 ft–3PT zones (no assisted discount).
- **rim/mid pre-1997**: inferred by regression fitted on 1997–2005 (features: 2P%, FT%, FTr, height, 2P volume, usage; targets are the RAW measured scores, so no modern-era discounts leak backwards). Fit quality: R² rim .78 / mid .60. Flagged `rim_mid_measured: false`.
- **ft** = literal FT%.
- **pd / defimpact**: anchored on defensive reputation = All-Defensive selections + DPOY vote shares over a CAREER WINDOW (votes decay 15% per year of distance from the peak season), plus steals, DBPM, team defensive rating, size, and a coach-trust term (heavy minutes at low usage). Players with zero career votes are shrunk toward the league middle.
- **id / rimprot**: blocks, defensive rebounding, height, DBPM, plus big-man share of defensive votes.
- **talent**: within-season percentile of 0.72×BPM + 0.28×usage, stretched 55–99.
- All other attrs (fouldraw, orb, drb, playvol, ballsec, usage, efficiency, durability, perimdisrupt, passqual, discipline): within-season percentiles of the corresponding Basketball-Reference rates.

## Known, accepted properties (do not "fix" these)
- Jordan's out is ~23: his peak season took almost no threes. Correct by doctrine.
- Lively-type lob finishers score ~60s on paint scoring: one-zone, fully-assisted diet. Their value shows in efficiency and rimprot.
- Inferred (pre-97) rim/mid compress superstars toward the mean; the asterisk exists for this reason.
