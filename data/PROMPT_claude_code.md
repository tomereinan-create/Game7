# Build: "game7" — a fast basketball draft roguelike (v1)

Working title: **game7** (lowercase). Repo/package name: `game7`. The name refers to the series-deciding Game 7 — the point-by-point ticker below is the signature moment of the product; build it with that in mind.

## Attached files (read before coding)
- `resolver.py` — the tuned, validated game engine prototype. Port it exactly; its scenario numbers are the source of truth for the acceptance tests below.
- `build_ratings.py` — the ratings pipeline: real Basketball-Reference stats -> player ratings. Do NOT port it; keep it as the Python data step. It is the single source of truth for player data.
- `players_stats.json` — its current output: 1,854 real players, seasons 1980-2025, peak-season versions.

## Vision (read first)
A snack game. Each round of a campaign you see the OPPONENT's 5-man lineup, draft 5 players from a random pool to counter them, press SIM, and a best-of-7 series resolves instantly. Win → next, harder round. Lose → run over. Runs take ~10 minutes. Fast, addictive, zero menus, zero tactics screens. Think Balatro's pacing with basketball reads.

The player's skill = reading the opponent's shape and drafting the counter. Luck = what the pool offers. Raw talent always matters most; the counter is a tiebreaker, never a cheat code.

## Hard constraints
- Single-page client-only app. Vite + React + TypeScript. No backend, no accounts, no persistence beyond localStorage for run-in-progress + best result. NOTE: this runs in the browser normally, NOT as a claude.ai artifact, so localStorage is fine.
- Mobile-first layout (will be played on phones).
- No animations except the Game 7 ticker (below). Everything else renders instantly.
- All game data is static JSON in the repo.

## Core loop (one round)
1. Show opponent card: team name, their 5 players, and a one-line identity tag (e.g. "Die by the three", "Twin towers", "Seven seconds or less"). Their shape must be readable at a glance from the players + tag.
2. Show a pool of 10 players. Player drafts exactly 5. Show live, minimal feedback: the drafted five's combined bars (Inside O / Outside O / Interior D / Perimeter D / Talent) next to the opponent's bars. No numbers required on cards beyond a single overall; bars carry the shape.
3. SIM button → resolve best-of-7:
   - Games 1–6: render instantly as one line each: "G1: W 112–104", plus a 3–4 word note derived from the biggest matchup term (e.g. "killed inside", "threes rained"). Notes must come from the actual sim terms, not random flavor.
   - Game 7 (only if 3–3): point-by-point text ticker. Very fast (~5–8s total) until end of Q3; if margin ≤ 6 entering Q4, slow the ticker for the final possessions. If not close, stay fast.
   - "Skip" button sims everything and shows the series line. Always available.
4. Win → advance. Lose → run summary screen (rounds cleared, best win, one-tap New Run).

## Campaign (v1: 8 rounds, fixed opponents)
Hand-author 8 opponent lineups with famous, readable identities, escalating:
1–2: bad teams (talent ~70) · 3–4: playoff teams (~80) · 5–6: champions (~88) · 7: superteam (~93) · 8: historic all-time team (~96).
Difficulty comes from the gap: the PLAYER's pool talent scales slower than opponent talent (see pool generator). By round 8 the player is a talent underdog and must draft a near-perfect counter AND get lucky.

## The resolver (already tuned — port exactly, do not redesign)
Each player: `{ name, peak_season, talent, in, out, id, pd, attrs }` — `attrs` is the full 17-attribute sheet (rim, mid, ft, fouldraw, orb, drb, playvol, ballsec, usage, efficiency, durability, rimprot, perimdisrupt, defimpact, passqual, discipline, out) plus a `rim_mid_measured` flag (false = inferred for 1980-96) (0–100; in=inside scoring, out=outside scoring, id=interior D, pd=perimeter D). THE RESOLVER READS ONLY talent + the 4 axes. `attrs` must NOT enter the sim math. Draft cards show the 4 bars + overall; the detail view (tap a card) shows peak_season and the full attrs sheet, marking rim/mid with an asterisk when rim_mid_measured is false.
A lineup compiles to the plain averages of its five players on all 5 fields.

```
matchupEdge(off, def):
  shareIn  = off.in / (off.in + off.out)
  shareOut = 1 - shareIn
  return shareIn * (off.in - def.id) + shareOut * (off.out - def.pd)

gameMargin(A, B):
  0.25 * (A.talent - B.talent)
+ 0.25 * (matchupEdge(A,B) - matchupEdge(B,A))
+ gaussian(0, 14)

A wins the game iff margin > 0. Series = first to 4.
```
Keep `A_TAL=0.25, B_FIT=0.25, SIGMA=14` in a single config file — they are balance knobs.
Game score for display: base 100 + margin/2 for winner, 100 - margin/2 for loser, jitter ±4, round. Ticker for G7: pre-generate the final margin with the same formula, then fabricate a plausible point-by-point path to it (random walk constrained to end at the margin). The ticker is presentation; the resolver decides the result.

### Acceptance tests (write as unit tests; run 20k sims each, seedable RNG)
- Mirror match (identical neutral 85 lineups): series winrate 50% ± 2.
- Neutral 85s vs neutral 75s: per-game 66–70%, series 82–88%.
- Equal-talent counter (perimeter-lock five vs shooter five, both 85): per-game 60–64%.
- Superstars (avg 95, inside-heavy, weak shape) vs perfectly countering role team (avg 78): superstars win series 79–86%. Talent must dominate.

## Player pool data (stats pipeline — the doctrine is STATS ONLY)
`players_stats.json` (attached) is the player pool. Rules:
- Every rating is derived from real Basketball-Reference statistics by `build_ratings.py`. NO hand-rated players, NO generated/fictional players, NO editorial overrides, NO priors. If a rating looks odd, it changes by tuning the WEIGHTS dict in the pipeline and regenerating — never by editing the JSON.
- Players are peak-season versions, seasons 1980-2025 only (every axis fully measured from 1980).
- App loads the JSON as static data. Show each player's `peak_season` on the detail view.
- Names and ratings only — NO images, NO team logos, NO likenesses.

## Pool generator (per round)
- Draw 10 players from a talent band tied to the round (band center ≈ opponent talent − handicap; handicap grows in late rounds).
- Constraint 1: never offer 5 players who are strictly best at every slot — force incomparable choices (e.g. the best two remaining bigs must trade off O vs D).
- Constraint 2: with probability ~25%, deny the clean counter (e.g. vs a shooting team, offer at most one plus perimeter defender). Losing rounds to a bad pool is intended.
- Redraft from scratch every round. Nothing persists between rounds in v1.

## Coach (v1: minimal)
At run start, pick 1 of 3 coaches. Each is a single passive modifier applied to YOUR compiled lineup all run:
- Defensive coach: +5 id, +5 pd
- Offensive coach: +5 in, +5 out
- Gambler: SIGMA 14 → 17 for both teams (more chaos, favors the underdog late)
One pick, ten seconds, done. No coach menus.

## Explicitly OUT of scope (do not build)
Mid-series adjustments · trades · injuries/fatigue · player progression · meta-progression between runs · sound · animations beyond the G7 ticker · settings screens · onboarding/tutorial (the game must teach itself through the bars).

## Definition of done
`npm run dev` serves the game; a full run is playable on a phone screen; all acceptance tests pass; a fresh player understands the draft with zero instructions.
