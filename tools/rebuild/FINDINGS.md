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
