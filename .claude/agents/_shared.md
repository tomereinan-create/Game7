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
5. **The anchors file is the whole record of his rulings.** `data/anchors.json` holds every ruling
   that still stands (card, scale, target, tolerance, round). Every regeneration prints the anchor
   table; `npm run anchors` prints it on demand and exits non-zero if any anchor fails. A round
   that breaks an anchor is not done. If the ruling you were given can only land by breaking an
   older anchor, stop and report the conflict — Tomer decides which ruling stands, not you.
   When your round lands, ADD its ruling to `data/anchors.json` (and, if it supersedes an older
   anchor by his explicit ruling, move that one to `data/anchors_superseded.json` with the note).

## Batches
A dispatch may carry SEVERAL rulings for your stage at once. Treat them as one fit: find the
single formula change (or the smallest set) that brings every target inside its tolerance while
holding all existing anchors. Do not land them as serial rounds that undo each other. Report a
table: every target and every anchor, before / after / error. If the set is jointly infeasible,
say which subset is reachable and what the rest would cost — that is a decline for the rest.

## Reading a card (do this first, it costs seconds)
```
npm run read -- "Shaquille O'Neal '00"       # one line: OVR, OFF, DEF, every attribute
npm run explain -- "Shaquille O'Neal '00"    # every weighted term, bonus, band position, blend, ranks
npm run scout                                # the detector: suspicious cards, grouped by check
npm run scout -- --base HEAD                 # after regenerating: movers vs the last commit (collateral)
```

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
The receipt is `data/rounds/<N>.json` (see Report back). Rounds up to 90 are hand-written blocks
in `scripts/receipts.ts`; do not add new hand-written blocks. Then run:
```
npm run receipts -- N
npm run anchors
npm test
```
All three must pass. A receipt is a reading taken from the data, never a claim from memory.

## Commit
One commit, message exactly in this form (past rounds are the model):
```
recal_N — <what changed, one line> (his ruling: "<verbatim ruling>")
```
For a decline: `recal_N declined — <why, one line> (his ruling: "...")` with the receipt block
still added, recording the measurement. Do NOT merge or push; the orchestrator merges to main
and pushes immediately after your report.

## Report back
Write `data/rounds/<N>.json` (schema in `data/rounds/SCHEMA.md`; `EXAMPLE.json` is a worked one).
That file IS the receipt: `scripts/receipts.ts` reads it and prints the round from the shipped data,
so you no longer hand-write a receipt block — but `npm run receipts -- N` must pass before you
commit, and `npm run anchors` must pass. Then report, in this order:
- ROUND: N, AGENT: your name, STATUS: done | declined
- SUBJECT(S): card, SCALE, TARGET, BEFORE -> AFTER (one line per target in a batch)
- WHAT CHANGED: the formula change in one or two sentences, with the knob names
- ANCHORS: all pass, or the list that fail and why you stopped
- COLLATERAL: from `npm run scout -- --base HEAD`: cards moved / biggest movers / top-12 after
- COMMIT: hash, branch
- COST: anything a later round should know (superseded pins, anchors re-derived)
