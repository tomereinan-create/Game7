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
PIPELINE_VERSION = 71

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

path = sys.argv[1] if len(sys.argv) > 1 else 'players_stats.json'
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
    print(f"attempt rates loaded for {len(_ATT):,} cards")
except Exception as _e:
    print(f"WARNING: no attempt rates ({_e}) — the specialist bonus falls back to its floor")
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

# offensive / defensive sub-ratings: SKILL composites from the attribute sheet
# (marginal-in-average-team measures fit value, not end-skill - wrong tool for display)
def o_score(p):
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
    std = (0.25*z[0] + 0.09*z[1] + 0.06*z[2] + 0.10*a['efficiency'] + 0.24*a['volume'] + 0.17*a['playvol']
        + 0.10*a['ballsec'] + 0.11*(a['fouldraw']*a['ft']/100) + 0.06*a['orb']
        # the volume x efficiency SIGNATURE keeps its volume FLOOR of 50 (recal_26): elite conversion on
        # a modest load is real scoring signal, not an accident of touches.
        + 0.08*(max(a['volume'],50)*a['efficiency']/100))
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
    # recal_55: THE BIG HUB. An efficient playmaking center had no channel - his assists scored
    # through playvol's 0.17 like everyone's, and nothing priced the offense that RUNS THROUGH him.
    # Bigs only, playvol 60 and up; the Jokic class is saturated at the band top anyway, and guards
    # are untouched by construction.
    if is_big(p) and a['playvol'] >= 60:
        std += 0.05 * a['playvol']
    # r34's deletion of the three gated bonuses stands; r37's dominance bonus is the one deliberate
    # exception, and it is a claim about SHAPE rather than a top-up for clearing a threshold.
    # recal_64 (design-side "62", the OKC problem): THE OFF-BALL FLOOR. The Dort/Wallace class had
    # no channel below the 80-3pt specialist gate — low-usage shooters now get paid for the job
    # they actually do: spacing, converting, not turning it over, not fouling. Volume scorers are
    # untouched by construction (their standard path is higher than the floor).
    if a['3pt'] >= 68 and a['volume'] < 55:
        std = max(std, 0.38*a['3pt'] + 0.20*a['efficiency'] + 0.08*a['ballsec'] + 0.06*a['discipline'])
    return std
def d_score(p):
    # class-dependent: bigs' defensive votes route to rimprot by design, so perdef understates them;
    # perimeter keeps the round-1 perdef-heavy mix (perdef IS the complete defensive verdict)
    a = p['attrs']
    if is_big(p):
        return 0.40*a['perdef'] + 0.40*a['rimprot'] + 0.17*a['drb'] + 0.03*a['discipline']   # drb weight up: rebounding credit now lives here, not inside rimprot
    # recal_57 trimmed perimdisrupt 0.15 -> 0.09; recal_62 (his ruling) trims it again 0.09 -> 0.05.
    # Steals are a gamble, not a lockdown — perdef takes all the slack (it IS the complete verdict).
    base = 0.79*a['perdef'] + 0.05*a['perimdisrupt'] + 0.09*a['drb'] + 0.07*a['discipline']
    # size modifier: a 6'0 defender guards one matchup; tall stoppers switch. Guard-quota All-D
    # selections are real evidence, but size caps the ceiling. Bites only truly small defenders.
    return base * min(1.0, 0.94 + 0.06*(a.get('height', 76) - 71)/7)
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
KNEE, OFF_TOP, DEF_TOP = 93.0, 106.36, 98.67
# OVR's own band: knee 93, top set to the highest raw the blend actually produces so the best card
# lands ON 99. The run prints the measured top, so drift away from the anchor is visible immediately.
OVR_KNEE, OVR_TOP = 93.0, 96.50
def band_ovr(raw):
    return raw if raw <= OVR_KNEE else OVR_KNEE + (raw - OVR_KNEE) * (99.0 - OVR_KNEE) / (OVR_TOP - OVR_KNEE)
_tops = []
_otops = []   # measured OFF raws, so the band anchor can be re-derived after any weight change
def band(raw, top):
    return raw if raw <= KNEE else KNEE + (raw - KNEE) * (99.0 - KNEE) / (top - KNEE)

for p in players:
    p['big'] = is_big(p)   # the app labels from this; is_big lives here and nowhere else
    # r34: 1.08 -> 0.93. Not a taste change — the new weight sum is ~15% larger, so the multiplier is
    # re-normalised to keep the scale where it was. Without it every top card saturates on the ceiling.
    _o = o_score(p) * 0.93
    _otops.append(_o)
    p['o_ovr'] = int(min(99, round(band(_o, OFF_TOP))))
    p['d_ovr'] = int(min(99, round(band(d_score(p) * 1.03, DEF_TOP))))   # recal_67: 1.10 was the inflation
    # OVR now includes the skill mix: BPM-based talent overpaid empty-calorie profiles
    # (assist collectors at bad efficiency read 83 while the engine punished them every possession)

    a = p['attrs']
    # THE CORE (recal_40, replacing r37's). Marginal value stays OUT of OVR — a card is a statement
    # about the man, and what he is worth NEXT TO FOUR OTHERS belongs to the team engine and the draft.
    # What is left is TWO READINGS of the same player, and he is given the better of them: the league
    # values a defensive anchor and a lead scorer differently, so each is read on the scale that suits
    # him and the higher answer stands. 40/60 is the defence-led reading, 75/25 the offence-led one.
    raw = max(0.4 * p['o_ovr'] + 0.6 * p['d_ovr'], 0.75 * p['o_ovr'] + 0.25 * p['d_ovr'])
    # EMPTY-VOLUME TAX: the negative side of the usage x efficiency signature - extreme load at
    # mediocre efficiency costs OVR (capped at 5)
    raw -= min(5.0, 0.06 * max(0, a['volume'] - 72) * max(0, 58 - a['efficiency']))   # threshold 72: real load, not just max load
    # BREADTH (recal_14): a man who does five or six things well is worth more than the sum of his
    # best two. Seven groups, one entry each so nothing is double-counted, with an escalator at six.
    groups = [max(a['3pt'], a['rim'], a['mid']), a['playvol'], max(a['perdef'], a['rimprot']),
              max(a['orb'], a['drb']), a['ballsec'], a['discipline'], a['fouldraw']]
    solid = sum(1 for g in groups if g >= 65)
    breadth = 4.0 if solid >= 6 else (2.0 if solid >= 5 else 0.0)
    # BREADTH FADE (recal_17): completeness lifts role players and stars, and stops mattering at the
    # summit — the 99 tier is for men who were the best at something, not the most well-rounded.
    # Full value below raw 90, nothing from 93 up.
    raw += breadth * max(0.0, min(1.0, (93 - raw) / 3))
    # recal 3: offense gates the ceiling (a defense-first perimeter player stops one man), but elite
    # defense keeps a floor; an elite anchor is a defensive SYSTEM, so bigs are effectively exempt
    cap = max(p['o_ovr'] + 10, 0.80 * p['d_ovr']) if not is_big(p) else p['o_ovr'] + 40
    # TOP-BAND RESCALE for OVR, the mirror of the one on the dials. There the raw ran PAST the ceiling
    # and the clamp ate the separation; here it stopped SHORT of it — even Jordan '91 landed at 96.6, so
    # the top of the scale was unreachable. Below the knee nothing changes; above it the observed range
    # is stretched onto 93-99, so the summit is occupied and the elite tier spreads out beneath it.
    _tops.append(raw)
    p['ovr'] = int(min(99, cap, round(band_ovr(raw))))
    # the marginal survives as a CARD FIELD so the draft and team screens can still read it; it simply
    # no longer moves OVR. Kept on the 1-99 scale it was already expressed in.
    p['marg'] = int(round(p['_marg']))
    del p['_raw']; del p['_marg']
json.dump(players, io.open(path, 'w', encoding='utf-8'), separators=(',', ':'))
print(f"pipeline version {PIPELINE_VERSION}")
print(f"OVR raw top {max(_tops):.2f} (band anchor {OVR_TOP}) — {sum(1 for t in _tops if t > OVR_TOP)} cards above the anchor")
print(f"OFF raw top {max(_otops):.2f} (band anchor {OFF_TOP}) — {sum(1 for t in _otops if t > OFF_TOP)} cards above the anchor")

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
