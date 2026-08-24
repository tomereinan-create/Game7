# game7 — offense engine update (apply in full)

## Files attached
- `team_rating.py` — source of truth for the team offense/defense formula. Port 1:1 into the sim's compile step (TypeScript), keeping every knob in one exported const.
- `build_ratings.py` + `players_stats.json` — regenerated data. IMPORTANT: a bug had silently dropped the `fouldraw` attribute from every player since an earlier update; this data restores it. Replace your data file AND regenerate any multi-season versions through this pipeline version.

## What the offense engine now does (spec)
Team offense is computed in this order (all details in team_rating.py):

1. **Usage economy.** Natural USG% forced to Σ=100. Creators absorb surplus (weight ∝ creation × usage, creation = .45 playvol + .35 passqual + .20 ballsec); shed comes off high-usage players. Repricing along skill curves: usage above natural costs 0.25–0.9% TS per point (by creation); usage below natural refunds 0.55%/pt gated by baseline TS ≥ .530 (chuckers get no refund).
2. **Usage extremes are bad in BOTH directions.** Below 13% reconciled usage: −1.0% TS per point (skill can't express). Above 32%: −0.6% per point (overload).
3. **Paint-dependent logic.** A player is paint-dependent by DIET, not rating: `out < 40 AND mid < 45`. For these players:
   - Low spacing from the other four (Σ of their out above 55) clogs the paint: up to −7% TS.
   - Natural usage < 20 (finisher): TS bonus up to +6% × best teammate's (creation × out) — a finisher needs a creator who shoots.
   - Natural usage ≥ 24 (hub): TS bonus up to +5% × teammates' spacing — a hub kicks out to shooters.
4. **Creation amplification.** Players below ~30 usage get TS × (1 + 0.06 × usage-weighted team creation).
5. **Stack cap.** Each player's combined interaction multiplier is clamped to [0.90, 1.12]. Never remove this — it prevents degenerate multiplier pileups.
6. **TeamOFF = Σ(usage share × repriced TS) × 2**, then:
   - **+ Fouldraw × FT points**: Σ(usage × fouldraw/99 × ft/100) × 0.06. (Matchup-discipline interaction is reserved for a future matchup layer — do not build it now.)
   - **× ORB second-chance multiplier**: 1 + 0.0012 × Σ(orb−50)+ × miss_factor, where miss_factor rises as team shooting falls (clamped 0.5–1.5). Misses are ORB's raw material.

Defense (unchanged from prior spec): Didx = .45 avg(defimpact) + .30 max(rimprot) + .25 min(defimpact); DRtg = 118 − 0.14×Didx; NET = OFF − DRtg.

## Resolver integration
- Game margin = 0.25 × talent gap + fit term from NET difference + noise(σ=14). Start with fit term = 0.20 × (NET_A − NET_B) and RE-RUN the resolver acceptance tests (mirror 50%±2, talent-gap and counter-swing bands). Tune that 0.20 until they pass; talent must remain first-order.

## Acceptance assertions (encode as unit tests, exact lineups in team_rating.py)
- CHUCK5 worst OFF of the four archetypes; ROLE5 below both star lineups.
- GOAT5 and BALANCED within 1.0 OFF point (currently exactly tied at 140.3); GOAT5 wins total rating via talent term.
- Lively-type finisher's TS at least 4 points higher next to Curry (shooting creator) than next to Rondo (non-shooting creator).
- Shaq-type hub's TS at least 4 points higher with shooters than in a no-spacing lineup.
- Removing the stack cap must FAIL a test (add one that asserts the cap binds for the BALANCED lineup).

## Do not
- Do not apply matchup/discipline interactions yet (future layer).
- Do not "fix" the tie at the top or the clogged-GOATs spacing penalty — both are design decisions.
