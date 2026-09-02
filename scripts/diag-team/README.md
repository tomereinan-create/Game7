# `scripts/diag-team` — the team-rating diagnosis, and recal_94's before/after

Truth is `data/bref/Team Summaries.csv` (`o_rtg` / `d_rtg` per team-season, 1980–2026). Fit is the
Spearman of the **shipped dial** against the real rating **within each season**, averaged over the 47
seasons that carry the 1,255 fieldable team-seasons of `src/data/teamseasons.json`. Ranking inside a
year is the only fair test: raw ORtg/DRtg drift ~15 points across eras.

The dial is read exactly as `src/ui/TeamDb.tsx`'s `gaugeOf` reads it — `startingFive` →
`seasonGauges` → `ratings100` / `defenseVs(five, REF_FIVE)`.

```
npx vite-node scripts/diag-team/sweep.ts     # every wheel team-season, dial + internals -> sweep.json
python scripts/diag-team/fit.py              # joins it to bref -> joined.json, prints the fit
cp scripts/diag-team/joined.json scripts/diag-team/joined_before.json    # (on the old engine)
cp scripts/diag-team/joined.json scripts/diag-team/joined_after.json     # (on the new one)
python scripts/diag-team/ba94.py             # the two, side by side — recal_94's headline table
```

The `.json` files are gitignored: they are megabytes and one command remakes them.

| file | what it answers |
| --- | --- |
| `sweep.ts` | writes the sweep: dial OFF/DEF, offRaw/drtgRef, the five, and every `defenseVs` internal |
| `fit.py` | the fit, per era and per season, plus the 25 worst DEF and OFF mismatches |
| `ba94.py` | **recal_94's before/after in one script** — fit, Philadelphia, the 2026 board, the all-time top 10 |
| `pkg94.py` | the package measured term by term BEFORE it was applied (this is how the weights were chosen) |
| `cap.py` | the uncapped-anchor evidence: 902 of 1,255 fives over 99, and what each removal is worth |
| `philly.py` | Philadelphia '26 decomposed, with a counterfactual per term |
| `variants.py` | every single-term variant, offense and defense, against the same truth |
| `scale.py` | why a 0.5-point DEF error moves the dial ~8 points and a 0.5-point OFF error moves it ~1.5 |
| `gauge94.ts` | re-derives the DEF gauge anchors and lists everything that clamps past the Pistons '04 summit |
| `named94.ts` | exact offRaw/drtgRef for the named summit fives |
| `ref94.ts` / `ref94b.ts` / `ref94c.ts` / `ref94d.ts` | re-deriving `ratings100`'s `REF_DRTG` — campaign median, drafted-five median, and (the one taken) recal_60's own 300-five sample |
| `opp94.ts` + `oppdiff94.py` | the campaign ladder's dials before and after, so a team round cannot silently reorder it |
| `pickcheck94.py` | proves `data/anchors.py`'s python five-picker IS `src/engine/bestfive.ts`, on all 1,255 team-seasons |
| `seed94.py` | the readings recal_94's anchors were seeded from, taken through `data/anchors.py` itself |
| `receipt94.ts` | the exact numbers `data/rounds/94.json` records, read the way `scripts/receipts.ts` reads them |
