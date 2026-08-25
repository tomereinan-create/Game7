# Rebuilding data/build_ratings.py — verified findings

The file was truncated to 0 bytes on 2026-08-24. No copy exists on the machine; the 19 copies in the
scratchpad are the design side's own lineage (newest Aug 23, 417 lines) and predate ~20 rounds of
repo-side work. The rebuild is verified against two oracles committed to git:

* `src/data/players_stats.json` — every card's final attributes
* `data/provenance.json` — the RAW INPUTS each attribute was computed from, plus the smoothing
  weights and the pre-smoothing values of every attribute smoothing changed (`smooth.was`)

Together these mean each formula can be checked independently: inputs are known, the pre-smoothing
target is recoverable, and the final value is known.

## MILESTONE 1 — ingestion  ✅ VERIFIED

Source CSVs in the bref cache. `Advanced.csv` supplies usg_percent, tov_percent, ast_percent,
ts_percent, mp, bpm, dbpm, orb/drb/stl/blk percent. A fresh loader reproduces the recorded inputs for
8/8 sampled cards across 1980–2025 exactly (Curry '16, Shaq '00, Jordan '89, Gobert '19, Kareem '80,
Trae '22, Rodman '92, Wembanyama '25).

## MILESTONE 2 — the card set  ✅ VERIFIED

Rule: **season >= 1980, minutes >= 1200, the TOT/2TM row preferred over single-team rows.**
That yields 9,994 of the 10,000 cards with **zero extras**.

The six stragglers are name collisions — two different Eddie Johnsons ('82-'86) and two George
Johnsons ('80) played the same seasons. The second card of a colliding name carries a ` (b)` suffix.

**Tie-break (verified on all six): the card with the HIGHER `talent` keeps the plain name.**

| season | plain | talent | (b) | talent |
|---|---|---|---|---|
| 1982 | johnsed02 | 87 | johnsed03 | 71 |
| 1983 | johnsed02 | 80 | johnsed03 | 78 |
| 1984 | johnsed03 | 80 | johnsed02 | 74 |
| 1985 | johnsed03 | 78 | johnsed02 | 73 |
| 1986 | johnsed03 | 77 | johnsed02 | 73 |
| 1980 | johnsge03 | 73 | johnsge02 | 73 (tie, decided before rounding) |

So cards are ordered by talent descending and names deduplicated in that order.

## Oracle notes

* `sc(x) = 1 + 98x`, rounded — recorded in compute_ovr's own comment.
* Smoothing weights per card are in `provenance[name].smooth.w` = [year, prev, next]; the standing
  law is 20/60/20, renormalised to 75/25 at a career edge, and `gap: true` marks the injury-gap reach
  to year+2.
* `smooth.was` lists ONLY the attributes smoothing changed, so the pre-smoothing table is
  `was[k] if k in was else shipped[k]` — a complete per-season target for every formula.

## Remaining

Formulas, attribute by attribute, each verified against (recorded inputs -> pre-smoothing value)
across all 10,000 cards; then smoothing; then a full run diffed against both oracles.

## MILESTONE 3 — formulas verified exactly  ✅ (3 of ~15)

Checked against (recorded inputs -> pre-smoothing value) on all 10,000 cards. `sc(x) = round(1 + 98x)`.

| attribute | formula | exact |
|---|---|---|
| durability | `sc(P_mp(mp))` | 9,994 / 9,994 |
| volume | `sc(P_vol(usg x (1 - tov/100)) ** 1.15)` | 9,994 / 9,994 |
| ballsec | `sc(1 - (0.65 x P_ratio + 0.35 x P_tov))`, ratio = `tov x 25 / max(10, usg + 0.5 x ast)` | 9,994 / 9,994 |

(The six misses everywhere are the ` (b)` collision cards, which the checker does not disambiguate.)

Percentile pools are the season's qualifying rows — proven by those three matching exactly.

## MILESTONE 4 — the missing mechanism: a MINUTES-CONFIDENCE SHRINK  ⚠ identified, not yet exact

Playvol is **not monotone in AST%**: Ibaka '16 and Mozgov '16 both have AST% 3.9 and land on 5 and 23.
The discriminator is minutes — Ibaka 2,500, Mozgov 1,326. Low-minute cards are pulled toward the
middle of the scale, exactly as the "Brandon Clarke rule" in the transcript describes ("a BPM mirage
on 19 minutes shrinks toward the season's median by the same minutes confidence the rate attributes
carry").

Implied confidence, measured by inverting the formula on ~9,000 cards:

| minutes | 1200 | 1400 | 1600 | 1800 | 2000 | 2200 | 2400+ |
|---|---|---|---|---|---|---|---|
| confidence | 0.44 | 0.55 | 0.68 | 0.77 | 0.89 | 0.97 | 1.00 |

Best closed form so far: `conf = min(1, (mp / 2400) ** 0.9)`, shrinking toward 0.5 in 0..1 space.

It is the right MECHANISM — the same curve lifts three attributes at once — but not yet the exact
constants:

| attribute | plain | with the shrink |
|---|---|---|
| playvol | 35.3% | **83.0%** |
| efficiency | 23.6% | **61.2%** |
| drb | 34.7% | **83.1%** |

Note that volume, ballsec and durability match exactly WITHOUT it, so the shrink applies to a subset
of the rate attributes. Identifying that subset, and the exact curve, is the next step.

## Still to do

* the exact confidence curve and which attributes carry it
* rim / mid / 3pt (era multiplier, the two shooter paths, the assisted-share discount)
* the defensive composite: perdef (drep votes, dbpm, team DRtg, the r35 height band), rimprot, the
  DFG floors, discipline by height tercile, fouldraw, orb, ft, perimdisrupt
* season smoothing (weights are recorded per card) and the injury-gap reach
* provenance output, then a full run diffed against both oracles

---

# SESSION 2 — the genuine file was found, and the shrink is solved

## THE BASE  ✅

`C:\Users\tomer\Desktop\game7\game7_formula_modules.zip` → `pipeline/build_ratings.py`,
**32,467 B, md5 e4621876b495, 518 lines** — the hash the first status report recorded. It is the real
file, but from an EARLIER snapshot than the truncation: it still has `passqual`, `usage` (not
`volume`), ballsec v2 (`tov_pct - 0.11 x ast`), `efficiency = sc(P_ts ** 1.30)`, smoothing 65/20/15,
`ERA_ALPHA 0.5`, and a PD vector with `stl` and `trust` terms. That is the pre-recal_12 state.

Extracted to `base.py` here. It supplies the true skeleton: CSV loading, the row filter, the
percentile helpers, the IN/OUT/ID/PD composites, the attribute assembly, smoothing and the provenance
writer.

## MILESTONE 4 — SOLVED: the minutes-confidence shrink

Recovered verbatim from the recal_14 patch script in the transcript, not fitted:

```python
_mp = f(by_pid_yr[(pid,yr)].get('mp_v')) or 0.0
mconf = 0.55 + 0.45 * max(0.0, min(1.0, (_mp - 1200) / 1200))
if mconf < 1.0:
    for _k in ('playvol', 'perimdisrupt', 'orb', 'drb', 'fouldraw', 'efficiency'):
        p['attrs'][_k] = int(round(50 + mconf * (p['attrs'][_k] - 50)))
```

Two details my curve-fitting could never have found: it shrinks toward **50**, and it is applied to
the **already-rounded integer**, not in 0..1 space. It touches exactly SIX attributes — which is why
volume, ballsec and durability matched exactly without it.

`lg_ts` was the other missing piece: the mean TS over **every NBA row with mp >= 800**, not the card
pool.

## Attributes now EXACT (9 of ~17), all 9,994/9,994

| attribute | formula |
|---|---|
| durability | `sc(P_mp(mp))` |
| volume | `sc(P_vol(usg x (1-tov/100)) ** 1.15)` |
| ballsec | `sc(1 - (0.65 x P_ratio + 0.35 x P_tov))` |
| playvol | `shrink(sc(0.6 x P_ast**1.12 + 0.4 x clamp(ast/44)))` |
| drb | `shrink(sc(P_drb ** 1.15))` |
| efficiency | `shrink(sc(0.5 x P_ts**1.05 + 0.5 x (0.5 + (ts - lg_ts) x 6)))` |
| perimdisrupt | `shrink(sc(P_stl ** 1.30))` |
| fouldraw | `shrink(sc(P_ftr(ftr)))` |
| height | `round(ht_in_in)` |

## Close, needs one more detail

* `ft = round(100 x ft_percent)` — 93.1%
* `orb = shrink(sc(P_orb ** 1.15))` — 73.5% (gamma or pool differs)
* `discipline = sc(1 - P_pf_by_height_class)` — 60.1% (class boundaries or pool)
* `usg_raw` / `ts_raw` / `ts_rel` — 13% is EXPECTED, not a failure: they are floats, and `smooth.was`
  records only the integer attributes, so there is no pre-smoothing target for them. They can only be
  verified after smoothing is implemented.

## Still to do

rim / mid / 3pt (the shooting model, era multiplier, assisted-share discount), rimprot and perdef
(the defensive composites, the tracking/DFG layer, All-D vote shares), season smoothing, the
provenance writer, then a full run diffed against both oracles.

---

# SESSION 3 — thirteen attributes exact

## The three near-misses were one bug in MY test, not the formulas

`pf100` prefers the **TOT row**: `if k not in pf100 or is_tot(r['team']): pf100[k] = r`. My probe kept
the last row instead, which for a traded player is a single-team row. Fixing it:

| attribute | was | now |
|---|---|---|
| ft = `round(100 x ft_percent)` | 93.1% | **100.0%** (9,995) |
| orb = `shrink(sc(P_orb ** 1.15))` | 73.5% | **99.9%** |
| discipline = `sc(1 - P_pf[height class](pf_per_100))`, terciles at 0.33/0.67 | 60.1% | **99.9%** |

## The 3PT model — verified end to end  ✅

**The era layer is exact on all 47 seasons.** The baseline is NOT player rows: it is the mean of team
`x3p_ar` from **Team Summaries.csv**, `MODERN_3AR = 0.326280` over 2011-2025, and

```python
era_mult(yr) = min(3.0, (MODERN_3AR / lg3ar[yr]) ** 0.38)      # ERA_ALPHA = 0.38
```

Solving the recorded multipliers for the exponent gives 0.3800 on every season with zero spread.

The rest of the chain, all confirmed against the recorded intermediates
(`prov['3pt'] = [path, 3PA/100, era_mult, 3P%, vol_pct, acc_pct, gate]`):

```python
vol = P_3pa_mod(att * era_mult(yr))                    # modern pool, 2011-2025 card rows
acc = P_3pp_mod(p3) if att >= 2 else 0.35 * P_ft_pct(ft_pct)     # within-season FT prior below 2
if season in {1995,1996,1997}: p3 *= 0.93
gun = 0.65*vol + 0.35*acc
if gap := med3 - p3 > 0.02: gun *= max(0.55, 1 - 3.0*(gap - 0.02))    # chucker gate
GUN_BOOST = min(1.0, gun * 1.08)
eye = min(0.95, 0.88*acc + 0.12*vol) if att * era_mult >= 3.0 else 0
OUT = max(gun, eye)
OUT = min(1.0, OUT + 0.07 * max(0.0, (vol - 0.70)/0.30))    # high-volume premium
OUT = max(OUT, GUN_BOOST)                                    # the de-stack: better of the two, never both
3pt = sc((sc(OUT) / 99) ** 1.12)                             # display gamma 1.12, not 1.08 or 1.15
```

**Result: 9,995 / 10,000 exact.** Gamma 1.08 scores 23.7% and 1.15 scores 31.5%, so 1.12 is not a
coincidence.

## Exact so far — 13 attributes

durability · volume · ballsec · playvol · drb · efficiency · perimdisrupt · fouldraw · height ·
**ft · orb · discipline · 3pt**

## Remaining

* **rim / mid** — the 2P model: `attr_store` per player-season, the assisted-share discount, the
  paint conversion floor, `mid ** 1.15`
* **rimprot / perdef** — the ID and PD composites, the tracking/DFG layer with its 150-attempt
  shrink and absolute floors, All-D vote shares (`drep`), the r35 height band, the r36 weights
* **season smoothing** (20/60/20, 75/25 at edges, the injury-gap reach) — also the only way to verify
  `usg_raw` / `ts_raw` / `ts_rel`, which are floats and have no pre-smoothing target
* the provenance writer, then a full run diffed against both oracles
