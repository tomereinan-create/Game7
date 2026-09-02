# Shared rules for every recal agent

Read this whole file before touching anything. It is included by reference from the three agent
definitions beside it.

## The ruling
The orchestrator hands you: the round number `N`, the subject (a player-season card such as
"Shaquille O'Neal '00", or a five), the target number and its scale, and Tomer's ruling verbatim.
The ruling text is the contract. Quote it verbatim in the commit message and the receipt.

## Doctrine (non-negotiable)
1. **One formula for everyone. No per-player override.** No name checks, no pinned values, no
   special-casing a card. The target is reached by changing weights, curves, anchors, gates or
   inputs that apply to every card. If no defensible formula change reaches the number, DECLINE:
   report the closest reachable value, what it would cost the rest of the board, and stop.
   recal_82 (rimprot band "provably infeasible") and recal_88 (declined) are the precedents.
2. **Measure before you commit.** Print the subject's before/after, the top 12 by the affected
   score, how many cards moved and by how much, and any card that changed rank order around the
   subject. Tuning is chosen against the measurement, never guessed.
3. **Season is the unit.** An unnamed year means the peak-season card. Names carry the year.
4. **Nothing is re-derived outside the pipeline.** `data/build_ratings.py` -> `data/compute_ovr.py`
   is the only path to a number on a card. `src/engine/offense.ts` is a 1:1 port of
   `data/team_rating.py`; change both together or neither.

## Regeneration (run from `data/`, python 3)
```
cd data
python build_ratings.py                    # writes data/players_stats.json + provenance.json (10,000 cards)
python compute_ovr.py players_stats.json   # o_ovr/d_ovr/ovr in place, export/, src/data/pipeline.json
cp players_stats.json ../src/data/players_stats.json
```
Check `data/compute_ovr.py` and `package.json` for the exact current invocation before running;
if the scripts have moved on, follow the scripts, not this note. Bump `PIPELINE_VERSION` in BOTH
python files to `N`. The four copies that must all change together: `data/players_stats.json`,
`src/data/players_stats.json`, `data/export/players_stats_smoothed.json` (+ MANIFEST.json),
`src/data/pipeline.json`.

## Receipt
Add a `'N': () => { ... }` block to `scripts/receipts.ts` in the style of the existing rounds:
`line(...)` for each acceptance check (source regex on the python, and the subject's numbers read
from the SHIPPED data), `note(...)` for what it cost and why. Then run:
```
npm run receipts -- N
npm test
```
Both must pass. A receipt is a reading taken from the data, never a claim from memory.

## Commit
One commit, message exactly in this form (past rounds are the model):
```
recal_N — <what changed, one line> (his ruling: "<verbatim ruling>")
```
For a decline: `recal_N declined — <why, one line> (his ruling: "...")` with the receipt block
still added, recording the measurement. Do NOT merge or push; the orchestrator merges to main
and pushes immediately after your report.

## Report back (this is what reaches the dashboard)
- ROUND: N, AGENT: your name, STATUS: done | declined
- SUBJECT: card name, SCALE, TARGET, BEFORE -> AFTER
- WHAT CHANGED: the formula change in one or two sentences, with the knob names
- COLLATERAL: cards moved / biggest movers / top-12 after
- COMMIT: hash, branch
- COST: anything a later round should know (superseded pins, anchors re-derived)
