# Game7

A basketball draft roguelike. Eight opponents, escalating. Each round you see their
five and a one-line identity, draft five from a pool of ten, and a best-of-seven
resolves instantly. Win, advance. Lose, run over. About ten minutes.

```bash
npm install
npm run dev
```

Then open the URL on a phone (the layout is built for one).

## On a phone

<https://tomereinan-create.github.io/Game7/>

Open that in Chrome or Safari and add it to the home screen. It installs as its own
app — no browser chrome, and it opens with no signal.

Every push to `main` rebuilds and republishes it, so a change is live at the same URL
a minute later. `index.html` is always fetched from the network, so a refresh can
never hand back an older build; only the hashed files a build renames are cached, and
when new html arrives the cache is dropped rather than grown. Nothing reloads on its
own — a deploy will not walk in on a game in progress.

Branches get their own copy. Push `try-something` and it appears at
`/Game7/preview/try-something/`, so a change can be opened on the phone before it
is merged; `/Game7/preview/` lists whatever is live, because branch names are no
fun to type on a phone. Deleting the branch takes its preview with it.

## The Android app

<https://tomereinan-create.github.io/Game7/Game7.apk>

The same game, wrapped so it installs from a file rather than from a browser. The
whole build goes inside the package, so it runs with no network at all. Every push
to `main` builds a new one and replaces the file at that address; the site carries
it, so the link never moves.

It is a debug-signed build, which is what makes it sideloadable without a Play
Store account. Android says so when installing.

Installing a new one over an old one keeps the saved runs, because every build
carries the same signature: keystore/debug.keystore, in the repo. Android accepts
an update only from the key that signed what is already on the phone, and gradle
would not use that keystore by any route — left at ~/.android/debug.keystore or
named through signingConfigs, it signed as CN=Android Debug with a fresh key each
time. apksigner replaces the signature after the build instead, and the step fails
if the result is not the key in the repo, so a build that would refuse to install
never reaches anyone.

The password is `android`, the documented default. It is a debug key for a
sideloaded game and grants nothing beyond signing this package.

The published site is the `gh-pages` branch — main at the root, previews beside it
— rewritten as a single commit each time, since a build is seven megabytes and
keeping them as history would add that to the repo on every push.

## Playing it without a terminal

There is a **Game7** shortcut on the Desktop. Double-clicking it runs
`launch.vbs`, which starts `serve.mjs` hidden (no console window) on port 5178 and
opens the browser. It serves `dist/`, building first if that folder is missing, and
a second double-click just reopens the tab instead of starting a rival server.

It binds `0.0.0.0`, so the phone URL it prints works too.

The game is served over http rather than opened as a `file://` page on purpose —
browsers refuse `localStorage` on `file://` origins, and the run-in-progress would
forget itself on every reload.

```bash
npm run play   # same thing, with a console
npm run icon   # regenerate game7.ico and the home-screen icons (drawn in code)
```

```bash
npm test            # acceptance + invariant tests
npm run balance     # per-round winrates for tuning
npm run ticker-check # Game 7 pacing and path integrity
```

## Where the balance lives

`src/config.ts`, and nowhere else:

| knob | value | what it does |
| --- | --- | --- |
| `A_TAL` | 0.25 | weight on the raw talent gap |
| `B_FIT` | 0.25 | weight on the two-way matchup edge |
| `SIGMA` | 14 | per-game noise — the reason a worse team can win |
| `GAMBLER_SIGMA` | 17 | the Gambler coach, for both teams |
| `POOL_HANDICAP` | per round | how far the pool's talent band sits below the opponent's |
| `DENY_COUNTER_CHANCE` | 0.25 | how often the clean counter is withheld |

## The resolver

Talent first, fit as a modifier — the formula, verbatim from the integration fix:

```
margin = A_TAL × (avg talent A − avg talent B)      0.45 (see below)
       + K_MATCH × matchup_margin(A, B)             0.20
       + coach / level modifiers                    points of spread (Sergeant, Professor: 1.5)
       + N(0, σ)                                     σ = 10
matchup_margin(A, B) = score_vs(A, B) − score_vs(B, A)
score_vs(us, them)   = OFF(us) + 0.024 × steals_vs(us, them) − DRtg_vs(us, them)
```

`avg talent` is top-heavy: `talent_eff = 0.34×best + 0.24×second +
0.42×mean(other three)` of the five's pipeline `talent` (55–99) — the one
compile improvement the 930-season SRS backtest paid rent for; five equal
talents give exactly the mean. Two 97s with three 80s read 89.9, not 86.8. σ: the
original resolver spec said 14; 10 was fitted to the spread table Tomer
supplied (−3 → 57.5% … −15 → 94.9%) and is kept so a point of spread means a
point. `A_TAL`: the fix wrote 0.25, but at σ 10 that makes a 10-point talent
gap 2.5 points (60% a game) and no σ reaches the 66–70% band without
breaking the table (it would need σ ≈ 5.5); 0.45 satisfies every band with
the 0.20 fit. The pre-sim card prints the decomposition — talent / fit /
coach = spread — so this class of bug is visible on sight.

Acceptance (`tests/resolver.test.ts`): mirror 50 ± 2 (50.5); neutral 85s vs
75s 66–70% (67.3); equal-talent counter 60–64% (63.6); superstars vs a
perfect-counter role team win the series 79–86% (81.5); the regression pin —
equal NET, +10 talent → a 65%+ favourite (67.1; it was 50% under the fit-only
build); the spread table within 2 points past the 3-point line; real fives:
the better record rates higher in 336 of 435 pairings, L30 over L1 69% a game.

`src/engine/offense.ts` is a 1:1 port of `data/team_rating.py` (every knob in
`KNOBS` / `DKNOBS` / `MKNOBS`; Python and TypeScript agree to the third
decimal on every archetype pairing).

**Offense** is a usage economy on **era-relative TS** (`ts_rel = ts_raw − league TS that season + .570`, league mean over 800+ minute players — a 2003 .538 reads .592, a 2026 .605 reads .591, so no era gets a subsidy): natural USG% is forced to Σ = 100 (creators
absorb surplus, high-usage players shed), each player's TS is repriced along
his skill curve, low-usage players are amplified by the team's creation,
paint-dependent players (out < 40 and mid < 45) are clogged by poor spacing
or fed by a shooting creator / kick-out shooters, every player's interaction
stack is clamped to [0.90, 1.12], then fouldraw × FT points and an ORB
second-chance multiplier are added. Archetypes: GOAT5 147.8 / BALANCED 146.5
/ ROLE5 136.3 / CHUCK5 131.2.

**Defense is a property of the pairing** (`defenseVs`): the anchor (top
rimprot, +0.35 × 2nd if elite) hides on the opponent's worst shooter and
loses value as that shooter's `out` rises past 45 (five-out); it covers
teammates' perdef deficit up to 37.5 points, only against paint-hunting
offense; the weakest defender is hunted in proportion to the opposing star's
usage, mitigated by the anchor only when that star hunts the paint; steals
are 60% on-ball (top perimdisrupt × the star's ball insecurity × usage) and
40% team pressure; the glass is top-2 DRB vs their ORB crash; indiscipline
is free points. `DRtg = 110 − 0.23 × (Didx − 55) + hunt`, and steal
generation adds transition offense. The draft screen shows the three reads
this produces: where to hide the anchor (or a five-out warning), the steal
target (star's usage and ball security), and whether they hunt the paint or
the perimeter.

The acceptance tests (`tests/offense.test.ts`, `tests/defense.test.ts`,
`tests/resolver.test.ts`): anchor isolation ≥ 4 DRtg between two-non-shooter
and five-out versions of the same offense (4.7); the hunt on Trae is blunted by Gobert only against a paint hunter (penalty
2.2 vs Shaq, 3.3 vs Curry); a Gobert wall beats a pure sieve modestly (+11.4);
defensive spread 8–10 vs an offense spread of 16.6 (9.8); mirror 50 ± 2; and the spread table the noise is fitted to — a 3-point
favourite wins 57.5%, 5 → 65.6%, 7 → 74.6%, 10 → 85.1%, 13 → 89.4%, 15 →
94.9% (least-squares σ = 9.8, shipped as 10; a gaussian overrates the 3-point
line by ~4 points, the rest land within 2). `K_MATCH` is 1: across the thirty
levels the engine's spread (sd 4.85) matches the record-implied spread (sd
4.98), so a matchup margin is read straight as points. Real fives: the better
record rates higher in 293 of 435 pairings; OKC vs WAS plays as a 59% favourite a game.

The four axes (`in/out/id/pd`) remain on every lineup for display and the
coach's shape, but do not enter the margin. The pipeline's `talent` field is
not read anywhere — a spun roster is ordered by points per game. Coaches: the Sergeant is
−5 DRtg, the Professor +5 OFF; the Gambler raises noise to 13 for both teams.

## Difficulty

`npm run balance` plays each round with a drafter that enumerates all 252 possible
fives and takes the best expected margin — the ceiling no human beats:

| rd | opponent | talent | perfect | talent-greedy | random |
| --- | --- | --- | --- | --- | --- |
| 1 | Motor City Scrap | 69.4 | 78.1% | 59.8% | 53.1% |
| 2 | Chuck City | 79.2 | 69.3% | 58.6% | 48.5% |
| 3 | Grind House | 83.8 | 67.7% | 51.8% | 43.0% |
| 4 | Twin Towers | 89.4 | 68.5% | 54.9% | 45.1% |
| 5 | Seven Seconds | 91.4 | 76.2% | 65.6% | 55.7% |
| 6 | Splash City | 90.0 | 53.2% | 39.4% | 30.2% |
| 7 | The Superteam | 96.4 | 45.3% | 33.3% | 24.0% |
| 8 | The Immortals | 97.0 | 46.6% | 34.9% | 25.6% |

Note the perfect-vs-greedy gap: **10–20 points every round.** With stats-derived
shapes (Shaq's outside scoring is 1, Korver's inside is 21) reading the counter is
worth far more than it was with smoother hand ratings. Talent still rules — the
random column shows a bad draft losing badly — but the counter is a real lever.

## Data — the stats-only doctrine

**Defense scale** (`build_ratings.py`, the Pippen fix): `pd`/`perdef` is a
two-population within-season scale — players with real defensive selections
(career-window award share ≥ 0.25) are percentiled against each other on
55–99, everyone else keeps the shrunk composite capped at 54, so stray vote
shares never buy the floor. Pippen '94 87, Jrue '21 96, Payton '96 97, Bowen
'06 95, Kawhi '17 92; Iverson '01 42, Luka '24 35, Trae '22 28.

**Season smoothing** (`build_ratings.py`, last step before the dump): every
card is `0.65 × season + 0.20 × previous + 0.15 × next` at the score level —
all 17 attributes, the four axes, talent, FT, usg/ts — shrinkage toward local
true skill tilted to the past. A neighbour counts only if it cleared the
1,200-minute floor; weights renormalise when one is missing (rookie
0.8125/0.1875, final season 0.7647/0.2353); a season with no qualifying
neighbour is untouched (8,966 of 10,000 cards blend). Magic '90 out 80 → 68;
Curry '16 out 99 → 98, paint 89 → 86; Giannis '20 paint 96 → 96. Era handling, the defense scale and the inferred-zone
uplift all happen per season before the blend; `rim_mid_measured` is the
centre season's. `perdef` (perimeter/overall defensive impact) is the new
name of the old `defimpact` — a rename only.

**Ball security** is usage-relative and creation-adjusted: the inverse
within-season percentile of `TOV% − 0.11 × AST%` — turnovers per play used,
with an allowance for creation load — so it no longer punishes anyone who
merely touched the ball. Jordan '88 97, CP3 '08 95, Battier '06 66, Jokić '25
74, Magic '87 66, Korver '15 28, Lively '24 18, Rondo '09 13.

**O / D sub-ratings** (`compute_ovr.py`): skill composites from the
attribute sheet — O from the best two zones, efficiency, usage, playmaking,
passing, ball security, fouls drawn; D from perdef (0.70 — it is the complete defensive verdict; the old 0.55
re-taxed disciplined non-gamblers through the steals term), the position's
specialty (rim protection for bigs, perimeter disruption otherwise), DRB and
discipline — shown beside OVR on every row and sortable in the Database.
Curry '16 98/61, LeBron '13 97/94, Gobert '19 53/84, Trae '22 89/35, Rodman
'92 40/96, Bowen '06 56/91. A 3-and-D shape with passqual ≥ 85 is tagged
*Connector*. OVR is not rebuilt from them.

**Inferred superstar zones** (`build_ratings.py`, the Jordan fix): pre-1997
paint/mid are inferred from a 1997–2005 fit; the measured superstar residual
is ~0 (rim −0.025, mid +0.011), so a declared design uplift (`UPLIFT_RIM`
0.11, `UPLIFT_MID` 0.09, ramped by usage × efficiency) applies to inferred
seasons only: Jordan '88 paint 93 / mid 90, Kareem '80 paint 97. Measured
seasons are untouched (Battier, Lively unchanged).

**Tracking defense** (`data/fetch_tracking_defense.py` → `tracking_defense.csv`,
ingested by `build_ratings.py`): NBA closest-defender defended-FG% for 2013-14
through 2025-26 in four slices — Overall, inside 6 ft, 15 ft +, and threes —
**27,422 rows**, every season present, nothing fabricated. The slices are kept
apart on purpose: **`perdef` reads the 15 ft + figure** (perimeter shots, so a
centre's rim work can't inflate a perimeter rating) and **`rimprot` reads the
inside-6-ft figure** as measured deterrence. For no-vote players in 2014+ the
perimeter diff is inverted, percentiled within the season and blended
`0.30 × shrunk composite + 0.70 × (0.15 + 0.63 × measured)`, capped at 0.80;
rim deterrence blends `0.65 × composite + 0.35 × measured` for everyone. A thin
sample is discounted toward neutral (full weight at 150 defended attempts).
Voted players' perdef band and pre-2014 seasons are untouched. Effect: Jaylen Brown '26 perdef 37 → 57 (D 45 → 60),
Tatum '22 37 → 52, Gordon '23 32 → 55, Luka '24 37 → 44 (a little), Trae '22
31 → 31 and White '26 / Daniels '25 unchanged — bad tracking numbers keep bad
defenders low, which is the point of measuring.

**Recalibration round 11**: `mid` is hardened globally (`mid^1.15` on the 0–1
scale, measured and inferred alike) — the top barely moves, the middle band
compresses a few points (pool median 46). `efficiency` is hardened the same
way (`percentile^1.30`): the median player reads ~40 instead of 50, elite
stays elite, and the empty-volume tax catches slightly more. The creator floor
is reweighted `0.34 playvol + 0.14 usage + 0.13 passqual + 0.18 best zone +
0.05 efficiency + 0.05 fd×ft` — Westbrook '17 OFF 85, Harden '19 91.

**Recalibration round 10**: the archetype tree gains **Three-level** before
*All-around* (usage ≥ 90, efficiency ≥ 75, every zone ≥ 55) — an offensive
superstar with all three zones open used to fall through to the fallback (58
seasons now carry it). The empty-volume tax starts at usage **72** (was 80),
so a high-load / low-efficiency rebounding star can no longer dodge it by a
point (Drummond '16 OVR 80 → 75). The maestro floor is reworked — gate
`zone ≥ 82`, `0.40 zone + 0.12 usage + 0.10 ballsec + 0.08 fd×ft + 0.05
playvol + 0.20 efficiency` — so the same craft with better conversion wins:
King '84 (mid 86, eff 89) OFF 92 above DeRozan '17 (mid 94, eff 52) OFF 86.

**Recalibration round 9**: entry to the voted defensive band is **graded** —
membership weight `w = min(1, drep/0.35)` above a 0.05 trace floor blends the
no-vote composite with the voted-band position, so a fading legend slides
instead of falling off a cliff (Kawhi '26 perdef 49 → D 68, not the 50s) and
the empty 60–82 band fills; trace votes still buy nothing (Iverson 45).
Inferred pre-1997 zones are **volume-first** (`0.75 × model + 0.25 × 2P-volume
percentile`) with a **low-2P% clamp** (`0.45 + 0.55 × pct` when the 2P%
percentile is under 0.40), so elite-percentage low-volume posts stop reading
in the 90s (Steve Johnson '83 paint 94 → the clamp doesn't bite him; Calvin
Murphy '83 mid 52, was 99) while high-volume legends rise (MJ paint 93, mid
93; Kareem 98). Perimeter D carries a **size modifier**
(`× min(1, 0.94 + 0.06 × (height − 71)/7)`) — CP3 99 → 93, Jrue/Payton −2,
wings unchanged. `height` (inches) is now on the attribute sheet and in the
card header; it is a fact, so the season smoother never blends it.

**Recalibration round 8**: the archetype labeler is an ordered decision tree —
creation tags before every scoring-diet tag, so a high-usage playmaker can
never read "post scorer" (Defensive playmaker → Engine → Floor general →
Two-way star → Midrange maestro → Freight train → Sniper → Connector →
Anchor → Post scorer → All-around → Balanced; order is law, thresholds are
tunable). Each scoring zone gains a **high-volume premium** of up to +7,
ramping only above the 70th volume percentile — strictly additive, stored
attributes only. And the attribute `out` is renamed **`3pt`** everywhere
(key, labels, sort chips, tooltips, reads); values identical.

**Recalibration round 7 — positional fairness** (rates are positional; global
percentiles misprice classes): `rimprot` is a two-stage deterrent scale —
a composite ≥ 0.60 is percentiled within the rim-protector class onto 55–99,
everyone below caps at 54, so tall men with decent blocks stop riding global
percentiles (Gobert / Wallace / Embiid / Duncan / Giannis 99; Capela 85, KAT
81, Jarrett Allen 83), and the anchor's protection capacity sharpens with it.
`is_big` also accepts `rimprot ≥ 80`, so stretch bigs classify correctly.
`discipline` is percentiled within size class (top-quartile height vs the
rest, per season) — "disciplined for his role" (Wallace 88, Duncan 74,
Giannis 24). O gains a maestro branch (zone mastery at load) and a creator
branch (playvol ≥ 95 and usage ≥ 90 — Westbrook '17 O 81), and OVR carries an
empty-volume tax (extreme load at mediocre efficiency, capped at 5). The
labeler checks creation before shot diet: a 98-playvol / 96-usage player is an
*Engine*, never a post scorer.

**Recalibration round 5**: the coach-trust term is `minutes × (1 − 0.6 ×
usage-pctile)` — usage discounts trust, never zeroes it (high-usage two-way
wings were punished for scoring); the no-vote perdef cap is 58 (was 54;
shrinkage unchanged). Data gap closed: the dataset snapshot predated the May
2026 awards, so the 2025-26 All-Defensive teams (1st: Wembanyama, Holmgren,
Ausar Thompson, Gobert, Derrick White; 2nd: Barnes, Cason Wallace, Adebayo,
Anunoby, Daniels) and the 13 DPOY vote shares (Wembanyama 1.000, Holmgren
0.478 …) were appended to the two award CSVs from Basketball-Reference's
award pages — exact selections only, no All-NBA. O gets a specialist-mastery
floor (`max(std, 0.44 × best zone + 0.25 × efficiency + 0.05 × ballsec)` when
the best zone ≥ 80). Side effect worth knowing: Giannis '20 D now edges
Gobert '19 by a point (95 vs 94).

**Recalibration round 3** (`compute_ovr.py`): offense gates the OVR ceiling for
perimeter players — `OVR = min(raw, max(O + 10, 0.80 × D))` — a defense-first
guard stops one man, but elite defense keeps a floor; bigs cap at O + 40 (an
elite anchor is a defensive system). Jrue '21 80, Smart '22 75, Bowen '06 71,
Draymond '16 76 (O63/D96 → the 0.8·D floor), two-way kings untouched at 99.
Class is position-aware: a lifetime guard (PG/SG on Basketball-Reference,
never PF/C) is never a big whatever his shape — Payton '96 reads 87 (D 98),
not 82, and Tony Allen and Rondo are graded as the guards they are. *All-around* tags the balanced both-ends shape with
no dominant zone.

**Rim protection purified**: `rimprot = 0.55 block% + 0.25 height + 0.20 DBPM`
(within-season percentiles) plus the big-vote bonus — pure shot deterrence.
Rebounding was paid three times (its own attribute, 0.30 of rimprot, and the
anchor term through rimprot, while also feeding the glass); now it lives only
in `drb`, and the big-class D weighs it there (0.40 perdef + 0.40 rimprot +
0.17 drb + 0.03 discipline).

**Recalibration batch 2** (`compute_ovr.py`): O adds ORB (0.03), scores fouls
drawn only through FT (0.05 × fouldraw × FT%), eases passing for scoring
bigs, and adds a usage × efficiency interaction (0.08) — sustained elite
efficiency at max load is a signature; D is class-dependent — bigs 0.40
perdef + 0.46 rimprot + 0.11 DRB + 0.03 discipline, perimeter 0.70 / 0.15 /
0.08 / 0.07 — with a compound big test (rimprot ≥ 55 and out < 45, or rim ≥
60 and out < 40) so 3&D wings aren't graded on rim protection; OVR = 0.50
talent + 0.30 marginal + 0.22 × (0.55 O + 0.45 D). Anchors: LeBron 99
(O97/D94), Kawhi 99 (92/99), Giannis 99 (90/94), Shaq 98, Curry 97 (O98),
Dwight 96 (D98), Gobert 90 (D95 — a flawless anchor outranks a fouling rim
god), Trae 86, Rondo 75. Archetypes name style, never tier: *Freight train*
(max-usage paint hub), *Defensive playmaker* (pass-first stopper), *Connector*
(low-usage shooter-passer with strong perdef).

**OVR** (`data/compute_ovr.py`, the final pipeline step after
`build_ratings.py`; `npm run ovr`): the headline number on every card and
draft list. `OVR = 0.65 × talent + 0.35 × marginal value`, where the marginal
value drops the player into his best-fit slot of a league-average five and
measures the added matchup margin against that five (usage economy, spacing,
anchor logic and the hunted man all price in), percentile-normalised within
position class (bigs vs perimeter) before blending. Display and draft
guidance only — the resolver reads `talent`, never `ovr` (tested). Anchors:
Curry '16 99 (#1), Gobert '19 93, Draymond '16 91, Trae '22 90, Rodman '92 88,
Kerr '96 88 (the known softness — efficiency role players run high; the lever
is the blend weights), Lively '24 81, Battier '06 81. Draft rosters and the
Database sort by OVR by default.

`src/data/players_stats.json` is the player pool: **1,854 real players at their
peak season, 1980–2026.** Every number is derived from real Basketball-Reference
statistics by `data/build_ratings.py` (kept as the Python data step; not ported).
No hand-rated players, no fictional players, no editorial overrides. If a rating
looks odd, it changes by tuning `WEIGHTS` in the pipeline and regenerating —
never by editing the JSON. The only edit the app makes is appending the peak
year to the six real same-name pairs (two Eddie Johnsons, …) so `name` is unique.

Each player carries `talent` + the four sim axes (`in out id pd`) + `attrs`, the
17-attribute sheet: rim, mid, out, ft, fouldraw, usage, efficiency, playvol,
passqual, ballsec, orb, drb, rimprot, perimdisrupt, perdef, discipline,
durability, plus `rim_mid_measured` (false = rim/mid inferred for 1980–96; the
UI marks those with an asterisk). **`attrs` never enters the sim** — the
`Lineup` type has no room for it, and a test asserts a compiled five carries
only the five fields.

One property of this pipeline worth knowing when tuning: it compresses
perimeter D toward the middle for anyone without All-Defense/DPOY votes
(`PD_SHRINK_NOVOTE`), so the pool's `pd` median is ~34 and only ~30 players
exceed 70. That is why the pool generator's "plus defender" bar is relative to
the eligible band rather than a fixed number.

The pipeline also emits `provenance.json` (served from `public/`, lazy-loaded):
for every player-season, the raw inputs behind each attribute — the Advanced
window in the app reads it. It is display-only and adding it provably changes
no rating (the players file is byte-identical with or without it).

```bash
npm run data      # rebuild the eight campaign opponents from the pool
```

## Look

"The box-score, promoted to a broadcast." Editorial sports, dark only, from the
Claude Design redesign: Instrument Serif carries identity and drama, Spline Sans
Mono carries every label and clock, Archivo carries names and numbers. You are
gold, they are ice; red means exactly one thing — the run is over. Talent is the
number; shape is the picture (a 9×22 four-bar glyph, IN·OUT│ID·PD, taught once
per list header); everything else stays quiet until tapped. All tokens live at
the top of `src/styles.css`. Desktop is a multiplier, not a layout: one 900px
media query, 1.5× type, a 562px column.

## Modes

- **One campaign, 120 levels, four eras** (`scripts/campaigns.ts` →
  `src/data/campaigns.json`, flattened in `App.tsx`): last season (1–30), the
  2020s (31–60), the 2010s (61–90), the 2000s (91–120) — thirty team-seasons
  each, worst record first, the era's champions as its last levels (six in
  the 2020s, ten in each of the others), every other level a team-season
  spread evenly across the era's record range. Each era's opponents carry
  +0 / +1 / +2 / +3 points of spread. One save, one star wallet, one staff
  tree; the map shows an era banner at each block.
- **Campaign** — a 30-level map: every team from the most recent season in
  the data, worst record at level 1, best at level 30 (`scripts/opponents.ts`
  builds them; a level's five is the team's five highest-minute qualified
  players). Levels unlock in order; each cleared one keeps its best star rating
  — a sweep is 3, one or two losses 2, three losses 1 — and can be replayed for
  a better one. A loss costs only the attempt. The score is the total, out of
  90. Progress persists per campaign (`src/state/campaign.ts`).
- **Salary Cap Campaign** — the same map, rules and opponents, but every player
  row also carries his salary that season and its share of the league cap
  (`$30.1M · 123.7% of cap` — Jordan '97). `scripts/salaries.ts` joins
  1985–2018 by Basketball-Reference `player_id` and 2019–2026 by name + season
  from ESPN's tables, against a hard-coded cap-by-season table; 87% of the
  10,000 player-seasons have a figure (1980–84 predate the cap; the rest are
  mostly 1985–89 bench rows). Separate save slot.
- **Your team** — the first time a campaign opens you pick a city (any of
  34,000 GeoNames cities with 15,000+ people, `public/cities.json`) and a
  name; the map, draft and series carry it. Rename from the map.
- **Series stats** — every series ends with the two teams one by the other:
  the series, box-score averages over the games played (FG, FG%, threes, 3P%, FTs, FT%,
  REB, AST, STL, BLK, TOV; the per-player lines show FG% / 3P% / FT% rather
  than makes-attempts — `src/engine/boxstats.ts`: possessions derive from the
  score at 113 per 100, free throws from fouldraw, the three-point diet and
  3P% from the lineup's outside-vs-paint identity, twos are what is left —
  PTS = 2×2PM + 3×3PM + FTM exactly, FG% held to 41–53%; rebounds from the
  other side's misses, turnovers from ball security; points are the sim's own), and the rating the sim used.
- **Opponents by position** — a level's five is the highest-minute five that
  covers PG · SG · SF · PF · C by lifetime positions, listed in that order
  (five teams need a player one slot over; none need more).
- **Positions** — a drafted player moves by drag (press and drag his row onto
  another slot) or by tap (chips); into a taken slot only as a swap the other
  player is eligible for.
- **Stars & the staff tree** — stars are a within-campaign currency: the
  map's total (best per level — replaying never farms them) minus what's spent
  in *Staff*, reachable from the map only, between levels. Eleven nodes in three
  branches, each branch a chain (the next node needs the one before), none
  adds a point of rating (`src/engine/tree.ts`): Scout — exact axis numbers instead of bars (36★),
  the matchup reads before drafting (36★), the tape room — the map reveals
  two levels ahead (36★), the wheel whisperer — see the next landing before
  you spin (48★); Front office, one use every draft —
  respin a landed team (24★), version respin a
  drafted player's season (36★), a second team respin (36★), a second
  version respin (36★); Coach — matchup coaching naive→optimal
  (10★, permanent), the matchup board (48★), tempo control — choose σ 8 / 10 / 13 for
  both teams before a level (36★).
  Every node costs **one star** (Tomer's ruling): over a 120-level campaign the
  tree is a checklist you work through, not a scarcity puzzle — the old
  scarcity pin is replaced by a test that fixes the price at 1.
- **Defensive assignment** — `defenseVs(us, them, assignment)`. The AI always
  plays *optimal* (the engine's own: anchor hidden on the worst shooter). The
  player starts *naive*: the anchor takes their most paint-oriented man
  whatever his shooting, everyone else position-on-position, and the draft
  screen shows those matchups so the mistake is visible. The assignment
  changes the anchor's hide factor and his protection cover (the hunt and
  on-ball pressure follow the ball, so naive can never beat optimal). A manual
  board scores the player's own 5-to-5 with the same math. Measured on a real
  five-out opponent the gap is 4.0 DRtg, on a paint opponent 0.0.
- **Team ratings 0–100 and the matchup panel** — every team card carries
  two dials, OFF and DEF (`ratings100`: offense from the usage economy,
  defense measured against `REF_FIVE`, a league-average positional five;
  anchored empirically — 50 = the median of plausible drafted fives (OFF
  132.0, DRtg 113.1), ×3 and ×8 per raw point, 1–99; raw values beneath). They never change
  with the opponent. Once the five is locked, the *Matchup* panel shows
  `matchupSwing` — how many points this pairing shifts against both teams'
  neutral baselines, signed — and the reads that explain it, each with its
  points: anchor hiding spot (yours and theirs), hunted man, steal target,
  the glass. Pure display: the resolver's margin is untouched, and the swing
  is antisymmetric (tests). Typical fives cluster around 50/50 (a sample across the campaign medians
  45/58), walls 90+ DEF, bad-defense extremes compress upward a little.
- **The cap rule** (Salary Cap campaign): the five's combined share of that
  season's cap may not pass **75%** (`CAP_LIMIT`). The draft shows a payroll
  meter under *Your five*, dims and labels roster players you can no longer
  afford ("over the cap") or who have no salary on record — both can still be
  scouted, neither can be drafted — and the wheel only lands on a team-season
  that still holds a priced, affordable, eligible player, so pre-1985 rosters
  simply never come up (the search scans the whole wheel before giving up; it
  never falls back to an illegal team). Every slot still to fill holds back
  **5% of the cap** (`CAP_RESERVE`), so an expensive early pick can't leave you
  playing four men — the meter shows what is held and what is spendable now. The *Salary* branch of the staff tree buys four steps
  of +5% payroll room (75% → 95%).
- **Custom matchup** — build both fives by hand out of the whole database
  (any era, search by name, OVR/OFF/DEF dials on every row, tap a name for his
  card), name the two teams, then play the series with the same engine. No
  wheel, no positions, no cap; the same man can't appear twice in either five.
  The series screen runs in exhibition mode — no level line, no stars.
- **No man twice** — in the campaigns the wheel and the roster now exclude
  every season of a player you already drafted, not just the exact card.
- **Decade spin / Division spin** (Front office): the wheel opens the
  franchise's whole decade (clipped to the data — the 2020s are 2020–2026) or
  that season's whole division; chips on the spun card switch between this
  team, the decade and the division, and the card shows the team's record.
- **Player vs Friend** — hot-seat on one phone. Twelve-player shared board, snake
  draft (A B B A A B B A A B), then the two fives play a best-of-seven with the
  campaign resolver.
- The campaign's draft runs off **the wheel**: five spins per round, each
  landing on a random year + conference + team (1,314 real team-seasons, built
  by `scripts/teams.ts` from per-stint Basketball-Reference rows, so traded
  players appear everywhere they suited up). Tap a player to scout him — the
  draft shows his real season line, not his ratings — assign him to one of his
  **lifetime Basketball-Reference positions** (the union of every position the
  site ever listed for him, any year), and confirm in the dock. A five must cover
  PG · SG · SF · PF · C; the wheel only lands where an open slot can be filled.
  No rerolls. The spin's decelerating name-shuffle is the app's one motion
  besides the Game 7 ticker.
- **Database** — every player, searchable, sortable on talent, the four axes,
  peak year and all seventeen attributes; virtualized.
