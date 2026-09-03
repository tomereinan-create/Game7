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

## recal_119 — the possession-loss channel

`team_offense` had no way to price a turnover: the baseline is usage-weighted repriced TS and
nothing else, so a five that keeps the ball is worth exactly what a five that coughs it up is worth.
The channel prices it physically — `OFF *= (1 - tov/100) / (1 - TOV_REF/100)` — with the turnover
rate predicted from the five's usage-weighted ball security. Run in this order; the `.json` dumps
are gitignored and one command remakes each.

```
python scripts/diag-team/tov119.py tov119_before.json   # ON THE OLD ENGINE: the board + wball + bref truth
python scripts/diag-team/fit119.py                      # the OLS fit and the first frontier
python scripts/diag-team/pred119.py                     # which weighting of ball security predicts TOV% best
python scripts/diag-team/var119.py                      # era drift, pooled vs within-season slope, second predictors
python scripts/diag-team/sweep119.py                    # the frontier, gauge re-frozen at every size
python scripts/diag-team/anch119.py                     # every OFF-side anchor, graded at every size
python scripts/diag-team/edge119.py                     # the same, CONTINUOUS, so the size is not chosen on a rail
python scripts/diag-team/oracle119.py                   # the ceiling: what a channel reading the REAL TOV% would buy
# ... apply the change, re-run scripts/gauge105.ts, paste the OFF block ...
python scripts/diag-team/tov119.py tov119_after.json    # ON THE NEW ENGINE
python scripts/diag-team/ba119.py                       # before/after: ten teams, fit per decade, movers
npx vite-node scripts/diag-team/ten119.ts               # the same table through the APP's own functions
npx vite-node scripts/diag-team/parity119.ts            # python vs port ON THE SUBJECT FIVE
npx vite-node scripts/diag-team/bands119.ts             # the four archetype lineups the offense test pins
```

| file | what it answers |
| --- | --- |
| `lib119.py` | the shared bench: board, OLS fit, gauge re-freeze (mirrors `gauge105.ts`), within-season Spearman |
| `tov119.py` | dumps every fieldable five with `offRaw`, `drtgRef`, usage-weighted ball security and the bref truth |
| `fit119.py` | fits real TOV% on ball security and sweeps the size, with the gauge re-frozen at each one |
| `pred119.py` | eight weightings of the five's ball security, scored against real TOV% within season |
| `var119.py` | the era drift, the pooled vs fixed-effects slope, and whether a second predictor earns a term |
| `sweep119.py` / `anch119.py` / `edge119.py` | **the frontier** — size vs fit vs every pin, rounded and continuous |
| `oracle119.py` | the honest ceiling: the same channel reading each team's REAL turnover rate |
| `resid119.py` | who the channel moves and whether it moves them for the right reason |
| `dec119.py` | the subject five term by term, and the 2024 board it sits in |
| `ba119.py` | before/after — ten teams, fit per decade, dial movers, both gauge blocks read from git |
| `ten119.ts` | the ten teams through the app's own `seasonGauges` / `ratings100` path |
| `parity119.ts` | the python and the port on the SUBJECT five, figure by figure |
| `bands119.ts` | the four archetype lineups `tests/offense.test.ts` pins, with `tovMult` broken out |
| `cards119.py` | proves no card moved on `o_ovr` / `d_ovr` / `ovr` / attrs, and sizes the `marg` move |
| `ladder119.py` | proves the campaign ladder's League tier did not reorder |
| `pin119.py` | adds the round's two pins to `data/anchors.json` programmatically |
