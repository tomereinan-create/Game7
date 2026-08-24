# game7 — team ratings (0-100) + matchup panel restructure

## Engine additions (attached team_rating.py — port as-is)
- `ratings_100(five)` -> (OFF 0-100, DEF 0-100). Opponent-INDEPENDENT: offense from team_offense, defense measured against REF_FIVE, a realistic league-average positional five (not flat averages — anchors/hunts must register). Bands in RATING_BANDS.
- `matchup_swing(us, them)` -> signed pts/game: how much THIS pairing shifts the margin vs both teams' neutral baselines. Positive favors us. This isolates the pairing effect from raw quality.

## UI restructure
1. TEAM CARDS (always visible, opponent card too): two 0-100 dials — OFF and DEF — replacing raw 130.5/113.3 numbers as the headline (raw values move to the detail row beneath).
2. After the player locks his five: a separate MATCHUP panel (its own category, between the team cards and SIM):
   - Headline: "Matchup: +X.X pts" (matchup_swing, signed, colored).
   - Beneath it the existing computed reads, reframed as the EXPLANATION of that number: anchor hide (yours & theirs), hunted man (who, hunter, mitigated or not), steal target (ballsec x usage), glass battle. Each line shows its pts contribution where available.
   - The pre-sim probability panel stays; spread = talent term + fit + matchup, unchanged math.
3. Calibration reference points (sanity, not tests): all-time creator lineups ~OFF 95 / DEF ~85; elite defensive wall ~OFF 55 / DEF ~95; shooter sieve ~OFF 45 / DEF ~5; chucker pile ~OFF 25 / DEF ~15.

## Acceptance
- ratings_100 is pure display: resolver/margins byte-identical.
- OFF/DEF of a lineup never change when the opponent changes; only the MATCHUP panel changes.
- matchup_swing(A,B) == -matchup_swing(B,A) within rounding.
