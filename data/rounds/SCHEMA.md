# `data/rounds/<N>.json` — the round file

A recalibration round used to end with ~77 hand-written lines in `scripts/receipts.ts`. Most of
those lines were the same lines: the pipeline version, a regex proving the knob moved, the
subject's before/after, the movers, the top 12. Writing them by hand was the slowest part of a
round and the easiest place to mistype a number.

A round may now ship **one JSON file** instead. `scripts/receipts.ts` reads every `*.json` in this
folder at startup and **synthesises** a receipt block from each one, in the same shape the
hand-written blocks print. Nothing else changes: `npm run receipts -- N` prints round `N` whether
it is hand-written or a file, and `npm run receipts` prints all of them.

**The file supplies the questions. The ledger supplies the answers.** Every number printed by a
synthesised block is read at run time from the shipped data (`src/data/players_stats.json` through
`src/engine/pool`, `src/data/pipeline.json`, and the python sources named in `knobs`). The numbers
you write into the file are the round's *record of the moment* — a receipt is still a reading, never
a claim from memory.

## Rules the loader enforces

- **The filename does not matter.** The `round` field is the key. `EXAMPLE.json` is round 0.
- **A hand-written block always wins.** If round `N` exists both here and in `scripts/receipts.ts`,
  the hand-written block runs and the file is ignored — with a `WARNING` line printed at the top of
  the run, never silently.
- **Round 0 is skipped by the all-rounds run.** It is the worked example, not a ruling. Ask for it
  by name: `npm run receipts -- 0`.
- **A malformed file is skipped with a warning, not a crash.** Bad JSON, a missing `round`, a
  missing `scale`, an unreadable knob file, an invalid regex, a card that has left the pool — each
  prints and fails its own line. Nothing throws.

## Writing a round file

```
npm run receipts -- 0       # the worked example, EXAMPLE.json, printed in full
npm run receipts -- 91      # your round, once data/rounds/91.json exists
npm run receipts            # every round except 0
npm test
```

Copy `EXAMPLE.json`, change the numbers, run it. Every field below appears in it at least once.

---

## Fields

### Identity (required)

| field | type | meaning |
| --- | --- | --- |
| `round` | number | The round number `N`. This, not the filename, is the key the runner uses. |
| `agent` | string | Which recal agent ran it (`ratings-to-off-def`, `engine`, `ui`, …). Printed in the header. |
| `status` | `"done"` \| `"declined"` | `declined` marks the header and turns the subject's target check into a **recorded** reading rather than a required one — doctrine 1 says a round that cannot reach the number without a per-player override declines and records the closest reachable value. Everything else in a declined file is still checked normally. |
| `ruling` | string | Tomer's ruling **verbatim**. Printed in the header inside quotes, the same wording that goes in the commit message. |
| `title` | string | One line, the commit's headline. Printed after `recal_N — `. |
| `scale` | string | The scale the subject is measured on. See **Scales** below. Required even when there is no `subject`. |

### The subject

| field | type | meaning |
| --- | --- | --- |
| `subject` | string | The card the ruling is about: `"Shaquille O'Neal '00"`. For a `team:*` scale this is just the label printed (e.g. `"Pistons '04"`) — the reading comes from `five`. Omit only if the round has no subject. |
| `five` | string[] | **Only for `team:*` scales.** Exactly 5 card names. The five is read through `ratings100()` in `src/engine/offense.ts` — the same `teamOffense` / `defenseVs` path the engine receipts use. |
| `target` | number | The number the ruling asked for. |
| `tol` | number | Tolerance on `target`. The line passes when `|reading − target| <= tol`. Default `0`. |
| `before` | number | The subject's reading before the round. Printed, never checked — nothing can re-derive it. |
| `after` | number | The subject's reading after the round. Re-read: if the shipped value no longer equals it, the block prints a **SUPERSEDED** line (a later ruling stood on top of this one) — recorded, **not** a failure. That is the convention the header of `scripts/receipts.ts` describes. |

### The pipeline

| field | type | meaning |
| --- | --- | --- |
| `pipeline_version` | number | The `PIPELINE_VERSION` the round shipped at. Checked against `version` in **`src/data/pipeline.json`** — the data the app actually reads, not a regex on the python — and passes when the current version is `>=` it. |

### `knobs` — the proof the formula moved

An array. One `src(...)` line each: the named file is read and the pattern is matched against it.
This is what makes a receipt a proof rather than an assertion — if a later round reverts or
rewrites the knob, this line goes `MISS`.

| field | type | meaning |
| --- | --- | --- |
| `file` | string | Repo-relative path, e.g. `"data/compute_ovr.py"`, `"data/build_ratings.py"`, `"src/engine/offense.ts"`. |
| `pattern` | string | A **JavaScript regular expression source string**. Remember JSON needs the backslashes doubled: `"OFF_TOP = 110\\.64"`. Match the formula, not the prose around it. |
| `label` | string | Optional. What the knob is, in a few words. |
| `note` | string | Optional. The `want` column — usually the before → after of the constant, e.g. `"106.36 -> 110.64"`. Defaults to the pattern. |

### `expect` — the collateral that must hold

An array of independent acceptance checks on other cards (or other fives).

| field | type | meaning |
| --- | --- | --- |
| `card` | string | The card to read. See **Card lookup**. |
| `five` | string[] | Instead of `card`, for a `team:*` scale: five names. If omitted on a team scale, the round's own `five` is used. |
| `scale` | string | Any scale (see below) — it need not be the round's own. |
| `op` | `">="` \| `"<="` \| `"=="` \| `"~"` | The comparison. `~` means within `tol`. |
| `value` | number | The right-hand side. |
| `tol` | number | Only meaningful with `~`. Default `0`. |
| `label` | string | Optional. Prefixed to the line so the check says *why* it is there. |

### `order` — rank order around the subject

An array. Each entry passes when the `above` card reads **strictly greater** than the `below` card
on that scale. This is the check that catches a tuning which hit its number by inverting the board.

| field | type | meaning |
| --- | --- | --- |
| `scale` | string | The scale both cards are read on. |
| `above` | string | The card that must read higher. |
| `below` | string | The card that must read lower. |
| `label` | string | Optional. |

### `movers` — the footprint

| field | type | meaning |
| --- | --- | --- |
| `scale` | string | The scale the footprint was measured on. |
| `count` | number | How many cards moved. Recorded and printed; **not** recomputed — the ledger has no snapshot of the previous board. |
| `max_abs` | number | The largest `|move|`. Recorded and printed, same reason. |
| `top` | `[name, before, after][]` | The biggest movers. Each one **is** re-read: the current value is compared to `after`, and a difference prints as SUPERSEDED (not a failure), exactly as the subject's `after` does. A name that has left the pool prints `MISSING` and fails. |

### `top12` — the board as it reads now

| field | type | meaning |
| --- | --- | --- |
| `scale` | string | A **card** scale (`off`, `def`, `ovr`, `attr:*`). A `team:*` scale is skipped with a note — the board is a list of cards. |
| `cards` | string[] | The 12 names, in order, as the round left them. |

The block prints the top 12 **as they read now** (sorted by the scale, descending, ties broken by
name ascending, so the listing is deterministic) and marks every position where the current name
differs from the recorded one. Differences are marked, never failed.

### Prose

| field | type | meaning |
| --- | --- | --- |
| `cost` | string[] | What a later round should know: superseded pins, anchors re-derived, a constant left drifting on purpose. Printed under a `COST` heading. |
| `notes` | string[] | Free reasoning lines — the argument, the rejected alternative, the honest qualifier. Printed as plain `note()` lines. |

---

## Scales

| scale | reading |
| --- | --- |
| `off` | the card's `o_ovr` |
| `def` | the card's `d_ovr` |
| `ovr` | the card's `ovr` |
| `attr:<key>` | one attribute off the 17-attribute sheet: `attr:rimprot`, `attr:perdef`, `attr:3pt`, `attr:playvol`, … Any numeric key of `Attrs` in `src/engine/types.ts`. |
| `team:off` | `ratings100(five).off` — the 1–99 offensive dial for a five |
| `team:def` | `ratings100(five).def` — the 1–99 defensive dial, rated against the synthetic `REF_FIVE` |

`team:*` readings also print `offRaw` and the reference `drtg` as a note, so the display dial and
the raw engine number are both on the record.

## Card lookup

- An **exact card name** (`"Shaquille O'Neal '00"`) is looked up directly. The season is part of the
  name — season is the unit.
- A **bare player name** (`"Shaquille O'Neal"`) resolves to that player's **peak card**: highest
  `talent`, then highest `ovr`, then name ascending as a deterministic last tie-break.
- A name that matches **nothing** prints `MISSING` and **fails that line** — it never throws, so one
  retired card cannot take the whole ledger down with it.

## What fails and what does not

This is the whole judgement of the format, so it is worth stating flat.

**Fails (a `MISS`, and the run exits non-zero):**

- `pipeline_version` above the shipped version
- a `knobs` pattern that no longer matches its file, an unreadable file, an invalid regex
- the subject outside `target ± tol` — unless `status` is `declined`
- any `expect`, any `order`
- any named card that has left the pool

**Does not fail (printed as a supersession, because that is what it is):**

- the subject no longer reading its recorded `after`
- a mover no longer sitting on its recorded value
- the top 12 having reshuffled
- the recorded `count` / `max_abs`, which are the round's own measurement and cannot be re-derived

A round whose numbers have moved on is not a broken round. It means a later ruling stood on top of
it, and the ledger's job is to print that, not to hide it.
