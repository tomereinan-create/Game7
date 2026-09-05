"""OVR = 0.65 x talent + 0.35 x engine-derived marginal value (class-relative).
The marginal value drops the player into his best-fit slot of a league-average five and measures the
added matchup margin vs that same five, so usage economy, spacing, anchor logic and hunted-man all price in;
it is percentile-normalised within position class (bigs vs perimeter) before blending.
FINAL pipeline step: build_ratings.py -> compute_ovr.py. Reads and rewrites players_stats.json in place
(the 10,000-season file; names carry the year).  python compute_ovr.py [path/to/players_stats.json]"""
import bisect, io, json, os as _os, re, sys

# VERSIONING LAW (sync verdict 3): one integer, bumped per applied batch, printed by every receipt and
# shown on the app's debug panel. Both pipelines carry it so a card can always be traced to the code
# that made it. 21 = recal_21 + the pipeline-sync verdict.
PIPELINE_VERSION = 133

# team_rating.py's functions only — its demo section at the bottom expects the peak-only file.
src = io.open('team_rating.py', encoding='utf-8').read()
head = src.split("P = {p['name']")[0]
tail = src[src.index('# ---------- DEFENSE v2'):]
tail = re.sub(r"^print\(.*\n", "", tail, flags=re.M)
tail = re.sub(r"^for name, L in LINEUPS.*\n(^[ \t].*\n)*", "", tail, flags=re.M)
exec(head); exec(tail)

# OVR v3 (recal_37): the three-weight blend is retired. The marginal term is out of the card entirely
# and the remaining two are folded into a single expression that leans toward whichever end leads —
# see the core below. The constants are kept only so an older receipt can still name what it replaced.
W_OFF, W_DEF, W_MARG = 0.45, 0.20, 0.35   # SUPERSEDED by recal_37; nothing reads them

# CARD MODES — two READ-ONLY inspections of a single card, added so a round can be dispatched (and
# argued about) without anyone re-deriving the arithmetic by hand:
#     python compute_ovr.py --read    "Shaquille O'Neal '00"   one line: OVR/OFF/DEF + every attribute
#     python compute_ovr.py --explain "Shaquille O'Neal '00"   every weighted term, the bonus, the
#                                                              band, the blend, and his ranks
# Both compute the WHOLE board (the ranks need it) and both exit BEFORE anything is written — no
# players_stats.json, no export/, no pipeline.json. They also skip the marginal-value loop, which is
# the only slow step in the run and feeds nothing but p['marg'], a field neither mode prints.
# NOTHING IN THE NORMAL PATH IS CHANGED: the tracing below is opt-in per call and adds no arithmetic.
_argv, _EXPLAIN, _READ, _rest, _i = sys.argv[1:], None, None, [], 0
while _i < len(_argv):
    if _argv[_i] == '--explain' and _i + 1 < len(_argv): _EXPLAIN = _argv[_i + 1]; _i += 2
    elif _argv[_i] == '--read' and _i + 1 < len(_argv): _READ = _argv[_i + 1]; _i += 2
    else: _rest.append(_argv[_i]); _i += 1
_CARD = _EXPLAIN or _READ
path = _rest[0] if _rest else 'players_stats.json'
players = json.load(io.open(path, encoding='utf-8'))

# ATTEMPT RATES (recal_45). The specialist bonus scales with how often a man fires HIS OWN shot, and
# those rates are already recorded per card in the provenance sidecar as the raw inputs to the rim and
# 3pt ratings: rim[1] is paint attempts per 100, 3pt[1] is three-point attempts per 100. Read here so
# the bonus can use them; a card with no sidecar entry simply gets the floor.
_ATT = {}
try:
    _prov_path = _os.path.join(_os.path.dirname(_os.path.abspath(path)), 'provenance.json')
    for _n, _m in json.load(io.open(_prov_path, encoding='utf-8')).items():
        _r, _t = _m.get('rim'), _m.get('3pt')
        _ATT[_n] = ((_r[1] if _r and len(_r) > 1 and _r[1] is not None else 0.0),
                    (_t[1] if _t and len(_t) > 1 and _t[1] is not None else 0.0))
    if not _CARD: print(f"attempt rates loaded for {len(_ATT):,} cards")
except Exception as _e:
    print(f"WARNING: no attempt rates ({_e}) — the specialist bonus falls back to its floor")
if _CARD:
    # the card modes never print or write marg, so the 10,000-card matchup sweep is skipped whole;
    # a constant leaves the percentile below well-defined and costs nothing that is read again.
    for p in players: p['_raw'] = 0.0
else:
    for p in players:
        best = -99
        for i in range(5):
            L = REF_FIVE[:i] + [p] + REF_FIVE[i + 1:]
            m = matchup_margin(L, REF_FIVE)
            if m > best: best = m
        p['_raw'] = best

import os
_here = os.path.dirname(os.path.abspath(__file__))
_cands = [os.path.join(os.path.dirname(os.path.abspath(path)), 'stats.json'), os.path.join(_here, '..', 'src', 'data', 'stats.json')]
_stats_path = next((c for c in _cands if os.path.exists(c)), None)
if not _stats_path: raise SystemExit('stats.json (lifetime positions) not found - the guard rule needs it')
_STATS_RAW = json.load(io.open(_stats_path, encoding='utf-8'))
_POS = {k: (v or {}).get('pos') or [] for k, v in _STATS_RAW.items()}
# recal_96 (HIS RULINGS, verbatim: "Ty Jerome '25 OFF should be high 60's to mid 70's. Not 81" and
# "Montrezl Harrell '18 is too high OFF as well"). THE LOAD TERM — read from the SAME sheet the
# position rule already reads, so no new input is introduced to the pipeline.
_MPG = {k: (v or {}).get('mpg') for k, v in _STATS_RAW.items()}

# LOAD_FULL: the minutes at which a per-possession profile is paid in full. LOAD_FOOT: the minutes
# below which the load terms earn nothing. Both are stated in COST and derived, not chosen by taste:
# see the long comment at the load term itself, inside o_score.
LOAD_FOOT, LOAD_FULL = 12.0, 24.0
# recal_99: the evidence recal_91's stretch-big terms are paid against - load, or glass.
SB_V_LO, SB_V_HI, SB_ORB_LO, SB_ORB_HI = 8.0, 22.0, 45.0, 65.0
def load_share(p):
    """How much of a full workload this card actually carried, in [0, 1]. 1.0 = full price, and the
    card is byte-identical to what it was. MEASURED, OR NOT AT ALL: a card with no minutes on the
    sheet takes 1.0 — no discount, no boost — which is recal_52's rule for the attempt rates, applied
    to the same kind of gap for the same reason."""
    m = _MPG.get(p['name'])
    if m is None: return 1.0
    return min(1.0, max(0.0, (m - LOAD_FOOT) / (LOAD_FULL - LOAD_FOOT)))

def is_big(p):
    # compound: rim protection alone doesn't make you a big (long-armed wings tripped the old threshold),
    # and a lifetime guard (PG/SG by Basketball-Reference, never PF/C) is never a big whatever his shape -
    # Payton-type post-defending guards were being graded as anchors
    pos = _POS.get(p['name'], [])
    if pos and ('PG' in pos or 'SG' in pos) and not ('C' in pos or 'PF' in pos): return False
    # ...and the mirror: a lifetime big (PF/C, never PG/SG) IS a big whatever his shape. Without this the
    # positive case was shape-only, so a shooting big who isn't an elite deterrent failed every clause -
    # Towns '18 (rimprot 78, 3pt 77) and Jokic '26 graded as PERIMETER players, took the 0.70-perdef mix
    # and the perimeter OVR cap, and could not reach the archetype they define ("Stretch big" needs big).
    # The 'never PG/SG' half is load-bearing, NOT decoration: _POS is the UNION of every position B-Ref
    # ever listed (scripts/stats.ts), so one season logged at PF marks a wing for life. Dropping it makes
    # bigs of DeRozan, Korver, Maggette and 6'3" Mike Dunleavy - and routes Paul George '19's defense to
    # rim protection he hasn't got (D 95 -> 84). Strict on both sides or the rule leaks.
    if pos and ('C' in pos or 'PF' in pos) and not ('PG' in pos or 'SG' in pos): return True
    # recal_72 (design-side "67"): a big's rim presence must at least match his perimeter rating —
    # the first shape clause was classifying SF-only stoppers (Reggie Williams-class) as bigs, halving
    # their perdef's authority (0.79 -> 0.40) and charging guard drb at 0.17. Shape branch only; the
    # position branches above are UNTOUCHED (and they, not this clause, hold the round's named card:
    # Anunoby '26 is lifetime SF/PF-never-guard, so the position rule decides him first — receipt 72).
    a = p['attrs']; return (a['rimprot'] >= 55 and a['3pt'] < 45 and a['rimprot'] >= a['perdef']) or (a['rim'] >= 60 and a['3pt'] < 40) or a['rimprot'] >= 80   # stretch bigs classify by deterrence, whatever their range

# recal_93 (HIS RULINGS, verbatim: "Agree with 14 andre", "Agree with 16 Jimmy",
# "Scotty 03 maybe around 75-77"). THE DEFENCE-BRANCH CLIFF.
#
# THE DEFECT, stated as the scout found it. is_big's MIDDLE shape clause — `rim >= 60 and 3pt < 40` —
# decides which of the two d_score formulas a card is graded by, and it is a CLIFF: one point of
# either bar swaps a man from the perimeter mix (0.63 perdef / 0.13 rimprot / 0.11 perimdisrupt /
# 0.07 drb / 0.06 discipline, x the size modifier) to the big mix (0.40 perdef / 0.40 rimprot /
# 0.17 drb / 0.03 discipline), and DEF moves 15 to 23 points in one step. 76 adjacent-season pairs
# flip across it. The three cards he ruled on are all the same accident:
#   Andre Iguodala '14  3pt 42 -> 38 across the line, DEF 93 ('13) -> 70 ('14) -> 88 ('15) on perdef 92
#   Jimmy Butler '16    3pt 45 -> 36 -> 42 across '15/'16/'17, DEF 89 -> 71 -> 83 on perdef 88/84/79
#   Scottie Pippen '03  rim touched EXACTLY 60 with 3pt 23
# The deeper complaint is that the clause reads a SHOT DIET: `rim` and `3pt` are the offensive zone
# ratings (o_score sorts them as z[0..2]), so how a man SCORES was deciding how he is GRADED on
# defence. A wing who stopped shooting threes was re-graded as a rim protector he never was —
# Iguodala '14 took the big mix on rimprot 39.
#
# THE FIX: A RAMP, ON THE CLAUSE'S OWN DEFENSIVE BAR. d_score's branch weight is now continuous in
# [0, 1] and the two mixes are BLENDED, so no card can move more than a fraction of the 15-23 gap
# for one point of anything. Two changes of substance, both inside this one clause:
#   1. the rim SCORING rating is replaced by RIMPROT, the defensive claim the branch is actually
#      about — a big's defensive votes routing to rim protection is the whole reason the big mix
#      exists, and a man with rimprot 39 has no such votes to route.
#   2. both bars ramp instead of stepping, between the clause's OWN numbers: rimprot 45 -> 80, where
#      80 is the third clause's own "an elite deterrent is a big whatever his shape" bar (so that
#      clause stops being a separate cliff and becomes the top of this ramp), and 3pt 40 -> 30, so
#      the `3pt < 40` line is a ten-point fade rather than a step.
# The first two clauses are UNTOUCHED and still return a hard 1.0: clause 1 already reads defensive
# shape (rimprot >= perdef), and clause 3 is the ramp's own ceiling. The POSITION branches above are
# untouched, so all 4,307 position-decided bigs (PF/C, never a guard) move by exactly ZERO — no
# genuine big is touched by this round, measured, not asserted.
#
# WHAT IT DOES NOT TOUCH: is_big itself. The boolean still labels the card (p['big']), still picks
# recal_55's big hub and recal_91's stretch-big floor inside o_score, still splits the marginal
# percentile classes, and still chooses the OVR cap branch. OFF therefore moves on ZERO cards.
# MEASURED: DEF moves on 222 of 10,000; Iguodala '14 70 -> 90, Butler '16 71 -> 85, Pippen '03
# 70 -> 76; every standing anchor passes, Pippen '94 (the hardest, 92 +-1) included at 93.
# THE ALTERNATIVE HE ASKED BE MEASURED — branch from the man's defensive shape as a CLIFF
# (rimprot vs perdef instead of rim vs 3pt) — is INFEASIBLE and was measured over the whole
# (threshold, slack) grid: it reads Pippen '03 at either 70 (still big) or 79 (perimeter) and never
# 75-77, and every setting that routes him to the perimeter also routes Pippen '94 there and breaks
# his 92 +-1 anchor at 96. Only a blend reaches a number BETWEEN the two formulas. See receipt 93.
DEF_RP_LO, DEF_RP_HI = 45.0, 80.0   # the ramp on rim protection; 80 is clause 3's own bar
DEF_3P_LO, DEF_3P_HI = 30.0, 40.0   # the fade on the clause's own `3pt < 40` line
DET_LO, DET_HI = 68.0, 80.0         # recal_99: the deterrence clause's own ramp, on rimprot alone
# recal_136 (HIS RULING, verbatim: "Ken Norman Agree"). THE LAST UNRAMPED CLAUSE.
#
# THE DEFECT, decomposed on the card the ruling names. Ken Norman '94 reads DEF 46 where his own
# '93 reads 61, on a quiet decline: rim protection 61 -> 53, perimeter defence 43 -> 38, defensive
# rebounding 61 -> 62 — nothing on the sheet moves by fifteen points and the printed number moves by
# fifteen. The whole of it is d_bigness clause 1, `rimprot >= 55 and 3pt < 45 and rimprot >= perdef`,
# which returns a hard 1.0: at rimprot 61 he takes the WHOLE big verdict and at 53 he takes 0.09 of
# it, so the formula he is graded by changed underneath him for eight points of one bar. His own big
# vector still reads 48.79 x 1.1305 = 55.2 against a perimeter vector of 45.2, and the ruling's
# number is his big vector.
#
# WHY THIS CLAUSE AND NOT ANOTHER. recal_93 replaced the MIDDLE shape clause's step with a product
# of two ramps and recal_99 gave the DETERRENCE clause its own; both rounds explicitly left clause 1
# alone ("the first two clauses are UNTOUCHED and still return a hard 1.0: clause 1 already reads
# defensive shape (rimprot >= perdef)"). Reading defensive shape is why the clause is right; it is
# not why the clause may STEP. It is the last hard 1.0 in the function, and the pool shows the step
# exactly where the constant is: of the shape-decided cards with 3pt < 45 and rimprot >= perdef,
# the 27 at rimprot 52-54 average d_bigness 0.17 and DEF 52.4, and the 12 at 55-57 average 1.00
# and DEF 57.8. Five rating points, five and a half printed points, and nothing between them.
#
# THE RAMP, AND IT INTRODUCES NO NEW CONSTANT. The clause's own bar 55 becomes the point of
# SATURATION and its foot is DEF_RP_LO — 45, the middle clause's own rim-protection foot, one line
# above. The two rim-protection ramps therefore start together and the function has one story about
# where a rim-protection claim begins, not two. The clause's other two tests are BYTE-IDENTICAL and
# still hard: `3pt < 45` (the clause is about a man who does not shoot) and `rimprot >= perdef`
# (recal_99's own guard, and the reason this ramp is a class statement rather than a bonus).
# At rimprot >= 55 the clause returns 1.0 exactly as it did, so no card the clause already decided
# moves by anything — verified, not asserted: Jared Dudley '19 sits ON 55 and reads 56 either way.
# MEASURED: 32 of 10,000 cards move on DEF, 30 up and 2 down, max +7 and max -2; OFF and every
# attribute move on ZERO (is_big is untouched, so the boolean, the big hub, the stretch-big floor
# and the OVR cap branch are all byte-identical); OVR follows on 20 cards, max +3. Every anchor
# holds. The movers are one archetype — scoring forwards with real size and no perimeter sheet:
# Dominique Wilkins '97, Mike Mitchell '81-'84, Glenn Robinson '97-'02, Alex English '85.
C1_RP_LO, C1_RP_HI = DEF_RP_LO, 55.0   # recal_136: clause 1's own step, made a ramp; both ends already existed
# recal_103 (HIS RULING, verbatim: "Herb jones DEF way too low all seasons"). THE POSITION RULE
# ITSELF, which is the third and last place a man's SHOT DIET was deciding his defensive formula.
#
# WHERE THE DEFECT ACTUALLY WAS. The scout put Herbert Jones on is_big's first shape clause; he is
# not on it. That clause already carries `rimprot >= perdef` and fails for him (65 against 96), and
# it is never reached anyway: `pos` is ['SF', 'PF'], so the POSITION branch returns 1.0 on the line
# above and no shape test runs at all. One season logged at power forward made a 6'7" wing a big for
# life, and the big mix then graded the best perimeter sheet in the pool on rim protection 65 and
# defensive rebounding 16 — 0.57 of the weight on his two worst bars, and 0.00 on the perimeter
# disruption of 87 that is most of what he does. His perimeter vector reads 80.2 against a big
# vector of 67.4, and he printed DEF 76.
#
# THE OVERRIDE, and why it is this quantity. A position big stays a big BY DEFAULT — recal_72's
# warning holds and is not reopened ("_POS is the UNION of every position B-Ref ever listed... Strict
# on both sides or the rule leaks"). What is new is that his own sheet may CONTRADICT the listing,
# and the contradiction is measured on the one act that is unambiguously a big's defensive job:
# DEFENSIVE REBOUNDING. A man whose perimeter disruption runs far ahead of his rebounding is not
# playing the position he is listed at, whatever a box score once called him. `perimdisrupt - drb`
# separates the two populations cleanly and with room to spare: Herbert Jones reads +79 / +71 / +69
# / +54 across his four seasons, while every genuine big is NEGATIVE — Tim Duncan '03 -92, Dennis
# Rodman '90 -74, Rudy Gobert '19 -73, Domantas Sabonis '21 -53, Kevin Garnett '04 -40, Ben Wallace
# '04 -18, Draymond Green '16 -8. Rodman and Draymond are the proof that the OBVIOUS quantity would
# not have worked: both have perdef ABOVE rimprot (-21 and -14 on that difference, the same side as
# Jones), so a rimprot-vs-perdef test cannot tell them apart from him, and both are anchored.
#
# NOT is_big. Only d_score's branch is affected, exactly as recal_93 did it: the boolean still labels
# the card, still gates the big hub and the stretch-big floor, still picks the OVR cap branch. OFF
# therefore moves on ZERO cards. MEASURED: 26 cards move on DEF, Jones reads 90 / 91 / 91 / 81, every
# anchor holds, the top 12 by DEF is identical and the top 50 by OVR does not move at all. The other
# movers are the same archetype found by the same test — Luc Mbah a Moute '17, Thaddeus Young,
# OG Anunoby '25, Gerald Wallace: wings a box score once listed at power forward.
POS_GAP_LO, POS_GAP_HI = 30.0, 60.0   # perimdisrupt - drb, over which a listed big is graded as a wing
def d_bigness(p):
    """How much of the BIG d_score mix this card is graded by, in [0, 1]. 0 = the whole perimeter
    verdict, 1 = the whole big verdict. The lifetime-guard branch and the third shape clause are
    is_big's, byte for byte; the middle clause is recal_93's ramp, the deterrence clause is
    recal_99's, clause 1 is recal_136's ramp (identical to is_big's at rimprot 55 and above), and
    the position-big branch is recal_103's shape override."""
    pos = _POS.get(p['name'], [])
    a = p['attrs']
    if pos and ('PG' in pos or 'SG' in pos) and not ('C' in pos or 'PF' in pos): return 0.0
    if pos and ('C' in pos or 'PF' in pos) and not ('PG' in pos or 'SG' in pos):
        _gap = a['perimdisrupt'] - a['drb']
        return 1.0 - min(1.0, max(0.0, (_gap - POS_GAP_LO) / (POS_GAP_HI - POS_GAP_LO)))
    if a['rimprot'] >= 80: return 1.0
    # recal_136: clause 1 is a RAMP on its own rim-protection bar, from DEF_RP_LO to its own 55.
    # Above 55 this is the hard 1.0 it always was; below it, the man is graded as a big in
    # proportion to the rim-protection claim he actually has. Its other two tests are untouched.
    w_c1 = (min(1.0, max(0.0, (a['rimprot'] - C1_RP_LO) / (C1_RP_HI - C1_RP_LO)))
            if a['3pt'] < 45 and a['rimprot'] >= a['perdef'] else 0.0)
    w_rp = min(1.0, max(0.0, (a['rimprot'] - DEF_RP_LO) / (DEF_RP_HI - DEF_RP_LO)))
    w_3p = min(1.0, max(0.0, (DEF_3P_HI - a['3pt']) / (DEF_3P_HI - DEF_3P_LO)))
    # recal_99 (HIS RULING, verbatim: "Agree with 1-7"). THE RAMP STILL CLIFFED FOR SHOOTERS.
    # recal_93 replaced the middle clause's step with the product above, but the 3pt factor is ZERO
    # for any card at 3pt >= 40 - so for a real shooter the whole product is zero and the branch was
    # still decided by the single line `rimprot >= 80`, the very cliff r93 was written to remove.
    # Kevin Durant is the case: '18 rimprot 84 -> DEF 75 and '19 rimprot 78 -> DEF 53, twenty-two
    # points on six points of rim protection; '23 83 -> 74 and '24 78 -> 56.
    # THE FIX: the absolute-deterrence clause gets its OWN ramp, on rim protection alone, so it
    # engages for a shooter exactly as it does for anyone else. It runs from 68 to 80 - 80 being
    # clause 3's own bar, which is therefore left byte-identical above - and it is GUARDED by
    # clause 1's own test, `rimprot >= perdef`: deterrence may pull a man toward the big mix only
    # when his rim protection is at least his perimeter defence. Without that guard the ramp also
    # DEMOTES elite perimeter defenders whose big vector is lower than their perimeter one (LeBron
    # '11 97 -> 94, Kawhi '16 95 -> 94); with it, the term can only ever lift, which is what a
    # clause called "an elite deterrent is a big whatever his shape" should do. MEASURED: 27 cards
    # move on DEF, every one of them UP, none of r93's own anchors moves, and Durant '18 and '23
    # hold at 75 and 74 exactly.
    w_det = (min(1.0, max(0.0, (a['rimprot'] - DET_LO) / (DET_HI - DET_LO)))
             if a['rimprot'] >= a['perdef'] else 0.0)
    return max(w_rp * w_3p, w_det, w_c1)

# offensive / defensive sub-ratings: SKILL composites from the attribute sheet
# (marginal-in-average-team measures fit value, not end-skill - wrong tool for display)
# recal_138 (HIS RULING, verbatim: "Magic agree a lot, maybe even 94-6"). THE HUB IS A ROLE, NOT A
# BODY — and a hub's creation is his team's LOAD, so it is priced wherever load is priced.
#
# THE CARD, decomposed. Magic Johnson '90 is his best box season — BPM 10.1, OBPM 8.3, .622 true
# shooting, 22.3 points and 11.5 assists in 37.2 minutes — and it printed OFF 87, FOUR BELOW his own
# '89 (91). Nothing in the box explains four points; one attribute does. His three-point rating went
# 37 -> 60 (he shot 38% from the arc that year), which flips is_big's middle shape clause
# `rim >= 60 and 3pt < 40` OFF, and recal_55's BIG HUB (+4.90) goes with it. His two seasons' raw
# o_scores are 93.28 [perimeter] and 93.45 + 4.90 [big]: the man is identical and the FLAG is the
# difference. recal_103 recorded this seam as open; recal_93 wrote the diagnosis for the defensive
# side of it in one sentence — "how a man SCORES was deciding how he is GRADED".
#
# WHY THE FLAG WAS THERE, AND WHY IT IS THE WRONG QUESTION. recal_55's own words are "an efficient
# playmaking CENTER had no channel — his assists scored through playvol's 0.19 like everyone's, and
# nothing priced the offense that RUNS THROUGH him." The claim is about a ROLE. `is_big` was a proxy
# for it, and in 2019 it was a good one, because the only unpriced hubs anybody was arguing about
# were centres. It is not a good proxy for a 6'9" point guard, and it breaks on a shot he learned.
#
# THE CLASS FUNCTION, and every number in it already existed.
#   A BIG IS STILL A HUB, unconditionally: `is_big` returns _role = 1.0 and recal_55's own class is
#     BYTE-IDENTICAL. This round only ADDS a second way in.
#   THE ROLE ITSELF is measurable on the two bars o_score already carries: more of the offence goes
#     through his hands as CREATION than as his own SHOT. `playvol - volume`, ramped over the hub's
#     OWN ramp width (HUB_FULL - HUB_GATE = 20), so it is a fade and not a step — which is what keeps
#     Russell Westbrook '17 (playvol 99, volume 98, surplus ONE) at 0.05 of the term and holds
#     recal_121's order pin '15 >= '17. Magic '90's surplus is 29 and he is at 1.00.
#   AND HE MUST CARRY A REAL SHARE HIMSELF: volume >= PD_V_HI. That is recal_117's own band top, 68,
#     which is the volume ABOVE which recal_109's elite-passer term pays nothing at all. So the two
#     creation channels are DISJOINT BY CONSTRUCTION and no card can be paid twice for one assist
#     rate — the same construction recal_112 and recal_109 use across playvol 70, and recal_131 and
#     recal_64/107/112 use across volume 55. John Stockton (volume 36), Steve Nash '05 (42) and all
#     three Mark Jacksons are on recal_109's side of the line and move by EXACTLY zero.
#
# THE SIZE, and it is DERIVED rather than inherited. recal_55 set the premium at 0.05 x playvol and
# never said why; recal_98 ramped the gate and explicitly left "the weight and the class function"
# alone. The claim now states its own price: a hub's creation IS his team's load, so it is paid at
# the LOAD weight instead of the CREATION weight, and the premium is the gap between them —
# 0.26 - 0.19 = 0.07, both of them recal_89's LOCKED DIAL STATE. Written as a premium ON TOP of the
# 0.19 the standard path already pays, the total is exactly 0.26 and the rate is paid ONCE.
#
# AND WHEREVER LOAD IS PRICED, which is the third consequence of the same sentence and not a fourth
# idea. o_score prices load in exactly TWO places: the 0.26 weight, and recal_26's SIGNATURE
# interaction `0.08 x max(volume, 50) x efficiency / 100` — "elite conversion on a modest load is
# real scoring signal". A hub's load is his creation, so the signature's floor reads
# max(volume, 50, hub load) and an efficient hub is paid for converting the offence he runs. It can
# only ever LIFT (it is a max) and it is zero for every card outside the hub class.
# MEASURED: 267 of 10,000 cards move on OFF, EVERY ONE OF THEM UP, mean +2.41, max +8; DEF and every
# attribute move on ZERO; OVR follows on 208. All 137 anchors hold.
HUB_GATE, HUB_FULL = 60, 80
HUB_K = 0.07                       # recal_138: the load weight 0.26 minus the creation weight 0.19
PD_V_LO, PD_V_HI = 10.0, 68.0      # recal_117's band; the hub's floor is its top, so the two are disjoint
def o_score(p, trace=None):
    # `trace` is the --explain hook and NOTHING ELSE: when it is a dict this function records the
    # terms it just computed into it. Every write is guarded by `if trace is not None`, no expression
    # that feeds `std` is rearranged, and the default None path is byte-for-byte the old function.
    # recal batch 2: orb IS offense (second chances); fouldraw only scores through FT (multiplicative,
    # the clank tax); passing weights eased so scoring bigs aren't taxed for a skill their shape never used;
    # volume x efficiency is a SIGNATURE, not two facts (the interaction term restores Curry's O99)
    a = p['attrs']; z = sorted([a['3pt'], a['rim'], a['mid']], reverse=True)
    # passqual's weight is REDISTRIBUTED into the playmaking terms, per the original removal spec and
    # the sync verdict: playvol 0.10 -> 0.15, ballsec 0.03 -> 0.06. This pipeline had dropped it and
    # renormalised instead, which was the one real formula divergence between the two sides. recal_20's
    # rebalance sits on top of that baseline, so playvol is 0.15 + 0.02 = 0.17.
    # DE-STACK (recal_24): a redundant SECOND range was paying almost as much as the first, and the
    # load a man actually carried was paying less than either. z1 0.09 -> 0.07, usage 0.11 -> 0.13.
    # VOLUME UP ONE MORE NOTCH (recal_31): load-carrying is PORTABLE value — it travels to any five —
    # while efficiency without load is CONDITIONAL, only fully priced next to another star. The team
    # engine already expresses that in drafts; the card now leans the same way.
    # THE THIRD ZONE NOW EXISTS (recal_32): a real paint game earns and a missing one costs. Weight
    # comes off the first two to pay for it, so a man with three real levels gains on one with two.
    # LOCKED DIAL STATE (recal_34). This single line replaces every weight from r30-33, and the three
    # conditional bonuses below it are deleted in the same move: what they paid for now lives in the
    # standing weights, where it applies to everyone instead of to whoever cleared a gate. Ball security
    # and drawn fouls are priced as the offensive skills they are (0.06 -> 0.10, 0.05 -> 0.11); volume
    # carries the load it actually is (0.18 -> 0.24); efficiency stops being paid twice (0.13 -> 0.10 —
    # the signature term below still multiplies it by volume); the second zone recovers (0.06 -> 0.09).
    # recal_89 (design-side round "76"; HIS RULING, verbatim: "Dont do 87, only shift the weights a
    # little torward 88" — the same sentence DECLINED the two-level dominance round, receipt 88).
    # "A tiny bit", not a redesign: weight comes off the three zones and goes to the load-and-
    # conversion terms. zones 0.25/0.09/0.06 -> 0.22/0.08/0.05 (-0.05), efficiency 0.10 -> 0.11,
    # volume 0.24 -> 0.26, playvol 0.17 -> 0.19 (+0.05). Total weight is unchanged BY CONSTRUCTION,
    # 0.05 out and 0.05 in, so no multiplier compensation is taken. Scale neutrality is nonetheless
    # MEASURED, not assumed: sharing a 1-99 scale is not sharing a DISTRIBUTION, and moving weight
    # between a zone max and a volume rating can move the pool mean even at constant total weight.
    # Receipt 89 holds the measured mean against the round's own +-0.3.
    # The dominance bonus below reads the zone RATINGS, not these weights, and is unaffected.
    # recal_96 (HIS RULINGS, verbatim: "Ty Jerome '25 OFF should be high 60's to mid 70's. Not 81"
    # and "Montrezl Harrell '18 is too high OFF as well"). THE LOAD TERM, and it applies to EVERY
    # card in the file.
    #
    # THE DEFECT. Every bar on this sheet is a RATE. `volume` is a usage percentile, `playvol` an
    # assist percentile — both are "per possession he was on the floor for", and o_score never asked
    # how much of a game the man was on the floor. So Ty Jerome '25 (usage 23.6, 12.5 points, in
    # 19.9 minutes off the bench) was priced at OFF 81, beside starters who carried the same rate
    # for forty minutes; Montrezl Harrell '18 at 77 on 17.0. recal_51 already named this problem —
    # "attempts are a RATE ... a 17-minute bench finisher can post a starter's attempt rate while
    # carrying no load" — but answered it with a ramp on `volume`, which is itself a rate. This is
    # the same question asked of the clock instead.
    #
    # WHAT IS DISCOUNTED, and what is deliberately NOT. Only the two LOAD terms: `volume` (how much
    # of the offence ran through him) and `playvol` (how much of it he created). They are the two
    # bars that claim "he carried this much", and a claim about how much is exactly the claim that
    # minutes qualify. Everything else on the card is a SKILL rate — the three zones, efficiency,
    # ball security, free throws, the offensive glass — and how well a man shoots is true whether he
    # shoots for nineteen minutes or thirty-nine. Those are untouched. The volume x efficiency
    # SIGNATURE is untouched too, because recal_26 gave it a volume FLOOR of 50 for precisely this
    # reason ("elite conversion on a modest load is real scoring signal"), and so are recal_64's
    # off-ball floor and recal_51's own attempt ramp, which read the raw ratings and decide class
    # membership rather than price.
    #
    # MEASURED, NOT CHOSEN — where the two constants come from.
    # LOAD_FULL = 24 is LOCATED BY HIS OWN STANDING ANCHORS, not picked. Clint Capela '17 is pinned
    # at off 58 +-1 (recal_51) and reads 57, so he has ZERO room, and he played 23.9 mpg. Every
    # full-load line above 24 takes him under: 26 -> 56, 28 -> 55, 30 -> 54, and by 32 it has taken
    # Clint Capela '18, Shaquille O'Neal '08 and '09 with it, and by 36 even Shai Gilgeous-Alexander
    # '25 and Giannis '25. The board's own ratified position is therefore that twenty-four minutes
    # is already a full workload for PRICING, whatever it is for a rotation, and the discount belongs
    # strictly below it. (A "real" starter's 32-36 is unreachable and is reported, not forced.)
    # LOAD_FOOT = 12 is set by the subject's own target and is exactly half of LOAD_FULL: Ty Jerome
    # '25 lands on 71 — the centre of "high 60's to mid 70's" — at a foot of 12.5, and 12 is the
    # round number inside that. Half a rotation earns no load credit; the ramp between is linear.
    #
    # WHY THE LOAD TERMS AND NOT THE WHOLE SCORE, measured on the whole pool. Discounting the whole
    # o_score by the same share CANNOT reach the number: at every foot from 0 to 16 the depth that
    # puts Jerome on 71 also puts Steve Kerr '96 on 60 against his 62 +-1 (recal_89). The reason is
    # the one the round is about — Kerr's load terms are 15.8% of his o_score (volume 8, playvol 44:
    # a spot-up shooter uses nothing) while Jerome's are 34.3% (volume 70, playvol 61). A man who
    # carries nothing has nothing to discount, and only the narrow instrument can tell them apart.
    _load = load_share(p)
    _vol, _pvol = a['volume'] * _load, a['playvol'] * _load
    # recal_138: THE HUB'S CLASS AND HIS LOAD, computed here because BOTH the signature term below
    # and recal_55's hub premium further down read them. See the block above o_score for the whole
    # argument. `_role` is 1.0 for every big (recal_55's class, byte-identical), and for a perimeter
    # card it is the share of the offence that goes through him as CREATION rather than as his own
    # shot, ramped over the hub's own width and floored at recal_117's band top so this term and
    # recal_109's elite passer cannot both pay the same assist rate. `_hubload` is the load that
    # creation constitutes: the same quantity the hub premium is charged on, computed once.
    _role = (1.0 if is_big(p) else
             (min(1.0, max(0.0, (a['playvol'] - a['volume']) / (HUB_FULL - HUB_GATE)))
              if a['volume'] >= PD_V_HI else 0.0))
    _hubload = a['playvol'] * min(1.0, max(0.0, (a['playvol'] - HUB_GATE) / (HUB_FULL - HUB_GATE))) * _role
    std = (0.22*z[0] + 0.08*z[1] + 0.05*z[2] + 0.11*a['efficiency'] + 0.26*_vol + 0.19*_pvol
        + 0.10*a['ballsec'] + 0.11*(a['fouldraw']*a['ft']/100) + 0.06*a['orb']
        # the volume x efficiency SIGNATURE keeps its volume FLOOR of 50 (recal_26): elite conversion on
        # a modest load is real scoring signal, not an accident of touches.
        # recal_138: and a HUB's load is his creation, so the floor reads it too. max() only lifts,
        # and _hubload is 0.0 for every card outside the hub class, so nobody else moves.
        + 0.08*(max(a['volume'],50,_hubload)*a['efficiency']/100))
    if trace is not None:
        trace['terms'] = [
            ('z[0] best zone',      z[0],                             0.22, 0.22*z[0]),
            ('z[1] second zone',    z[1],                             0.08, 0.08*z[1]),
            ('z[2] third zone',     z[2],                             0.05, 0.05*z[2]),
            ('efficiency',          a['efficiency'],                  0.11, 0.11*a['efficiency']),
            ('volume x load',       _vol,                             0.26, 0.26*_vol),
            ('playvol x load',      _pvol,                            0.19, 0.19*_pvol),
            ('ballsec',             a['ballsec'],                     0.10, 0.10*a['ballsec']),
            ('fouldraw x ft/100',   a['fouldraw']*a['ft']/100,        0.11, 0.11*(a['fouldraw']*a['ft']/100)),
            ('orb',                 a['orb'],                         0.06, 0.06*a['orb']),
            ('signature vol x eff', max(a['volume'],50,_hubload)*a['efficiency']/100, 0.08, 0.08*(max(a['volume'],50,_hubload)*a['efficiency']/100)),
        ]
        trace['std_base'] = std
        trace['zones'] = dict(z=z, rim=a['rim'], mid=a['mid'], three=a['3pt'])
        trace['load'] = dict(share=_load, mpg=_MPG.get(p['name']), foot=LOAD_FOOT, full=LOAD_FULL,
                             volume_raw=a['volume'], volume_paid=_vol,
                             playvol_raw=a['playvol'], playvol_paid=_pvol)
    # EVERY FLOOR IS DELETED (recal_37). Specialist, maestro and creator each REPLACED the sum for
    # whoever cleared a gate, so three scoring laws ran at once and a card's own law depended on a
    # threshold it happened to pass. (Their round lists four; this side never had a FINISHER floor.)
    # ZONE DOMINANCE replaces all of them: one weapon towering over the rest of the diet, flat +8.
    # Either the best zone beats the other two put together while itself being elite, or it beats them
    # by half again — the second clause catches the true narrow specialist whose zone is not yet 91.
    #
    # THE WEAPON MUST BE THE ARC OR THE RIM (his ruling). A towering MIDRANGE is not the same threat:
    # the rim weapon collapses a defence inward and the shooter stretches it out, while the mid-range
    # is the shot a defence concedes on purpose. Shape alone was paying all three the same. Ties go to
    # the bonus — an equal rim or three IS a paint or perimeter weapon.
    # recal_137 (HIS RULINGS, verbatim: "Beasley agree" and "Hield agree, similar to Beasley").
    # THE SHAPE GATE ITSELF IS A RAMP — the last cliff left in the dominance bonus.
    #
    # THE DEFECT, and it is the same sentence recal_43 wrote about the factors INSIDE this gate,
    # applied to the gate. r43 ruled "NO CLIFFS" and made zone_f, att_f and gate_f lines instead of
    # bands, so the LEVEL of the bonus stopped stepping — but the bonus is worth 5 to 8 raw points
    # and whether it is paid AT ALL was still decided by two hard tests. One point of one zone
    # rating therefore decided seven printed OFF points.
    #   Malik Beasley '22 (92/40/17) collects +7.98 and reads 64; '23 (89/44/16) collects NOTHING
    #     and reads 51. He is one point short: his bar is 1.5 x (44 + 16) = 90 and he is 89.
    #   Buddy Hield '24 (93/40/23) collects +6.80 and reads 63; '25 (90/38/27) collects NOTHING and
    #     reads 53. He is one point short too: 90 against the clause's own 91.
    # Both subjects sit ONE POINT below their own bar, which is the defect in its purest form.
    # It is not two cards: of the 217 adjacent-season pairs of the same SHOOTER where the gate fires
    # on one season and not the other, 65 flip on a three-point move of 4 or less.
    #
    # THE RAMP, AND IT IS ONE CONSTANT IN THE UNIT THE GATE IS ALREADY WRITTEN IN. Both clauses say
    # the same thing — the weapon must REACH A BAR — and they differ only in where the bar is:
    # clause 1's bar is the flat 91 (and it also demands the weapon tower over the other two zones,
    # `z[0] > z[1] + z[2]`), clause 2's is 1.5 x (z[1] + z[2]), the narrow specialist whose zone is
    # not yet 91. So each clause keeps ITS OWN BAR as a point of SATURATION and earns its share over
    # the same width of z[0] beneath it, and the card takes the better of the two. At or above
    # either bar the share is 1.0 and the bonus is BYTE-IDENTICAL to what it was — verified to ten
    # decimals on every tol-1 shooter pin (Korver '15, Kerr '96, Reggie Miller '97, Curry '16,
    # Novak '13) and on Shaq '00, Capela '17, Zion '21 and Giannis '25. Below it, the term can only
    # ADD: `_shape` multiplies a bonus that was previously zero.
    #
    # WHY THREE POINTS WIDE, measured on the class and not chosen. For each of those 217 flip pairs,
    # the DEFICIT of the non-firing season below its own nearest bar has a lower quartile of 3.25
    # points (median 9.0, p75 32.5, p90 54.0) — so a width of three absorbs the quarter of the flips
    # that are genuinely on the line and leaves the other three quarters exactly where they are,
    # because a season nine points from its bar is a different shape and not a wobble. 3 is the
    # round number inside 3.25, which is recal_96's own way of rounding a measured constant. The
    # paint class agrees independently: its own lower quartile is 2.50 over 295 pairs.
    # THE WIDTH IS NOT SET BY THE ANCHORS, and that is said plainly: every width from 2 to 10 holds
    # all 135 pins AND puts both subjects inside their bands. What sets it is the collateral, which
    # runs 42 movers at 2, 70 at 3, 97 at 4, 131 at 5 and 264 at 10 — so the round takes the
    # narrowest width that reaches both numbers.
    #
    # WHAT IS NOT RAMPED, on purpose. `max(3pt, rim) >= mid` is recal_38's ruling that a towering
    # MIDRANGE is not the same threat, and it is a statement about WHICH zone, not about how much;
    # and `z[0] > z[1] + z[2]` inside clause 1 is the towering claim itself. Both stay hard.
    # MEASURED: 70 of 10,000 cards move on OFF, EVERY ONE OF THEM UP, max +5, mean +1.93; DEF and
    # every attribute move on ZERO; OVR follows on 58, max +3. Every anchor holds and the top 12 by
    # OFF is identical. The movers are one class and read like it — Lonzo Ball '21, Allen Crabbe
    # '18, Alec Burks '24, Gary Trent Jr. '21, Mike Conley '21, Brent Barry '04, Craig Hodges '87.
    ZD_W = 3.0
    _shape = max(min(1.0, max(0.0, (z[0] - (91.0 - ZD_W)) / ZD_W)) if z[0] > z[1] + z[2] else 0.0,
                 min(1.0, max(0.0, (z[0] - (1.5 * (z[1] + z[2]) - ZD_W)) / ZD_W)))
    if max(a['3pt'], a['rim']) >= a['mid'] and _shape > 0.0:
        # HOW MUCH OF IT HE KEEPS. The shape says he HAS one weapon; these factors say whether the
        # weapon is worth fearing and whether he is really a specialist at all.
        #
        # NO CLIFFS (recal_43, his ruling). Every factor is a LINE, drawn through the midpoints of the
        # bands it replaces, so the level of the bonus is unchanged and only the step is gone. A 99 zone
        # now beats a 95 (1.10 against 1.00) and a 61 free-throw shooter beats a 64 (0.775 against 0.55),
        # where before each pair was paid identically and a single point at a boundary cost a quarter.
        zone_f = min(1.10, max(0.35, 0.50 + (z[0] - 75) * 0.025))
        # AND THEN VOLUME (recal_41): high(bonus x volume/50, bonus). A weapon is worth what it is
        # FIRED, so carrying a real load multiplies it — 50 volume is the hinge, 100 doubles it. Written
        # as a single factor, max(volume/50, 1), because that IS the high() of the two: nothing here
        # reads its own output, so there is no recursion and no order-of-operations to get wrong. Note
        # it only ever LIFTS: a low-volume finisher keeps his bonus rather than losing it.
        # HOW OFTEN HE FIRES IT (recal_45, replacing the usage multiplier). Paint attempts for a rim
        # weapon, threes for a shooter — hinged so the median specialist sits on the floor and the
        # busiest doubles, which is how max(volume/50, 1) behaved before it.
        _two, _three = _ATT.get(p['name'], (0.0, 0.0))
        # THE TWO SPECIALISTS DO NOT SHARE A BASE (recal_46, his ruling: the shooter's was too big).
        # A paint weapon's damage is mostly OFF the shot — fouls drawn, offensive boards, the defence he
        # collapses — and the standard path prices almost none of it. A shooter's damage is the shot,
        # which his zone rating already pays for. So the shooter's top-up is 5 where the paint man's is 8.
        if a['rim'] >= max(a['3pt'], a['mid']):
            # ATTEMPTS DECIDE MORE OF IT (recal_47). The factor is now a POWER, and it has no floor at
            # 1.0: living at the rim pays, standing near it costs. 5 attempts a hundred keeps 0.54,
            # 7.5 is even, 14 takes 2.55. The base comes down to 6.5 to pay for the steeper curve, so
            # the man who actually shoots there holds his ground while the rest come back down.
            base = 6.5
            # SELF-CREATED PAINT ONLY (recal_49). A lob, a putback and a dump-off are not the same
            # work as a post-up a man made himself, and until now they bought the same bonus. Creation
            # is the discriminator: finishers live at playvol 9-23, post scorers at 52-79. A man who
            # creates nothing keeps 55% of his attempts; by playvol 50 he keeps all of them.
            # (The round proposed the ASSISTED SHARE for this. It fails its own Shaq constraint by 9
            # points, because an entry pass into the post counts as an assist — reported, not applied.)
            # FLOOR 0.55 -> 0.35 (his ruling): r49 fixed the mechanism, this sets the magnitude.
            # A man who creates nothing now keeps just over a third of his attempts; playvol 50
            # still keeps all of them, so the post scorers are untouched and only the finishers move.
            # MEASURED, OR INFERRED BY MODEL — NEVER ASSUMED (recal_52). The attempt rate exists
            # only where the shot tables do (1997+). On an inferred season rim[1] is a 0-1 model
            # value, not a rate, so the old line read _two ~ 0.6 and parked every pre-97 interior
            # monster on the 0.30 clamp — a 70% cut for a number nobody measured. Where the data
            # is measured the r49/r50 gate stands whole; where it is not, the factor is 1.0 —
            # no discount, no boost.
            if a.get('rim_mid_measured'):
                _create = 0.35 + 0.65 * min(1.0, a['playvol'] / 50.0)
                att_f = min(2.85, max(0.30, ((_two * _create) / 7.5) ** 1.5))
            else:
                att_f = 1.0
            # AND HOW MUCH HE SHOOTS AT ALL (recal_51). Attempts are a RATE — per hundred — so a
            # 17-minute bench finisher can post a starter's attempt rate while carrying no load.
            # The ramp asks the load question the rate cannot: zero below volume 70, full at 80+.
            # Paint branch only; a shooter's branch stays, because narrow shooting specialists are
            # definitionally low-volume and the Korver class would re-collapse. Stacks with r49's
            # creation gate — they multiply. Shaq/Zion/Hakeem/Giannis/Embiid all sit at a full ramp
            # by construction (volume 85+), so the permanent constraint holds untouched.
            # recal_93 DECLINED a general minutes-load term here (HIS RULING, verbatim: "Ty Jerome
            # '25 OFF should be high 60's to mid 70's. Not 81"). It is PROVABLY INFEASIBLE against
            # Montrezl Harrell '18, recal_52's own anchor: Harrell reads OFF 77 +-1 on 17.0 mpg,
            # BELOW Ty Jerome '25's 19.9, and every load measure agrees (1,292 season minutes to
            # 1,393; 11.0 ppg to 12.5; BPM 3.3 to 4.3). Any load term T(score, load) that is
            # non-decreasing in both of its arguments — which every discount toward a bench
            # footprint is — must therefore leave Harrell at or below Jerome, while the two rulings
            # together require Harrell >= 76 and Jerome <= 75. No parameterisation exists, and the
            # sweep confirms it: the largest discount that breaks NO anchor moves Jerome 81 -> 80.
            # This clause, recal_51's, remains the only load question o_score asks, and it asks it
            # of `volume` — a usage RATE, which is exactly the thing his ruling says is not a load.
            # Receipt 93 carries the measurement and the conflict; anchors.json is unchanged.
            att_f *= max(0.0, min(1.0, (a['volume'] - 70) / 10.0))
        else:
            base = 5.0
            att_f = max(_three / 8.5, 1.0)
        # EACH SPECIALIST IS GATED BY WHATEVER ALREADY PAYS HIM (recal_44).
        #
        # A PAINT weapon is gated on his free-throw stroke: the standard path pays touch through
        # 0.11 x fouldraw x ft/100, so the better the stroke, the less he needs from here.
        #
        # A SHOOTER is gated on the offense he ALREADY has. A 55-OFF shooter is a man whose one skill
        # the card is failing to price; a 90-OFF shooter is already being paid, and topping him up again
        # is paying twice for the same jumper.
        #
        # NOT RECURSIVE: `std` here is the standard path BEFORE this bonus is added, and the bonus is
        # added once. o_ovr is never consulted — it does not exist yet.
        if a['rim'] >= max(a['3pt'], a['mid']):
            gate_f = min(1.00, max(0.25, 1.00 - (a['ft'] - 58) * 0.075))
        else:
            pre_off = std * 0.93
            gate_f = min(1.00, max(0.25, 1.00 - (pre_off - 55) * 0.025))
        std += base * zone_f * att_f * gate_f * _shape
        if trace is not None:
            trace['bonus'] = dict(
                kind='paint' if a['rim'] >= max(a['3pt'], a['mid']) else 'shooter',
                base=base, zone_f=zone_f, att_f=att_f, gate_f=gate_f, shape_f=_shape,
                bar_a=(91.0 if z[0] > z[1] + z[2] else None), bar_b=1.5 * (z[1] + z[2]), width=ZD_W,
                paint_att_per100=_two, three_att_per100=_three,
                rim_mid_measured=bool(a.get('rim_mid_measured')),
                added=base * zone_f * att_f * gate_f * _shape)
    elif trace is not None:
        trace['bonus'] = None   # the shape gate did not fire: no weapon towering over the diet
    # recal_55: THE BIG HUB. An efficient playmaking center had no channel - his assists scored
    # through playvol's 0.17 like everyone's, and nothing priced the offense that RUNS THROUGH him.
    # Bigs only, playvol 60 and up; the Jokic class is saturated at the band top anyway, and guards
    # are untouched by construction.
    # recal_98 (HIS RULING, verbatim: "How is Karl Malone 99 is 93 OFF? 24ppg with mid passing and
    # 3.3 tov cant be this high. Eff is good but nothing crazy..").
    # THE HUB IS A RAMP, NOT A CLIFF. r55's gate was a step at playvol 60: a big at 59 got nothing
    # and a big at 60 got the whole premium, and the premium is 0.05 x playvol, so it lands ALMOST
    # IN FULL on a man who only just cleared the gate. Karl Malone '99 is playvol 62 - his own
    # ruling's words are "mid passing" - and he was collecting 3.10 of a hub bonus built for the
    # Jokic class, on top of the 11.78 his passing already earns through playvol's 0.19. The same
    # shape recal_93 found in is_big's middle clause, one term further down the file.
    # THE FIX IS r55's OWN CLAIM, made continuous: the premium is now paid in proportion to how much
    # of a hub the man actually is, from nothing at the gate to the whole of it at playvol 80. The
    # gate, the weight and the class function are UNTOUCHED - a genuine hub is byte-identical
    # (Jokic '25 playvol 97, Giannis '25 86, LeBron '10 93 all move by ZERO), and only the cards
    # that were being paid a hub premium for average passing come down.
    # MEASURED: 186 of 10,000 cards move on OFF, every one of them DOWN and none by more than 3;
    # Malone '99 93 -> 90; DEF moves on zero; every standing anchor holds, r55's own named card
    # (Domantas Sabonis '21, off 71 +-1, playvol 90) included.
    # 90 IS THE FRONTIER, not a choice: searching the hub ramp against the volume, efficiency,
    # ballsec and signature weights jointly, 90 is the LOWEST reading Malone '99 can take with every
    # anchor held. See receipt 98 - the orchestrator's assumed target was 87 +-3 and 90 is its edge.
    # recal_138: HUB_GATE/HUB_FULL and PD_V_LO/PD_V_HI are hoisted to module scope (just above
    # o_score) because the hub's own class function now reads them BEFORE `std` is built. The lines
    # are otherwise byte-identical and every constant keeps its value.
    if _role > 0.0 and a['playvol'] >= HUB_GATE:
        _hub = HUB_K * _hubload
        std += _hub
        if trace is not None:
            trace['big_hub'] = _hub
            trace['hub_role'] = dict(role=_role, hubload=_hubload, k=HUB_K, big=is_big(p),
                                     surplus=a['playvol'] - a['volume'], v_floor=PD_V_HI)
    # r34's deletion of the three gated bonuses stands; r37's dominance bonus is the one deliberate
    # exception, and it is a claim about SHAPE rather than a top-up for clearing a threshold.
    # recal_64 (design-side "62", the OKC problem): THE OFF-BALL FLOOR. The Dort/Wallace class had
    # no channel below the 80-3pt specialist gate — low-usage shooters now get paid for the job
    # they actually do: spacing, converting, not turning it over, not fouling. Volume scorers are
    # untouched by construction (their standard path is higher than the floor).
    # recal_107 (HIS RULING, verbatim: "This should be around 58 OFF. Super eff"). THE TWO-LEVEL BIG.
    #
    # WHAT THE CARD IS. Deandre Ayton '26 scores at TWO real levels - rim 71 and mid 70 - on 67.1%
    # from the field and a .676 true shooting, in 16.7% usage. Every scoring channel this file has
    # is built for a man with ONE weapon: recal_37's dominance bonus requires a zone TOWERING over
    # the rest of the diet, and Ayton's two levels are one point apart, so the gate cannot fire for
    # him at all. What is left is the standard path, where his second zone is paid 0.08 against the
    # first zone's 0.22 - and a big whose second level is as good as his first is priced as if he
    # barely had one. He printed OFF 52.
    #
    # THE TERM. For a big who is BOTH efficient AND genuinely two-level, the second zone is paid at
    # the FIRST zone's rate. The 0.22 is not a new number - it is z[0]'s own weight, which is the
    # whole claim: his second level is a first level. Written as a max() so it can only ever lift,
    # and gated three ways, each of which is one of his own words:
    #   - `is_big` and volume < 55: recal_64's own low-usage gate, reused untouched. A high-usage
    #     scorer is unreachable by construction, so no star can be paid twice for his range.
    #   - mid 55 -> 70: the second level must be REAL. Clint Capela '17 (mid 21) and Ivica Zubac '26
    #     (mid 45) are below it and do not move, which is what keeps Capela's recal_51 pin at 58 +-1
    #     intact and leaves Zubac's twice-declined target exactly where recal_99 left it.
    #   - efficiency 70 -> 85: "Super eff" is his own reason and it is the gate that separates this
    #     card from Deandre Ayton '20, who has the same two levels (mid 61) on efficiency 64 and is
    #     therefore untouched at 61.
    # MEASURED: 40 of 10,000 cards move on OFF, every one of them UP, max +10; DEF and every
    # attribute move on ZERO; the top 12 by OFF is identical and the top 50 by OVR does not move.
    # The other movers are the same archetype found by the same gates - Detlef Schrempf '98,
    # Larry Nance '92 and '93, Richaun Holmes '21, Deandre Ayton '22.
    # WHY NOT THE LEVERS THE DISPATCH LISTED, all three measured on the whole pool: recal_26's
    # signature volume floor lifts Ayton only 52 -> 55 even at 100, and takes Capela '17 to 60 and
    # seven anchors with it; retiring recal_51's attempt ramp gains Ayton NOTHING (his dominance
    # gate never fires, so there is no bonus to un-throttle) and breaks six anchors; recal_96's load
    # term is already 1.0 for him at 27.2 mpg. None of them can tell a two-level big from a lob
    # finisher, because none of them reads the second zone.
    TL_MID_LO, TL_MID_HI = 55.0, 70.0
    TL_EFF_LO, TL_EFF_HI = 70.0, 85.0
    if is_big(p) and a['volume'] < 55:
        _gm = min(1.0, max(0.0, (a['mid'] - TL_MID_LO) / (TL_MID_HI - TL_MID_LO)))
        _ge = min(1.0, max(0.0, (a['efficiency'] - TL_EFF_LO) / (TL_EFF_HI - TL_EFF_LO)))
        if _gm * _ge > 0.0:
            std = max(std, std + _gm * _ge * (0.22 - 0.08) * z[1])
            if trace is not None:
                trace['two_level'] = dict(gm=_gm, ge=_ge, z1=z[1], added=_gm * _ge * 0.14 * z[1])
    # recal_109 (HIS RULINGS, verbatim: "Agree with both" on the scout's group B, and on Steve Nash
    # '05: "Elite passers are massively underrated in OFF. This is 85+ OFF. Amazing eff and playvol").
    # THE ELITE PASSER.
    #
    # THE SCOUT'S SENTENCE IS THE DIAGNOSIS: "o_score's volume weight (0.26) dominates playvol (0.19)
    # badly enough that an elite pure-distributor with near-zero individual scoring load (volume
    # 10-12) still prints OFF in the bottom decile of his own class even when his class-adjusted BPM
    # rank sits in the top decile". Mark Jackson '00 ran 8.0 assists at BPM 3.1 and printed 48.
    # Steve Nash '05 is the same complaint one class up: an MVP at 11.5 assists on .606 true
    # shooting, printing 78.
    #
    # WHY A TERM AND NOT A WEIGHT, and it is settled rather than argued: recal_91 and recal_98 both
    # measured the reweight and both DECLINED it. Every star's playvol matches these men's - Magic
    # '89 is 98, Chris Paul '09 96, Stockton 99, against Jackson's 91-97 and Nash's 97 - so any hand
    # from volume to playvol lifts the stars as much as the passer and breaks 22 to 31 anchors before
    # the subject moves. The two populations cannot be separated by a RATIO of the two weights. They
    # can only be separated by the fact that one of them takes almost no shots.
    #
    # THE TERM, and each factor is one of the two rulings:
    #   playvol x (1 - volume/100)  - an assist rate discounted by the share of the offence the man
    #     used himself. Largest for a passer who shoots least; it vanishes for a passer who scores.
    #   gate on playvol 80 -> 95    - this is for ELITE distribution, not for anyone who passes.
    #   gate on volume 65 -> 10     - the half that makes the stars unreachable. LeBron '13 (volume
    #     97), Harden '19 (99), Jokic '25 (89), Chris Paul '09 (82) and Magic '89 (70) all sit at
    #     gate 0.00 and move by EXACTLY zero.
    #   efficiency factor 0.5 -> 1.0 across efficiency 70 -> 90 - "Amazing eff" is Nash's own reason.
    #     It is a HALF-floor, not a gate: a pure non-scorer who is also inefficient (Mark Jackson '98
    #     is efficiency 36) still keeps half the term, because his ruling is about the ball he moves,
    #     not about his jumper. Without the floor the group-B cards fall back to where they were.
    # THE SIZE WAS 0.32 AND IT WAS HIS CHOICE, not the fit's: 0.36 put Nash on 86 and both Jacksons
    # exactly on target, but carried John Stockton '97 to 93. 0.32 put Nash on his stated floor of
    # 85, kept both Jacksons inside tolerance, and capped Stockton at 91. See the round file.
    #
    # recal_117 (HIS RULING, verbatim: "For the scout, I agree with 3,4,5,6,7"). BOTH GATES ARE
    # RAMPED, AND VOLUME IS READ ONCE. Items 3 and 4 of the scan's shortlist are the two halves of
    # one defect: r109 built the class correctly and then priced it with two cliffs.
    #
    # ITEM 3, THE PLAYVOL CLIFF. 80 -> 95 is 1/15 of the term per playvol point, and playvol is a
    # PERCENTILE inside its own season pool, so a 50-game lockout year re-ranks a man who did the
    # same job. MARK JACKSON '99 is the case: 7.6 assists on .513 shooting at BPM 3.0, an assist
    # share of 46.7% - HIGHER than his own '98 (45.4) and '00 (45.0), both of which HE pinned - and
    # his box sits between the two. His playvol reads 86 against 94 and 91, and the gate turned that
    # eight-point percentile wobble into SEVEN OFF points: 47 against 54 and 57.
    # THE RAMP IS RE-CUT ON THE POOL, not on his card. 80 -> 95 spans the top 6.5% of the 10,000
    # cards down to the top 0.8%: full credit was reserved for EIGHTY-FOUR seasons in history, which
    # is not a ramp, it is a needle. 70 -> 85 spans the top 14.7% to the top 4.0% - the same fifteen
    # rating points covering nearly TWICE the population, because playvol's density climbs steeply
    # as you come down the scale. The foot stops AT 70 and not below it because recal_112's
    # efficient interior scorer is gated `playvol <= 70`: at exactly 70 both gates are 0, so the two
    # terms stay disjoint BY CONSTRUCTION and no card can take both. (Measured: at a foot of 65 one
    # card - Jeff Hornacek '97, playvol 66 - takes both, which is why the foot is 70.)
    #
    # ITEM 4, THE DOUBLE CHARGE. Volume was read TWICE: once by the gate and once again by the
    # `(1 - volume/100)` discount, and the product of two decreasing factors is steeper than either.
    # The consequence was an INVERTED ARC - inside the band, scoring more LOWERED a passer's OFF at
    # about 0.28 of a point per volume point, net of the 0.26 the standard path pays for the same
    # volume. JOHN STOCKTON '90 is the case: his best season by BPM (8.9, 17.2 points and 14.5
    # assists on .607 true shooting) read 79, BELOW his own '88 (82) whose only advantage is that he
    # scored less. The gate charged him 0.53 where '88 pays 0.91 and '97 0.76.
    # THE RULE: VOLUME IS READ ONCE, BY THE GATE. The `(1 - volume/100)` factor is gone and the
    # constant absorbs its value at the band's foot (0.32 x 0.90 = 0.288 -> 0.245). The band itself
    # widens 65 -> 68, set just clear of the nearest star it must exclude rather than on top of him:
    # Magic Johnson '89 is volume 70 and '87 is 71, and both still sit at gate 0.00 exactly, as do
    # Chris Paul '09 (82), LeBron '13 (97), Harden '19 (99) and Jokic '25 (89).
    # WHAT THAT BUYS, measured: the net charge per volume point falls from -0.28 to -0.16 and
    # Stockton's arc turns the right way up - '88 80, '89 83, '90 82, '91 80, '92 83, where it read
    # 82, 82, 79, 78, 81. ZERO IS INFEASIBLE AND THAT IS ARITHMETIC, not a choice: a net charge of
    # zero needs the term's own slope to be at most the standard path's 0.26, i.e. a volume band 93
    # points wide, which starves the pure non-scorer this same round has to lift (Mark Jackson '99
    # falls to 49). The compounding is what is removable; the gate's own slope is what the gate is.
    #
    # THE SIZE IS 0.245 AND IT IS FIXED BY HIS OWN CAP, not chosen. He capped John Stockton '97 at
    # 91 when he took 0.32 over 0.36 ("K=0.32 not 0.36"), and '97 is the largest term on the board,
    # so the cap prices everything: 0.245 puts him on 91.06 with the next display point at 91.50.
    # THE FRONTIER, and it is why the two subjects land where they do rather than on their numbers.
    # Stockton '90 (volume 36) and Steve Nash '05 (volume 42) differ by SIX volume points and by
    # nothing else the term reads - playvol 99 against 97, efficiency 94 against 96, both at gate
    # 1.00 on playvol. Reaching 84 for Stockton needs the volume response to fall 26% across those
    # six points while falling no more than 20% across the thirteen points from '97 (23) to '90 (36)
    # - an accelerating decline that no single monotone gate of this family has, and the search
    # confirms it: every parameterisation that puts Stockton '90 above 82 puts Nash '05 above 88 and
    # out of his own recal_109 band. So both subjects land INSIDE tolerance and neither lands on its
    # centre: Jackson '99 53 against 54 +-3, Stockton '90 82 against 84 +-3.
    #
    # recal_130 (HIS RULING, verbatim: "Stockton became overrated, on OFF" and, on the number, "01'
    # is currently at 92. 80+-4 sounds about right"). THE SECOND PAYMENT CARRIES ITS OWN LOAD LINE.
    #
    # THE DEFECT, decomposed on the card the ruling names. John Stockton '01 is 29.2 minutes, 11.5
    # points and 18.8% usage, and of his o_score of 92.98 the creation rate is paid TWICE: playvol 99
    # x 0.19 = 18.81 on the standard path AND 15.47 more from this term - 34.3 points of a 93 for one
    # fact, an assist rate. recal_126 fixed his zone bars (mid 86 -> 67, rim 72 -> 49) and measured
    # that the attribute stage saturates at OFF 86; the rest is here.
    #
    # WHY A LOAD LINE AND NOT A SMALLER TERM, and it is arithmetic rather than a preference.
    # recal_123 proved that no flat factor g on this term can work, and the post-126 board says the
    # same with new numbers: the subject needs g <= 0.863 and John Stockton '90 - pinned 84 +-3 and
    # reading 82 - needs g >= 0.916. The two cards are playvol 99 apiece, volume 31 against 36 and
    # efficiency 97 against 94, so NOTHING this term reads separates them. What separates them is
    # MINUTES: 29.2 against 37.4.
    #
    # AND MINUTES IS NOT A NEW FACT, IT IS recal_96's OWN DOCTRINE APPLIED TO THE SECOND PAYMENT.
    # recal_96 ruled that a per-possession profile must be scaled by the load that produced it, and
    # discounts BOTH standard-path load bars by `load_share` - but its full-load line is 24 minutes,
    # located by Clint Capela '17 (23.9 mpg) and Ty Jerome '25, i.e. cut to answer "did this man play
    # at all". This term is a SECOND payment of the same rate, and it took the raw percentile with no
    # load reading whatever (recal_123's COST recorded the omission: "a passer under 24 minutes is
    # paid his creation rate twice at full price"). A rate paid twice has to be scaled twice, and the
    # second line is not the bench boundary: it is the minutes at which a distributor has actually
    # carried a season's creation.
    # THE LINE IS THE CLASS'S OWN UPPER QUARTILE, MEASURED, NOT CHOSEN. Of the 834 cards this term
    # pays, the 75th percentile of minutes is 34.7 (median 31.6, p90 36.8), so PD_MIN_FULL = 34.7 and
    # the factor is the flat share `min(1, mpg / 34.7)` - a creation RATE turned into a season's
    # worth of created offence. A card with no minutes on the sheet takes 1.0, which is recal_96's
    # own rule ("measured, or not at all"). It is also inside the window his standing anchors leave:
    # every value from 33.9 to 35.2 puts the subject on 84 with every anchor held (33.8 leaves him
    # on 85, 35.3 takes Mark Jackson '98 below his band), and 34.7 sits in it with room either side.
    #
    # WHERE IT LANDS AND WHERE IT STOPS. John Stockton '01 off 86 -> 84, inside his 80 +-4 band at
    # its top edge, and 84 IS THE FLOOR OF WHAT IS REACHABLE. The frontier is Mark Jackson '98, who
    # is pinned 55 +-3, reads 53, and played 29.4 minutes - two tenths MORE than the subject. Any
    # factor monotone in minutes therefore pays the subject at least what it pays Jackson, and
    # Jackson can lose at most 16.6% of his term while the subject must lose 13.7% to reach 84 and
    # 26.3% to reach 83. MEASURED, not argued: 13,236 parameterisations of the whole floor-plus-ramp
    # family (floor 0.00 to 1.00, foot 15.0 to 39.5, width 0.5 to 25) hold every OFF anchor on the
    # board - value and order, the only scale this round can move - and the
    # LOWEST reading any of them gives the subject is 84. The only shape that would separate two
    # cards two tenths of a minute apart is a cliff at 29.3 mpg, and Mark Jackson '00 (27.0 mpg,
    # pinned 58 +-3) closes that door: a ramp steep enough to split them zeroes his whole term.
    PD_PV_LO, PD_PV_HI = 70.0, 85.0
    # recal_138 hoisted `PD_V_LO, PD_V_HI = 10.0, 68.0` to module scope — the band top is now read
    # by the hub's class function too, and the two terms are DISJOINT across it by construction.
    PD_E_LO, PD_E_HI, PD_E_FLOOR = 70.0, 90.0, 0.5
    PD_MIN_FULL = 34.7
    _gpv = min(1.0, max(0.0, (a['playvol'] - PD_PV_LO) / (PD_PV_HI - PD_PV_LO)))
    _gv = min(1.0, max(0.0, (PD_V_HI - a['volume']) / (PD_V_HI - PD_V_LO)))
    if _gpv * _gv > 0.0:
        _ge = PD_E_FLOOR + (1.0 - PD_E_FLOOR) * min(1.0, max(0.0,
              (a['efficiency'] - PD_E_LO) / (PD_E_HI - PD_E_LO)))
        _mp = _MPG.get(p['name'])
        _gl = 1.0 if _mp is None else min(1.0, _mp / PD_MIN_FULL)
        _pd = 0.245 * a['playvol'] * _gpv * _gv * _ge * _gl
        std += _pd
        if trace is not None:
            trace['passer'] = dict(gate=_gpv * _gv, eff_factor=_ge, mpg=_mp, load=_gl, added=_pd)
    # recal_112 (HIS RULING, verbatim: "I think in general eff is getting undervalued. 17pgg on 68
    # ts(on a bad era). Has to show mid to high 60's at least. Even low 70's"). THE EFFICIENT
    # INTERIOR SCORER — the mirror of recal_64's off-ball floor, for the man whose efficiency comes
    # from inside instead of from the arc.
    #
    # THE CARD. Cedric Maxwell '80: 16.9 points on .679 true shooting in a league that shot .526,
    # at 17.7% usage. His efficiency attribute is 99 - the top of the scale - and he printed OFF 55,
    # because the standard path pays efficiency 0.11 while it pays volume 0.26 and he has volume 27.
    #
    # HIS LEVER WAS MEASURED FIRST AND IT DOES NOT WORK. "In general eff is getting undervalued"
    # points at the efficiency weight, so that was tried first, shifting weight from volume to
    # efficiency with the total held constant (recal_89's rule, so no multiplier compensation is
    # owed). It cannot be done: 0.11 -> 0.12 is worth ONE point to Maxwell, 0.13 already breaks
    # Moses Malone '82, and reaching the bottom of his band needs 0.25 against volume 0.12 - which
    # breaks TWENTY-FIVE anchors and moves 9,064 cards. The global dial is the same wall recal_91
    # and recal_98 hit; the efficiency of a low-usage man cannot be paid through a weight that every
    # high-usage anchor also rides.
    #
    # THE TERM, and why it is gated the way it is. It pays elite efficiency where the standard path
    # cannot see it - at low usage - and every gate excludes a class that already has a channel:
    #   efficiency 85 -> 99   the claim is about ELITE conversion, not about being adequate.
    #   volume 55 -> 25       recal_64's own low-usage idea. Every star is at 0.00 by construction:
    #                         LeBron '13 (volume 97), SGA '25 (98), Giannis '25 (98), Jokic '25 (89).
    #   playvol 70 -> 40      recal_109's elite passer is paid for the ball he moves and is excluded
    #                         here. The two terms are DISJOINT: 109 needs playvol >= 80, this needs
    #                         <= 70, so no card can take both and dropping either leaves the other
    #                         untouched. John Stockton '96 (playvol 99) and Steve Nash '05 (97) do
    #                         not move.
    #   3pt 68 -> 40          THE MIRROR OF recal_64. That floor is gated `3pt >= 68` and exists for
    #                         the low-usage SHOOTER; its own named cards are Kyle Korver '15 and
    #                         Steve Kerr '96, both pinned. Without this gate they take this term too
    #                         and both leave their bands. With it, efficiency earned at the rim and
    #                         the line is paid here and efficiency earned from the arc is paid there.
    # MEASURED: 154 of 10,000 cards move on OFF, every one of them UP, max +13; DEF and every
    # attribute move on ZERO; the top 12 by OFF is identical and the top 50 by OVR has no entrant
    # and no leaver. All 118 anchors hold at every size tested from 0.10 to 0.20.
    EF_E_LO, EF_E_HI = 85.0, 99.0
    EF_V_LO, EF_V_HI = 25.0, 55.0
    EF_PV_LO, EF_PV_HI = 40.0, 70.0
    EF_3P_LO, EF_3P_HI = 40.0, 68.0
    _ee = min(1.0, max(0.0, (a['efficiency'] - EF_E_LO) / (EF_E_HI - EF_E_LO)))
    _ev = min(1.0, max(0.0, (EF_V_HI - a['volume']) / (EF_V_HI - EF_V_LO)))
    _ep = min(1.0, max(0.0, (EF_PV_HI - a['playvol']) / (EF_PV_HI - EF_PV_LO)))
    _e3 = min(1.0, max(0.0, (EF_3P_HI - a['3pt']) / (EF_3P_HI - EF_3P_LO)))
    if _ee * _ev * _ep * _e3 > 0.0:
        _ef = 0.14 * a['efficiency'] * _ee * _ev * _ep * _e3
        std += _ef
        if trace is not None:
            trace['interior'] = dict(gate=_ee * _ev * _ep * _e3, added=_ef)
    # recal_118 (HIS RULING, verbatim: "For the scout, I agree with 3,4,5,6,7"). THE OFF-BALL FLOOR
    # IS A RAMP, NOT A GATE — item 5 of the scan's shortlist.
    #
    # THE DEFECT. r64's gate is `3pt >= 68 and volume < 55`, and since recal_91 grew the big branch
    # the thing behind that gate is worth up to TWENTY-FOUR printed OFF points. One rating point of
    # `3pt` therefore decides a fifth of a card. DORIAN FINNEY-SMITH is the case, on two seasons of
    # the same job: '20 (3pt 57) reads 38 and '21 (3pt 72) reads 62, on usage 12.9 and 12.2, true
    # shooting .595 and .609, 37.6% and 39.4% from the arc, BPM -0.2 and +0.1. Across the whole pool
    # 45 adjacent-season pairs of the same man jump 10 or more OFF points across this one flip.
    #
    # THE RAMP, and it introduces NO NEW CONSTANT. The share of the floor a man has earned is his
    # own shooting measured against r64's own number: `min(1, 3pt / 68)`. At 3pt 68 and above it is
    # 1.0 and the branch is byte-identical to what stood before; below it the man is paid in
    # proportion to how much of a spacer he actually is. 68 stops being a threshold and becomes the
    # point of saturation - the same number, doing the job it was chosen for.
    #
    # WHAT THE SHARE IS APPLIED TO, which is the whole of why this reaches the card. The floor is
    # not a rival score: it is a CORRECTION to the standard path - the claim that a man who spaces,
    # converts and holds the ball is worth more than his own weighted line says. So the share is
    # applied to the CORRECTION and not to the floor: `std + f x (floor - std)`, which at f = 1 is
    # `max(std, floor)` exactly. MEASURED, all three forms, on the whole pool:
    #   floor x f, foot 0     Finney-Smith '20 reads 46 - the scaled floor sinks below his own
    #                         standard path long before it reaches him
    #   correction x f, foot 50 (the shortlist's own example)  he reads 45
    #   correction x f, foot 0                                 he reads 53
    # Only the last one reaches his band, and it is also the only one with no constant to choose.
    #
    # UNTOUCHED BY CONSTRUCTION, and verified rather than assumed - of the 499 cards that move,
    # ZERO have 3pt >= 68, ZERO have volume >= 55 and ZERO have 3pt of 0. Every wing pin the floor
    # was built on is above the saturation point (Korver '15 95, Kerr '96 93, Bowen '06 81, Snell
    # '18 80, Novak '13 99, Tolliver '14 95, Anunoby '21 75, Hachimura '26 88, Finney-Smith '21 72)
    # and every volume scorer is outside r64's usage gate, which this round does not touch.
    # MEASURED: 499 of 10,000 cards move on OFF, every one of them UP, max +16, mean +3.50; DEF and
    # every attribute move on ZERO; the top 12 by OFF is identical and the top 50 by OVR has no
    # entrant, no leaver and no rank flip. The cliff pairs fall from 45 to 20 and Finney-Smith's own
    # gap closes from 24 to 9.
    OB_3P_FULL = 68.0
    _f3 = min(1.0, max(0.0, a['3pt'] / OB_3P_FULL))
    if _f3 > 0.0 and a['volume'] < 55:
        _fl = 0.38*a['3pt'] + 0.20*a['efficiency'] + 0.08*a['ballsec'] + 0.06*a['discipline']
        # recal_91 (HIS RULINGS, verbatim: "Too low OFF 54. Should be mid 60s" for OG Anunoby '21,
        # and "OFF should be low 60s, or high 60s. Not 55" for Rui Hachimura '26).
        # THE STRETCH BIG GETS THE OTHER HALF OF THE FLOOR. r64 built this floor for the low-usage
        # WING shooter — the Dort/Snell/Bowen class — and its four terms are the whole of what a
        # standstill wing specialist does: space, convert, hold the ball, don't foul. Its weight sums
        # to 0.72 against the standard path's 1.26, and that thinness is CORRECT for a wing, because
        # there is nothing else to pay him for. The big who shoots was routed onto the same floor,
        # and for him the same thinness is a 43% discount on work he actually does: he crashes the
        # offensive glass, he finishes at the rim, and he carries a real share of the possessions.
        # The big branch therefore adds exactly the three terms the wing branch drops — orb, rim and
        # volume — bringing this branch's weight to 1.16, in line with the standard path it stands in
        # for. It is the SIBLING of recal_55's big hub: same idea (a big's channel that the guard
        # formula had no room for), same class function (is_big, which lives at the top of this file).
        # NOT A NEW GATE: the branch reuses r64's own gate (3pt >= 68 and volume < 55) untouched, so
        # the class is 212 cards of 10,000 and no card outside r64's class is touched at all.
        # NOTHING ABOVE IS RE-WEIGHTED. The standard path, the dominance bonus, the big hub, the 0.93
        # multiplier and OFF_TOP are all byte-identical — this is a max() against a taller floor, so
        # a card whose standard path already exceeds it (Schrempf '98, Bertans '20) does not move.
        # MEASURED: Anunoby '21 54 -> 64, Hachimura '26 55 -> 66, 198 cards move, max +17, every one
        # of them inside r64's gate. The wing floor's own anchors are untouched BY CONSTRUCTION —
        # Korver '15 58, Kerr '96 62, Snell '18 50, Bowen '06 45 are all perimeter, not bigs.
        if is_big(p):
            # recal_99 (HIS RULING, verbatim: "Agree with 1-7"). THE STRETCH-BIG TERMS ARE EARNED,
            # NOT GIVEN. r91 added orb, rim and volume for bigs because "he crashes the offensive
            # glass, he finishes at the rim, and he carries a real share of the possessions" - but
            # it paid them to EVERY big inside r64's gate, at their raw level and with no floor. So
            # Steve Novak '13 (volume 9, rim 27, orb 19) and Anthony Tolliver '14 (volume 7, rim 21)
            # collected 8.7 and 11.8 for work they do not do, and read OFF 70 and 66 as standstill
            # shooters in a power forward's body.
            # THE GATE IS r91's OWN SENTENCE, made a condition: the three terms are paid in
            # proportion to the evidence of EITHER real load OR real glass - volume from 8 to 22, or
            # offensive rebounding from 45 to 65, whichever is the better claim. A card that shows
            # neither is a wing spacer and keeps r64's wing floor, which is the whole of what he does.
            # WHY "OR" AND NOT "AND", measured: gating on load alone reaches the two named cards but
            # takes Dorian Finney-Smith '21 (volume 7 but orb 71) from 62 to 45 and Al Horford '24
            # (volume 5, orb 60) from 67 to 52 - both genuine glass workers, both cards r91 moved on
            # purpose. With the glass half in place they read 62 and 63.
            # MEASURED: 63 cards move on OFF, Novak 70 -> 62 and Tolliver 66 -> 55; r91's own anchors
            # hold (Hachimura '26 66, Anunoby '21 64) and so does Harrison Barnes '25 at 73.
            _g = max(min(1.0, max(0.0, (a['volume'] - SB_V_LO) / (SB_V_HI - SB_V_LO))),
                     min(1.0, max(0.0, (a['orb'] - SB_ORB_LO) / (SB_ORB_HI - SB_ORB_LO))))
            _fl += _g * (0.17*(a['orb'] + a['rim']) + 0.10*a['volume'])
        # recal_118: the share of the CORRECTION he has earned, not the whole of it. At _f3 == 1.0
        # this line is `max(std, _fl)` byte for byte, which is what every card above 3pt 68 gets.
        _flr = std + _f3 * (_fl - std)
        std = max(std, _flr)
        if trace is not None:
            trace['offball_floor'] = dict(value=_flr, binding=std == _flr, share=_f3, full=_fl,
                                          branch='stretch big (recal_91)' if is_big(p) else 'wing (recal_64)')
    # recal_131 (HIS RULING, verbatim: "What I dont like, is Malone being 69 OFF with 25 ppg on not
    # bad eff"). THE PAINT-EVIDENCE FLOOR ON THE ZONE BLOCK.
    #
    # THE CARD. Moses Malone '85: 24.6 points at 26.9% usage on .570 true shooting in a .543 league,
    # the offensive rebounding and foul-drawing leader of his era, and he printed OFF 69. His own
    # '82 card, the same man on the same shape, prints 85. The whole of the sixteen points is the
    # ZONE BLOCK: rim 95 -> 60 and mid 67 -> 50 between the two seasons, worth 6.1 of o_score with
    # nothing else on the sheet moving by more than a couple (usage 28.7 -> 26.9, true shooting
    # .578 -> .570).
    #
    # WHERE THAT COMES FROM, and it is not a bar this file may touch. `rim` and `mid` are MEASURED
    # from the shot-location tables only from 1997; before that build_ratings.py INFERS them from a
    # model fitted on 1997-2005 and regressed toward each season's own mean — the compression of
    # pre-1997 superstars toward the mean that RATINGS_UPDATE.md ratifies and that recal_52 already
    # named ("MEASURED, OR INFERRED BY MODEL — NEVER ASSUMED"). So for an inferred card z[0] and
    # z[1] are one model output, not two facts, and a one-year wobble in the model's inputs costs
    # 0.30 of the weight vector. The third zone is not in the claim: three-point shooting is on the
    # sheet from 1980 and is measured in every era this file carries.
    #
    # WHAT IS MISSING, and it is general rather than era-specific. z[0] at 0.22 is the ONLY channel
    # that answers "does this man score inside". The two facts that constitute an interior scorer's
    # damage — the fouls he draws and converts, and the offensive glass — are on the sheet in EVERY
    # era, straight out of the box score, and o_score prices them as side skills at 0.11 and 0.06.
    # recal_46 wrote the diagnosis itself, one term up the file: "A paint weapon's damage is mostly
    # OFF the shot — fouls drawn, offensive boards, the defence he collapses — and the standard path
    # prices almost none of it." Its answer was the paint half of recal_37's dominance bonus, which
    # is reachable ONLY through a SHAPE gate on the zone vector (z[0] must tower over the other two
    # and be 91+). A man whose paint damage is real but whose zone BAR is not is therefore locked
    # out of the one channel built for him, by the very number that is wrong about him.
    #
    # THE TERM. The zone block is FLOORED at the paint damage the card measurably did:
    #   PZ_EVIDENCE = half the standard path's own free-throw term, half the offensive glass. Evenly,
    #     because it takes BOTH: a foul-drawing guard has no glass and a putback specialist draws no
    #     fouls, so the pair is the interior scorer's signature and no position gate is needed.
    #   0.30 is not a new number. It is z[0]'s 0.22 plus z[1]'s 0.08 — the weight of exactly the two
    #     zones the pre-1997 model infers — which is the same move recal_107 made with the 0.22.
    #   volume 55 -> 80. 55 is this file's own low-usage line, the gate recal_64, recal_107 and
    #     recal_112 all read as `volume < 55`; this term begins where those three end, so it and they
    #     are DISJOINT by construction and no card is paid twice. 80 is a top-sixth load (usage 24.8).
    #   efficiency 45 -> 65. 45 IS the league's own conversion rate — median ts_rel .566 against a
    #     league mean of .570 — so a man who scores at his league's rate earns nothing here, and the
    #     ramp is full three points of true shooting above it (.598). This is "not bad eff", his own
    #     phrase, made a number: Hakeem Olajuwon '90 carries the same load (volume 89 to 88) on
    #     efficiency 57 and his floor lands BELOW his standard path, so he does not move at all.
    # Written as a max() so it can only ever LIFT, and every card whose zone block already exceeds
    # the evidence is untouched BY CONSTRUCTION — which is the whole of the protection for the class:
    # Moses '82 (rim 95), Ewing '90 (97), Kareem '80 (98), Barkley '90 (97), Robinson '92 (97),
    # Shaq '00 (99) and Hakeem '90 (85) all move by EXACTLY zero.
    # MEASURED: 103 of 10,000 cards move on OFF, every one of them UP, max +9; DEF, every attribute
    # and the top 12 by OFF move on ZERO, and the top 50 by OVR has no entrant and no leaver. The
    # movers are one archetype and read like it — Moses '84-'90, Zydrunas Ilgauskas '04-'06, Shawn
    # Kemp '96-'99, Kevin Love '11/'12, Karl-Anthony Towns '26, Brook Lopez '10, Corey Maggette '07,
    # Jimmy Butler '20 — men who live at the line and on the offensive glass. 66 of the 103 are
    # MEASURED-era cards (max +6), so this is not an era patch: the inference is why the defect bites
    # hardest before 1997, not what the defect is.
    PZ_V_LO, PZ_V_HI = 55.0, 80.0
    PZ_E_LO, PZ_E_HI = 45.0, 65.0
    _pz = (min(1.0, max(0.0, (_vol - PZ_V_LO) / (PZ_V_HI - PZ_V_LO)))
           * min(1.0, max(0.0, (a['efficiency'] - PZ_E_LO) / (PZ_E_HI - PZ_E_LO))))
    if _pz > 0.0:
        _pe = 0.5 * (a['fouldraw'] * a['ft'] / 100) + 0.5 * a['orb']
        _pblk = 0.22 * z[0] + 0.08 * z[1]
        std = max(std, std + _pz * (0.30 * _pe - _pblk))
        if trace is not None:
            trace['paint_floor'] = dict(share=_pz, evidence=_pe, block=_pblk,
                                        added=max(0.0, _pz * (0.30 * _pe - _pblk)))
    # recal_121 (HIS RULING, verbatim: "This is way too much ball sec for a very turnover prone guy.
    # In addition to the OFF being a touch heigher than Id like it to be.. More around 85"; and, on
    # the round's first cut, HIS AMENDMENT, verbatim: "I agree that Luka and Lebron are the only
    # concerns. If there is a way to keep them, its more ideal").
    # THE HANDLER'S TURNOVER CHARGE — the OFF half of the sentence recal_116 answered on the bar.
    #
    # THE HISTORY, because this term was DECLINED once and the decline is what makes it legitimate
    # now. recal_111 measured this ruling and refused it: three of his own pins stood in the way of
    # any charge on inefficient, turnover-prone load, and the binding one was RUSSELL WESTBROOK '17
    # at off 91 +-1 — the same man one season later, WORSE on both faults at the same usage, so no
    # charge that is non-increasing in efficiency and security could take '15 down four points and
    # leave '17 inside one. He was shown that decline with the blockers named, and he REPEATED the
    # ruling. So '17's pin is released to anchors_superseded.json BY HIS REAFFIRMATION and '17 now
    # reads what the formula gives; the other two blockers, JAYLEN BROWN '26 (off 83 +-1) and JAMES
    # HARDEN '19 (off 95 +-1), still stand, and they are held by this term's own gates rather than
    # by luck — see WHO IS SPARED. Both move by EXACTLY zero.
    #
    # THIS IS NOT recal_85's EMPTY-VOLUME TAX, and the difference is structural, not a matter of
    # degree. That tax lived in the OVR CORE, after o_ovr and d_ovr were fixed, and subtracted from
    # the BLEND: it was "the sole cause of every card printing BELOW its weaker end — 192 of them".
    # This charge is inside o_score, so what falls is OFF ITSELF and the blend still reads between a
    # card's two ends; no card can print below its weaker end from it, by construction. It is also
    # gated on TWO faults and on handling load, where the tax read heavy load at poor efficiency
    # alone: 48 cards move here against that tax's 192.
    #
    # THE TERM. Every constant is a quantile of the class the ruling names, or a measured frontier.
    # THE CLASS is the man the offence RUNS THROUGH: handling load, the mean of o_score's own two
    # load bars (recal_96 named exactly these two — "the two bars that claim he carried this much").
    # Westbrook '15 is (98 + 93)/2 = 95.5. The gate opens at 85 and pays in full at 95; H >= 85 is
    # 218 cards of 10,000, and those 218 ARE the population every other constant below is read off.
    #   efficiency 51 -> 60  full charge at or below the class's LOWER TERCILE of conversion
    #                        (measured: 51) and NOTHING at its MEDIAN (measured: 60).
    #                        HIS AMENDMENT, verbatim: "I agree that Luka and Lebron are the only
    #                        concerns. If there is a way to keep them, its more ideal". The leg first
    #                        ran from the median to the class's UPPER QUARTILE (60 -> 75), which
    #                        charged men who convert at or above the class's middle: LeBron '20
    #                        (efficiency 59) -4 and Luka '22 (54) -6. Pulling the fade back to the
    #                        MEDIAN is the whole amendment, and efficiency is the only quantity that
    #                        can carry it — ball security cannot spare either man, because 58 and 55
    #                        are WORSE than the subject's 60. At the median LeBron '20 sits on the
    #                        leg's foot (gate 0.11) and keeps all but a point; Luka '22 halves.
    #                        K DID NOT HAVE TO MOVE and the ceiling did not rise: the subject sits AT
    #                        the floor of the new leg, so his own gate is 1.00 either way. A leg cut
    #                        to the class's lower QUARTILE instead (46 -> 60) spares the same two men
    #                        but needs K = 9.8 and takes Westbrook '18 to 75 and '19 to 70 — measured
    #                        and rejected: it buys nothing and deepens the tail by three.
    #   ballsec 58 -> 65     full charge at or below the class's LOWER QUARTILE of ball security
    #                        (measured: 58, the 24th percentile). Westbrook '15 is 60.
    #                        65 IS A FRONTIER, not a taste. A WIDER fade needs a SMALLER K to put the
    #                        subject on his number, and therefore leaves a shallower tail, so the
    #                        round takes the widest fade the ORDERING permits: at 66 and above the
    #                        term can no longer put Westbrook '17 at or BELOW '15, which is the
    #                        condition his reaffirmation carries — '17 is the worse season on both
    #                        faults and must not read above the season he ruled on.
    #   K = 6.3              solved for the subject: 89.2313 raw - 0.93 x 6.3 x 0.7143 = 85.05 -> 85.
    #                        It is also the CEILING of the whole charge, so no card on the board can
    #                        lose more than 6 printed points to it.
    #
    # WHO IS SPARED, and each by a gate rather than by a threshold drawn around him:
    #   JAMES HARDEN '19  — efficiency 87, far above the class's median, so the efficiency gate is
    #                       0.00 and his ball security of 56 costs him nothing. Held at 96.
    #   LEBRON '20, TRAE '22 — his amendment's two names and the class they stand for: a man who
    #                       converts at the class's middle or better is at or near the leg's foot.
    #                       Trae '22 (efficiency 64) is at 0.00 and does not move at all; LeBron '20
    #                       (59) is at 0.11 and moves one point. Trae '21, Wade '08, Cassell '98,
    #                       Booker '19, Grant Hill '99, Deron Williams '11 and four more LeBron
    #                       seasons left the footprint entirely with them.
    #   JAYLEN BROWN '26  — twice over: handling load (96 + 68)/2 = 82, below the gate, AND ball
    #                       security 64. Inefficient but careful, and he does not create. Held at 83.
    #   KOBE '16, IVERSON '02, CARMELO '13 — the inefficient-but-CAREFUL class the ruling does not
    #                       name: ball security 84, 87 and 91, all at gate 0.00, all unmoved. DeMar
    #                       DeRozan '17 is the sharpest control on the board — efficiency 51, EXACTLY
    #                       Westbrook '15's, at volume 97 — and ball security 90 leaves him at 86.
    #   LUKA '23, GIANNIS '24, EWING '90, ZION '21 — poor ball security is not enough on its own:
    #                       all four convert, so the efficiency gate holds them at or near zero.
    # MEASURED on the whole pool, at the amended cut: 35 of 10,000 cards move on OFF, every one of
    # them DOWN, max -6; DEF moves on ZERO and no attribute moves at all; OVR moves on 32, max -4.
    # The top 12 by OFF is identical. THE CEILING IS UNCHANGED AT 6.3 — the men who take the whole
    # charge are Westbrook '17 and '18, handling load 98, and nobody loses more than six printed
    # points. The 35 are one class and read like it: Westbrook '11-'21, Trae Young '19-'25, John
    # Wall '13-'18, Cade Cunningham '24-'26, Luka '19-'22, D'Angelo Russell '19, LaMelo Ball '25 —
    # high-usage creators who neither convert nor keep the ball. Against the first cut (60 -> 75)
    # this sheds 103 printed points across 35 cards rather than 148 across 48.
    TC_H_LO, TC_H_HI = 85.0, 95.0
    TC_E_LO, TC_E_HI = 51.0, 60.0
    TC_B_LO, TC_B_HI = 58.0, 65.0
    TC_K = 6.3
    _hl = 0.5 * (a['volume'] + a['playvol'])
    _th = min(1.0, max(0.0, (_hl - TC_H_LO) / (TC_H_HI - TC_H_LO)))
    _te = min(1.0, max(0.0, (TC_E_HI - a['efficiency']) / (TC_E_HI - TC_E_LO)))
    _tb = min(1.0, max(0.0, (TC_B_HI - a['ballsec']) / (TC_B_HI - TC_B_LO)))
    if _th * _te * _tb > 0.0:
        _tc = TC_K * _th * _te * _tb
        std -= _tc
        if trace is not None:
            trace['turnover_charge'] = dict(handling=_hl, h=_th, e=_te, b=_tb,
                                            gate=_th * _te * _tb, taken=_tc)
    if trace is not None: trace['o_score'] = std
    return std
def d_score(p, trace=None):
    # class-dependent: bigs' defensive votes route to rimprot by design, so perdef understates them;
    # perimeter keeps the round-1 perdef-heavy mix (perdef IS the complete defensive verdict)
    #
    # recal_93: the class is now a WEIGHT, not a switch (see d_bigness above). Both vectors are
    # computed and blended; at w == 1.0 and w == 0.0 the arithmetic is byte-identical to what stood
    # before, so 4,307 position-decided bigs and every lifetime guard are unmoved by construction.
    a = p['attrs']
    w = d_bigness(p)
    # drb weight up: rebounding credit now lives here, not inside rimprot
    # recal_106 (HIS RULING, verbatim: "reduce by a little discipline impact on DEF"). BOTH
    # DEFENSIVE VECTORS LOSE A TENTH OF THEIR DISCIPLINE WEIGHT, and the survivors are renormalised
    # proportionally so each vector still totals 1.00 — the convention recal_76 and recal_81 used.
    #
    # HOW MUCH "A LITTLE" IS, and it is bounded rather than chosen. The perimeter side cannot go far:
    # CARON BUTLER '08 is pinned at def 73 +-1 by recal_57 and already reads 72, sitting ON his edge,
    # and he leaves the band the moment the perimeter weight reaches 0.052 — the largest cut the
    # anchors permit there is about a EIGHTH. A TENTH is the round number strictly inside that, and
    # applying the same tenth to both keeps the 2:1 relationship recal_80 set between the two
    # discipline weights rather than inventing a new one. The big vector alone would tolerate far
    # more (it holds every anchor even with discipline deleted), but a ruling about "discipline
    # impact on DEF" is one statement about one attribute, not two different ones.
    # MEASURED: 1,368 cards move on DEF, every single one by exactly ONE point, and the split is
    # near even — 703 up, 665 down. OFF and every attribute move on ZERO. The top 12 by DEF is
    # identical and the top 50 by OVR has no entrant and no leaver.
    DISC_BIG, DISC_PER = 0.027, 0.054
    _kb = (1.0 - DISC_BIG) / 0.97    # the big vector's surviving 0.97, renormalised back to 1.00
    _kp = (1.0 - DISC_PER) / 0.94    # the perimeter vector's surviving 0.94, likewise
    # drb weight up: rebounding credit now lives here, not inside rimprot
    _big = _kb*(0.40*a['perdef'] + 0.40*a['rimprot'] + 0.17*a['drb']) + DISC_BIG*a['discipline']
    # recal_57 trimmed perimdisrupt 0.15 -> 0.09; recal_62 (his ruling) trims it again 0.09 -> 0.05.
    # Steals are a gamble, not a lockdown — perdef takes all the slack (it IS the complete verdict).
    # recal_80 (design-side round, HIS RULING "Ship 80"): rim protection counted ZERO on the
    # perimeter branch, so a wing who genuinely contests at the rim got nothing for it. New vector,
    # sums to 1.00. NOTE the raise to perimdisrupt is 0.05 -> 0.11 on OUR real vector (the round
    # quotes 0.09 -> 0.11), a 2.2x raise that SUPERSEDES recal_62 — see the annotation in receipt 80.
    base = (_kp*(0.63*a['perdef'] + 0.13*a['rimprot'] + 0.11*a['perimdisrupt'] + 0.07*a['drb'])
            + DISC_PER*a['discipline'])
    # size modifier: a 6'0 defender guards one matchup; tall stoppers switch. Guard-quota All-D
    # selections are real evidence, but size caps the ceiling. Bites only truly small defenders.
    # It belongs to the PERIMETER vector alone, exactly as it always has: a man is only shrunk for
    # his height on the share of him that is being graded as a perimeter defender.
    _size = min(1.0, 0.94 + 0.06*(a.get('height', 76) - 71)/7)
    _perim = base * _size
    out = w * _big + (1.0 - w) * _perim
    if trace is not None:
        trace['branch'] = ('big' if w >= 1.0 else ('perimeter' if w <= 0.0 else f'blend w={w:.4f}'))
        trace['bigness'] = w
        _wpd = _kb*0.40*w + _kp*0.63*(1-w)*_size
        _wrp = _kb*0.40*w + _kp*0.13*(1-w)*_size
        _wpx = _kp*0.11*(1-w)*_size
        _wdr = _kb*0.17*w + _kp*0.07*(1-w)*_size
        _wdi = DISC_BIG*w + DISC_PER*(1-w)*_size
        trace['terms'] = [('perdef', a['perdef'], _wpd, _wpd*a['perdef']),
                          ('rimprot', a['rimprot'], _wrp, _wrp*a['rimprot']),
                          ('perimdisrupt', a['perimdisrupt'], _wpx, _wpx*a['perimdisrupt']),
                          ('drb', a['drb'], _wdr, _wdr*a['drb']),
                          ('discipline', a['discipline'], _wdi, _wdi*a['discipline'])]
        trace['base'] = base
        trace['big_vector'] = _big
        trace['perim_vector'] = _perim
        trace['size_mod'] = _size
        trace['d_score'] = out
    return out
for cls in (True, False):
    grp = sorted(p['_raw'] for p in players if is_big(p) == cls)
    for p in players:
        if is_big(p) != cls: continue
        pct = bisect.bisect_left(grp, p['_raw']) / max(1, len(grp) - 1)
        p['_marg'] = 40 + 59 * pct
# TOP-BAND RESCALE (his ruling). The x1.10 display multiplier ran past the ceiling and the clamp ate
# the difference: 51 offensive seasons and 30 defensive ones all printed 99, so Curry '16, Harden '19
# and Shai '25 were indistinguishable. Below the knee nothing changes — 98% of cards are byte-identical.
# Above it, the raw range is mapped onto 93-99 so the men who were tied now separate. The tops are the
# measured maxima (OFF 108.0, DEF 104.7) so the best card in the pool lands ON 99 rather than short of
# it; a future outlier past them simply pins at 99, which is what a ceiling is for.
# recal_67: the DEF display multiplier deflates 1.10 -> 1.03 (a fossil from when defensive attributes
# ran low; after the defensive evidence campaign every defender floated ~7 above his own composite).
# DEF_TOP re-derived by the band's own standing doctrine — the measured maximum raw (Ben Wallace '06,
# d_score 95.80 x 1.03 = 98.674) — so the summit lands ON 99 and the top ordering is untouched.
# The round ordered "solve DEF_TOP for Gobert '19 = 99 exactly": UNSATISFIABLE here and reported, not
# forced — his composite is 84.08, so his deflated raw (86.6) sits BELOW the knee where the band is
# identity; no DEF_TOP reaches him, and our summit is Wallace, not Gobert (receipt 67 has the board).
# recal_80 item 2, SCALE NEUTRALITY (disclosed, not optional). The new perimeter vector deflates the
# whole perimeter class, so the DEF display pair is re-solved: the multiplier 1.03 -> 1.1305 puts the
# round's named anchor Gary Payton '96 back on 86 (his pre-round v73 value, the +-1 test), and DEF_TOP
# 98.67 -> 107.55 is re-derived by r67's own doctrine as the measured maximum raw, so the summit lands
# ON 99. That also repairs a drift: after r76/r81/r82 nothing in the pool reached 99 at all (the top
# was Ben Wallace '04 at 98). r60's REF_DRTG intercept underneath is NOT re-opened.
# recal_90 (HIS RULING, verbatim: "Fix the OFF band anchor"). Completes the drift recal_89 named
# and deliberately left, and it is the SIBLING of recal_84, which did the same job for OVR_TOP.
#
# THE READING TAKEN, named explicitly because r84's had to be argued for: for OFF there is NO
# ambiguity, and that is worth saying rather than glossing. The band's doctrine is "top set to the
# highest raw the pool actually produces, so the best card lands ON 99", and the value the band
# CONSUMES is not an intermediate that has to be reconstructed — the pipeline literally appends the
# band's own argument to _otops one line before calling it:
#     _o = o_score(p) * 0.93 ; _otops.append(_o) ; band(_o, OFF_TOP)
# So the reading is o_score AFTER the standard weighted path, AFTER the volume x efficiency
# interaction term, AFTER the zone-dominance bonus, and AFTER the 0.93 display multiplier.
# THE ONE OTHER DEFENSIBLE READING, considered and rejected: derive from the raw BEFORE the
# dominance bonus, so a weapon could be rewarded past the ceiling. Rejected for r84's reason — the
# band's entire function is to map ITS OWN INPUT onto 99, so an anchor derived from anything else
# cannot make the top card land on 99, which is the only thing the constant is for.
# MEASURED over all 10,000 cards: 110.6400, Giannis Antetokounmpo '25. 106.36 -> 110.64.
# WHY IT DRIFTED: recal_89's weight shift toward load and creation lifted the very top of the
# offensive raw (110.08 -> 110.64) and carried a SECOND card past the old anchor, so Giannis '25 and
# '24 both clamped to 99 and tied. That is the same compression r84 removed from OVR, on OFF.
# THE 0.93 MULTIPLIER IS NOT IN CONFLICT AND IS NOT RE-SOLVED. The two constants own DISJOINT
# regions of the scale: below the knee band() is the identity, so 0.93 alone decides where ~98% of
# the pool sits, and OFF_TOP alone decides how the thin tail above 93 is stretched onto 93-99.
# Changing the top cannot move a card the multiplier governs, and this round changes no weight at
# all, so r89's grounds for amending r34's LOCKED DIAL STATE pin (total weight unchanged, therefore
# the renormalised multiplier still holds) survive this round untouched.
# DEF_TOP IS LEFT, and it is a decision rather than an oversight: measured 107.5558 against the
# anchor 107.55 — ONE card (Ben Wallace '03), 0.0058 above, which already lands ON 99 through the
# band. That is the same sub-hundredth rounding gap recal_84 measured and left, and it is NOT the
# drift being fixed here: OFF had two cards tied at the ceiling with a 4.28-point gap behind the
# leader. One sanctioned outlier that lands on 99 is what a ceiling is for.
# recal_102 (HIS RULING, verbatim: "Jordan still too low. I want him 98+ OFF and DEF"). HIS
# REAFFIRMATION, AFTER THE COST TABLE. recal_98 declined this ruling and printed the frontier: MJ
# '89 reads OFF 96 on a raw of 100.49 (23rd on the board) and DEF 96 on 101.44 (29th), and the only
# instrument that reaches him is the band. He was shown that, and he ruled again. So this round does
# what recal_98 would not do on its own authority, and the cost is his, not the agent's.
#
# WHAT THIS OVERTURNS, said plainly. The band's standing doctrine since recal_67 is "the top is the
# MEASURED MAXIMUM RAW, so the best card lands ON 99, and a future outlier simply pins at 99". Both
# constants below now sit BELOW their measured maxima on purpose: OFF 102.75 against a measured
# 110.6400 (Giannis '25) and DEF 104.25 against a measured 108.4602 (Ben Wallace '03). Everything
# above the constant clamps, so the doctrine's own consequence follows and is measured, not hidden:
# cards printing 99 go from 1 to 17 on OFF and from 5 to 13 on DEF. That is the compression recal_84
# and recal_90 were written to remove, reinstated by his instruction on a card he has now ruled on
# twice. recal_90's Giannis '25 anchor still holds at 99 — but he is no longer ALONE there.
#
# WHY THESE TWO NUMBERS AND NOT LOWER. 102.75 is the largest OFF_TOP that puts MJ on 98, and 104.25
# the largest DEF_TOP: his ruling is "98+", so the round takes the SMALLEST move that satisfies it
# and therefore the smallest tie block. Going further to 99/99 costs more: OFF 99 needs 101.00 and
# breaks four anchors he has NOT superseded (Curry '16, LeBron '13, SGA '25, Harden '19); DEF 99
# needs 102.00, breaks nothing, but takes the cards on 99 from 13 to 31.
#
# THE ALTERNATIVE THAT KEEPS THE SUMMIT DISTINCT, measured and NOT taken because he has not seen it.
# The band is linear by construction; making it CONCAVE (KNEE + 6*x**g, g < 1) stretches the middle
# instead of clamping the top, so the tops can stay at their measured maxima. At g = 0.33 on OFF, MJ
# reads 98 and exactly ONE card prints 99 — Giannis '25, alone, as recal_90 left him. It costs five
# further anchors (Curry '16, Harden '19, Kawhi '17 off, Luka '23, Shaq '95). On DEF, g = 0.50 gives
# MJ 98 with 8 on 99 and costs one (Rodman '90). That is the trade the receipt puts in front of him:
# seventeen cards tied at the offensive summit, or five more of his own numbers moved.
KNEE, OFF_TOP, DEF_TOP = 93.0, 102.75, 104.25
# OVR's own band is GONE (recal_85, his ruling "Kill the band too"). It ran knee 93 with
# OVR_TOP re-derived to 97.10 by recal_84; both that constant and band_ovr() are now DEAD CODE and
# are removed rather than left to rot. `_tops` survives as a diagnostic only: it now records the
# pure blend, so the run still prints the top of the board and any future drift stays visible.
_tops = []
_otops = []   # measured OFF raws, so the band anchor can be re-derived after any weight change
# recal_90: DEF gets the same standing diagnostic OFF has had. recal_84 had to hand-audit the DEF
# anchor because nothing printed it, and this is the SECOND time a band anchor has drifted unseen,
# so the measurement is made permanent rather than repeated by hand. Same list, same print, same job.
_dtops = []   # measured DEF raws, for exactly the same reason
def band(raw, top):
    return raw if raw <= KNEE else KNEE + (raw - KNEE) * (99.0 - KNEE) / (top - KNEE)

for p in players:
    p['big'] = is_big(p)   # the app labels from this; is_big lives here and nowhere else
    # r34: 1.08 -> 0.93. Not a taste change — the new weight sum is ~15% larger, so the multiplier is
    # re-normalised to keep the scale where it was. Without it every top card saturates on the ceiling.
    _o = o_score(p) * 0.93
    _otops.append(_o)
    p['o_ovr'] = int(min(99, round(band(_o, OFF_TOP))))
    _d = d_score(p) * 1.1305
    _dtops.append(_d)
    p['d_ovr'] = int(min(99, round(band(_d, DEF_TOP))))   # recal_67: 1.10 was the inflation
    # OVR now includes the skill mix: BPM-based talent overpaid empty-calorie profiles
    # (assist collectors at bad efficiency read 83 while the engine punished them every possession)

    # THE CORE (recal_40, replacing r37's). Marginal value stays OUT of OVR — a card is a statement
    # about the man, and what he is worth NEXT TO FOUR OTHERS belongs to the team engine and the draft.
    # recal_83 (HIS RULING): "OVR = bigger of ((OFF*0.7 + DEF*0.3), (OFF*0.4 + DEF* 0.6))". The
    # branches cross exactly where o_ovr == d_ovr, so it reads "0.7*hi + 0.3*lo" when offence is the
    # stronger end and "0.6*hi + 0.4*lo" when defence is. Monotone in both inputs.
    #
    # recal_85 (HIS RULINGS, verbatim: "Kill breadth and the tax", then "Kill the band too").
    # THE BLEND IS NOW THE WHOLE OF OVR. Three shaping terms are gone, and each is named here rather
    # than deleted from the record:
    #   - THE EMPTY-VOLUME TAX (recal_37/r40 era): subtracted up to 5 for heavy load at poor
    #     efficiency. SUPERSEDED BY recal_85. It was the sole cause of every card printing BELOW its
    #     weaker end — 192 of them.
    #   - BREADTH + BREADTH FADE (recal_14, faded by recal_17): added up to +4 for a man who did five
    #     or six things well, fading to nothing at raw 93. SUPERSEDED BY recal_85. With the tax it
    #     accounted for the 142 cards printing ABOVE their better end, Embiid '26 among them.
    #   - THE TOP-BAND RESCALE for OVR (the r37-era mirror of the dial bands): stretched everything
    #     above a 93 knee onto 93-99 so the summit was reachable. SUPERSEDED BY recal_85 on his second
    #     ruling. Measured first: with the tax and breadth gone it was the ONLY remaining cause of a
    #     card printing above its better end, and it did so for exactly fourteen — LeBron '08-'13,
    #     Giannis '19-'23, Jordan '89/'90/'91. He was shown that list and ruled it out.
    # What survives is the blend, the offence cap below, and the 99 clamp. A card can therefore never
    # print above its higher end nor below its lower one, which is the point: OFF, DEF and OVR read
    # on one scale.
    # recal_104 (HIS RULING, verbatim: "Change OVR to raw = max(0.5 * o_ovr + 0.5 * d_ovr,
    # 0.70 * o_ovr + 0.30 * d_ovr)"). THE DEFENCE-LED READING IS AN EVEN SPLIT.
    #
    # recal_83's shape is untouched and is quoted here beside the new weight, because the two are
    # his and they are one sentence apart. recal_83, verbatim: "OVR = bigger of ((OFF*0.7 + DEF*0.3),
    # (OFF*0.4 + DEF* 0.6))". recal_104 keeps "the bigger of two role readings" and changes what the
    # DEFENCE-led one weighs: 0.4/0.6 becomes 0.5/0.5. The offence-led reading, the cap and the 99
    # clamp are all exactly as they were.
    #
    # WHAT IT DOES, arithmetically and therefore without exception. The two branches still cross where
    # o_ovr == d_ovr, so which reading wins is unchanged for every card. Above the crossing nothing
    # moves at all. Below it - every card whose DEFENCE is the stronger end - the reading falls by
    # exactly 0.1 x (d_ovr - o_ovr), so the change can only ever LOWER a card and it lowers it in
    # proportion to how one-sided he is. The largest drops on the board are therefore the men with the
    # widest gap: Ben Wallace '07 (o 21, d 98) -7.7, Caldwell Jones '80 and Ben Wallace '08 -7.6.
    # OFF, DEF and every attribute are untouched by construction - this line is the whole round.
    raw = max(0.5 * p['o_ovr'] + 0.5 * p['d_ovr'], 0.70 * p['o_ovr'] + 0.30 * p['d_ovr'])
    # recal 3: offense gates the ceiling (a defense-first perimeter player stops one man), but elite
    # defense keeps a floor; an elite anchor is a defensive SYSTEM, so bigs are effectively exempt.
    # It can only ever pull OVR DOWN toward the offence, never below the weaker end (cap >= o+10).
    #
    # recal_93 (HIS RULING, verbatim: "Kawhi 14 agree"). THE ELITE-DEFENCE FLOOR, 0.80 -> 0.85.
    # THE DEFECT: this cap, not the blend, was deciding OVR on 813 perimeter cards, and for the best
    # perimeter defenders on the board it was clipping the blend by SEVEN — Kawhi Leonard '14
    # (o 65, d 95) blends to 83 and printed 76; Paul George '13, Metta World Peace '07, Jason Kidd
    # '01 and Ben Simmons '20 were clipped by the same 7. recal_83/85 left OVR as nothing but the
    # bigger of the two role blends, and a shaping term that overrides the blend by seven points on
    # the very cards the blend exists to describe is no longer a gate, it is a second formula.
    # WHICH HALF WAS BINDING, measured rather than guessed: for Kawhi '14 the binding term is NOT
    # `o_ovr + 10` (75) but the elite-defence FLOOR, 0.80 x 95 = 76. So the round loosens exactly
    # the half that decided him, and nothing else: an ELITE defender's floor rises with how elite he
    # is, while a card whose defence is ordinary is governed by `o_ovr + 10` and does not move at all.
    # recal 3's intent is intact and is still doing work: 0.85 x 95 = 80.75 still pulls Kawhi '14
    # DOWN from his 83 blend, and the cap still binds on 532 cards after the change.
    # REJECTED, both measured on the whole pool and both able to hit the number: widening the gap to
    # `o_ovr + 15` (613 cards move, max +5) and a defence-proportional gap `o_ovr + 10 + 0.17*(d-o)`
    # (584, max +4). Each reaches Kawhi '14 = 80 with no anchor broken, but each rewrites the half of
    # recal 3 that was NOT the cause — the offence gate — for every perimeter card on the board.
    # MEASURED: 606 cards move on OVR, every one of them UP (a cap can only ever be loosened), max
    # +5; DEF and OFF move on zero; no card enters, leaves or reorders the top 50 by OVR.
    # recal_99 (HIS RULING, verbatim: "Agree with 1-7"). THE BIG BRANCH IS THE UNTOUCHED SIBLING.
    # recal_93 loosened the perimeter branch's ELITE-DEFENCE FLOOR from 0.80 to 0.85 x d_ovr because
    # it was clipping Kawhi Leonard '14's blend by seven. The big branch never had that floor at all
    # - it is the flat `o_ovr + 40` - so a big whose offence is genuinely nil is capped by his
    # offence with nothing to catch him: Ben Wallace '07 (o 21, d 97) blends to 66.6 and printed 61,
    # '08 blends to 63.6 and printed 58, Caldwell Jones '80 blends to 64.6 and printed 59. The same
    # defect, on the branch r93 did not touch.
    # The two branches now read the same shape - an offence gate, and the same elite-defence floor
    # underneath it - and differ only in the gate, which is r3's own distinction ("an elite anchor is
    # a defensive SYSTEM, so bigs are effectively exempt"). MEASURED: 33 cards move on OVR, every one
    # of them UP, max +6, and no anchor moves at all.
    cap = max(p['o_ovr'] + (40 if is_big(p) else 10), 0.85 * p['d_ovr'])
    _tops.append(raw)
    p['ovr'] = int(min(99, cap, round(raw)))
    # the marginal survives as a CARD FIELD so the draft and team screens can still read it; it simply
    # no longer moves OVR. Kept on the 1-99 scale it was already expressed in.
    p['marg'] = int(round(p['_marg']))
    del p['_raw']; del p['_marg']

# ---------------------------------------------------------------- CARD MODES (read-only, then exit)
def _resolve_card(nm):
    """Season is the unit and names carry the year, so an exact match wins. A name with NO year is
    the peak card: highest talent, then highest ovr — the same rule data/anchors.py uses."""
    for q in players:
        if q['name'] == nm: return q
    same = [q for q in players if q.get('player') == nm] or [q for q in players if q['name'].startswith(nm + " '")]
    return sorted(same, key=lambda q: (q.get('talent', 0), q.get('ovr', 0)))[-1] if same else None

def _ranks(q, field):
    v = q[field]
    cls = [x for x in players if x['big'] == q['big']]
    return (1 + sum(1 for x in players if x[field] > v), len(players),
            1 + sum(1 for x in cls if x[field] > v), len(cls))

if _CARD:
    try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
    _q = _resolve_card(_CARD)
    if _q is None:
        print(f"no card matches {_CARD!r} (names carry the year, e.g. \"Shaquille O'Neal '00\"; a bare "
              f"name resolves to the peak season)")
        raise SystemExit(2)
    _a = _q['attrs']
    _attrs = ' '.join(f"{k} {_a[k]}" for k in sorted(_a))
    if _READ:
        print(f"{_q['name']}  OVR {_q['ovr']}  OFF {_q['o_ovr']}  DEF {_q['d_ovr']}  |  {_attrs}")
        raise SystemExit(0)
    # ---- --explain: the whole derivation, in the order the pipeline computes it ----
    _ot, _dt = {}, {}
    _oraw = o_score(_q, _ot) * 0.93
    _draw = d_score(_q, _dt) * 1.1305
    W = 78
    print('=' * W)
    print(f"{_q['name']}   OVR {_q['ovr']}   OFF {_q['o_ovr']}   DEF {_q['d_ovr']}"
          f"   [{'big' if _q['big'] else 'perimeter'}]   pipeline v{PIPELINE_VERSION}")
    print('=' * W)
    print('ATTRIBUTES')
    _ks = sorted(_a)
    for _i2 in range(0, len(_ks), 4):
        print('  ' + '  '.join(f"{k:>16s} {_a[k]!s:>8s}" for k in _ks[_i2:_i2 + 4]))
    print(f"  {'talent':>16s} {_q.get('talent')!s:>8s}")
    print('  marg is not computed in card mode (the 10,000-card sweep is skipped) and recal_40 took it out of OVR anyway')

    def _table(title, terms):
        print(f"\n{title}")
        print(f"  {'term':<22s}{'attr value':>12s}{'weight':>10s}{'contribution':>16s}")
        for nm2, val, w, c in terms:
            print(f"  {nm2:<22s}{val:>12.2f}{w:>10.2f}{c:>16.3f}")
        print(f"  {'':<22s}{'':>12s}{'sum':>10s}{sum(c for _, _, _, c in terms):>16.3f}")

    _table('O_SCORE — the standard weighted path', _ot['terms'])
    _b = _ot.get('bonus')
    if _b:
        print(f"\nZONE-DOMINANCE BONUS ({_b['kind']}) — the shape gate FIRED"
              + ('' if _b['shape_f'] >= 1.0 else f" IN PART (recal_137's ramp: share {_b['shape_f']:.4f})"))
        print(f"  zones sorted {_ot['zones']['z']}  (rim {_ot['zones']['rim']} / mid {_ot['zones']['mid']} / 3pt {_ot['zones']['three']})")
        print(f"  bars (recal_137, width {_b['width']:.1f} of z[0] beneath each): flat "
              f"{_b['bar_a'] if _b['bar_a'] is not None else 'n/a (zone does not tower)'}"
              f" · 1.5 x (z[1]+z[2]) = {_b['bar_b']:.1f}  -> shape_f {_b['shape_f']:.4f}")
        print(f"  base {_b['base']:.2f}  x  zone_f {_b['zone_f']:.4f}  x  att_f {_b['att_f']:.4f}  x  gate_f {_b['gate_f']:.4f}"
              f"  x  shape_f {_b['shape_f']:.4f}  =  +{_b['added']:.3f}")
        print(f"  inputs: paint attempts/100 {_b['paint_att_per100']:.2f} · three attempts/100 {_b['three_att_per100']:.2f}"
              f" · rim_mid_measured {_b['rim_mid_measured']}")
    else:
        print('\nZONE-DOMINANCE BONUS — did NOT fire (no single weapon towering over the rest of the diet,'
              '\n  or the weapon is a midrange one, which recal_38 ruled is not the same threat)')
    _l = _ot.get('load')
    if _l:
        print(f"LOAD SHARE (recal_96) - {_l['mpg']} mpg against the {_l['full']:.0f}-minute full-load "
              f"line (foot {_l['foot']:.0f}): share {_l['share']:.4f}")
        print(f"  volume {_l['volume_raw']} paid as {_l['volume_paid']:.2f} - "
              f"playvol {_l['playvol_raw']} paid as {_l['playvol_paid']:.2f} - every SKILL rate untouched")
    if 'interior' in _ot:
        _i2 = _ot['interior']
        print(f"EFFICIENT INTERIOR SCORER (recal_112) - gate {_i2['gate']:.2f}: "
              f"+{_i2['added']:.3f}")
    if 'passer' in _ot:
        _p2 = _ot['passer']
        print(f"ELITE PASSER (recal_109) - gate {_p2['gate']:.2f} x eff factor "
              f"{_p2['eff_factor']:.2f} x load {_p2['load']:.3f} (recal_130: "
              f"{_p2['mpg'] if _p2['mpg'] is not None else 'no'} mpg against the class's own 34.7-minute "
              f"full-creation line): +{_p2['added']:.3f}")
    if 'two_level' in _ot:
        _t2 = _ot['two_level']
        print(f"TWO-LEVEL BIG (recal_107) - mid gate {_t2['gm']:.2f} x eff gate {_t2['ge']:.2f}, "
              f"second zone {_t2['z1']} paid at the first zone's rate: +{_t2['added']:.3f}")
    if 'turnover_charge' in _ot:
        _t3 = _ot['turnover_charge']
        print(f"HANDLER'S TURNOVER CHARGE (recal_121) - handling load {_t3['handling']:.1f} "
              f"(gate {_t3['h']:.2f}) x efficiency gate {_t3['e']:.2f} x ball-security gate "
              f"{_t3['b']:.2f} = {_t3['gate']:.3f}: -{_t3['taken']:.3f}")
    if 'big_hub' in _ot:
        _hr = _ot['hub_role']
        print(f"HUB (recal_55's channel, recal_98's ramp playvol 60->80, recal_138's ROLE class) - "
              f"{'big (role 1.00 by recal_55s own class)' if _hr['big'] else f'''perimeter: creation surplus playvol-volume {_hr['surplus']:+d} over the hub's own 20-point width, volume floor {_hr['v_floor']:.0f} -> role {_hr['role']:.4f}'''}")
        print(f"  hub load {_hr['hubload']:.2f} x K {_hr['k']:.2f} (the load weight 0.26 minus the "
              f"creation weight 0.19): +{_ot['big_hub']:.3f}; the same load also floors the signature term")
    if 'offball_floor' in _ot:
        _f = _ot['offball_floor']
        print(f"OFF-BALL FLOOR — {_f['branch']} branch: {_f['value']:.3f} — {'BINDING' if _f['binding'] else 'not binding'}")
    if 'paint_floor' in _ot:
        _pf = _ot['paint_floor']
        print(f"PAINT-EVIDENCE FLOOR (recal_131) - share {_pf['share']:.2f} (volume 55->80 x efficiency "
              f"45->65); evidence {_pf['evidence']:.2f} (half the free-throw term, half the offensive "
              f"glass) x 0.30 = {0.30 * _pf['evidence']:.2f} against zone block {_pf['block']:.2f}: "
              f"+{_pf['added']:.3f}")
    print(f"\n  o_score {_ot['o_score']:.4f}  x 0.93 display multiplier  =  raw {_oraw:.4f}")
    _table(f"D_SCORE — the {_dt['branch']} branch (effective weights; recal_93 blends the two vectors)", _dt['terms'])
    print(f"  big vector {_dt['big_vector']:.4f}   perimeter vector {_dt['perim_vector']:.4f}"
          f" (base {_dt['base']:.4f} x size {_dt['size_mod']:.4f}, height {_a.get('height', 76)})")
    print(f"  d_bigness {_dt['bigness']:.4f}  ->  {_dt['bigness']:.4f} x big + {1-_dt['bigness']:.4f} x perimeter"
          f"  =  {_dt['d_score']:.4f}")
    print(f"  d_score {_dt['d_score']:.4f}  x 1.1305 display multiplier  =  raw {_draw:.4f}")

    print(f"\nBAND POSITION (knee {KNEE}, OFF_TOP {OFF_TOP}, DEF_TOP {DEF_TOP})")
    for _lbl, _raw2, _top, _fin in (('OFF', _oraw, OFF_TOP, _q['o_ovr']), ('DEF', _draw, DEF_TOP, _q['d_ovr'])):
        _side = 'ABOVE the knee — stretched onto 93-99' if _raw2 > KNEE else 'below the knee — band() is the identity'
        print(f"  {_lbl}: raw {_raw2:7.4f}  {_side}")
        print(f"       band -> {band(_raw2, _top):7.4f}   clamp 99 -> {_fin}"
              + (f"   ({_raw2 - _top:+.4f} vs the anchor)" if _raw2 > KNEE else ''))

    _b1, _b2 = 0.5*_q['o_ovr'] + 0.5*_q['d_ovr'], 0.70*_q['o_ovr'] + 0.30*_q['d_ovr']
    _cap = max(_q['o_ovr'] + 10, 0.85 * _q['d_ovr']) if not _q['big'] else _q['o_ovr'] + 40
    print(f"\nOVR BLEND (recal_83, the bigger of two role readings; recal_85 left nothing else in)")
    print(f"  defence-led  0.50 x OFF {_q['o_ovr']} + 0.50 x DEF {_q['d_ovr']} = {_b1:.2f}")
    print(f"  offence-led  0.70 x OFF {_q['o_ovr']} + 0.30 x DEF {_q['d_ovr']} = {_b2:.2f}")
    print(f"  winner: {'defence-led' if _b1 >= _b2 else 'offence-led'} = {max(_b1, _b2):.2f}")
    print(f"  offence cap ({'big: o_ovr + 40' if _q['big'] else 'max(o_ovr + 10, 0.85 x d_ovr)'}) = {_cap:.2f}")
    print(f"  OVR = min(99, cap, round(raw)) = {_q['ovr']}")

    print('\nRANKS')
    _cls = 'bigs' if _q['big'] else 'perimeter'
    for _lbl, _f2 in (('OFF', 'o_ovr'), ('DEF', 'd_ovr'), ('OVR', 'ovr')):
        _ra, _na, _rc, _nc = _ranks(_q, _f2)
        print(f"  {_lbl}  #{_ra:,} of {_na:,} all cards   ·   #{_rc:,} of {_nc:,} among {_cls}")
    print('=' * W)
    raise SystemExit(0)
# ------------------------------------------------------------------- end card modes; normal path on

json.dump(players, io.open(path, 'w', encoding='utf-8'), separators=(',', ':'))
print(f"pipeline version {PIPELINE_VERSION}")
print(f"OVR blend top {max(_tops):.2f} — no band, no anchor: OVR is the blend, capped and clamped (recal_85)")
print(f"OFF raw top {max(_otops):.2f} (band anchor {OFF_TOP}) — {sum(1 for t in _otops if t > OFF_TOP)} cards above the anchor")
print(f"DEF raw top {max(_dtops):.2f} (band anchor {DEF_TOP}) — {sum(1 for t in _dtops if t > DEF_TOP)} cards above the anchor")

# VERDICT 1: the smoothed export IS the shared verification base. Written once per regeneration so the
# design side calibrates against the same cards the app ships, ending the permanent single-season offset.
_exp = _os.path.join(_os.path.dirname(_os.path.abspath(path)), 'export')
_os.makedirs(_exp, exist_ok=True)
json.dump(players, io.open(_os.path.join(_exp, 'players_stats_smoothed.json'), 'w', encoding='utf-8'), separators=(',', ':'))
json.dump(dict(pipeline_version=PIPELINE_VERSION, cards=len(players), smoothing='20/60/20 season blend, applied (75/25 at career edges; reaches yr+2 across an injury gap)',
               note='This is the app-side smoothed export. Calibration targets are quoted against THESE cards '
                    'as named player-seasons (protocol v2), never as hypothetical shapes.'),
          io.open(_os.path.join(_exp, 'MANIFEST.json'), 'w', encoding='utf-8'), indent=1)
# the app reads its version from the data, not from a constant that can drift
json.dump(dict(version=PIPELINE_VERSION, cards=len(players)),
          io.open(_os.path.join(_os.path.dirname(_os.path.abspath(path)), '..', 'src', 'data', 'pipeline.json'), 'w', encoding='utf-8'), indent=1)
print(f"smoothed export written: {_os.path.join(_exp, 'players_stats_smoothed.json')}")

rank = sorted(players, key=lambda x: -x['ovr'])
print("TOP 12 BY OVR:")
for p in rank[:12]: print(f"  {p['name']:28s} OVR {p['ovr']}  (O {p['o_ovr']} D {p['d_ovr']})")
print("\nARCHETYPE CHECKS:")
for nm in ["Dennis Rodman '92", "Trae Young '22", "Steve Kerr '96", "Shane Battier '06", "Dereck Lively II '24", "Rudy Gobert '19", "Draymond Green '16", "Carmelo Anthony '14", "Stephen Curry '16", "LeBron James '13", "Michael Jordan '88", "Kareem Abdul-Jabbar '80"]:
    m = [p for p in players if p['name'] == nm]
    if m: p = m[0]; print(f"  {p['name']:28s} OVR {p['ovr']}  O {p['o_ovr']}  D {p['d_ovr']}  paint {p['attrs']['rim']} mid {p['attrs']['mid']}")

# THE STANDING PINS, printed on every regeneration. recal_90 re-derived OFF_TOP and Shaq '00 fell
# 99 -> 97 while four earlier receipts still carried him at 99 — and nothing said so until someone
# went looking. data/anchors.json holds the rulings that are still meant to hold; anchors.py grades
# them against the cards this run just produced. It is a REPORT, never a gate on the write: the file
# is already on disk above, and a failing pin is a fact for the round to answer, not a crash.
print()
try:
    sys.dont_write_bytecode = True   # no data/__pycache__ left in the tree by a regeneration
    import anchors as _anchors
    print(_anchors.report(_anchors.grade(players)))
except Exception as _e:
    print(f"ANCHORS: not graded ({type(_e).__name__}: {_e})")
