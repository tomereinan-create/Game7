# game7 — FULL STATUS REPORT v2

Snapshot **2026-08-24**, read-only: nothing was changed to produce it. Supersedes `STATUS_REPORT.md`
(2026-08-23).

> **READ THIS FIRST — the attribute pipeline source is gone.**
> `data/build_ratings.py` was truncated to **0 bytes** on 2026-08-24 by a bad write from this side
> (`open(path,'w').write(open(path).read()...)` — Python truncates with the outer open before the
> inner read runs). The SHIPPED DATA IS INTACT and the game is unaffected; `compute_ovr.py` reads the
> attributes from `data/players_stats.json`, so every scoring, OVR and tree round since has been
> applied and verified normally. **Only attribute-level rounds are blocked.** §6 covers the state of
> the rebuild, including a genuine copy of the file found inside `game7_formula_modules.zip`.

---

## 1. The formulas, verbatim, as they run today

### 1.1 `o_score` — `data/compute_ovr.py`

```python
def o_score(p):
    a = p['attrs']; z = sorted([a['3pt'], a['rim'], a['mid']], reverse=True)
    std = (0.25*z[0] + 0.09*z[1] + 0.06*z[2] + 0.10*a['efficiency'] + 0.24*a['volume'] + 0.17*a['playvol']
        + 0.10*a['ballsec'] + 0.11*(a['fouldraw']*a['ft']/100) + 0.06*a['orb']
        + 0.08*(max(a['volume'],50)*a['efficiency']/100))
    if max(a['3pt'], a['rim']) >= a['mid'] and ((z[0] > z[1] + z[2] and z[0] >= 91) or (z[0] > 1.5 * (z[1] + z[2]))):
        zone_f = min(1.10, max(0.35, 0.50 + (z[0] - 75) * 0.025))
        _two, _three = _ATT.get(p['name'], (0.0, 0.0))
        if a['rim'] >= max(a['3pt'], a['mid']):
            base = 6.5
            att_f = min(2.85, max(0.30, (_two / 7.5) ** 1.5))
        else:
            base = 5.0
            att_f = max(_three / 8.5, 1.0)
        if a['rim'] >= max(a['3pt'], a['mid']):
            gate_f = min(1.00, max(0.25, 1.00 - (a['ft'] - 58) * 0.075))
        else:
            pre_off = std * 0.93
            gate_f = min(1.00, max(0.25, 1.00 - (pre_off - 55) * 0.025))
        std += base * zone_f * att_f * gate_f
    return std

# display
p['o_ovr'] = int(min(99, round(band(o_score(p) * 0.93, OFF_TOP))))
KNEE, OFF_TOP, DEF_TOP = 93.0, 106.36, 104.5
```

**NO FLOORS EXIST.** Specialist, maestro and creator were deleted in r37 and never returned. The
dominance bonus is the only conditional term in the whole function.

`_ATT` is loaded from `data/provenance.json` at startup: `rim[1]` = paint attempts per 100,
`3pt[1]` = three-point attempts per 100.

#### DIFFERENCES FROM r37 — all direct Tomer updates, in order

| # | change | from → to | why |
|---|---|---|---|
| r38 | dominance bonus gated on the primary zone | any zone → `max(3pt, rim) >= mid` | "instead of hard caps… if primary zone is paint". A towering MIDRANGE is the shot a defence concedes; the rim collapses it inward and the arc stretches it. **Removes Karl Malone's peak seasons from a bonus r37 named him for** — flagged at the time. |
| r39 | the bonus is earned in DEGREE | flat +8 → `8 × zone_f × play_f` | zone > 90 full, 80–90 ×0.75, under 80 ×0.5; playvol < 30 full down to ×0.25 at 50+. His worked example (zone 75, playvol 45 → 0.25) reproduces exactly. |
| r41 | volume multiplies the bonus | `× max(volume/50, 1)` | "high(bonus × vol/50, bonus)" — written as one factor because that IS the high() of the two, so nothing reads its own output. |
| r42 | paint weapons gated on the stroke | + `ft_f` | ft < 60 full, < 65 half, 65+ a quarter. The standard path already pays touch through `0.11 × fouldraw × ft/100`. |
| r43 | every factor becomes a LINE | steps → `clamp` lines | Each line drawn through the MIDPOINTS of the bands it replaced, so the level is unchanged and only the cliff is gone. 473 distinct bonus values, where the ladder produced dozens. |
| r44 | playvol OUT; shooters gated on their own offense | `play_f` deleted, `gate_f` for shooters | 1.00 at pre-bonus OFF 55, 0.50 at 75, 0.25 at 85. Not recursive: reads `std` before the bonus is added. |
| r45 | attempts replace usage | `max(volume/50,1)` → attempt rates | paint attempts/100 hinged 7.5, threes/100 hinged 8.5, both set so the factor behaves as the usage one did (median on the floor, busiest ≈ 2.0). |
| r46 | the two specialists stop sharing a base | 8 → paint 8 / shooter 5 | "Lower the shooter bonus, it's too much." |
| r47 | paint attempts decide more, base pays for it | `max(2PA/7.5,1)` → `clamp((2PA/7.5)**1.5, 0.30, 2.85)`, base 8 → 6.5 | Tuned against his constraint BEFORE applying: Shaq holds or rises, everyone else falls. Measured six (base, exponent) pairs to find it. |
| — | `orb` weight | 0.03 → **0.06** | **r37's own enumeration of the standard path said 0.06** where this side had been locked at 0.03 since r34. The explicit arithmetic won. **If 0.03 was intended, this is a one-number revert.** |

### 1.2 `d_score` and `is_big`

```python
def d_score(p):
    a = p['attrs']
    if is_big(p):
        return 0.40*a['perdef'] + 0.40*a['rimprot'] + 0.17*a['drb'] + 0.03*a['discipline']
    base = 0.70*a['perdef'] + 0.15*a['perimdisrupt'] + 0.08*a['drb'] + 0.07*a['discipline']
    return base * min(1.0, 0.94 + 0.06*(a.get('height', 76) - 71)/7)

p['d_ovr'] = int(min(99, round(band(d_score(p) * 1.10, DEF_TOP))))
```

`is_big` — position first, then shape:

```python
pos = _POS.get(p['name'], [])
if pos and ('PG' in pos or 'SG' in pos) and not ('C' in pos or 'PF' in pos): return False   # lifetime guard
if pos and ('C' in pos or 'PF' in pos) and not ('PG' in pos or 'SG' in pos): return True    # lifetime big
a = p['attrs']
return (a['rimprot'] >= 55 and a['3pt'] < 45) or (a['rim'] >= 60 and a['3pt'] < 40) or a['rimprot'] >= 80
```

Unchanged since before r37.

### 1.3 The OVR chain

```python
# CORE (r40, Tomer's direct update — replaces r37's (0.6o + 0.4d + max(o,d))/2)
raw = max(0.4 * p['o_ovr'] + 0.6 * p['d_ovr'], 0.75 * p['o_ovr'] + 0.25 * p['d_ovr'])

# EMPTY-VOLUME TAX (unchanged)
raw -= min(5.0, 0.06 * max(0, a['volume'] - 72) * max(0, 58 - a['efficiency']))

# BREADTH + SUMMIT FADE (unchanged)
groups = [max(a['3pt'], a['rim'], a['mid']), a['playvol'], max(a['perdef'], a['rimprot']),
          max(a['orb'], a['drb']), a['ballsec'], a['discipline'], a['fouldraw']]
solid = sum(1 for g in groups if g >= 65)
breadth = 4.0 if solid >= 6 else (2.0 if solid >= 5 else 0.0)
raw += breadth * max(0.0, min(1.0, (93 - raw) / 3))

# CAPS (unchanged)
cap = max(p['o_ovr'] + 10, 0.80 * p['d_ovr']) if not is_big(p) else p['o_ovr'] + 40
p['ovr'] = int(min(99, cap, round(band_ovr(raw))))
p['marg'] = int(round(p['_marg']))        # r37: marginal SHIPS but no longer moves OVR
OVR_KNEE, OVR_TOP = 93.0, 96.50
```

`marg` is the class-relative marginal value against the reference five, `40 + 59 × percentile`
within big/perimeter class. It is on every card for the draft and team screens and is **not** part of
OVR.

**Difference from r37:** the core. r37 specified `(0.6·OFF + 0.4·DEF + max(OFF,DEF)) / 2`; r40 (Tomer)
replaced it with `max(40/60, 75/25)`. The two readings cross exactly where OFF = DEF, so a man is
always read on the side he wins on; the defence-led reading takes 52% of cards, verified to be exactly
those with DEF > OFF. This is a large lift for one-way defenders: the 117 cards with DEF ≥ 90 and
OFF ≤ 60 average OVR 72.6.

### 1.4 Attribute pipeline — `data/build_ratings.py`

**THE SOURCE IS GONE (0 bytes).** What follows is what has been PROVED about the lost formulas by
re-deriving them against the shipped data; see §6. Exact on 9,994 of 10,000 cards (the six misses are
name-collision cards the checker does not disambiguate), where `sc(x) = round(1 + 98x)` and every
percentile is taken within the season over the qualifying rows:

```python
durability = sc(P_mp(mp))
volume     = sc(P_vol(usg × (1 - tov/100)) ** 1.15)
ballsec    = sc(1 - (0.65 × P_ratio + 0.35 × P_tov))
             ratio = tov × 25 / max(10, usg + 0.5 × ast)
```

Known from the round prompts and the transcript, NOT yet re-verified exactly (see §6 for why —
a minutes-confidence shrink sits between the formula and the card):

```python
playvol    = sc(0.6 × P_ast ** 1.12 + 0.4 × clamp(ast / 44))
efficiency = sc(0.5 × P_ts ** 1.05 + 0.5 × (0.5 + (ts - league_ts) × 6))
perdef     = W['PD']['drep']*(drep*(1.2-0.8*hp)) + W['PD']['dbpm']*P_dbpm + W['PD']['teamd']*tD
             + W['PD']['height_inv'] * max(0, 1 - max(0, max(75-ht, ht-80))/8)        # r35 sweet band
             PD = dict(drep=0.366, dbpm=0.192, teamd=0.192, height_inv=0.25)          # r36
             if drep == 0: PD = 0.5 + 0.70*(PD - 0.5)
rimprot    = 0.55×P_blk + 0.25×P_height + 0.20×P_dbpm, then + 0.25×(drep × height_pct)
```

### 1.5 Resolver margin — `src/engine/resolver.ts`

```ts
margin = A_TAL × (A.talent - B.talent) + K_MATCH × (A.net - B.net) + (A.bonus - B.bonus) + N(0, SIGMA)
SIGMA = 10   GAMBLER_SIGMA = 13
```

The fit term splits exactly into an offense half and a defense half, and the single gaussian is split
across the two as independent `N(0, σ/√2)` draws so the margin distribution is unchanged. Unchanged
this cycle.

### 1.6 The archetype tree — 43 rules, in priority order

First match wins. `zone` = best of 3pt/rim/mid; `h` = inches; `solid` = how many of zone, playvol,
best defence, best rebounding clear 60; `big` = the numeric shape.

```
 1. Defensive playmaker    playvol >= 80 && perdef >= 80 && zone < 55
 2. Point god              playvol >= 97 && volume < 83 && !big && h < 79
 3. Offensive engine       playvol >= 85 && volume >= 90
 4. Triple-double threat   playvol >= 85 && drb >= 80 && volume >= 88
 5. Point forward          h >= 79 && h < 83 && playvol >= 70 && volume < 92 && !big
 6. Floor general          playvol >= 88 && volume < 88
 7. Floor raiser           playvol >= 90 && efficiency < 45 && volume >= 85
 8. Two-way anchor         big && rimprot >= 90 && o_ovr >= 78
 9. Unicorn                big && three >= 50 && rimprot >= 85 && h >= 86 && ovr >= 70
10. Two-way star           o_ovr >= 85 && d_ovr >= 85
11. All-around star        o_ovr >= 80 && d_ovr >= 80
12. Two-way wing           !big && o_ovr >= 78 && d_ovr >= 85
13. Offensive superstar    o_ovr >= 85 && d_ovr < 70
14. Elite defender         d_ovr >= 90 && o_ovr < 70
15. Three-level scorer     volume >= 80 && efficiency >= 75 && paint >= 65 && mid >= 65 && three >= 55
16. Midrange maestro       mid >= 85 && three < 40 && volume >= 90
17. Slasher                !big && paint >= 80 && fouldraw >= 85 && three < 45
18. Paint beast            paint >= 90 && volume >= 90 && three < 25 && h >= 81
19. Freight train          paint >= 90 && volume >= 90 && three < 40 && mid < 60
20. Tank                   big && paint >= 80 && fouldraw >= 80 && ft < 60
21. Foul merchant          fouldraw >= 90 && ft >= 85
22. Spark plug             h < 75 && volume >= 80 && o_ovr < 85
23. Flamethrower           three >= 90 && volume >= 70
24. Sniper                 three >= 90 && volume < 40
25. Deadeye                ft >= 80 && three >= 80 && volume < 50 && o_ovr < 80 && d_ovr < 70
26. Catch-and-shoot wing   three >= 80 && playvol < 40 && volume < 55 && h >= 77 && h < 83
27. Stretch big            big && three >= 70 && h >= 82
28. Glass cleaner          orb >= 90 && drb >= 90
29. Energy big             big && orb >= 85 && volume < 40
30. Enforcer               big && rimprot >= 70 && discipline < 35
31. Anchor                 rimprot >= 90
32. Elite role player      volume < 60 && playvol < 60 && three >= 50 && o_ovr > 60 && d_ovr > 75
33. 3&D                    three >= 75 && perdef >= 70 && volume < 60
34. Versatile defender     min(perdef, rimprot) >= 68 && d_ovr >= 78 && o_ovr < 80
35. Stopper                perdef >= 90 && volume < 60 && o_ovr < 70 && three < 60
36. Pest                   h < 76 && perimdisrupt >= 90
37. Combo guard            h >= 72 && h < 77 && playvol >= 50 && playvol < 75 && volume >= 60 && volume < 85
38. Throwback              mid >= 75 && three < 20
39. Post scorer            paint >= 70 && mid >= 65 && three < 40 && playvol < 60 && (pos PF or C)
40. Scoring machine        volume >= 90 && zone >= 88 && efficiency >= 50 && volume - playvol >= 20
41. Volume shooter         efficiency < 75 && volume >= 91
42. Scorer                 volume >= 75 && zone >= 75 && playvol < 45 && h < 81
43. All-around             max(zone, playvol, perdef, rimprot, orb, drb) < 88 && solid >= 4
    Balanced               fallback, OVR <= 79
    Unclassified           OVR 80+ and nothing matched — REPORTED, never softened
```

**Two structural changes since the last report.** Rule 39 introduces the tree's **first non-numeric
condition** (position, read from the same lifetime list the draft slots players with). And the
**OVR-79 rescue is deleted**: a good card the tree cannot name is `Unclassified`, not re-read at
relax 10. `npm run unfit` lists them with the rule each came closest to.

---

## 2. Prompt ledger delta

| round | subject | status |
|---|---|---|
| r34 | LOCKED dial state (o_score + ballsec v4) | **applied**, receipts 16/25 (9 OFF targets missed — see §5) |
| r35 | perdef height sweet band | **applied**, receipts 15/15 |
| r36 | *(no design prompt — Tomer: raise `height_inv` to 0.25)* | direct update |
| r37 | zone dominance + new OVR core | **applied**, receipts 27/27, then **SUPERSEDED in part** by r38–r47 and r40 (§1.1, §1.3) |
| — | r29, r30 | **NEVER ARRIVED.** r30's shooter touch was reconstructed from r31's parenthetical; r29's SCORER / SCORING MACHINE tags were defined on this side at Tomer's instruction ("just make on whatever you think and I fix") and have since been reshaped four times by him. |

**Highest applied design round: r37.** Everything after it is Tomer's.

**PIPELINE_VERSION: `compute_ovr.py` = 47.** `build_ratings.py` = **N/A, file is 0 bytes** (it read 47
before the truncation; the shipped data was produced by version 47 of both).

---

## 3. Tomer's direct updates log

Roughly in order. Everything here happened without a design-side prompt.

### Ratings and OVR
1. **r36** — `height_inv` 0.14 → **0.25**, other PD weights renormalised ×0.75/0.86 (drep 0.42→0.366,
   dbpm/teamd 0.22→0.192) to hold the vector at 1.0, because the composite is clamped at 1.0 before
   percentiling and an over-sum would tie elite defenders at the clamp. Added a permanent `PD clamp:`
   counter to the run.
2. **r38–r47** — the specialist bonus, rebuilt in nine steps. See the table in §1.1.
3. **r40** — the OVR core replaced (§1.3).
4. **orb 0.03 → 0.06** — from r37's own enumeration; flagged as a possible transcription error.

### The archetype tree (from 44 rules → 43, with 8 deletions and 6 additions)
* **Deleted:** Microwave, Connector, Secondary creator, and the OVR-79 rescue.
* **Added:** Scorer, Scoring machine (both defined on this side for the missing r29), Combo guard,
  All-around star, Offensive superstar, Elite defender, Volume shooter.
* **Renamed:** Engine → **Offensive engine**.
* **Rewritten:** Elite role player (its old rule wanted OFF ≥ 72 at volume < 60 — unreachable, so the
  tag sat EMPTY for rounds), Deadeye (wanted ft ≥ 95 — one card in 10,000).
* **Retuned:** Unicorn, Point god, Paint beast (×2), Anchor, Freight train, Flamethrower, Stopper,
  Versatile defender, Post scorer, Scorer (×2), Scoring machine (×3), Combo guard (×2), Offensive
  engine, Elite defender.
* **Rule ORDER is now user-editable and persisted**, and the archetype index is sorted A–Z.

### App and tooling
* **Player card** — press any player's name for a full card: verdict rail (OVR/OFF/DEF), archetype,
  the real season line, all 16 attributes, and Advanced. One screen, no scrolling, verified at
  1280×720 and 375×812. Wired into Draft, Database, Versus and Custom.
* **Rank screen Save/Discard** — a move is now a draft applied live but not written; nothing is law
  until Save. Leaving with unsaved moves asks.
* **Saved rankings survive the tree changing** — see §6 bug 2.
* **`npm run unfit`** — the report of cards the tree cannot name, with the rule each came closest to.
* **`ctxFor` exported from pool.ts** — the audit and unfit report used to rebuild the evaluation
  context by hand, which let the audit drift from the labeler it checks.
* **Git** — the project is now a git repository, pushed to `github.com/tomereinan-create/Game7`,
  with every round committed since.

---

## 4. Data and app state

| item | state |
|---|---|
| season smoothing | **20/60/20** (year / prev / next), renormalised to 75/25 at a career edge; injury-gap reach to year+2 when the next season misses the minutes floor |
| smoothed export | `data/export/players_stats_smoothed.json`, 4.57 MB, regenerated 2026-08-24 17:13, MANIFEST at pipeline v47 — **not sent back to the design side this cycle** |
| tracking_defense.csv | 1.76 MB, seasons **2014–2026**, columns `season, category, player_name, dfg_pct, expected_pct, diff_pct, freq, att, gp`; zone split present via `category` (Overall + zones) |
| 2026 awards | present (All-D shares ingested through r9) |
| season-versions | **10,000** cards, 1980–2026, 1,200-minute floor |
| new match/blow-by sources | **none ingested this cycle** |
| archetype histogram | Balanced **59.6%** (FLAG >12%); next largest Enforcer 7.8%, Combo guard 2.7%, Anchor 2.6% |
| empty tags | **Slasher, Freight train** (2 of 43) |
| Unclassified | **27** cards |
| mislabel audit | **0 violations of 10,000** |
| test suite | **84 of 86 pass**; the 2 failures are `invariants.test.ts` reading `build_ratings.py` source, red BY DESIGN until it is restored |

---

## 5. Verification snapshot (smoothed cards)

| card | OVR | OFF | DEF | archetype |
|---|---|---|---|---|
| Kawhi Leonard '17 | 98 | 94 | 97 | Two-way star |
| Giannis Antetokounmpo '20 | 98 | 96 | 95 | Two-way anchor |
| LeBron James '13 | 98 | 97 | 93 | Offensive engine |
| Stephen Curry '16 | 93 | 96 | 81 | Offensive engine |
| Michael Jordan '89 | 98 | 96 | 96 | Two-way star |
| Shaquille O'Neal '00 | **99** | **99** | 89 | Two-way anchor |
| Rudy Gobert '19 | 78 | 56 | 92 | Elite defender |
| Chauncey Billups '06 | 87 | 85 | 77 | Floor general |
| Jaylen Brown '26 | 78 | 84 | 66 | Volume shooter |
| Kyle Korver '15 | 60 | 58 | 62 | Sniper |
| Trae Young '22 | 81 | 93 | 46 | Offensive engine |
| Russell Westbrook '17 | 81 | 91 | 62 | Offensive engine |
| Draymond Green '16 | 79 | 54 | 96 | Elite defender |
| DeMar DeRozan '17 | 81 | 86 | 69 | Offensive superstar |
| Steve Nash '07 | 72 | 82 | 42 | Point god |

**Resolver acceptance suite: PASS** (11/11 across `resolver.test.ts` and `parity.test.ts`).
**Parity test: PASS** — 50 random lineup pairs agree between `team_rating.py` and `offense.ts` within
0.5 points.

### The named pairs

* **Billups '06 − White '25 = 19 OFF** (85 vs 66). Target was 9–12. **Still open, and now wider.**
* **Billups '06 − Brown '26 = 1 OFF** (85 vs 84).

---

## 6. Bugs and open items — documented, not fixed

**1. `data/build_ratings.py` is 0 bytes.** Cause and blast radius in the banner above. Recovery state:

* A **genuine copy exists** at `game7_formula_modules.zip → pipeline/build_ratings.py`, **32,467 B,
  md5 `e4621876b495`** — matching the first status report's recorded hash exactly. It is committed to
  the GitHub repo. **It is NOT current:** it still contains `passqual`, `usage` (not `volume`),
  ballsec v2, `efficiency = sc(P_ts ** 1.30)`, smoothing 65/20/15, `ERA_ALPHA 0.5` and a PD vector
  with `stl` and `trust` terms — i.e. the state before recal_12. Restoring it means re-applying
  ~25 rounds, all of which are recorded as patch scripts.
* **Independently, the formulas are being re-derived from the shipped data**, which is a stronger
  check than any copy: `data/provenance.json` records every attribute's RAW INPUTS plus the smoothing
  weights and the pre-smoothing value of anything smoothing changed. Verified so far — ingestion,
  the exact 10,000-card set (season ≥ 1980, minutes ≥ 1200, TOT row preferred; ties on colliding
  names go to the higher-talent card, the other takes ` (b)`), and `durability`, `volume`, `ballsec`
  exact on 9,994/9,994.
* **Newly discovered while re-deriving:** a **minutes-confidence shrink** pulls low-minute cards
  toward the middle of the scale. Playvol is not monotone in AST% — Ibaka '16 and Mozgov '16 both
  have AST% 3.9 and land on 5 and 23, separated only by minutes (2,500 vs 1,326). The same curve
  lifts playvol 35→83%, efficiency 24→61% and drb 35→83%; volume, ballsec and durability match
  WITHOUT it. Curve so far: `min(1, (mp/2400) ** 0.9)`. Working notes in `tools/rebuild/`.

**2. Saved rankings were being discarded silently (FIXED this cycle, recorded here because it was a
real defect).** A stored order was honoured only if it named exactly the tags of the build reading it,
so every round that added, deleted or renamed a rule threw the user's ranking away without a word. It
now reconciles: surviving tags keep their relative order, dead tags drop, unseen tags land where the
shipped law puts them, and the repaired order is written back. Four tests pin it.

**3. r38 contradicts r37's own ratified list.** r37 named the bonus for the
"Malone/Robinson/Giannis/Shaq/Zion/Kareem class"; r38's 3PT/paint gate removes Karl Malone's peak
seasons, because in this data he is a MIDRANGE weapon (mid 95, rim 77, 3pt 14 in 1997). 8 of his 19
seasons still fire. If the intent was to cut midrange SPECIALISTS while keeping interior scorers, the
gate wants to be about the rim being real (`rim >= 70`) rather than about which zone is highest.

**4. The one-end tier tags cost 4 canonical checks.** Ranked above the diets (as shipped),
Offensive superstar and Elite defender take the diets' best men — Rodman '92 reads Elite defender
rather than Glass cleaner, DeRozan '17 Offensive superstar rather than Midrange maestro — and
canonical falls 22 → 18. Ranked below every diet, the names come back but Elite defender drops from
199 cards to 10. Shipped high; it is one drag in the rank screen either way.

**5. Slasher and Freight train are empty.** Freight train emptied when `mid < 60` was added (14 → 2 →
0 as later rounds moved cards): almost every high-volume paint scorer has some mid-range game.
Slasher has been empty since r22 made `big` a shape.

**6. Balanced is 59.6% of the pool.** Long-standing and unchanged in character: the tree is
star-focused, so most role-player seasons match nothing. It is the honest fallback, not a bug, but it
is the largest single number in the histogram by a factor of eight.

**7. The Billups–White gap is 19 OFF against a 9–12 target**, and Billups–Brown is 1. Neither has
been addressed by any round this cycle.

**8. `data/players_stats.json`, `src/data/players_stats.json` and the smoothed export are three
copies of the same 4.5 MB payload**, kept in sync by hand (`cp` + `npm run data`) after every
regeneration. Nothing enforces it.
