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
PIPELINE_VERSION = 98

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
_POS = {k: (v or {}).get('pos') or [] for k, v in json.load(io.open(_stats_path, encoding='utf-8')).items()}
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
def d_bigness(p):
    """How much of the BIG d_score mix this card is graded by, in [0, 1]. 0 = the whole perimeter
    verdict, 1 = the whole big verdict. The position branches and the first/third shape clauses are
    is_big's, byte for byte; only the middle clause is a ramp."""
    pos = _POS.get(p['name'], [])
    if pos and ('PG' in pos or 'SG' in pos) and not ('C' in pos or 'PF' in pos): return 0.0
    if pos and ('C' in pos or 'PF' in pos) and not ('PG' in pos or 'SG' in pos): return 1.0
    a = p['attrs']
    if a['rimprot'] >= 80: return 1.0
    if a['rimprot'] >= 55 and a['3pt'] < 45 and a['rimprot'] >= a['perdef']: return 1.0
    w_rp = min(1.0, max(0.0, (a['rimprot'] - DEF_RP_LO) / (DEF_RP_HI - DEF_RP_LO)))
    w_3p = min(1.0, max(0.0, (DEF_3P_HI - a['3pt']) / (DEF_3P_HI - DEF_3P_LO)))
    return w_rp * w_3p

# offensive / defensive sub-ratings: SKILL composites from the attribute sheet
# (marginal-in-average-team measures fit value, not end-skill - wrong tool for display)
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
    std = (0.22*z[0] + 0.08*z[1] + 0.05*z[2] + 0.11*a['efficiency'] + 0.26*a['volume'] + 0.19*a['playvol']
        + 0.10*a['ballsec'] + 0.11*(a['fouldraw']*a['ft']/100) + 0.06*a['orb']
        # the volume x efficiency SIGNATURE keeps its volume FLOOR of 50 (recal_26): elite conversion on
        # a modest load is real scoring signal, not an accident of touches.
        + 0.08*(max(a['volume'],50)*a['efficiency']/100))
    if trace is not None:
        trace['terms'] = [
            ('z[0] best zone',      z[0],                             0.22, 0.22*z[0]),
            ('z[1] second zone',    z[1],                             0.08, 0.08*z[1]),
            ('z[2] third zone',     z[2],                             0.05, 0.05*z[2]),
            ('efficiency',          a['efficiency'],                  0.11, 0.11*a['efficiency']),
            ('volume',              a['volume'],                      0.26, 0.26*a['volume']),
            ('playvol',             a['playvol'],                     0.19, 0.19*a['playvol']),
            ('ballsec',             a['ballsec'],                     0.10, 0.10*a['ballsec']),
            ('fouldraw x ft/100',   a['fouldraw']*a['ft']/100,        0.11, 0.11*(a['fouldraw']*a['ft']/100)),
            ('orb',                 a['orb'],                         0.06, 0.06*a['orb']),
            ('signature vol x eff', max(a['volume'],50)*a['efficiency']/100, 0.08, 0.08*(max(a['volume'],50)*a['efficiency']/100)),
        ]
        trace['std_base'] = std
        trace['zones'] = dict(z=z, rim=a['rim'], mid=a['mid'], three=a['3pt'])
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
    if max(a['3pt'], a['rim']) >= a['mid'] and ((z[0] > z[1] + z[2] and z[0] >= 91) or (z[0] > 1.5 * (z[1] + z[2]))):
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
        std += base * zone_f * att_f * gate_f
        if trace is not None:
            trace['bonus'] = dict(
                kind='paint' if a['rim'] >= max(a['3pt'], a['mid']) else 'shooter',
                base=base, zone_f=zone_f, att_f=att_f, gate_f=gate_f,
                paint_att_per100=_two, three_att_per100=_three,
                rim_mid_measured=bool(a.get('rim_mid_measured')),
                added=base * zone_f * att_f * gate_f)
    elif trace is not None:
        trace['bonus'] = None   # the shape gate did not fire: no weapon towering over the diet
    # recal_55: THE BIG HUB. An efficient playmaking center had no channel - his assists scored
    # through playvol's 0.17 like everyone's, and nothing priced the offense that RUNS THROUGH him.
    # Bigs only, playvol 60 and up; the Jokic class is saturated at the band top anyway, and guards
    # are untouched by construction.
    if is_big(p) and a['playvol'] >= 60:
        std += 0.05 * a['playvol']
        if trace is not None: trace['big_hub'] = 0.05 * a['playvol']
    # r34's deletion of the three gated bonuses stands; r37's dominance bonus is the one deliberate
    # exception, and it is a claim about SHAPE rather than a top-up for clearing a threshold.
    # recal_64 (design-side "62", the OKC problem): THE OFF-BALL FLOOR. The Dort/Wallace class had
    # no channel below the 80-3pt specialist gate — low-usage shooters now get paid for the job
    # they actually do: spacing, converting, not turning it over, not fouling. Volume scorers are
    # untouched by construction (their standard path is higher than the floor).
    if a['3pt'] >= 68 and a['volume'] < 55:
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
            _fl += 0.17*(a['orb'] + a['rim']) + 0.10*a['volume']
        std = max(std, _fl)
        if trace is not None:
            trace['offball_floor'] = dict(value=_fl, binding=std == _fl,
                                          branch='stretch big (recal_91)' if is_big(p) else 'wing (recal_64)')
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
    _big = 0.40*a['perdef'] + 0.40*a['rimprot'] + 0.17*a['drb'] + 0.03*a['discipline']
    # recal_57 trimmed perimdisrupt 0.15 -> 0.09; recal_62 (his ruling) trims it again 0.09 -> 0.05.
    # Steals are a gamble, not a lockdown — perdef takes all the slack (it IS the complete verdict).
    # recal_80 (design-side round, HIS RULING "Ship 80"): rim protection counted ZERO on the
    # perimeter branch, so a wing who genuinely contests at the rim got nothing for it. New vector,
    # sums to 1.00. NOTE the raise to perimdisrupt is 0.05 -> 0.11 on OUR real vector (the round
    # quotes 0.09 -> 0.11), a 2.2x raise that SUPERSEDES recal_62 — see the annotation in receipt 80.
    base = 0.63*a['perdef'] + 0.13*a['rimprot'] + 0.11*a['perimdisrupt'] + 0.07*a['drb'] + 0.06*a['discipline']
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
        trace['terms'] = [('perdef', a['perdef'], 0.40*w + 0.63*(1-w)*_size, (0.40*w + 0.63*(1-w)*_size)*a['perdef']),
                          ('rimprot', a['rimprot'], 0.40*w + 0.13*(1-w)*_size, (0.40*w + 0.13*(1-w)*_size)*a['rimprot']),
                          ('perimdisrupt', a['perimdisrupt'], 0.11*(1-w)*_size, 0.11*(1-w)*_size*a['perimdisrupt']),
                          ('drb', a['drb'], 0.17*w + 0.07*(1-w)*_size, (0.17*w + 0.07*(1-w)*_size)*a['drb']),
                          ('discipline', a['discipline'], 0.03*w + 0.06*(1-w)*_size, (0.03*w + 0.06*(1-w)*_size)*a['discipline'])]
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
KNEE, OFF_TOP, DEF_TOP = 93.0, 110.64, 107.55
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
    raw = max(0.4 * p['o_ovr'] + 0.6 * p['d_ovr'], 0.70 * p['o_ovr'] + 0.30 * p['d_ovr'])
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
    cap = max(p['o_ovr'] + 10, 0.85 * p['d_ovr']) if not is_big(p) else p['o_ovr'] + 40
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
        print(f"\nZONE-DOMINANCE BONUS ({_b['kind']}) — the shape gate FIRED")
        print(f"  zones sorted {_ot['zones']['z']}  (rim {_ot['zones']['rim']} / mid {_ot['zones']['mid']} / 3pt {_ot['zones']['three']})")
        print(f"  base {_b['base']:.2f}  x  zone_f {_b['zone_f']:.4f}  x  att_f {_b['att_f']:.4f}  x  gate_f {_b['gate_f']:.4f}"
              f"  =  +{_b['added']:.3f}")
        print(f"  inputs: paint attempts/100 {_b['paint_att_per100']:.2f} · three attempts/100 {_b['three_att_per100']:.2f}"
              f" · rim_mid_measured {_b['rim_mid_measured']}")
    else:
        print('\nZONE-DOMINANCE BONUS — did NOT fire (no single weapon towering over the rest of the diet,'
              '\n  or the weapon is a midrange one, which recal_38 ruled is not the same threat)')
    if 'big_hub' in _ot:
        print(f"BIG HUB (recal_55, bigs at playvol >= 60): +{_ot['big_hub']:.3f}")
    if 'offball_floor' in _ot:
        _f = _ot['offball_floor']
        print(f"OFF-BALL FLOOR — {_f['branch']} branch: {_f['value']:.3f} — {'BINDING' if _f['binding'] else 'not binding'}")
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

    _b1, _b2 = 0.4*_q['o_ovr'] + 0.6*_q['d_ovr'], 0.70*_q['o_ovr'] + 0.30*_q['d_ovr']
    _cap = max(_q['o_ovr'] + 10, 0.85 * _q['d_ovr']) if not _q['big'] else _q['o_ovr'] + 40
    print(f"\nOVR BLEND (recal_83, the bigger of two role readings; recal_85 left nothing else in)")
    print(f"  defence-led  0.40 x OFF {_q['o_ovr']} + 0.60 x DEF {_q['d_ovr']} = {_b1:.2f}")
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
