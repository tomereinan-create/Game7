"""
game7 ratings pipeline: Basketball-Reference stats -> {name, talent, in, out, id, pd, raw}
Philosophy:
  - PEAK season per player (best BPM with minutes floor), because game7 drafts peak versions.
  - in / id / pd  = percentile WITHIN season (vs that year's league, min-minutes players)
  - out           = percentile vs a MODERN REFERENCE POOL (2011-2025), i.e. absolute shooting scale.
                    Pre-3PT-line players get a capped FT%-based touch prior.
  - talent        = within-season percentile of BPM (dominance over your own league), stretched.
All weights live in WEIGHTS below - tune freely.
"""
import csv, json, math, os as _os
from collections import defaultdict

import sys
# The Basketball-Reference CSVs live in the repo (data/bref) so the pipeline runs anywhere — a fresh
# clone, another machine, a cloud session — without hunting for a scratch folder. An explicit path
# still wins if one is given.
DATA = sys.argv[1] if len(sys.argv) > 1 else _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'bref')
MIN_MP = 1200          # minutes floor for a season to count
MIN_SEASON = 1980      # stats-only doctrine: every axis measured, no priors (3PT line exists from 1980)
MODERN = (2011, 2025)  # reference pool for absolute OUT scale
PIPELINE_VERSION = 176
# recal_92 (HIS RULING, verbatim: "Way too high per def"). THE TRACKED READ IS REGRESSED TO ITS
# OWN RELIABILITY. A season of defended-FG% differential is an ESTIMATE of a man's true differential,
# and the estimate is noisy: measured on our own tracking_defense.csv over every consecutive-season
# pair a player appears in (min 150 attempts defended in the slice), the year-to-year correlation is
#   Outside 6Ft (what perdef reads)  r = 0.345  (n = 3,181)
#   Overall     (the 0.30 corroborator) r = 0.355  (n = 3,705)
#   Less Than 6Ft (what rimprot reads)  r = 0.558  (n = 2,052)   <- and rimprot already weights it 0.35
#   Greater Than 15Ft                    r = 0.140  (n = 2,632)
# recal_86 anchored the tracked branch in card space but read the raw season diff as if it were the
# truth, so one season bought (or cost) ~20 points of perdef. The best estimate of the true diff is
# the observed deviation from neutral shrunk by the series' reliability; that is all this dict does.
# recal_101 (HIS RULING, verbatim: "This is better than 50, should be low 60's"). RHO SCALES WITH
# THE SAMPLE, and this corrects recal_92's own note. That round wrote "it does not improve with
# sample: at a 250-attempt floor it is 0.363" - true, and measured over too short a range to see
# the trend. Re-measured on the same file over consecutive-season pairs, with BOTH seasons above an
# attempt floor:
#   Outside 6Ft  150+ 0.345 (n=3181) | 250+ 0.363 | 350+ 0.406 | 450+ 0.431 | 550+ 0.502 | 650+ 0.528
#   Overall      150+ 0.355 (n=3705) | 350+ 0.421 | 550+ 0.471 | 750+ 0.577
# Reliability rises by half again between a thin sample and a full season, so a flat 0.345 regressed
# a FULL tracking season as hard as a 150-shot one. The table below is the measurement itself,
# linearly interpolated and flat outside it - not a fitted curve.
TRK_RHO_CURVE = ((150.0, 0.345), (250.0, 0.363), (350.0, 0.406), (450.0, 0.431), (550.0, 0.502), (650.0, 0.528))
def trk_rho(att):
    if att is None: return TRK_RHO_CURVE[0][1]
    a = max(TRK_RHO_CURVE[0][0], min(TRK_RHO_CURVE[-1][0], att))
    for i in range(len(TRK_RHO_CURVE) - 1):
        a0, r0 = TRK_RHO_CURVE[i]; a1, r1 = TRK_RHO_CURVE[i + 1]
        if a <= a1: return r0 + (r1 - r0) * (a - a0) / (a1 - a0)
    return TRK_RHO_CURVE[-1][1]
# recal_149 (HIS RULING on Amen Thompson, verbatim: "Decline Amen as well. He is elite defender.
# His 25/26 seasons are even underrated defensively"). THE MEASUREMENT MAY RANK THE BAND.
# recal_101 gave a voted card's full-sample tracked reading a FLOOR, and it was right to; but the
# floor was written on the WRONG SCALE. The voted band is a within-season RANK map into 55..99
# (0.55 + 0.45 x Pvot(PD) x vf), while `_abs_perdef` is an ABSOLUTE level centred on 58 whose whole
# full-sample pool spans 43 to 81 (p50 57.7, p90 66.5, p99 72.8, max 80.7 = Wembanyama '26). Taking
# max() of a rank-in-a-band against a level therefore fired for exactly ONE card in the file: an
# All-Defensive wing measured at -3.2% over 517 shots read 65 on the tracked line against 92 in the
# band, so his measurement could never be seen. The band ranks a PROXY (votes, DBPM, height); the
# tracked line MEASURES the same thing. This round reads the measurement WHERE THE BAND DECIDES —
# it is added to the card's own composite and the SAME frozen Pvot pool is asked again, so elite
# tracked defence buys BAND POSITION, which is what votes buy.
# BOTH CONSTANTS ARE MEASURED ON THIS FILE, neither is chosen:
#   TRK_BAND_LO / TRK_BAND_TOP = 62.5 / 72.8 — the ramp is the TOP QUARTILE of the regressed
#                   tracked reading, measured over the 1,068 full-sample tracked cards in this file:
#                   p50 57.7 · p75 62.5 · p90 66.5 · p95 68.6 · p99 72.8 · max 80.7 (Wembanyama '26).
#                   His word is ELITE, so the credit starts where a season beats three quarters of
#                   the measured pool and is full at the top one percent. A ramp opened at recal_86's
#                   neutral 58.0 instead was measured first and is REJECTED: the voted composite pool
#                   is dense between 0.95 and 1.00, so a merely-average tracked season (Luguentz Dort
#                   '26, -0.2%) crossed five cards and gained five points, and OKC '26's team dial
#                   left recal_100's band at 92 against 86 +-4. At the top quartile Dort earns zero.
#   TRK_BAND_W    = 0.32 — the distance from a season's MEDIAN voted composite to its MAXIMUM,
#                   measured over the thirteen tracked seasons: mean 0.319, median 0.322, range
#                   0.264 (2020) to 0.361 (2014). So a fully elite measured season is worth exactly
#                   enough to carry the MEDIAN voted defender to the top of his own season's band,
#                   and not one point further. It is read beside drep (0.453) and height_inv (0.309).
# WHY NOTHING FALLS AND THE POOL IS BIT-IDENTICAL: the term is applied to the CARD'S OWN lookup
# inside the loop, never to the PD stored in `tmp`, so the Pvot pool it is measured against does not
# move (recal_114's doctrine, stated there for the same reason), and the whole thing is a max() —
# no card is demoted by a measurement, so recal_54, recal_82 and recal_97's voted band stand.
# BY CONSTRUCTION FLAT: every pre-2014 card (no tracking), and every NO-VOTE card (wv = 0 makes the
# recomputed value identical to PD2 term for term) — Jaylen Brown '26 66, Stephon Castle '26 62,
# Ajay Mitchell '26 62, Kevin Durant, Stephen Curry, Ayo Dosunmu are untouched by construction.
TRK_BAND_LO  = 62.5    # regressed tracked reading, card space, where elite starts (p75 full-sample)
TRK_BAND_TOP = 72.8    # ... and where it is full (p99)
TRK_BAND_W   = 0.32    # what a fully elite measured season is worth in composite space
BAND_FOOT, BAND_FULL = 12.0, 34.0   # recal_159: recal_96's 12-minute foot; full load = this term's own class p75 (34.04)
# recal_175 (HIS RULING, verbatim: "Agree with Mikal bridges 21' dropping per d", and on the
# collateral: "Jrue Smart and Kobe shouldnt drop nearly as much as bridges"). A CARRIED BALLOT IS
# PAID IN FULL UNLESS THE SEASON'S OWN MEASUREMENT CONTRADICTS IT.
# `drep` is a CAREER reputation decayed 15%/yr in BOTH directions, so a season with no ballot of its
# own collects a neighbouring year's ballot at full weight in the PD composite — which is the whole
# of Mikal Bridges '21: perdef 95, #4 of 2021, on ZERO 2021 ballot (his only career selection is
# 2022), DBPM +0.9, STL% 1.6, and the WORST tracked read of any card in the file reading 95+ —
# +5.3% on 483 shots from 6ft out, +2.8% on 863 overall. His own '20, with the better box sheet,
# reads 89. recal_160 established the own-ballot / carried-ballot split for rim protection and
# recal_165 extended it to the voted ceiling's unlock; this is the same split for perimeter defence.
# WHAT SEPARATES HIM FROM THE OTHER CARRIED BALLOTS, MEASURED. A flat half-rate on every carried
# ballot is NOT the form and is the thing his second ruling forbids: it takes Jrue Holiday '20,
# Marcus Smart '23 and Kobe Bryant '99 down with him. The separator is the season's OWN tracked
# defence, which the file already computes and regresses to its reliability (`_dmeas101`, recal_92 /
# recal_101 / recal_86). Read in card space, the four seasons the ruling names are not alike:
#   Bridges '21 47.3   |   Smart '23 56.3   |   Jrue '20 63.5   |   Kobe '99 — NOT MEASURED
# so the carried ballot is discounted toward CARRIED_REIN only where the measurement CONTRADICTS it,
# and Kobe '99 (and every pre-2014 card in the file) is untouched by construction: recal_52's rule,
# "measured, or not at all". Nothing here reads DBPM — recal_150's declined form did, and it is the
# door that ruling closed.
# THE WINDOW IS MEASURED ON TWO CLASSES AND THEY AGREE. Over the 288 CARRIED-ballot tracked seasons
# this line actually pays (the term's own class, recal_117/130/145/159's rule) the regressed tracked
# reading runs p01 44.6 · p05 49.2 · p10 51.7 · p25 54.5 · p50 59.3; over the 124 seasons that hold
# a ballot OF THEIR OWN — the class a carried ballot claims to belong to — it runs p01 49.3 · p05
# 51.5 · p10 55.4 · p25 59.2 · p50 63.2. The bottom twentieth of the paid class and the bottom
# hundredth of the certified class land on the SAME 2.5-point window, so that window is where a
# season stops looking like one the league votes for. Below CONTRA_LO the carried ballot buys
# CARRIED_REIN of what it bought; at CONTRA_FULL and above it buys all of it.
# WHY NOT A WIDER RAMP: at the certified class's p05->p10 (51.5 -> 55.4) Bridges '25 (53.8) starts
# paying, and recal_141's control pin Mikal Bridges '24 == 78 is a 20% blend of it and breaks.
CONTRA_LO, CONTRA_FULL = 49.2, 51.7   # carried-class p05 / p10 (certified-class p01 / p05: 49.3 / 51.5)
SHORTLINE = {1995, 1996, 1997}  # 22ft uniform line -> discount 3P% a touch
ERA_ALPHA = 0.38  # dampening for the 3PT-volume era multiplier (recal_22 -> recal_24)
ERA_CAP   = 3.0   # multiplier ceiling

WEIGHTS = dict(
  IN  = dict(x2p_per_100=0.40, x2p_pct=0.35, ftr=0.25),
  OUT = dict(x3pa_rate=0.65, x3p_pct=0.35),   # volume-first: taking them at league % IS the skill
  # recal_81 (HIS RULING, completing recal_76): DBPM is REMOVED from rim protection. recal_76 closed
  # perdef's explicit team-defence door, but DBPM carries the BPM 2.0 team adjustment too, and
  # d_score adds perdef and rimprot — so team defence still reached a big's defensive score through
  # this vector at ~0.068 residual. Survivors renormalised over 0.80, proportions kept.
  # THE PRICE, measured and stated: DBPM did carry real individual rim signal — corr with the tracked
  # rim defended-FG% diff is -0.377 over 2,972 tracked cards. But both survivors predict that same
  # truth BETTER (BLK% -0.615, height -0.531), and DBPM is +0.442 correlated with BLK% already, so
  # roughly half of what leaves was duplicated by the block term. The loss is real and small.
  ID  = dict(blk=0.6875, height=0.3125),   # rim protection = shot DETERRENCE; rebounding has its own attribute
  # recal_76 (HIS RULING, verbatim: "Remove team Def rating from per def"). Team defense was counted
  # TWICE: dbpm is Basketball-Reference's DBPM, and BPM 2.0's team adjustment bakes the roster's
  # defensive quality into it before any weighting, so an explicit team-DRtg term charged the same
  # fact again. Measured on our own pool: corr(team DRtg, DBPM) = -0.387, making the EFFECTIVE team
  # weight ~0.22-0.27 against the 0.192 this vector claimed. Survivors renormalised over 0.808 with
  # their proportions kept. Team context still arrives, through DBPM, and is not counted separately.
  PD  = dict(drep=0.453, dbpm=0.238, height_inv=0.309),
  PD_SHRINK_NOVOTE = 0.70,   # no All-D/DPOY votes -> compress pd toward 0.5 by this factor
)

def is_tot(t):
    # combined-season rows: 'TOT' in older exports, '2TM'/'3TM'... in newer ones
    return t == 'TOT' or (len(t) == 3 and t.endswith('TM') and t[0].isdigit())

def f(x):
    try: return float(x)
    except: return None

def load(name, key=None):
    rows = list(csv.DictReader(open(f"{DATA}/{name}", encoding="utf-8")))
    return rows

adv   = load("Advanced.csv")
# league-average TS per season (qualified: mp >= 800) -> era-relative efficiency for the team offense engine
lg_ts = defaultdict(list)
for r in adv:
    if r['lg']=='NBA' and r.get('ts_percent') not in (None,'','NA'):
        try:
            if float(r['mp']) >= 800: lg_ts[int(r['season'])].append(float(r['ts_percent']))
        except: pass
lg_ts = {yr: sum(v)/len(v) for yr, v in lg_ts.items() if v}
# --- defensive reputation data (recorded votes, 1969+/1983+) ---
alld = defaultdict(float)   # (pid, season) -> All-Defense credit
for r in load("End of Season Teams.csv"):
    if r['type'] == 'All-Defense':
        alld[(r['player_id'], int(r['season']))] = max(alld[(r['player_id'], int(r['season']))], 1.0 if r['number_tm']=='1st' else 0.6)
dpoy = defaultdict(float)   # (pid, season) -> DPOY vote share
for r in load("Player Award Shares.csv"):
    if 'dpoy' in r['award']:
        try: dpoy[(r['player_id'], int(r['season']))] = float(r['share'])
        except: pass
rep_by_pid = defaultdict(dict)   # pid -> {season: vote credit}
for (pid, yr), v in list(alld.items()): rep_by_pid[pid][yr] = max(rep_by_pid[pid].get(yr,0), v)
for (pid, yr), v in list(dpoy.items()): rep_by_pid[pid][yr] = max(rep_by_pid[pid].get(yr,0), min(1.0, rep_by_pid[pid].get(yr,0) + 0.5*v))
def career_rep(pid, yr):
    best = 0.0
    for y2, v in rep_by_pid.get(pid, {}).items():
        best = max(best, v * max(0.0, 1 - 0.15*abs(yr - y2)))
    return best
per100= load("Per 100 Poss.csv")
info  = {r['player_id']: r for r in load("Player Career Info.csv")}
teamd = {}   # (season, abbrev) -> d_rtg
lg3ar = defaultdict(list)   # season -> team 3PA rates (from the same dataset, no web needed)
lgpace = defaultdict(list)  # season -> team pace, for recal_78's attempt counts
for r in load("Team Summaries.csv"):
    try: teamd[(int(r['season']), r['abbreviation'])] = float(r['d_rtg'])
    except: pass
    try: lg3ar[int(r['season'])].append(float(r['x3p_ar']))
    except: pass
    try: lgpace[int(r['season'])].append(float(r['pace']))
    except: pass
lg3ar = {yr: sum(v)/len(v) for yr, v in lg3ar.items() if v}
lgpace = {yr: sum(v)/len(v) for yr, v in lgpace.items() if v}
MODERN_3AR = sum(lg3ar[y] for y in range(2011, 2026) if y in lg3ar) / len([y for y in range(2011, 2026) if y in lg3ar])
def era_mult(yr):
    base = lg3ar.get(yr)
    if not base or base <= 0: return 1.0
    return min(ERA_CAP, (MODERN_3AR / base) ** ERA_ALPHA)

# index per-100 by (player_id, season, team) -- use TOT rows when present
p100 = {}
for r in per100:
    k = (r['player_id'], r['season'])
    if k not in p100 or is_tot(r['team']): p100[k] = r

# ---- the SEASON'S SCHEDULE (recal_156) ----
# recal_14's minutes-confidence line (see below, ~"MINUTES CONFIDENCE") is a FIXED minute line —
# 1200 raw minutes to 2400 — applied to every season ever played. Over 82 games those are 14.6 and
# 29.3 minutes a night; over the 50-game lockout season of 1999 the same numbers are 24.0 and 48.0
# minutes a night, and 48 minutes a night does not exist. So the whole of 1999 was shrunk toward the
# median on playvol/perimdisrupt/orb/drb/fouldraw/efficiency and talent for games the league never
# played: John Stockton's league-leading 48.3 AST% read playvol 86 while Jason Kidd's 44.0 read 90,
# purely because Kidd played 650 more minutes of the same 50-game schedule.
# SEASON_G[yr] is the season's own schedule: the maximum games any player appeared in that year,
# clamped at 82 (a mid-season trade can push a player past the schedule). 1999 -> 50, 2012 -> 66,
# 2021 -> 72, 2020 -> 74; every other season since 1980 clamps to 82, so an 82-game season is
# BYTE-IDENTICAL to recal_14 and a 1,400-minute part-timer in a full season keeps his shrink exactly.
SEASON_G = {}
for r in adv:
    if r['lg'] not in ('NBA', 'BAA'): continue
    _g = f(r['g'])
    if _g is None: continue
    _y = int(r['season'])
    if _g > SEASON_G.get(_y, 0.0): SEASON_G[_y] = _g
SEASON_G = {y: min(82.0, g) for y, g in SEASON_G.items()}

# ---- collect qualified seasons ----
seasons = defaultdict(list)   # season -> list of merged rows
for r in adv:
    if r['lg'] not in ('NBA','BAA'): continue
    mp = f(r['mp'])
    if mp is None or mp < MIN_MP: continue
    if int(r['season']) < MIN_SEASON: continue
    k = (r['player_id'], r['season'])
    s = p100.get(k)
    if not s: continue
    if not is_tot(r['team']) and any(x['player_id']==r['player_id'] and x['season']==r['season'] and is_tot(x['team']) for x in adv): 
        continue
    ht = f(info.get(r['player_id'],{}).get('ht_in_in'))
    seasons[int(r['season'])].append(dict(
        pid=r['player_id'], name=r['player'], season=int(r['season']),
        bpm=f(r['bpm']), dbpm=f(r['dbpm']), blk=f(r['blk_percent']), stl=f(r['stl_percent']),
        drb=f(r['drb_percent']), ast=f(r['ast_percent']), usg=f(r['usg_percent']),
        ts=f(r['ts_percent']), ftr=f(r['f_tr']), tov_pct=f(r['tov_percent']),
        x2p_per_100=f(s['x2p_per_100_poss']), x2p_pct=f(s['x2p_percent']),
        x3pa_per_100=f(s['x3pa_per_100_poss']), x3p_pct=f(s['x3p_percent']),
        ft_pct=f(s['ft_percent']), ht=ht,
        drep=career_rep(r['player_id'], int(r['season'])),
        team_drtg=teamd.get((int(r['season']), r['team'])), mp_v=mp, g_v=f(r['g']),
    ))

def pctile_top(vals):
    """value -> 0..1 where the maximum maps to exactly 1.0 (pctile leaves the top at (n-1)/n,
    which quietly made a 99 unreachable for rim protection)."""
    xs = sorted(v for v in vals if v is not None)
    def p(v):
        if v is None or len(xs) < 2: return 0.5
        import bisect
        return min(1.0, bisect.bisect_left(xs, v) / (len(xs) - 1))
    return p

def pctile(vals):
    """value -> percentile 0..1 within list (None-safe)"""
    xs = sorted(v for v in vals if v is not None)
    def p(v):
        if v is None or not xs: return 0.5
        import bisect
        return bisect.bisect_left(xs, v) / len(xs)
    return p

# ---- modern reference distributions for OUT (absolute scale) ----
mod = [r for y in range(MODERN[0], MODERN[1]+1) for r in seasons.get(y, [])]
P_3pa_mod = pctile([r['x3pa_per_100'] for r in mod])
P_3pp_mod = pctile([r['x3p_pct'] for r in mod if (r['x3pa_per_100'] or 0) >= 2])

CARRIED_REIN = 0.50   # recal_160: a ballot from ANOTHER season reinforces rim protection at half rate
CARRIED_UNLOCK = 1 - (1 - CARRIED_REIN) / 2   # recal_165: = 0.75. The SAME carried-ballot discount,
# halved, because the voted rim CEILING's unlock already carries a second gate the reinforcement line
# does not: it is multiplied by recal_92's block evidence, so a ballot carried into a season is already
# corroborated by that season's own blocks before it buys anything. See the _w53 block below.
_ID_OWN = {}          # (pid, season) -> the card's own gated ID; the Prot pool keeps the ungated one
def score_season(r, P):
    W = WEIGHTS
    IN  = W['IN']['x2p_per_100']*P['x2p_per_100'](r['x2p_per_100']) + W['IN']['x2p_pct']*P['x2p_pct'](r['x2p_pct']) + W['IN']['ftr']*P['ftr'](r['ftr'])
    # OUT: absolute vs modern pool (all seasons >=1980 have measured 3P data)
    if True:
        DEADEYE_ATT = 3.0   # era-adjusted 3PA/100 at which the deadeye path pays in full (recal_185 names it)
        p3 = r['x3p_pct']
        if r['season'] in SHORTLINE and p3: p3 = p3*0.93
        vol = P_3pa_mod((r['x3pa_per_100'] or 0) * era_mult(r['season']))   # volume is ALWAYS era-adjusted
        acc = P_3pp_mod(p3) if (r['x3pa_per_100'] or 0)>=2 else 0.35*P['ft_pct'](r['ft_pct'])
        # GUNNER path: volume-first blend (chucker-gated)
        gun = WEIGHTS['OUT']['x3pa_rate']*vol + WEIGHTS['OUT']['x3p_pct']*acc
        gate = 1.0
        if p3 is not None and P.get('_med3') and (r['x3pa_per_100'] or 0) >= 2:
            gap = P['_med3'] - p3
            if gap > 0.02:
                gate = max(0.55, 1 - 3.0*(gap-0.02))
                gun *= gate
        # DEADEYE path: elite accuracy on real (era-adjusted) attempts; capped so specialists never pass elite gunners
        # recal_185 (HIS RULING, verbatim: "Agree with 1-10"). THE DOOR BECOMES A RAMP — THE FILE'S OWN
        # NO-CLIFFS RULE (recal_43), APPLIED TO THE ONE HARD STEP LEFT IN THE 3PT BAR.
        # THE SUBJECT, MEASURED BEFORE ANYTHING WAS TOUCHED. Richard Hamilton '06 LED THE NBA in 3P%
        # (.458, 55 of 120, 1.5 a game over 35.3 mpg) and read 3pt 39. He is 2.3 3PA/100 x an era
        # multiplier of 1.2005 = 2.761 adjusted attempts, which is 0.239 BELOW this gate, so he took
        # the gunner path at a pre-smooth 50. Jim Jackson '02 — .469 on the SAME 1.5 attempts a game —
        # is 2.4 x 1.2501 = 3.0002, two ten-thousandths ABOVE it, took the deadeye path at a pre-smooth
        # 89 and ships 75. A quarter of one adjusted attempt per 100 was worth thirty-nine points of
        # shooting. Pool-wide the step is the same size and it is a step, not a slope: the median
        # pre-smooth bar just UNDER the line is 48 and just OVER it is 81.
        # WHY THE RAMP HAS NO FITTED WIDTH. The obvious form is a ramp from a foot measured on the
        # class — the lower quartile of adjusted attempts among cards whose accuracy clears p90. That
        # measurement is DEGENERATE for this purpose: of 528 such cards the lower quartile is 6.16
        # adjusted attempts and only EIGHT sit under the gate at all, so any foot read off the class
        # lands above 3.0 and the ramp has zero width. The only foot that is not a chosen number is
        # therefore zero, and it makes the share LITERALLY what the ruling asks for — a card under the
        # gate takes the deadeye path in the proportion its attempts bear to the gate, _share = adj/3.0.
        # The 3.0 stays the only constant in the term; nothing new is fitted.
        # WHAT IS BYTE-IDENTICAL BY CONSTRUCTION. (a) Every card at or above 3.0 adjusted attempts:
        # _share saturates and eye is the same expression it always was. (b) The gunner path: gun,
        # its chucker gate and GUN_BOOST are untouched, and the ramp blends FROM gun, so _share = 0
        # returns gun exactly and OUT = max(gun, eye) cannot fall. This term can only lift, and it is
        # continuous at 3.0 from both sides — there is no longer a card on either side of a line.
        # (c) Every card under 2 raw 3PA/100. Below that line `acc` above is NOT three-point accuracy
        # at all, it is 0.35 x the free-throw percentile standing in for a shot the man did not take —
        # the deadeye path pays MEASURED accuracy, so there is nothing for it to pay. That is the
        # file's own existing test, reused, and it is what holds the doctrine the ruling explicitly
        # kept: Michael Jordan '89 (1.5 raw 3PA/100, 2.64 adjusted — UNDER this gate, and under the
        # measured line too) stays at 3pt 23, and low volume still means a low bar for every man who
        # simply did not take them.
        # THE FRONTIER, STATED. This is the whole of what the path selection can pay. At full deadeye
        # — the gate removed outright — Hamilton '06's pre-smooth bar is 88 and he SHIPS 60, because
        # the 20/60/20 season smoother blends him with his own '05 (pre-smooth 16, .305 on the same
        # attempts) and '07 (28). The ruling's 65 is not reachable from the path selection at any
        # width; 60 is the ceiling and it is the bottom of the tolerance. Nothing here touches the
        # deadeye VALUE, the gunner path, or the smoother.
        eye = 0.0
        if p3 is not None:
            _eye_full = min(0.95, 0.88*acc + 0.12*vol)   # season-level deadeye: near-pure accuracy, volume nudge
            _adj3 = (r['x3pa_per_100'] or 0) * era_mult(r['season'])
            if _adj3 >= DEADEYE_ATT:
                eye = _eye_full
            elif (r['x3pa_per_100'] or 0) >= 2:
                _share = min(1.0, max(0.0, _adj3 / DEADEYE_ATT))
                eye = gun + _share * (_eye_full - gun)
        GUN_BOOST = min(1.0, gun * 1.08)   # the gunner boost and the volume premium are alternatives
        OUT = max(gun, eye)   # two ways to be a shooter
    ID  = W['ID']['blk']*P['blk'](r['blk']) + W['ID']['height']*P['ht'](r['ht'])   # recal_81: no dbpm term
    # reputation term: All-D/DPOY votes are the only recorded measure of pre-tracking perimeter D.
    # height splits the credit: small defenders' votes -> pd, big defenders' votes -> id (rim protectors get All-D too)
    hp = P['ht'](r['ht'])
    trust = P['mp_v'](r['mp_v']) * (1 - 0.6*P['usg'](r['usg']))   # heavy minutes = trust; usage discounts but never zeroes it (star wings were being punished for scoring)
    # recal_35: height is a SWEET BAND (75-80 flat, 8 inches to zero), not an inverse slope.
    # recal_54: the tall-defender discount keys on the SWEET BAND, not percentile. Percentile height
    # halved a perfect reputation at 6'9" and taxed every voted WING while guards kept full credit —
    # and r53's voted ceiling on rimprot made it obsolete as rim-vote protection. 6'8" and under
    # keep the full 1.2; 7'1" is ~0.53; the floor is 0.5, so true bigs' rim-vote protection stands.
    rep_hf = max(0.5, 1.2 - 0.8 * max(0.0, min(1.0, ((r['ht'] or 78) - 80.0) / 6.0)))
    # recal_114 (HIS RULING, verbatim: "Dan rounfield too high for def 99. 91 is fine."). A VOTE IS
    # PAID ONCE. Dan Roundfield '82 read DEF 99, #1 of 10,000, above Mutombo '97 (DPOY, BLK% 7.0) at
    # 92, David Robinson '92 at 94 and Hakeem '94 at 95. He is 6'8" exactly - the TOP EDGE of the
    # 6'3"-6'8" band - so rep_hf and height_inv both pay him at the full WING rate (1.2 and 1.0, the
    # most advantaged height in this formula), which is 76% of a perdef of 96. d_score then reads him
    # as a BIG (d_bigness 1.0000 at 80 inches) and takes 0.40 x rimprot as well, where recal_53's
    # voted ceiling had already paid the SAME All-Defensive votes: rimprot 92 on a BLK% of 2.6.
    # 0.40 x 96 + 0.40 x 92 = 75.2 of a 92.76 d_score, and 104.86 raw against a DEF_TOP of 104.25.
    # THE TERM IS SCALED BY WHAT IS ALREADY PAID AND BY WHAT BACKS IT. _paid_in_rim is recal_53's own
    # unlock weight (drep x block evidence) - literally the share of the card's votes that rimprot has
    # already cashed - and _support is the DBPM percentile that says whether the votes describe real
    # defensive value. Only the part that is BOTH already paid AND unsupported is removed, so:
    #   - a card rimprot never paid loses NOTHING, whatever its DBPM. Michael Jordan '89 (BLK% 1.2,
    #     w53 0.000), Kawhi '16, Pippen '94, Jrue Holiday '21, Rodman '90, Herbert Jones '23 - every
    #     wing anchor on this attribute - is untouched by construction.
    #   - a card whose DBPM fully backs its votes loses NOTHING, however big. Ben Wallace '02
    #     (dbpmP 0.996), Dwight '11 (0.974), Garnett '04 (0.986), Gobert '19 (0.979) keep the DEF
    #     ceiling and their bands.
    # Roundfield is the one card high on both: w53 0.899 with a DBPM percentile of 0.713 (+0.7 raw),
    # the lowest of any card reading DEF 95+, where every other one is above 0.865.
    # THE POWER is the fitted part and is stated as such: the same shape at powers 1, 2, 3, 4 and 5 leaves
    # Roundfield at perdef 86, 82, 81, 78 and 75 - DEF 97, 95, 96, 95 and 94. 6 is the lowest integer
    # power that reaches his 91 with margin, and the form is monotone in DBPM, so no ordering depends
    # on the choice. Read it as a bar: votes rimprot has already cashed are backed in perdef only by
    # a top-decile DBPM.
    VOTE_SUPPORT_POW = 3
    # recal_135 (HIS RULING, verbatim: "Karl Malone agree a lot."). recal_114's METER WAS INCOMPLETE:
    # IT COULD ONLY SEE ONE OF THE TWO WAYS RIMPROT PAYS A VOTE. Karl Malone '97 read DEF 95 - level
    # with Hakeem '94 (DPOY) and above Dikembe Mutombo '97 (DPOY, BLK% 7.0, the same season) at 92 -
    # on 0.6 blocks a game, BLK% 1.3, DBPM +1.2 and no rim deterrence of any kind. recal_114's rule
    # never touched him because its meter, drep x block evidence, is 0.000 at the 57th percentile of
    # the season's block rate: its verdict was "rimprot never cashed these votes". It had.
    # THE SECOND CHANNEL, MEASURED. Rim protection reads All-Defensive votes TWICE. recal_53's voted
    # ceiling is the gated one (_w53, block evidence required since recal_92) - and there is also the
    # reinforcement line ID = ID + 0.25*(drep*hp), which is gated on NOTHING but height. Zero that one
    # line in a scratch run and Malone '97's rimprot reads 56 instead of 74: his votes are worth 18
    # points of rim protection, which the big d_score branch takes at 0.40 BESIDE the 0.40 it takes of
    # perdef. Mutombo '97 and Hakeem '94 read 99 with the line and 99 without it - their blocks carry
    # them - which is exactly why the deduction belongs on the man whose blocks do not.
    # WHERE IT SWITCHES ON, AND WHY IT IS NOT A FITTED NUMBER. This file has exactly one place where a
    # card stops being a perimeter defender and it is 80 inches: recal_35's sweet band is FLAT at 1.0
    # across 75-80 and recal_54's rep_hf is FLAT at its maximum 1.2 through 80. Past it both fade, but
    # over 8 inches and 6 - so a 6'9" power forward still collects 87.5% and 89% of the pure-WING rate
    # (0.2704 + 0.4832 of Malone's 0.9477 composite, 80% of his sheet) for votes his blocks and his
    # DBPM do not back. The height channel is therefore the band test itself: 0 at 6'8" and under,
    # 1 above it. No card in the pool has a fractional height, so OUT_OF_BAND_IN = 1.0 IS that test;
    # the 2-inch and 3-inch ramps were measured and leave the subject at DEF 91 and 91, out of band.
    # NOTHING ELSE OF recal_114 MOVES. The deduction still lands on the 0.45 vote premium, so Pvot is
    # bit-identical and no card rises; VOTE_SUPPORT_POW stays 3 (it is also, independently, the power
    # that puts this subject on his number: 0.816**3 = 0.542); a card whose DBPM backs its votes keeps
    # them at ANY height (Garnett '04 0.959, Ben Wallace '04, Gobert '19, Shaq '00 all untouched); and
    # every card inside the wing band is untouched by construction - Jordan '89, Kawhi '16, Draymond
    # '16, Rodman '90 and '93, Buck Williams '91, Roundfield '82, Pippen '03, Herb Jones '23.
    # THE PRICE, STATED: at 80 inches Buck Williams '91 keeps perdef 93 and at 81 Malone reads 76.
    # The boundary cannot move down - Rodman '90 (def 94 +-1, 79 in) and Pippen '03 (def 76 +-1, 80 in)
    # are anchored on it, and Buck '91 88 and Rodman '93 89 are the comparables the ruling's own target
    # is read off. A fade that starts at 78 or 79 costs all four.
    OUT_OF_BAND_IN = 1.0
    _out_of_band = min(1.0, max(0.0, ((r['ht'] or 78) - 80.0) / OUT_OF_BAND_IN))
    # recal_172 (HIS RULING on Dan Roundfield '83, verbatim: "Agree with 7"). ON THE BAND'S TOP EDGE
    # THE METER WAS STILL ASKING THE CEILING'S QUESTION, NOT THE RIM'S.
    # THE SUBJECT, MEASURED BEFORE ANYTHING WAS TOUCHED. Dan Roundfield '83 read DEF 95 - #1 of 1983,
    # above Bobby Jones '83 (94) and above HIS OWN '82, the card recal_114 was written for and pinned
    # at 91 +-3. Same man, same sheet, same shape: 6'8" on the big d_score branch taking 0.40 x perdef
    # 83 beside 0.40 x rimprot 87, for one 1983 All-Defensive 1st team on 1.5 blocks a game.
    # THE DEFECT IS THE RULER, AND THE TWO SEASONS PROVE IT. His BLK% of 2.3 is the 82nd percentile of
    # 1983, a THIRD of the way up recal_92's six-point unlock band, so _blk_evidence returned 0.344 and
    # the meter's verdict was that rim protection had cashed a third of his ballot. It had cashed all
    # of it: his rim protection reads 88.4 where the SAME SHEET WITH NO BALLOT AT ALL reads 74.1 - a
    # realised lift of FOURTEEN card points, against his '82's fifteen (92.0 against 76.9) on an
    # evidence reading of 0.899. Two neighbouring seasons of one man, the same payment, and deductions
    # that differed by a factor of two and a half: the WEAKER block line earned the SMALLER deduction
    # (vote factor 0.738 against 0.428) and printed four DEF points HIGHER.
    # WHY THE BAND IS THE WRONG RULER, DECOMPOSED. Rim protection pays a ballot through channels that
    # recal_92's band does not govern. Of Roundfield '83's 0.146 lift, the voted CEILING - the thing
    # the band grades - is worth 0.004. The other 0.142 is recal_135's reinforcement line,
    # ID = ID + 0.25*(drep*hp), which is gated on nothing but height and pays at EVERY block rate. So
    # the meter should ask the PRIOR question - has the rim cashed this ballot at all - and that is the
    # question recal_162 already had to ask of recal_95's floor. Its answer is reused here verbatim:
    # recal_92's own evidence function read ONE BAND WIDTH EARLIER (full at the bar p80, nothing one
    # band under it, the same linear grade between). No new constant: the band, its width and its bar
    # are recal_92's and the shift is recal_162's.
    # WHERE THE EARLIER READING APPLIES, AND WHY IT IS THE SAME 80 INCHES recal_135 ALREADY DREW.
    # recal_135 gave this meter its height channel as a STEP - flat 1.0 above the wing band, flat 0
    # inside it - because its own subject was 81 inches and it had no reason to look at the edge. The
    # card recal_114 was written for stands ON that edge: 80 inches is the last inch at which recal_35's
    # sweet band and recal_54's rep_hf both pay the FULL wing rate, so a card there collects the whole
    # perimeter-vote premium while standing tall enough for the rim reinforcement to land on him. The
    # step therefore gets a landing at the edge instead of starting past it: at 80 inches and above the
    # block band is read one width earlier, at 79 and under it is read exactly where recal_92 put it.
    # MEASURED, AND THIS IS WHY THE SHIFT IS GATED ON THE EDGE AND NOT APPLIED TO EVERY CARD. Reading
    # the band one width earlier for EVERYONE reaches the subject too (DEF 92, identically) but it
    # reaches BELOW recal_92's bar, into cards the file says have no block evidence at all, and breaks
    # two anchors: Dennis Rodman '90 (79 in, blk p76, def 94 +-1) falls to 92 and Amen Thompson '24
    # (79 in, blk p80.2, def 94 +-1) to 91. Taking recal_135's height step down to 80 inches as a flat
    # 1.0 instead - the other variant measured - costs Scottie Pippen '97/'98/'99 fifteen to twenty
    # perdef points apiece on block rates BELOW the bar, takes Paul George '17/'18 thirteen DEF points
    # and breaks the Bulls '96 dial (r94). The gated form is the intersection of the two: it moves only
    # cards ON the band's edge whose blocks clear recal_92's bar, 32 of 10,000.
    # NOTHING BELOW 6'8" MOVES, BY CONSTRUCTION, and nothing rises anywhere: the meter can only go up,
    # the deduction still lands on the 0.45 vote premium and never on PD, so the within-season Pvot
    # pool is bit-identical. Rodman '90, Amen Thompson '24/'25/'26, Kawhi '16, Draymond '16, Jordan
    # '89, Jrue '21, Herbert Jones '23, Maurice Cheeks '85 and Scottie Pippen '03 are bit-identical,
    # and so is every card recal_135 already reached above the band (McHale '85/'88, Moses '85, Bobby
    # Jones '82/'83/'85, Sikma '83, Malone '97, Dwight '11, Garnett '04/'08, Ben Wallace '04).
    _at_band_top = min(1.0, max(0.0, ((r['ht'] or 78) - 79.0) / OUT_OF_BAND_IN))
    _paid_in_rim = (min(1.0, max(0.0, r['drep'])) * max(_blk_evidence(P['blk'](r['blk']) + (BLK_FULL - BLK_BAR) * _at_band_top), _out_of_band)) if r['drep'] > 0.05 else 0.0
    _vote_factor = 1.0 - _paid_in_rim * (1.0 - P['dbpm'](r['dbpm']) ** VOTE_SUPPORT_POW)
    PD  = W['PD']['drep']*(r['drep']*rep_hf) + W['PD']['dbpm']*P['dbpm'](r['dbpm']) + W['PD']['height_inv'] * max(0.0, 1.0 - max(0.0, max(75.0-(r['ht'] or 78), (r['ht'] or 78)-80.0))/8.0)
    if r['drep'] == 0:   # evidence is weak without votes: shrink toward league middle (fixes both steal-gamblers and quiet solid defenders)
        PD = 0.5 + WEIGHTS['PD_SHRINK_NOVOTE']*(PD-0.5)
    # recal_160 (HIS RULING on Jack Sikma '83, verbatim: "Can be high 70s", and on Ben Simmons '21,
    # verbatim: "Disagree"). A CARRIED BALLOT REINFORCES AT HALF RATE. The line below is rim
    # protection's SECOND vote channel (recal_135 named it and measured it: zero it and Karl Malone
    # '97 reads 56 instead of 74). recal_92 gated the voted rim CEILING on block evidence and
    # recal_114 gated perdef's vote premium on DBPM support, but this line was gated on NOTHING but
    # height -- and, crucially, not on WHICH SEASON THE BALLOT WAS CAST IN. `drep` is a CAREER
    # reputation, decayed 15% a year in both directions (career_rep, top of this file), so a man with
    # no ballot at all in the season the card describes still collects the full reinforcement for a
    # ballot cast the year before or the year after.
    # THE SUBJECT, MEASURED. Jack Sikma '83 read rimprot 82 on BLK% 1.3 (the 65th percentile of 1983),
    # 0.9 blocks a game, DBPM +0.9 and NO 1983 selection: his drep 0.51 is his 1982 All-Defensive 2nd
    # team decayed one year. Every other 1982-84 no-vote big at 6'9"+ with a BLK% between 1.0 and 2.0
    # reads 63-78 (Cartwright '82 78, Lanier '82 76, Kelley '83 72, Ruland '83 68) and his own box
    # twin Mickey Johnson '82 reads 65. The whole gap is this line.
    # THE FORM: the reinforcement is paid IN FULL for the share of drep the season's OWN ballot
    # supplies, and at CARRIED_REIN for the rest. It is byte-identical for every card whose
    # reputation is its own season's ballot -- Ben Simmons '21 (All-Defensive 1st IN 2021, own 1.00 =
    # drep 1.00) does not move a point, which is his ruling -- and it is monotone in both channels.
    # CARRIED_REIN = 0.50 IS THE FITTED PART AND IS STATED AS SUCH (the VOTE_SUPPORT_POW precedent
    # above). A carried ballot is evidence, but it is evidence about ANOTHER season; half is the
    # roundest reading of "less, not nothing". Measured across the pool, the subject lands 72 at 0.00
    # (his votes worth nothing), 77 at 0.30, 79 at 0.40-0.55 and 80 at 0.60; the pins decide the rest
    # -- below 0.50, Joel Embiid '23 (r81 rimprot 91 +-1, reading 90) falls to 89 and Joakim Noah '09
    # (r82 92 +-1) to 90 at 0.30. 0.50 is the value at which every rim anchor in the file holds.
    _own = min(r['drep'], max(0.0, rep_by_pid.get(r['pid'], {}).get(r['season'], 0.0)))   # the ballot THIS season cast
    # THE POOL IS FROZEN (recal_114's doctrine, and recal_149's, both stated in this file for the
    # same reason): the deduction is applied to the CARD'S OWN lookup, never to the ID that builds
    # the season's Prot pool below, so the within-season deterrent ranking does not move and NO CARD
    # CAN RISE. Without the freeze the pool thins under every card that loses a carried ballot and
    # the top of it drifts up a point -- Mutombo '97, Duncan '03, Ben Wallace '04 (rimprot 98 +-0),
    # Gobert '19 and Wembanyama '24 (97 +-0) all broke on the pool shift alone, measured.
    _ID_OWN[(r['pid'], r['season'])] = min(1.0, ID + 0.25*((_own + CARRIED_REIN*(r['drep'] - _own))*hp))
    ID  = ID + 0.25*(r['drep']*hp)   # big-man defensive votes reinforce rim protection
    # recal_175: the exact value the PD COMPOSITE pays for the part of `drep` that was cast in
    # ANOTHER season. Stashed, not deducted — the deduction is decided in the season loop below,
    # where the season's own tracked measurement is available. Zero for every own-ballot season and
    # for every no-vote card, so both classes are byte-identical by construction.
    _cw175 = W['PD']['drep'] * rep_hf * max(0.0, r['drep'] - _own)
    # recal_97 (HIS RULING, verbatim: "This is 99 per def. 3+ dpbm. Perfect heigh. perfect voting").
    # THE PD CLAMP IS GONE. PD was clamped to 1.0 BEFORE Pvot percentiled it, and a perfect sheet
    # overshoots 1.0 by construction: full votes at height <= 6'8" pay 0.453 x 1.2 = 0.5436, the
    # height term pays its whole 0.309, and a top DBPM percentile pays ~0.237 - which is 1.0896, the
    # highest sheet in the pool and Michael Jordan '89's exactly. 109 voted cards (8.6% of the voted
    # pool) sat on that clamp, so the percentile whose entire job is to separate them could not see
    # a single point of difference between the best perimeter defender ever measured and the 109th.
    # ID keeps its clamp: recal_92 measured removing it and it moves nobody rimprot cares about.
    ID  = min(ID, 1.0)
    TAL = 0.72*P['bpm'](r['bpm']) + 0.28*P['usg'](r['usg'])   # dominance x volume: kills the low-usage-specialist BPM bias
    # provenance: which OUT path won, and the raw defensive components (display only)
    path = 2 if (r['x3pa_per_100'] or 0) < 2 else (1 if eye > gun else 0)
    BRK = dict(
        out=[path, r['x3pa_per_100'], era_mult(r['season']), r['x3p_pct'], round(vol, 3), round(acc, 3), round(gate, 3)],
        idc=[r['blk'], r['ht'], r['dbpm'], round(r['drep'], 3),
             (TRACKING.get((r['season'], 'Less Than 6Ft'), {}).get(_nrm(r['name'])) or (None,))[0]],
        _vf=_vote_factor, _cw=_cw175,
        pdc=[round(r['drep'], 3), r['dbpm'], r['team_drtg'], r['ht'], 1 if r['drep'] == 0 else 0,
             (TRACKING.get((r['season'], 'Outside 6Ft'), {}).get(_nrm(r['name'])) or (None, None))[0],
             round(min(1.0, r['drep'] / 0.30) if r['drep'] > 0.05 else 0.0, 2),
             round((TRACKING.get((r['season'], 'Outside 6Ft'), {}).get(_nrm(r['name'])) or (None, 0))[1]),   # recal_56: the sidecar records the 6ft+ series the score reads
             (TRACKING.get((r['season'], 'Overall'), {}).get(_nrm(r['name'])) or (None,))[0]],
    )
    OUT = min(1.0, OUT + 0.07*max(0.0, (vol - 0.70)/0.30))   # HIGH-VOLUME PREMIUM (never subtracts)
    try: OUT = max(OUT, GUN_BOOST)
    except NameError: pass   # no gunner path on this sheet
    return IN, OUT, ID, PD, TAL, BRK

# within-season percentile functions
import unicodedata as _ud
def _nrm(n): return ''.join(c for c in _ud.normalize('NFKD', (n or '').lower()) if c.isalnum())
TRACKING = {}          # (season, category) -> {norm name: (diff_pct, attempts)}
TRK_CATS = {'overall': 'Overall', 'rim': 'Less Than 6Ft', 'perim': 'Greater Than 15Ft', 'three': '3 Pointers'}
# recal_92: THE r16 FLOOR LADDER IS RETIRED (it was ((-0.035, 76), (-0.02, 70), (-0.01, 64))).
# recal_16 wrote an absolute floor because the tracked branch was a within-season PERCENTILE and
# could not say what a diff MEANT. recal_86 made that branch absolute and value-anchored, and its
# own comment records that the two lines now sit within 0.5-1.0 card points of each other. So the
# ladder had become the same reading taken a second time with every evidential discount switched
# off - no sample weight, no targeting weight, no corroboration, no composite base - and it OVERRODE
# the discounted one. That is what handed a hard 76 to Isaiah Thomas '16 (blend 41), Kevin Durant '25
# (46), Deandre Ayton '20, Carmelo Anthony '18 and 535 other cards. One line to restore on a ruling.
DFG_FLOORS = ()   # recal_16 -> recal_92: defended-FG% diff no longer sets an absolute card floor
BLK_BAR, BLK_FULL = 0.80, 0.86   # recal_92: the block-evidence band the voted rim ceiling unlocks on
def _blk_evidence(blk_pctile):
    return max(0.0, min(1.0, (blk_pctile - BLK_BAR) / (BLK_FULL - BLK_BAR)))

# recal_95 (HIS RULING, verbatim: "Grade the no-vote rim ceiling by blocks, Pau high 70s", amended
# "Not only his blocks, his dbpm isnt even high"). THE NO-VOTE CEILING IS NO LONGER FLAT.
# recal_53 gave every big with no defensive votes the SAME ceiling, 88, whatever his evidence, and
# recal_92 measured what that costs: a 7'0" man at the 89th percentile of his season's block rate
# with a DBPM of +0.1 (Gasol '04) read the identical 88 as Shawn Bradley '95 at the 99.5th on +1.6.
# A flat ceiling is a floor for everyone who reaches it, and Gasol was reaching it on size.
# The ceiling now READS THE SAME TWO THINGS THE RULING NAMES, and both must be there:
#   ev = max(drep, blk_ramp x dbpm_ramp)      blk_ramp = (blk_pctile - 0.80)/0.06, clamped
#                                             dbpm_ramp = (DBPM - 0.0)/1.0,       clamped
#   cap = NOVOTE_FLOOR + (r53 tier - NOVOTE_FLOOR) * ev
# In card points: 75 at no evidence, 88 at full, and 92 at full where recal_53's MEASURED tier
# already applied (elite tracked rim defence on a real workload). Reading of the line: a no-vote big
# keeps the whole 88 only with a top-quintile block rate AND a genuinely positive DBPM; with one of
# them he lands in between; with neither he is held to 75.
# THE drep TERM IS WHY THIS IS STILL THE NO-VOTE CEILING. Votes raise the ceiling exactly as far as
# they go, so a voted big is held to the same cap he was held to before this round and NOTHING in
# recal_82's graded entry or recal_92's block gate is touched. It is monotone in reputation and in
# evidence, and it is smooth at drep = 0 — no cliff between a trace vote and none (the Iverson rule).
# DBPM, AND THE recal_76/81 LINE THIS DOES NOT CROSS. recal_81 removed DBPM from the rim-protection
# COMPOSITE because BPM 2.0 bakes the roster's defensive quality into it and d_score was charging
# team defence twice. That door stays shut: DBPM is NOT back in ID, it does not add a single point to
# any card, and no card rises through it. It enters only here, as one of two gates on HOW HIGH a big
# with no votes may be READ — a ceiling, which can only ever subtract. His ruling named it.
NOVOTE_FLOOR = (75 - 1) / 98.0   # recal_95: the ceiling with no block and no DBPM evidence behind it
# recal_162 (HIS RULING on Dirk Nowitzki '07, verbatim: "Agree"). recal_95's OWN SENTENCE, APPLIED TO
# ITS OWN FLOOR: "a flat ceiling is a floor for everyone who reaches it." recal_95 graded the 88 tier
# by block-and-DBPM evidence and left the BOTTOM of that grading flat at 75 — so the no-vote ceiling
# still handed a free 75 to every tall man whose raw deterrent composite cleared it, with no block
# evidence of any kind required. Dirk Nowitzki '07 is that card: 7'0", BLK% 1.7 (0.8 a game, the 72nd
# percentile of his season), no All-Defensive vote, ceiling evidence 0.000 — pre-cap 0.7798, capped to
# 0.7551, rimprot 75 EXACTLY. The big d_score branch takes that at 0.40 beside drb 88 at 0.17, and an
# MVP season with 0.8 blocks and 0.7 steals read DEF 84, #20 of 239 in 2007, one under Battier '07 and
# two under Okafor '07, where Barkley '93 (rimprot 50) reads 75 and Bird '87 (60) reads 77.
# THE FLOOR NOW GRADES ON THE SAME EVIDENCE THE CEILING DOES, ONE BAND EARLIER. recal_92's block bar
# is where this file says block evidence BEGINS (nothing below the 80th percentile of the season's
# block rate); recal_95's ceiling then grades from that bar to BLK_FULL. The floor asks the prior
# question — is there any rim evidence at all — so it reads recal_92's own evidence function shifted
# down by exactly one band width: full 75 at the bar (p80), nothing one band under it (p74), and in
# between the same linear grade. No new constant: the band, its width and its bar are recal_92's, and
# the bottom is RIM_BAND_FLOOR, the 0.55 the two-stage deterrent scale itself starts from (ID2 =
# 0.55 + 0.47 x Prot(ID), and the sub-gate cap of 0.54 that meets it). Reading of the line: a big with
# no votes and no blocks is not held at 75 for being tall, he is returned to the bottom of the
# deterrent band and has to climb it on measured deterrence.
# MONOTONE AND SUBTRACTIVE BY CONSTRUCTION. The graded floor is <= NOVOTE_FLOOR everywhere, it enters
# the same cap that can only ever bind downward, and full votes (ev = 1) still read the whole tier, so
# no card rises on this attribute and every voted band is bit-identical.
# MEASURED ON THE POOL: 2,261 cards move rimprot (1,337 by more than 3), 619 move DEF by more than 3,
# 81 move OVR by more than 3, and nothing rises. Dirk '07 rimprot 75 -> 55, DEF 84 -> 75, OVR 90 -> 88;
# the block '03 84 -> 77, '05 86 -> 84, '06 84 -> 77, '08 82 -> 74, '11 78 -> 71. Jokic '20 DEF 78 -> 69,
# Durant '22 78 -> 68, Bill Laimbeer '85 75 -> 67, Jack Sikma '89 83 -> 74.
# THE FRONTIER AND THE STOPPING PIN, STATED. Grading the floor on recal_92's band UNSHIFTED (bar p80,
# full p86) reaches Dirk 75 too but costs Kevin Durant '19 (def 79 +-3 -> 68) and '24 (80 +-3 -> 75):
# at BLK% 2.6 / p81 his floor would fall with Dirk's, and r99's "anchor the Durants" holds him up. The
# shift by one band width is exactly what separates them — Durant '19 p81 and '24 p83 sit AT or above
# recal_92's bar and do not move a point; Dirk '07 at p72 sits a full band under it. Softer ramps were
# measured and do not reach: over [RIM_GATE, BLK_BAR] Dirk lands rimprot 66, DEF 80.
RIM_BAND_FLOOR = 0.55   # the bottom of the two-stage deterrent band (see ID2 below); card 55
def _novote_floor(blk_pctile, drep=0.0):
    # recal_92's evidence function read one band EARLIER: 1.0 at BLK_BAR, 0.0 a band-width below it.
    # INTEGRATION 159-164 (pipeline 164): a ballot is evidence for the floor exactly as it is for the ceiling
    # (_ceiling_evidence takes max(drep, blocks x DBPM)). Without this, recal_160's half-rate carried ballot
    # and recal_162's graded floor charged the same decayed ballot twice: Jack Sikma '83 (drep 0.51, blk p65)
    # read rimprot 73 against his 78 +-2 pin, and Moses Malone '85 fell 90 -> 85 taking the 76ers '85 dial
    # to 90 against 93 +-2. A no-vote card (drep 0) is byte-identical to recal_162 as landed.
    return RIM_BAND_FLOOR + (NOVOTE_FLOOR - RIM_BAND_FLOOR) * max(_blk_evidence(blk_pctile + (BLK_FULL - BLK_BAR)), min(1.0, max(0.0, drep)))
NOVOTE_CAP = 0.62   # recal_13's no-vote cap, card 61.8. Named by recal_173 so the `novote = min(PD,
# ...)` line below and the relief's clawback read ONE number; the value is recal_13's and unchanged.
def _relief_corroboration(ht, stl_pctile, blk_pctile):
    # recal_173: how much of the pre-2014 DBPM relief ABOVE the no-vote cap the card's own sheet
    # backs. Three existing ramps under a max(), no new constant (see the block at the relief line):
    # recal_35's perimeter band at its upper edge (1.0 through 80 inches, 0 at 88 — the same term
    # PD weights as height_inv and the same 80.0 recal_135 calls the edge of the wing band), and
    # recal_92's evidence band read on the card's own steal rate and on his block rate.
    return max(max(0.0, 1.0 - max(0.0, (ht or 78) - 80.0) / 8.0),
               _blk_evidence(stl_pctile), _blk_evidence(blk_pctile))
RELIEF_BAND_CUT = 0.375   # recal_146 amended: the pre-2014 relief's SIZE fades with its weight
# (see the block at the `if yr < 2014` relief below). 0.375 of no-vote space is subtracted from the
# relief LINE at full band membership; carried at the line's own weight (1 - wv) the deepest cut any
# card can take is 0.375/4 = 0.094, i.e. 9.2 perdef points, and it lands at wv = 0.5 exactly - the
# point where the two channels are most evenly split. Zero at wv = 0 and zero at wv = 1, both ends
# byte-identical by construction.
DBPM_CEIL_BAR, DBPM_CEIL_FULL = 0.0, 1.0   # DBPM band the ceiling grades on; the BLOCK band is
# recal_92's own BLK_BAR/BLK_FULL, reused deliberately - there is ONE definition of "block evidence"
# in this file and both rim gates read it, so a later ruling moves one number, not two.
# recal_165: the MEASURED half of recal_95's ceiling meter, lifted out of _ceiling_evidence
# unchanged (the function below is byte-identical to what it was) so the voted-band unlock can
# read the same thing: does THIS season's own sheet certify the rim protection its ballot claims.
def _measured_rim_evidence(blk_pctile, dbpm):
    dbp = max(0.0, min(1.0, ((dbpm if dbpm is not None else 0.0) - DBPM_CEIL_BAR) / (DBPM_CEIL_FULL - DBPM_CEIL_BAR)))
    return _blk_evidence(blk_pctile) * dbp
def _ceiling_evidence(blk_pctile, dbpm, drep):
    return max(min(1.0, max(0.0, drep)), _measured_rim_evidence(blk_pctile, dbpm))
def dfg_floor(yr, name):
    # recal_20: the floors judge the same series perdef reads; recal_55 widened that to 6ft+.
    # recal_65: VERIFIED — the design side re-reported the floors as still keyed to all-shots; they are
    # not, and have not been since recal_55. The floors consume the derived 6ft+ (diff, att) below,
    # the SAME series the blend reads. The 15ft+ series feeds nothing here (it is what the design side
    # mistook for 6ft+); the Overall series feeds only the blend's 0.30 corroboration (his ruling).
    row = TRACKING.get((yr, 'Outside 6Ft'), {}).get(_nrm(name))
    if not row or not row[1] or min(1.0, row[1] / 350.0) < 0.75: return None
    for _d, _card in DFG_FLOORS:
        if row[0] <= _d: return _card
    return None
try:
    import csv as _csv, os as _os
    _trk = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'tracking_defense.csv')
    with open(_trk, encoding='utf-8') as _f:
        for _row in _csv.DictReader(_f):
            _cat = _row.get('category', 'Overall')
            try:
                _d = float(_row['diff_pct'])
            except (TypeError, ValueError):
                continue
            try:
                _a = float(_row.get('att') or 0) * float(_row.get('gp') or 0)   # the CSV is per game; volume is att x games
            except ValueError:
                _a = 0.0
            TRACKING.setdefault((int(_row['season']), _cat), {})[_nrm(_row['player_name'])] = (_d, _a)
    # recal_55 (his ruling): perdef reads shots from SIX feet out. No category measures it directly,
    # so it is DERIVED: att = overall - lt6, diff = the attempt-weighted remainder. 6-15ft is where
    # slow bigs bleed - floaters, short pull-ups, drives finishing short of the rim - and the 15ft+
    # series was blind to all of it. The rim series (<6ft) keeps feeding rimprot untouched.
    for _yr55 in sorted({_k[0] for _k in TRACKING if _k[1] == 'Overall'}):
        _ov = TRACKING.get((_yr55, 'Overall'), {})
        _l6 = TRACKING.get((_yr55, 'Less Than 6Ft'), {})
        _d6 = {}
        for _n55, (_do, _ao) in _ov.items():
            _dl, _al = _l6.get(_n55, (0.0, 0.0))
            _att55 = max(0.0, (_ao or 0.0) - (_al or 0.0))
            if _att55 <= 0: continue
            _d6[_n55] = (((_do or 0.0) * (_ao or 0.0) - (_dl or 0.0) * (_al or 0.0)) / max(1.0, _att55), _att55)
        TRACKING[(_yr55, 'Outside 6Ft')] = _d6
    print(f"tracking defense loaded: {sum(len(v) for v in TRACKING.values())} rows across {len({k[0] for k in TRACKING})} seasons, categories {sorted({k[1] for k in TRACKING})}")
except FileNotFoundError:
    pass   # inert until the CSV exists

out_players = {}
out_brk = {}
for yr, rows in seasons.items():
    P = {k: pctile([r[k] for r in rows]) for k in ['x2p_per_100','x2p_pct','ftr','blk','drb','stl','dbpm','ht','bpm','ft_pct','usg','team_drtg','mp_v']}
    q3 = sorted(r['x3p_pct'] for r in rows if r['x3p_pct'] is not None and (r['x3pa_per_100'] or 0) >= 2)
    P['_med3'] = q3[len(q3)//2] if q3 else None
    # two-population pd scale (the Pippen fix, evidence-respecting):
    # VOTED defenders (All-D/DPOY credit, drep >= 0.25) are percentiled against each other on 55-99 -
    # max recorded evidence reaches the max. NO-VOTE players keep their shrunk composite, capped at 54
    # (percentiling the shrunk clump re-inflated Luka/Gobert; stray vote shares don't buy the floor).
    tmp = [(r, score_season(r, P)) for r in rows]
    # recal_97: pctile -> pctile_top, the SAME correction recal_53 made for rim protection and never
    # made here. pctile leaves its maximum at (n-1)/n, so the top of the voted band was unreachable
    # by arithmetic: the best-measured voted defender of a season could not be read as the best one.
    # pctile_top maps the maximum to exactly 1.0. (Read pctile_top's own docstring - it says this.)
    Pvot = pctile_top([t[1][3] for t in tmp if t[0]['drep'] >= 0.25])
    # two-stage deterrent scale: a real rim protector (composite >= RIM_GATE) is percentiled WITHIN that
    # class onto 55-99; everyone below caps at 54, so tall men with decent blocks stop riding global
    # percentiles into the high 80s. The anchor term sharpens with it (protection scales anchor/99).
    # TRACKING-MEASURED on-ball defense (2014+, when tracking_defense.csv is present). The slices are
    # kept apart on purpose: shots from 15+ ft are PERIMETER defense (perdef), shots inside 6 ft are
    # rim DETERRENCE (rimprot). Mixing them let a shot-blocking centre's rim work inflate a perimeter
    # rating. A thin sample is discounted toward neutral rather than trusted.
    MIN_ATT = 150.0   # season attempts defended in the slice for full weight; below that, shrink to neutral
    def _trk(cat, name):
        row = TRACKING.get((yr, cat), {}).get(_nrm(name))
        if row is None: return None
        d, att = row
        return d * min(1.0, att / MIN_ATT) if att else None
    def _pct_for(cat):
        vals = [d * min(1.0, a / MIN_ATT) for d, a in TRACKING.get((yr, cat), {}).values() if a]
        return pctile_top(vals) if vals else None
    PERDEF_CAT = 'Outside 6Ft'   # recal_20 chose the outside-paint slice; recal_55 widens it to 6ft+ (derived: overall - rim)
    Pperim = _pct_for(PERDEF_CAT)
    # ALL SHOTS CARRY WEIGHT (his ruling). The 15ft+ series keeps the majority — it is what perimeter
    # defence IS — but every shot he contested is evidence, so the Overall series corroborates at 0.30.
    ALLSHOT_W = 0.30
    Pall = _pct_for('Overall')
    # recal_86 (design-side round "74"; their numbering collides with ours). THE TRACKED BRANCH
    # BECOMES ABSOLUTE. It used to read 1 - percentile(diff), so the value centred wherever the
    # tracked pool happened to sit that season and drifted as the pool changed shape. A percentile
    # RANKS; it does not MEAN. This line anchors the tracked reading on the diff itself, in card
    # space, so 0.0 -> 58 reads "allowed exactly what was expected" in every season ever tracked.
    # Reading of the line: +0.8 -> 54.0 · 0.0 -> 58 · -1.0 -> 63 · -2.0 -> 68 · -3.5 -> 75.5, which
    # sits just under the r16/r20/r55 absolute floor ladder (-1.0 -> 64, -2.0 -> 70, -3.5 -> 76)
    # rather than fighting it: the floors still bind for the men who earn them, by 1 to 0.5 points.
    # Same doctrine that made those floors absolute, and the same as the value-anchored efficiency
    # and playvol rounds. Diff arrives as a FRACTION here and the line is written in percentage
    # points, hence the x100.
    def _abs_perdef(diff, rho=1.0):
        # recal_92: rho regresses the observed diff to the series' measured season-to-season
        # reliability (TRK_RHO at the top of the file) before recal_86's absolute line reads it.
        return min(84.0, max(25.0, 58.0 - 5.0 * (100.0 * diff * rho)))
    _atts = sorted(a for _d, a in TRACKING.get((yr, PERDEF_CAT), {}).values() if a)
    TGT_MED = _atts[len(_atts) // 2] if _atts else None
    # recal_101: 350 -> 500. recal_12 set "full workload = full evidence" at 350 by assertion; the
    # MEDIAN tracked card in this file defends 452 shots from 6ft+ (p75 = 546, p90 = 631), so 350 was
    # the 35th percentile of workload and `samp` saturated for two thirds of the pool. 500 sits just
    # above the median, and it is where the measured reliability curve above has climbed to ~0.47.
    FULL_SAMPLE = 500.0
    def _targeting_weight(name):
        # recal_101: RETIRED, and retired because its premise is measurably BACKWARDS. It assumed a
        # man who defends far more shots than the season median is being HUNTED, so his diff is
        # earned against a harder diet and should be discounted - down to 0.35 at 2.08x the median.
        # Measured over all 6,875 tracked cards, corr(attempts / season median, diff) = -0.068, and
        # the buckets run the wrong way for the assumption at every step:
        #   < 0.5x median  n=2201  mean diff +2.14%  sd 15.11%
        #   0.5-1.0x       n=1233        +1.61%      sd  4.39%
        #   1.0-1.5x       n=1245        +1.07%      sd  3.62%
        #   1.5-2.0x       n=1120        +0.83%      sd  3.16%
        #   2.0-2.5x       n= 725        +0.64%      sd  2.93%
        #   > 2.5x         n= 351        +0.16%      sd  2.62%
        # Men who defend the most shots have BETTER diffs and LESS noise. The term discounted the
        # readings that were both the truest and the most reliable, by up to 65%, and it fought
        # _sample_weight - which rewards the same volume - card for card. One line to restore.
        return 1.0
    def _sample_weight(name):
        row = TRACKING.get((yr, PERDEF_CAT), {}).get(_nrm(name))
        return min(1.0, row[1] / FULL_SAMPLE) if row and row[1] else 0.0
    Prim = _pct_for('Less Than 6Ft')
    RIM_GATE = 0.60
    Prot = pctile_top([t[1][2] for t in tmp if t[1][2] >= RIM_GATE])
    for r, (IN, OUT, ID, PD, TAL, BRK) in tmp:
        out_brk[(r['pid'], yr)] = BRK
        ID = _ID_OWN.get((r['pid'], yr), ID)   # recal_160: the card's own (carried-ballot-gated) ID; Prot above is built on the ungated one
        # the very top SATURATES (0.47 slope, clamped): season smoothing blends a peak with its
        # neighbours, so only a man who is the league's best deterrent for years running lands on 99
        ID2 = min(1.0, RIM_BAND_FLOOR + 0.47 * Prot(ID)) if ID >= RIM_GATE else min(ID, 0.54)   # recal_162: 0.55 named, value unchanged
        if Prim is not None:                                                    # measured rim deterrence, 2014+
            rv = _trk('Less Than 6Ft', r['name'])
            if rv is not None:
                ID2 = min(1.0, 0.65*ID2 + 0.35*(0.10 + 0.90*(1 - Prim(rv))))   # the best measured deterrent reaches the top too
        # recal_53: THE VOTED CEILING — perdef's architecture, mirrored. Block rate is chaseable;
        # deterrence at the elite level is what the league's votes certify. A no-vote rim protector
        # caps at 88; the same graded band perdef uses (drep/0.30, trace shares buy nothing — the
        # Iverson rule) unlocks the rest. The measured tier mirrors the DFG floors: a rim-zone
        # defended-FG% diff of -4.0% or better on a real workload (2014+) lifts the cap to 92 —
        # measurement beats the cap, votes beat both.
        # recal_82 (HIS RULING, verbatim: "So lets change the bar. 0.4 != 1. The more the better").
        # The old bar saturated: min(1, drep/0.30) handed FULL band membership to any reputation at
        # or above 0.30, so a 0.43 fringe vote bought the identical door a unanimous DPOY got, and
        # once inside, the uncapped top held nothing back — which is exactly why Noah '09 read 97.
        # The entry is now GENUINELY GRADED and monotone in reputation, with no plateau below a
        # unanimous vote: w = drep. More reputation always means more, and only 1.00 earns the whole
        # band. Below that a man blends against his own no-vote value (min(ID2, cap), which IS his
        # actual value whenever it sits under the r53 cap), never against a flat number.
        # recal_92 (HIS RULING, verbatim: "Rim prot too high.. Way too high. Should be high 80's or
        # low 90's. Its like def rep took everything"). VOTES CERTIFY A RIM PROTECTOR, THEY CANNOT
        # INVENT ONE. recal_53 built the voted ceiling and recal_82 graded its entry by vote share,
        # but a vote still bought the whole band with no rim evidence behind it at all: All-Defensive
        # teams are awarded for TOTAL defence, and a 6'10" forward can earn them on post and help
        # work while blocking shots at the 81st percentile of his season (McHale '88, blk 2.2%). The
        # unlock is now the vote share TIMES the block evidence: nothing below the 80th percentile of
        # the season's block rate, the whole band at the 86th and above. Below the bar the man keeps
        # exactly what he had without the vote - min(ID2, cap) - which is his own measured value.
        # The r53 measured tier is untouched: elite tracked rim defence still lifts the cap to 92.
        # recal_165 (HIS RULING on Kevin McHale '85, verbatim: "Mchale agree"). THE UNLOCK READS WHICH
        # SEASON THE BALLOT WAS CAST IN, THE WAY recal_160 TAUGHT THE REINFORCEMENT LINE TO. recal_92
        # gated this unlock on block evidence but left its OTHER half, `drep`, ungraded — and drep is a
        # CAREER reputation, decayed 15% a year in BOTH directions, so a season with no ballot at all
        # still buys the voted band with one cast the year before or the year after.
        # THE SUBJECT, MEASURED. Kevin McHale '85: 1.5 blocks a game, BLK% 2.4, DBPM -0.2, NO 1985
        # All-Defensive selection (own 0.000) — and rimprot 93, above Hakeem Olajuwon '85 (94 on BLK%
        # 4.3) and 2 over his own '88 (91), the season he WAS a unanimous 1st-team pick. His BLK% 2.4
        # is 0.1 over 1985's p86, so block evidence is 1.000 and the unlock is his whole drep 0.850 —
        # which is his 1986 1st team carried back one season. The same 2.2 in 1988 is p81 and unlocks
        # 0.233. The vote the '85 card cashes was cast in 1986.
        # THE FORM IS recal_160's, TO THE LETTER: full for the share of drep the season's OWN ballot
        # supplies, discounted for the rest — so a card whose reputation is its own season's ballot is
        # byte-identical (Mutombo '97, Duncan '03, Ben Wallace '04, Gobert '19, Wemby '24, Simmons '21,
        # McHale '86/'87/'88 all own 1.000 and do not move a point on their own season's score).
        # RESTORED BY THE SEASON'S OWN MEASURED RIM EVIDENCE. A carried ballot that the card's own
        # blocks AND DBPM independently certify is not carried evidence at all — the season says the
        # same thing the ballot does — so the rate returns to 1.000 through _measured_rim_evidence,
        # which is recal_95's own ceiling meter (block evidence x the DBPM ramp), refactored out of
        # _ceiling_evidence unchanged. That is what holds Mutombo '00 (BLK% 5.9, DBPM +1.5) whole and
        # with him the Mutombo '01 99 +-0 pin, and Noah '09 and Embiid '23 with theirs. McHale '85's
        # DBPM is -0.2: nothing in his season backs the ballot, and he takes the discount in full.
        # THE RATE IS NOT A NEW FREE CONSTANT (see CARRIED_UNLOCK at the top): it is recal_160's own
        # discount halved, because this gate is already multiplied by block evidence and that one is
        # gated on nothing but height. MEASURED FRONTIER, and it is a NARROW window: 0.50 and 0.60 put
        # the subject on 90 but take Moses Malone '85 — the same 1985 sheet, BLK% 2.4, p87, no ballot,
        # drep 0.700 carried from 1983 — to 85, and the 76ers '85 defdial (recal_133, 93 +-2) is
        # sitting EXACTLY on its floor at 91, so it falls to 90 and breaks. 0.65 breaks it too. 0.80
        # and 0.85 leave the subject at 92, outside 88 +-3. 0.70-0.75 is the whole feasible band and
        # both read the subject 91; 0.75 is the derived value and the roundest one in it.
        # WHY 91 AND NOT 88: with Moses '85 pinned at rimprot 86 by that dial, and his rim sheet
        # identical to the subject's but for drep (0.700 vs 0.850), NO monotone reading of the ballot
        # can drop the subject below the top of his tolerance. Measured over the same window on the
        # band channel too (BLK_FULL 0.86 -> 0.90, the other route to the same unlock), the subject
        # bottoms at the identical 91 and the floor band moves with it. 88 is not reachable while
        # recal_133 stands.
        _own53 = min(r['drep'], max(0.0, rep_by_pid.get(r['pid'], {}).get(yr, 0.0)))   # the ballot THIS season cast
        _carr53 = max(CARRIED_UNLOCK, _measured_rim_evidence(P['blk'](r['blk']), r['dbpm']))
        _w53 = min(1.0, max(0.0, _own53 + _carr53 * (r['drep'] - _own53))) * _blk_evidence(P['blk'](r['blk'])) if r['drep'] > 0.05 else 0.0
        _cap53 = (88 - 1) / 98.0
        _row6 = TRACKING.get((yr, 'Less Than 6Ft'), {}).get(_nrm(r['name']))
        if _row6 and _row6[1] and min(1.0, _row6[1] / 350.0) >= 0.75 and _row6[0] <= -0.040:
            _cap53 = (92 - 1) / 98.0
        # recal_95: the tier above is the CEILING A BIG CAN EARN; what he is actually held to is that
        # tier graded by the evidence behind it (blocks and DBPM), or by his votes, whichever is more.
        # recal_162: the floor of that grading is itself graded by block evidence (see _novote_floor).
        _nf = _novote_floor(P['blk'](r['blk']), r['drep'])
        _cap53 = _nf + (_cap53 - _nf) * _ceiling_evidence(P['blk'](r['blk']), r['dbpm'], r['drep'])
        ID2 = (1 - _w53) * min(ID2, _cap53) + _w53 * ID2
        # GRADED entry to the voted band (the Kawhi-'26 cliff fix): membership is a weight, not a switch.
        # Full selections (drep>=0.35) sit purely in the voted band; fading legends blend down SMOOTHLY;
        # trace votes (<=0.05) still buy nothing (the Iverson rule holds).
        wv = min(1.0, r['drep'] / 0.30) if r['drep'] > 0.05 else 0.0   # recal_20: graded band enters sooner
        novote = min(PD, NOVOTE_CAP)   # recal_13: no-vote cap 0.58 -> 0.62
        # recal_55: PRE-2014 NO-REP DBPM RELIEF, at his "big increase" size. Before tracking exists
        # a no-vote defender had no way past the cap no matter what DBPM said; elite-DBPM unvoted
        # men now reach ~78-80. The negative control holds by construction: a bad DBPM percentile
        # makes 0.28 + 0.52 x P less than the cap he already had, so gamblers move zero.
        # recal_141 (HIS RULING on Ginobili '11, "This should be low 70s not high", and on the pins
        # recal_134 declined against, "Agree with Manu"): THE SLOPE RETIRES ITS OWN PLATEAU, 0.60 ->
        # 0.52. At 0.60 the line hit the 0.80 ceiling at P = 0.867, so EVERY no-vote pre-2014 card in
        # the top 13% of its season's DBPM read the identical maximum - Ginobili '11 (P 0.848, DBPM
        # +1.3), Ron Harper '88, Brent Barry '02, Craig Ehlo '89 and Carlos Delfino '11 all at 78,
        # a plateau, not a ranking. 0.52 reaches the same ceiling only at P = 1.0, so the ceiling is
        # now a single point rather than the top eighth of every season and the class is ordered
        # again. This is recal_82's repair of the voted band applied to the no-vote channel; the gate
        # (pre-2014, no votes) and the 0.80 top are untouched, so no voted card and no 2015+ card can
        # move by construction (the only 2014+ movers are 83 peak_season-2014 cards, through the
        # 20/60/20 season blend's reach back into 2013). recal_57's Caron Butler '08 def 73 +-1 and
        # recal_55's own Vlade Divac '95 perdef 78 +-1 were RELEASED by that ruling and now sit in
        # anchors_superseded.json; they were the two pins recal_134 declined against.
        # recal_146 (HIS RULING on Shaquille O'Neal '94, verbatim: "Confirm 7"): THE RELIEF'S GATE WAS
        # A CLIFF, AND A CARD COULD BE PUNISHED FOR HAVING BEEN VOTED FOR. `drep <= 0.05` is not a
        # statement about a season -- drep is a CAREER reputation, decayed 15% a year in both
        # directions, so a man with no 1994 ballot at all can carry a tail from a vote six years
        # LATER. Shaq '94 carries 0.069 (his 2000 All-D 2nd plus DPOY credit, 0.687, x 0.10 at six
        # years out): 0.019 over the line, which FORFEITED the whole relief line and put him in the
        # voted band at wv 0.23 instead. His '93 -- the same player, a WORSE box line (DBPM 1.5 vs
        # 0.6 is better, but BPM 3.5 against 6.8) -- has drep exactly 0.0, keeps the relief, and reads
        # perdef 64 / DEF 89 against his '94's 45 / 78. Larry Sanders '13 is the same gate from the
        # other side: ONE DPOY ballot, share 0.149, halves to 0.0745, crosses by 0.024, and his card
        # reads perdef 47 where the relief line gives ~71 -- one more ballot LOWERED him by 24.
        # THE FIX IS TO DELETE THE GATE, NOT TO MOVE IT. The relief now applies to the NO-VOTE
        # CHANNEL WHENEVER THE ERA HAS NO TRACKING, and what fades it is the channel's OWN WEIGHT:
        # PD2 = (1 - wv)*novote + wv*(voted band), with wv = min(1, drep/0.30) above the Iverson line.
        # So the relief is paid IN FULL at drep <= 0.05 (wv = 0, byte-identical to before), fades
        # smoothly across 0.05 -> 0.30 exactly as real vote weight takes over, and is worth nothing
        # at drep >= 0.30 (wv = 1, byte-identical again). There is no new constant: the band is the
        # one recal_20 already drew for the voted channel, and the two channels now hand off
        # continuously instead of one of them switching off 0.25 before the other switches on.
        # By construction NOTHING outside 0.05 < drep < 0.30 can move, and nothing can fall: the
        # relief enters through a max() and only ever raises the no-vote channel.
        # recal_146 AMENDED (HIS RULING on the whole of 146, verbatim: "A touch too high for all in
        # 146, try to aim a 2-4 points lower, but in general its better"): THE RELIEF'S SIZE FADES
        # WITH ITS WEIGHT, NOT ONLY ITS WEIGHT. 146 deleted the gate and let recal_114's hand-off do
        # all the fading, but it faded only HOW MUCH OF THE LINE IS READ (1 - wv) and never WHAT THE
        # LINE SAYS. So a card one tick over the Iverson line was still offered the whole relief a
        # man with no certification at all is offered, and the band's readings came out a touch high
        # across the board. The relief is compensation for having no vote to be graded by; the more
        # of the card the votes already grade, the less there is to compensate. The line is therefore
        # re-cut inside the faded band by a single slice proportional to band membership:
        #   min(0.80, 0.28 + 0.52 * P) - RELIEF_BAND_CUT * wv
        # ONE constant, applied to every card in every pre-tracking season by the same rule. Because
        # the cut is carried at the line's own weight (1 - wv), the cost to a card is proportional to
        # wv*(1 - wv): it is exactly zero at wv = 0 (the 5,933 drep <= 0.05 cards recal_141 set stay
        # BYTE-IDENTICAL), exactly zero at wv >= 0.30 (the 860 full-vote cards, byte-identical),
        # and deepest at wv = 0.5, where the two channels are most evenly split and the hand-off is
        # most ambiguous. recal_141's slope (0.52) and ceiling (0.80) are untouched; nothing about
        # WHO the line is offered to changes, only how much of it survives the band.
        # THE MULTIPLICATIVE VARIANT HE ALSO OFFERED was measured on the same pool: line * (1 - k*wv)
        # at k = 0.48 (matched to the same mean cut) is IDENTICAL on Sanders '13, Bol '92, Chandler
        # '05, Mourning '06 and Mutombo '07 and MISSES the two cards he named that sit low on the
        # line - Shaq '94 reads 85 against his re-cut 83 +-2, and Shaq '09 76 against his ~75 -
        # because scaling by the line pays back least where the line is smallest (Shaq '94's relief
        # is 0.643, Shaq '09's 0.488, against 0.78-0.80 for the rest of the band). A card's debt to
        # the band is its band membership, not the size of the favour, so the slice is absolute.
        # recal_173 (HIS RULING on Vlade Divac '02, verbatim: "Agree with 10"): THE RELIEF IS PAID
        # FOR PERIMETER DEFENCE, SO IT IS CORROBORATED BY THE CARD'S OWN DISRUPTION EVIDENCE.
        # THE SUBJECT, TRACED. Vlade Divac '02 read DEF 87, #10 of 226 in 2002, above Shaquille
        # O'Neal '02 (86), David Robinson '02 (85) and Andrei Kirilenko '02 (85) — with no defensive
        # bar at 80 on the card: perdef 77, rimprot 77, perimdisrupt 39, drb 78, discipline 62
        # (76.77 x 1.1305 = 86.8, no clamp, no band). `explain` cannot break perdef down, so the
        # provenance sidecar was read instead, and the whole of that 77 is THIS LINE: his own
        # composite is `novote` = min(PD, 0.62) = 0.3903, i.e. card 39, and the relief line pays
        # 0.7770, i.e. card 77. A 7'1" centre with 1.0 steals a game and BLK% 2.6 is read as the
        # 23rd-best PERIMETER defender of his season by his DBPM alone.
        # WHY THAT IS WRONG AND WHERE IT IS WRONG. DBPM is a TOTAL defensive rating: for a centre it
        # is mostly defensive rebounding and rim deterrence, both of which this file already pays
        # somewhere else (drb has its own attribute, rimprot its own vector, and d_score takes 0.40
        # of rimprot beside 0.40 of perdef). The relief line reads all of it as perimeter defence
        # with nothing on the card agreeing — perimdisrupt 39 flatly contradicts it. This is the
        # Rich Kelley '81 shape too ("How is this 86 DEF with no stat above 80?"): 50 cards read
        # DEF >= 80 with perdef, rimprot, perimdisrupt and drb ALL under 80, and the subject tops
        # that list.
        # THE FORM. The relief's whole purpose is to lift a no-vote card ABOVE recal_13's no-vote
        # cap (0.62, card 61.8) — below the cap the line is inert by construction, exactly as
        # recal_55 said of its negative control. So the part of the line that is claimed back is the
        # part ABOVE THE CAP, and it is paid at the share the card's own sheet corroborates:
        #     relief = NOVOTE_CAP + corroboration x (line - NOVOTE_CAP)      for line > NOVOTE_CAP
        # NO NEW CONSTANT. NOVOTE_CAP is recal_13's own cap, named here and read on the `novote` line
        # above so there is ONE definition of it. The corroboration is three existing ramps under a
        # max(), the same shape _ceiling_evidence uses ("votes, or the season's own measurement"):
        #   - recal_35's PERIMETER BAND, upper edge: 1.0 through 80 inches, zero at 88. Inside the
        #     band the file has already decided the card IS a perimeter defender (this is the same
        #     height_inv term PD weights at 0.309, and the same 80.0 boundary recal_135 calls the
        #     place a card stops being one), so every guard and wing is BYTE-IDENTICAL by
        #     construction — Manu Ginobili '11 (recal_141, 72 +-2), Shawn Marion '06, Ken Norman '94
        #     and every sub-6'9" card in the pool do not move a point.
        #   - recal_92's EVIDENCE BAND read on the card's own STEAL rate, and on his BLOCK rate:
        #     nothing below the 80th percentile of his season, the whole band at the 86th. A tall man
        #     who does disrupt gets the whole relief back through one of them (25 cards are restored
        #     by steals alone — Corey Brewer, Jerome Williams, Kenyon Martin, Nene '03 — and 377 by
        #     blocks). Divac '02 clears neither: steals p42, blocks p81, 0.162 of the block band,
        #     so the perimeter band's 0.375 is the most his sheet says and he keeps the cap plus a
        #     third of the rest.
        # THE FRONTIER AND THE STOPPING PIN, STATED. The verbatim form of the ruling — perimeter
        # evidence ONLY, max(band, steals) with no block channel — was measured first and BREAKS FOUR
        # ANCHORS: Arvydas Sabonis '96 (recal_55, perdef 79 +-1) falls to 64, Larry Sanders '13
        # (recal_146, 67 +-3, already sitting ON its floor at 64) to 63, and the Celtics '08 and
        # Bulls '96 defence dials go -4 and -3. Both of those pinned cards are bigs whose DBPM is
        # rim work and neither has a steal rate: Sabonis '96 is 7'3" at steal p61, Sanders '13 6'11"
        # at p36 — BELOW the subject's p42. No steal-monotone reading can lower Divac without
        # lowering Sanders further, and no height-monotone reading can lower him without lowering
        # Sabonis further (7'3" against 7'1"). The block channel is what separates them and it is
        # not a courtesy: Sabonis blocks at p86 and Sanders at p99, where the subject is at p81.
        # MONOTONE AND SUBTRACTIVE BY CONSTRUCTION: the clawback only ever lowers the relief LINE,
        # the line still enters through max() against the card's own composite, and a card whose
        # line never cleared the cap is untouched — which is why Shaquille O'Neal '94 (recal_146,
        # def 83 +-2, line 0.5569) and Ken Norman '94 (recal_136, def 55 +-3, line 0.3206, ON its
        # floor) are byte-identical, and why 0 of 10,000 cards rise.
        if yr < 2014:
            _relief = min(0.80, 0.28 + 0.52 * P['dbpm'](r['dbpm'])) - RELIEF_BAND_CUT * wv
            if _relief > NOVOTE_CAP:
                _relief = NOVOTE_CAP + _relief_corroboration(r['ht'], P['stl'](r['stl']), P['blk'](r['blk'])) * (_relief - NOVOTE_CAP)
            novote = max(novote, _relief)
        _dmeas101 = None
        if Pperim is not None:   # the season-has-tracking sentinel; recal_86 retired the percentile itself
            dv = _trk(PERDEF_CAT, r['name'])
            if dv is not None:
                # recal_86: 1 - Pperim(dv) (a within-season percentile) -> the absolute card line.
                _r6 = TRACKING.get((yr, PERDEF_CAT), {}).get(_nrm(r['name']))
                d_card = _abs_perdef(dv, trk_rho(_r6[1] if _r6 else None))                                       # a lower defended-FG% diff is a better defender
                # the rest of his workload, blended in. If he has one series and not the other, the
                # one that exists carries the term alone rather than pulling him toward the middle.
                # recal_86 PRESERVES this 0.30 corroboration and maps it through the SAME absolute
                # line. The round's replacement formula reads diff_6plus ALONE, which would delete
                # HIS OWN RULING ("all shots carry weight") as a side effect of a scaling change no
                # part of the round argues for. An owner ruling outranks a design round, so the
                # corroboration stays and is made absolute alongside the series it corroborates —
                # which is the round's actual doctrine. The verbatim single-series variant was
                # measured too; receipt 86 carries both so it is one line to flip on a ruling.
                dv_all = _trk('Overall', r['name'])
                if dv_all is not None:
                    _rov = TRACKING.get((yr, 'Overall'), {}).get(_nrm(r['name']))
                    d_card = (1 - ALLSHOT_W) * d_card + ALLSHOT_W * _abs_perdef(dv_all, trk_rho(_rov[1] if _rov else None))
                d_meas = (d_card - 1.0) / 98.0                                 # card space -> the 0..1 space this branch works in
                # recal_101 (HIS RULING): A FULL TRACKING SEASON IS EVIDENCE, so the ceiling on how
                # much of it is read rises with the sample instead of standing at 0.70 for everyone.
                # The composite it blends against is, for a no-vote card, deliberately uninformative -
                # shrunk toward 0.5 by PD_SHRINK_NOVOTE and capped at 0.62 - so holding 30% back for
                # it at a full sample was holding back for noise. At half a sample the weight is
                # 0.43, at a full one it is 1.00; thin samples still lean on the composite exactly as
                # recal_12 intended.
                _sw = _sample_weight(r['name'])
                wm = (0.70 + 0.30 * _sw) * _targeting_weight(r['name']) * _sw
                _dmeas101 = d_meas
                novote = min(0.84, (1 - wm)*novote + wm*d_meas)
        # recal_97: the band's own top, 0.44 -> 0.45. With 0.44 a FULL percentile mapped to 0.99, i.e.
        # card 98.02 - so 99 was not merely hard to reach on perdef, it did not exist. The band now
        # spans exactly 55 to 99: a perfect untracked sheet (full votes, DBPM at the top of its
        # season, height inside the 6'3"-6'8" band) reads 99 in ANY era, which is the ruling.
        # The floor is untouched at 0.55, so the no-vote cap of 54 and its 55 handoff still meet.
        # recal_114: THE DEDUCTION LANDS ON THE VOTE PREMIUM, NOT ON THE COMPOSITE. Taking it out of PD
        # was measured first and has an unavoidable side effect: PD feeds Pvot, a WITHIN-SEASON
        # percentile, so cutting the double-paid cards RAISES every voted card the round never touched -
        # Scottie Pippen '03 (w53 0.000, untouched by the rule itself) rose 77 -> 79 against his recal_93
        # anchor of 76 +-1 purely by other men falling past him. Applied here instead, to the 0.45 band
        # premium that the votes actually buy, the Pvot pool is BIT-IDENTICAL and nobody rises: every
        # card with _paid_in_rim = 0 reads exactly what it read before, by construction.
        # recal_175: THE CARRIED SHARE OF THE COMPOSITE'S REPUTATION TERM, PAID BY THE SEASON'S OWN
        # MEASUREMENT (see the CONTRA_LO/CONTRA_FULL block at the top of this file). `_cw` is what
        # the PD composite pays for a ballot cast in another year; `_dmeas101` is this season's own
        # tracked perimeter defence, already regressed to its reliability. Where the measurement is
        # at or above the window the card is BYTE-IDENTICAL — which is every own-ballot season
        # (_cw = 0), every no-vote card (_cw = 0), every pre-tracking card (_dmeas101 is None,
        # recal_52's "measured, or not at all"), and every carried ballot the season corroborates:
        # Jrue Holiday '20, Marcus Smart '23, Kobe Bryant '99, Amen Thompson '26, Luguentz Dort
        # '24/'26, Herbert Jones '23, Paul George '17, Avery Bradley '15, Andre Roberson '15.
        # The contradiction is itself paid at recal_12/101's sample weight, so a thin tracking season
        # cannot empty a ballot.
        # THE POOL IS FROZEN, recal_114's and recal_149's doctrine, stated there for this reason: the
        # deduction lands on the CARD'S OWN lookup into Pvot and never on the PD stored in `tmp`, so
        # the within-season voted ranking does not move and NO CARD CAN RISE. `novote` is read off the
        # UNDISCOUNTED composite above, so the no-vote channel and recal_146's pre-2014 relief are
        # byte-identical too — this round can only take band POSITION off a contradicted carry.
        _corr175 = 1.0
        if BRK['_cw'] > 0.0 and _dmeas101 is not None:
            _m175 = 1.0 + 98.0 * _dmeas101
            _c175 = min(1.0, max(0.0, (_m175 - CONTRA_LO) / (CONTRA_FULL - CONTRA_LO)))
            _corr175 = 1.0 - (1.0 - _c175) * _sample_weight(r['name'])
        PDo = PD - (1.0 - CARRIED_REIN) * (1.0 - _corr175) * BRK['_cw']
        PD2 = (1 - wv) * novote + wv * (0.55 + 0.45 * Pvot(PDo) * BRK['_vf'])   # no-vote cap 54 -> 58 (recal 5)
        # recal_101 (HIS RULING on Wembanyama '26, verbatim: "Per def is too low. I understand the
        # 7'4 is an issue but everything else is 10/10"). A VOTED CARD'S FULL-SAMPLE MEASUREMENT MAY
        # RAISE HIM, NEVER LOWER HIM. For wv = 1 the tracked branch was multiplied by zero, so the
        # single best tracked perimeter reading in the pool - Wembanyama '26 at -8.6% over 765 shots
        # - was DISCARDED, and he was ranked purely on a composite that charges his height twice
        # (rep_hf halves his votes above 6'8" AND height_inv zeroes at 7'4"). The band ranks a PROXY
        # built from votes, DBPM and height; the tracked line MEASURES the same thing. Where the
        # measurement is full-sample and says more than the proxy's rank, it is not thrown away.
        # It is a floor, never a ceiling: no voted card is demoted by a tracked reading, so recal_54,
        # recal_82 and recal_97's voted band are untouched for everyone the measurement does not lift.
        if wv > 0 and _dmeas101 is not None and _sample_weight(r['name']) >= 1.0:
            PD2 = max(PD2, _dmeas101)
        # recal_149: the same measurement, read on the band's own scale (see the header block).
        # `_dmeas101` is already regressed by recal_92's reliability curve and already carries his
        # "all shots carry weight" 0.30 Overall corroboration, so the ramp is taken straight off it;
        # recal_12/101's sample weight then decides how much of the band credit a partial season
        # earns, which is why a 285-shot rookie year (Amen Thompson '24, and it measures +1.4%
        # besides) earns none of it. wv carries the trace-vote rule through untouched.
        # RECAL_159 (his ruling on Andre Roberson '15, verbatim: "Can go down to lower mid 80s"):
        # THE BAND CREDIT IS PAID AT THE CARD'S LOAD. recal_149's weight on the credit is a shot
        # COUNT and nothing else — `_sample_weight` is attempts / 500 — so a 19.2-minute bench wing
        # switched onto 328 perimeter shots collected two thirds of a credit that is SIZED (see
        # TRK_BAND_W at the top of this file: "the distance from a season's MEDIAN voted composite to
        # its MAXIMUM") to carry a median voted defender to the TOP of his season's band. Roberson
        # '15 (19.2 mpg, 0.8 spg, 0.4 bpg, BPM -0.7, usg 9, no ballot that season; his drep 0.422 is
        # the 2017 All-Defensive 2nd decayed two years, which puts a no-ballot season inside the
        # voted band) went perdef 82 -> 91 and DEF 81 -> 88 on an unchanged box line, printing above
        # Fat Lever '88 and level with Jrue Holiday '17, who read the same kind of line over 32.7
        # minutes. A COUNT IS NOT A LOAD: the 6ft+ series counts the shots a man was NEAR, and a
        # switch-everything specialist's count rises with his assignment while his season stays a
        # bench season. recal_96/130/145/151/157 all put a load line on a rate paid without one; this
        # was the one term on the DEF side that had none.
        # THE LINE IS MEASURED ON THIS TERM'S OWN CLASS, recal_117's rule, exactly as recal_145 and
        # recal_130 measured theirs: of the 135 cards this credit actually pays (q > 0, sample > 0,
        # wv > 0, and the max() binding), minutes per game run p25 28.40 · median 31.79 · p75 34.04 ·
        # p90 35.85, so BAND_FULL = 34.0 with recal_96's 12-minute foot, below which a load term
        # earns nothing. WHY NOT recal_96's 24-MINUTE BENCH BOUNDARY (measured first, it is the
        # frontier and it is recorded in data/rounds/159.json): 24 minutes sits BELOW this class's
        # own 25th percentile, so a ramp that saturates there is a no-op for 132 of the 135 cards and
        # taxes essentially the subject alone — a load line that only one card can feel is a
        # per-player override wearing a formula's clothes, and it lands him DEF 86, one point outside
        # the ruling. At 34.0 the whole class pays in proportion to what it carried: 48 cards move,
        # every one of them down, the largest perdef move is 7 (Matisse Thybulle '20, 19.8 mpg) and
        # the largest DEF move is 5. The full-time defenders the credit was written for are
        # untouched — Amen Thompson '24/'25/'26 (recal_149's own pins), Draymond '16, Jrue '21,
        # Herbert Jones '23, Dort '25/'26, Kawhi '16/'17 and Marcus Smart '19 are all BYTE-IDENTICAL.
        # NOTHING RISES, AND NOTHING FALLS BELOW ITS PRE-149 VALUE: the term is still a one-way max()
        # read against the same frozen Pvot pool, so this can only shave credit recal_149 added.
        # A card with no minutes on the sheet takes 1.0 — recal_52's "measured, or not at all".
        # RECAL_171 (his ruling on Joakim Noah '15, verbatim: "Agree with 6"): THE CARRIED BALLOT
        # UNLOCKS THE BAND CREDIT ONLY AS FAR AS THE SEASON'S OWN PERIMETER SHEET CERTIFIES IT.
        # recal_149's credit is paid THROUGH wv, and wv = min(1, drep/0.30) — so a card whose whole
        # drep is a ballot CARRIED from another season collects the credit at full band membership
        # exactly as a man voted for THIS season does. Noah '15 is that card: DPOY 2014, no 2015
        # ballot at all (own credit 0.003 against drep 0.850), and the credit took him perdef 73 ->
        # 89 and DEF to 96, tied 2nd of 2015 above Draymond '15. recal_160 drew the line this round
        # applies — "a ballot cast FOR this season is not a ballot carried from another" — and
        # recal_165 gave it its shape on the rim side: the carried share is restored by asking
        # whether THIS season's own sheet certifies the thing the ballot claims (_measured_rim_
        # evidence, blocks x DBPM, because the rim ballot claims deterrence). The perimeter ballot
        # claims PERIMETER DEFENCE, and this file's own perimeter counting stat is the steal rate —
        # it is what `perimdisrupt` is built from (Pa['stl']), and it is the only own-season
        # individual perimeter signal here that is not already inside the credit.
        # NO NEW CONSTANT: the certification IS the within-season steal-rate percentile, read raw
        # off the SAME P['stl'] the rest of the file already builds, with no bar and no ramp — the
        # reason recal_159 rejected the 24-minute boundary applies to any bar drawn here too.
        # WHY NOT THE TRACKED READING ITSELF, AND WHY NOT DBPM. Both were measured and both fail in
        # the direction that matters, because Noah '15 is the BETTER card on each: regressed tracked
        # reading 68.51 against Amen Thompson '26's 65.47 (-3.8% over 625 attempts against -3.2%
        # over 517), DBPM percentile 0.950 against 0.797. Gating on `_q149` or on DBPM would take
        # Amen '26 — recal_149's own pin, def 97 +-2, reading 95 with no slack left — and leave the
        # subject where he is. The steal rate is the one own-season axis that separates them, and it
        # separates them by a distance: Noah '15 is the 22nd percentile of 2015 (0.7 a game over 30.6
        # minutes, STL% 1.1), Amen '26 the 74th of 2026. That is the difference between a centre
        # whose 2014 ballot was a RIM ballot and a wing certifying his own season on the perimeter.
        # WHERE THE FACTOR LANDS, AND THE VARIANT THAT MISSED. It is applied to the credit's PAYMENT
        # (the distance the band credit would carry the card) and not to `_pd149`, the credit's size
        # in composite space. Measured on the whole pool, the composite-space placement lands the
        # subject at perdef 82 / DEF 95, ONE POINT outside 78 +-3, because the same shrink in PD
        # space buys a different number of card points at every point of the Pvot density — Noah '15
        # sits in the dense middle of 2015, so a 78% cut of his composite credit is only a 44% cut of
        # his card points, while Amen '26 is past the top of the 2026 pool and a cut there costs him
        # nothing at all. Unlocking the PAYMENT is the same rule for every card wherever it sits.
        # MONOTONE AND ONE-WAY BY CONSTRUCTION. u lies in [0, 1] and multiplies a max(0, ...), so at
        # u = 1 the line is byte-identical to recal_149 (PD2 + max(0, X - PD2) IS max(PD2, X)), at
        # u = 0 it is byte-identical to pre-149, no card rises, and no card falls below its pre-149
        # value. BYTE-IDENTICAL for every card whose ballot is its OWN (own = drep -> u = 1 exactly):
        # Draymond '15/'16, Kawhi '16/'17/'20, Jrue '21, Marcus Smart '19, Dort '25, Giannis '20,
        # Gobert '21, Anthony Davis '15, Bam Adebayo '20/'21, OG Anunoby '26, Amen Thompson '25,
        # Ben Simmons '21 — and for every card the credit never paid (pre-2014, no vote, q = 0, thin
        # sample): Dort '26, Amen Thompson '24, Herbert Jones '23 is held at 91 by his own p96 steals.
        # MEASURED ON THE POOL: 74 cards move perdef, ALL down, 8 by more than 3; 55 move DEF, one by
        # 4 (Klay Thompson '17); 28 move OVR, none by more than 3. Joakim Noah '15 perdef 89 -> 80,
        # DEF 96 -> 94, and 2015's defensive board reads Kawhi 98 · Davis 96 · Draymond 95 · DeAndre
        # Jordan 94 · Noah 94 instead of Noah tied 2nd. Al Horford '22 (p24 steals, drep 0.255 all
        # carried) 76 -> 69 is the next largest and the class's other end.
        if _dmeas101 is not None:
            _q149 = min(1.0, max(0.0, ((1.0 + 98.0 * _dmeas101) - TRK_BAND_LO) / (TRK_BAND_TOP - TRK_BAND_LO)))
            _dmpg = ((r.get('mp_v') or 0.0) / (r.get('g_v') or 0.0)) if (r.get('g_v') or 0) > 0 else None
            _dload = 1.0 if _dmpg is None else min(1.0, max(0.0, (_dmpg - BAND_FOOT) / (BAND_FULL - BAND_FOOT)))
            _own171 = min(r['drep'], max(0.0, rep_by_pid.get(r['pid'], {}).get(yr, 0.0)))   # the ballot THIS season cast
            _cert171 = P['stl'](r['stl'])   # recal_171: what the season's OWN perimeter sheet certifies
            _u171 = 1.0 if r['drep'] <= 0.0 else min(1.0, max(0.0, (_own171 + _cert171 * (r['drep'] - _own171)) / r['drep']))
            _pd149 = PDo + TRK_BAND_W * _sample_weight(r['name']) * _q149 * _dload   # recal_175: the same discounted composite; recal_171's gate below unchanged
            PD2 = PD2 + _u171 * max(0.0, ((1 - wv) * novote + wv * (0.55 + 0.45 * Pvot(_pd149) * BRK['_vf'])) - PD2)
        # v3: every qualified season is a draftable player. Identity = player + year.
        sc = lambda x: round(1+98*x)
        out_players[(r['pid'], yr)] = dict(
            name=r['name'] + " '" + str(yr)[-2:], player=r['name'], peak_season=yr, _bpm=r['bpm'] or -99,
            talent=round(55+44*TAL), **{'in':sc(IN)}, out=sc(OUT), id=sc(ID2),
            pd=max(sc(PD2), dfg_floor(yr, r['name']) or 0))

players = sorted(out_players.values(), key=lambda x:-x['talent'])
for p in players: p.pop('_bpm')
_seen = {}
for _p in sorted(players, key=lambda x: (x['name'], x['peak_season'])):
    _n = _seen.get(_p['name'], 0)
    _seen[_p['name']] = _n + 1
    if _n: _p['name'] = _p['name'] + ' (' + chr(97 + _n) + ')'
json.dump(players, open('players_stats.json','w',encoding='utf-8'), separators=(',',':'))
print(f"{len(players)} players | talent {players[-1]['talent']}-{players[0]['talent']}\n")
CHECK = ['Kareem Abdul-Jabbar','George Gervin','Larry Bird','Magic Johnson','Michael Jordan','Hakeem Olajuwon','Stephen Curry','Luka Don\u010di\u0107']
print(f"{'player':22s} {'peak':>4s} {'tal':>4s} {'in':>4s} {'out':>4s} {'iD':>4s} {'pD':>4s}")
for nm in CHECK:
    m = sorted([p for p in players if p['player']==nm], key=lambda x:-x['talent'])
    if m: p=m[0]; print(f"{nm:22s} {p['peak_season']:4d} {p['talent']:4d} {p['in']:4d} {p['out']:4d} {p['id']:4d} {p['pd']:4d}")

# ================= FULL 17-ATTRIBUTE SHEET =================
# Doctrine v2: measured, or inferred by a model FITTED on measurements (rim/mid pre-1997 only).
import numpy as np

shoot = {}
for r in load("Player Shooting.csv"):
    try: yr = int(r['season'])
    except: continue
    k = (r['player_id'], yr)
    if k not in shoot or is_tot(r['team']): shoot[k]=r

# per-season feature/target tables
FIT_YEARS = range(1997, 2006)          # fit era: closest style to 1980-96
season_P = {}                           # yr -> percentile fns reused below
rows_by = seasons                       # from main pipeline

def season_pct(yr, keys):
    rows = rows_by.get(yr, [])
    return {k: pctile([r[k] for r in rows]) for k in keys}

# measured rim/mid scores for >=1997
# RECAL_161 (his ruling, item 10: "Can be even heigher than 75", confirmed to land at the frontier
# with "161 confirm"): THE DISCOUNT IS CHARGED AGAINST THE PAINT, SO IT MAY ONLY CARRY THE PAINT'S
# SHARE OF THE STATISTIC IT READS.
# `percent_assisted_x2p_fg` is one number measured over a card's WHOLE two-point diet -- the paint
# finishes AND the jump shots from 10 feet to the arc. The composite one function below charges that
# number, whole, against the PAINT VOLUME TERM and nothing else. For a one-zone diet the two are the
# same object and the charge is exact; for a two-zone scorer it bills the paint for assists collected
# in a zone the term never pays. Karl Malone '00 is the case: 25.5 ppg at 31.2 usage, paint FG .614
# (the 98th percentile of 2000) on the 85th-percentile paint attempt rate, and a MIDRANGE diet LARGER
# than his paint one (7.82 attempts per 100 against 5.81) -- so barely two fifths of the twos behind
# his .776 assisted share are the shots being discounted. The full 45% took his volume percentile from
# p86 to p41 (composite 0.65 x 0.414 + 0.35 x 0.977 = 0.611) and his rim bar read 60, below Chris
# Gatling, Cedric Ceballos, Jahidi White and Keith Van Horn in his own season, 43rd of its 220 cards.
# THE EASING FACTOR IS THE PAINT'S SHARE OF THE TWO-POINT MAKES, which is not a chosen constant but
# the fraction of the statistic that belongs to the zone being charged. It is read on MAKES, not
# attempts, because the statistic itself counts MADE field goals ("percent ASSISTED of 2P FG"), and
# both halves come off the same shooting row the assisted share comes from; three-pointers are
# excluded because the statistic excludes them.
# A ONE-ZONE PAINT DIET IS BYTE-IDENTICAL BY CONSTRUCTION (paint_frac = 1.0), which is the whole
# lob-finisher class: Clint Capela '17 and '18 (paint share of the two-point diet 0.96) move one point
# of rim and hold their OFF pins at 58 and 60, Dereck Lively II '24 moves by zero, and RATINGS_UPDATE's
# "lob finishers score ~60s" doctrine is untouched -- it is a doctrine about ONE-ZONE fully-assisted
# diets, and this term now says so in code instead of taxing every card that shares their assisted
# share. The subject is not that case and the numbers say which: two zones, 25.5 ppg, and more
# midrange attempts than paint ones.
# THE DEADEYE GATE IS NOT TOUCHED AND NO CARD ENTERS OR LEAVES IT. The gate further down this function
# (`creation_factor(sh) >= 0.73`) asks recal_126's CARD-LEVEL question -- is this man's shot-making his
# own -- and calls this function with the default paint_frac, so it reads exactly the number it read
# before this round: the deadeye population is bit-identical and Malone stays outside it at 0.651. What
# changed is only the ATTRIBUTION of the assisted share to the volume term. Opening the gate on the
# eased factor was MEASURED and is REJECTED: it prints the subject at rim 87 and his '99 at 83.
# WHY HIS '97 ALREADY READ 77 ON THE SAME ASSISTED SHARE: it is the DIET RAMP, not the era, and the
# dispatch asked. The two cards' creation factors are the same to three decimals (0.650 vs 0.651) and
# their paint-accuracy percentiles are the same (0.981 vs 0.977); his 1997 paint attempt rate was 7.66
# per 100 against 5.81 in 2000, so the DISCOUNTED volume landed at p57 instead of p41. Both seasons are
# 1997+ and measured, so no era term touches either.
def creation_factor(sh, paint_frac=1.0):
    a2 = f(sh.get('percent_assisted_x2p_fg'))
    return 1.0 if a2 is None else (1 - 0.45*paint_frac*a2)   # 45% max discount for fully-assisted rim diets

def paint_stats(sh):
    # rim = PAINT scoring, 0-10 ft: restraining-circle finishes AND the post-up office (3-10)
    s03 = f(sh['percent_fga_from_x0_3_range']); s310 = f(sh['percent_fga_from_x3_10_range']) or 0
    f03 = f(sh['fg_percent_from_x0_3_range']);  f310 = f(sh['fg_percent_from_x3_10_range'])
    if s03 is None: return None, None
    share = s03 + s310
    fgp = None
    if f03 is not None or f310 is not None:
        w = (s03*(f03 or 0) + s310*(f310 or 0)) / max(1e-9, s03*(1 if f03 is not None else 0) + s310*(1 if f310 is not None else 0))
        fgp = w
    return share, fgp

def rim_mid_measured(r, sh, P, fga100, use_factor=True):
    share, fgp = paint_stats(sh)
    s10  = (f(sh['percent_fga_from_x10_16_range']) or 0) + (f(sh['percent_fga_from_x16_3p_range']) or 0)
    f10a = f(sh['fg_percent_from_x10_16_range']); f10b = f(sh['fg_percent_from_x16_3p_range'])
    fmid = ((f10a or 0)+(f10b or 0))/ (2 if (f10a and f10b) else 1) or None
    if share is None or fga100 is None: return None, None
    # recal_145's load share, hoisted here because RECAL_157 below needs it one term earlier. The two
    # constants and the ramp are recal_145's, byte for byte; only their position in the file moved.
    PREM_FOOT, PREM_FULL = 12.0, 35.7
    _pmpg = ((f(r.get('mp_v')) or 0.0) / (f(r.get('g_v')) or 0.0)) if (f(r.get('g_v')) or 0) > 0 else None
    _pload = 1.0 if _pmpg is None else min(1.0, max(0.0, (_pmpg - PREM_FOOT) / (PREM_FULL - PREM_FOOT)))
    # RECAL_161: the assisted-2P discount is charged against the paint volume, so it carries only the
    # paint's share of the two-point diet it is measured over (1.0 for a one-zone diet = unchanged),
    # and the correction is PAID ON THE SHOTS BEHIND IT -- recal_126's diet ramp, the same shape it
    # uses one screen below for the deadeye floors ("the bar now carries the shots behind it"), on
    # this term's own frontier foot. A card whose paint attempt rate sits below the foot has no
    # second-zone blend to disentangle, only a handful of assisted cuts, so it earns none of the
    # easing and is byte-identical; at the top decile of paint rate the easing is whole. Malik
    # Beasley '23 (rim 16) is the card this ramp is for: without it a single point of rim crossed
    # recal_137's zone-dominance saturation and cost him 3 OFF against his own 58 +-3 pin.
    #
    # THE FOOT IS THE FRONTIER, NOT A CHOSEN NUMBER, AND THE BAND IS NOT REACHED. His ruling asks for
    # more than 75 and this prints 72; he was shown the frontier and confirmed it ("161 confirm").
    # KARL MALONE'S RIM BAR IS PINNED FROM BOTH SIDES BY TWO OF HIS OWN OLDER RULINGS, and the
    # 20/60/20 season smoother makes his four cards one object -- stored '00 = 0.6 x '00 + 0.2 x '99
    # + 0.2 x '01, stored '99 = 0.6 x '99 + 0.2 x '98 + 0.2 x '00:
    #   recal_98 ("How is Karl Malone 99 is 93 OFF?", 90 +-2) reads 92, unrounded 91.95. rim enters
    #     o_score as z[1] at 0.08 x 0.93 = 0.0744 OFF per point, so his '99 rim may rise at most 7
    #     (58 -> 65) before OFF prints the 93 that ruling struck down. Probed card by card on the
    #     shipped pool: rim 58 / 64 / 65 -> OFF 92; rim 66 / 67 / 68 -> OFF 93.
    #   recal_120 ("Jazz 97' pnr Stockton and Malone is more fitting", tests/tactics.test.ts):
    #     styleFit('postup', JAZZ_97) = 63.70 + 0.70 x his '97 rim against a pnr fit of 76.248 that
    #     does not move with rim at all (screenFit reads his MID). They cross at rim 87.93, so his
    #     '97 may rise at most 10 (77 -> 87); at 88 the Jazz stop being a pick-and-roll.
    # NO RAMP ON ANY INPUT THIS FILE HOLDS CAN DO BETTER. His '98 and '00 paint attempt-rate
    # percentiles are 0.849 and 0.855 and their paint shares of two-point makes 0.510 and 0.513, so
    # nothing separates them; and his '97 percentile (0.917) is ABOVE his '00's, so every monotone
    # ramp gives '97 MORE easing than the subject while '97 has ten points of room and the subject
    # needs twelve. Solving the smoother against both caps gives stored '00 <= 71.6.
    # Swept on the whole pool against all 154 anchors and all 411 tests: foot 0.42 and 0.44 put his
    # '99 at rim 66 and his OFF at 93 (recal_98 fails); 0.46, 0.48 and 0.50 all print the same board
    # -- subject 71, '97 87, '99 65 -- and every anchor and every test holds; the attempts-weighted
    # share instead of the makes-weighted one reaches 72 at foot 0.56 but takes his '97 to 89 and
    # flips the Jazz. 0.48 is the MIDPOINT of the feasible window, taken by recal_126's own rule.
    # The full ladder, and a second cliff found in this composite and deliberately left alone
    # (recal_16's elite-conversion floor is gated on a hard `>= 6.0` step: his '98 clears it at 6.19
    # and is floored to rim 71, his '00 misses at 5.81 and keeps 0.611 -- two tenths of an attempt per
    # 100 worth seven points of rim), are recorded in data/rounds/161.json.
    EASE_LO, EASE_HI = 0.48, 0.90
    _diet161 = lambda pv: max(0.0, min(1.0, (pv - EASE_LO) / (EASE_HI - EASE_LO)))
    _mk_p = share * (fgp or 0.0); _mk_m = s10 * (fmid or 0.0)
    _pfrac = _mk_p / (_mk_p + _mk_m) if (_mk_p + _mk_m) > 0 else 1.0
    _pfrac = 1.0 - (1.0 - _pfrac) * _diet161(P['rimvol'](share*fga100))
    rim = 0.65*P['rimvol'](share*fga100*(creation_factor(sh, _pfrac) if use_factor else 1.0)) + 0.35*P['rimfg'](fgp)
    # ELITE-CONVERSION FLOOR (recal_16, widened by recal_19): accuracy AND volume.
    if use_factor and fgp is not None and share * fga100 >= 6.0:
        rim = max(rim, min(0.68, 0.28 + 0.42 * P['rimfg'](fgp) + 0.15 * P['rimvol'](share*fga100)))
    # RECAL_157 (his ruling, "Agree with 9"): THE COMPOSITE'S VOLUME SHARE IS PAID AT THE CARD'S LOAD
    # TOO. recal_145 loaded the +0.07 PREMIUM that sits on top of this composite and wrote in its own
    # COST that "the composite (0.65 vol / 0.35 fg) and both deadeye floors still read RATES ... a
    # later round that wants the composite itself loaded has to say so." This is that round. Seth
    # Curry '23 printed mid 99 -- the only 99 in the pool under 24 mpg -- on 19.9 minutes, 9.2 ppg,
    # BPM -2.1, USG 19.2, with nothing behind the bar but the per-100 composite: the 94th percentile
    # of the 2023 midrange ATTEMPT RATE times 0.65, plus a 94th-percentile conversion times 0.35. He
    # tied Dirk '07 and Jordan '98 and outranked DeRozan '23, which is the ordering shape recal_145
    # ruled against when it cut Jamal Crawford '19 from 99 to 95. recal_51's objection, quoted twice
    # further down this function, applies to the FIRST payment of the rate exactly as it applies to
    # the second: "attempts are a RATE -- per hundred -- so a 17-minute bench finisher can post a
    # starter's attempt rate while carrying no load." So the part of the rate percentile that only a
    # carried workload can justify is now paid at a load share: above VOL_GATE the percentile is
    # scaled toward the gate by the card's load, below it nothing changes, and a card at or above the
    # full-load line is byte-identical. Nothing can rise: the term is a min() against the old value.
    #
    # THE LINE IS recal_96's, NOT recal_145's. recal_117 ruled that "a rate paid twice has to be
    # scaled twice, and the second line is not the bench boundary" -- and recal_145 used that second
    # line (the class's own p75, 35.7) because the premium is the SECOND payment. The composite is
    # the FIRST payment, the card's primary reading of the zone, so its load question is the ordinary
    # one recal_96 settled and recal_151 reused on the defensive side: foot 12, full 24, the bench
    # boundary. Measured both ways: at 35.7 the subject reads the SAME 95 and 1,353 mid bars move
    # (Dirk '18 99 -> 89, Sam Cassell '08 95 -> 84); at 24 it is 168 bars, largest 10, and every card
    # at 24 minutes or more is byte-identical.
    #
    # THE GATE IS THE FRONTIER, NOT A CHOSEN NUMBER. Swept 0.70 (recal_145's own premium gate) to
    # 0.90 in steps of 0.01 against all 150 anchors: at 0.76 and below Jamal Crawford '19 falls to
    # mid 89 and leaves the 93 +-3 band recal_145 earned him -- his composite drops under his own
    # deadeye floor (0.879) and the floor, not this term, sets his bar. 0.77 is the largest step at
    # which every anchor holds. THE TARGET IS NOT REACHED AND THE WALL IS THAT ANCHOR: the ruling
    # asks 93 and the subject lands 95, because his own deadeye floor caps at 0.92 -- to print 93 the
    # floor's DIET would have to be loaded as well, which is measured in data/rounds/157.json and
    # costs Crawford '19 mid 87, four points outside his band.
    VOL_FOOT, VOL_FULL, VOL_GATE = 12.0, 24.0, 0.77
    _vload = 1.0 if _pmpg is None else min(1.0, max(0.0, (_pmpg - VOL_FOOT) / (VOL_FULL - VOL_FOOT)))
    _mvol = P['midvol'](s10*fga100)
    mid = 0.65*(min(_mvol, VOL_GATE + (_mvol - VOL_GATE)*_vload) if use_factor else _mvol) + 0.35*P['midfg'](fmid)
    # zone deadeye (same convexity rule as 3PT): elite conversion on real attempts earns its own path.
    # Applies only to stored attributes (use_factor=True), never to inference training targets;
    # rim deadeye also requires self-creation (assisted-heavy finishing is not shot-making).
    if use_factor:   # HIGH-VOLUME PREMIUM (stored attributes only, never inference targets)
        # RECAL_145 (his ruling, "Confirm 5"): THE HIGH-VOLUME PREMIUM IS PAID AT THE CARD'S LOAD.
        # This is the SAME objection recal_51 wrote and recal_78/126 applied to the two deadeye
        # floors, arriving at last at the bonus sitting directly above them: "attempts are a RATE --
        # per hundred -- so a 17-minute bench finisher can post a starter's attempt rate while
        # carrying no load." The midrange premium is keyed on nothing but the in-zone attempt-rate
        # PERCENTILE, so an 18.9-minute gunner whose whole job is to launch reads the 95th percentile
        # of midrange rate and collects the same full 0.07 a 36-minute first option collects --
        # Jamal Crawford '19 (7.9 ppg, 39.7% FG, TS .522, BPM -3.9) printed mid 99, one of 73 cards
        # on 99 and SIX ABOVE his own 20-ppg '13. It is now scaled by a LOAD SHARE in [0, 1]: a card
        # that carried a full workload keeps the premium whole and is byte-identical, a half load
        # gets half of it, and nothing can rise. No cliff. The minutes come from the `mp` and `g`
        # columns of the Advanced sheet this file already loads (Crawford '19: 1211 / 64 = 18.92),
        # which is the same number recal_96's load_share reads off Player Per Game, so no new input
        # enters the pipeline. The composite and both deadeye floors underneath are untouched: this
        # taxes only the top-quintile-RATE bonus that sits on top of them.
        #
        # THE FULL-LOAD LINE IS NOT THE BENCH BOUNDARY -- recal_117 already ruled this, for the same
        # shape of mistake. recal_96's ramp runs 12 -> 24 minutes because it was cut to answer "did
        # this man play at all" (Capela '17 at 23.9). recal_117 found the creation rate being paid a
        # SECOND time with no load reading and ruled that "a rate paid twice has to be scaled twice,
        # and the second line is not the bench boundary: it is the minutes at which a distributor has
        # actually carried a season's creation" -- then MEASURED that line as the class's own upper
        # quartile of minutes (34.7 of the 834 cards the term pays). This premium is the same object:
        # the composite already pays P['midvol'] at weight 0.65, and the premium pays the TOP of that
        # same percentile AGAIN. So it takes recal_96's SHAPE (a ramp with the 12-minute foot, below
        # which a load term earns nothing) and recal_117's LINE, measured on this term's own class:
        # of the 2,005 cards this premium pays (midrange rate percentile > 0.70, mp >= 1200, 1997+),
        # the 75th percentile of minutes per game is 35.69 (median 32.52, p25 27.61), so PREM_FULL =
        # 35.7. Against recal_96's own 24-minute bench line the subject reads mid 97, ONE POINT
        # outside his band: 24 minutes is not what "high volume" means, and that reading is the
        # frontier of the bench-boundary shape, recorded in data/rounds/145.json.
        #
        # WHY THE PAINT PREMIUM ON THE NEXT LINE IS LEFT ALONE. The objection applies to it word for
        # word and the symmetric change was measured first (942 rim bars fall, none by more than 5).
        # It is NOT taken here because it is not this ruling and it does not pay for itself: the two
        # cards it moves by a single point are Deandre Ayton '26 (27.2 mpg, rim 71 -> 70) and Erick
        # Dampier '07 (25.2 mpg, 58 -> 57), and those two points re-decide a screen tie-break and a
        # starting five that two of his OWN earlier rulings pinned in tests/court.test.ts (recal_120,
        # "Why is Ayton out and James in? Makes no sense") and tests/campaigns.test.ts (recal_142).
        # A round does not spend an old ruling to buy tidiness in a term the new ruling never named.
        # The paint premium keeps the unloaded rate and its class line is measured and on the record
        # (2,004 cards, p75 34.95) so a paint ruling can turn it on in one line. STILL TRUE AFTER
        # recal_166 below: that round gave the paint premium the CREATION discount, not the LOAD
        # share, so the paragraph above is the open door it always was and Ayton '26 / Dampier '07
        # are untouched.
        #
        # RECAL_166 (his ruling, "166 confirm", on the scout's "Eddy Curry '04 rim 86, near 78"):
        # THE PAINT PREMIUM READS THE SAME CREATION-DISCOUNTED RATE THE COMPOSITE READS. ONE CLAIM,
        # ONE DISCOUNT. This is the objection the paragraph above deferred, arriving at last with a
        # ruling behind it. The composite one term up discounts the paint attempt rate by
        # creation_factor -- Eddy Curry '04's 8.61 attempts per 100 become 5.79 and his percentile
        # 0.991 becomes 0.813 -- and THIS line then re-read the SAME rate UNDISCOUNTED at 0.991 and
        # paid the full +0.0679, seven card points, as if a man with 72.6% of his makes assisted had
        # created that volume himself. He converted 53.2% of it, the 57th percentile of 2004, on
        # BPM -2.8 and 14.7 ppg. A rate discounted once and then paid twice is the same double
        # payment recal_117 named ("a rate paid twice has to be scaled twice") and recal_157 fixed on
        # the midrange composite; the premium is simply the last place in this function where the
        # undiscounted rate was still readable. It now reads share*fga100*creation_factor(sh), the
        # identical expression the composite reads, so a card's paint VOLUME enters its bar exactly
        # once and at one scale.
        #
        # THE SHAPE IS DELIBERATELY UNTOUCHED: the gate is still 0.70, the payment still 0.07 over a
        # 0.30 band, and the POOL still stays raw (see vol_rim below -- "adjusted value ranks as
        # self-created-equivalent volume"). Nothing rises anywhere on the board: 2,003 rim bars fall,
        # ZERO rise, the largest move is 7 (Moritz Wagner '24) and 423 move by more than 3. The
        # self-created finishers the premium was written for are untouched -- Zion '24 (assisted2p
        # .474) keeps 0.0649 of 0.0690 and is BYTE-IDENTICAL at 88, Shaq '00-'02 read 0.995 on both
        # scales and hold rim 99, Hakeem '93/'94 and Moses '82/'85 do not move a point. What falls is
        # exactly the assisted diet: Capela '18 .992 -> .784, Nene '11 .909 -> .600, Sabonis '21
        # .927 -> .641, the subject .991 -> .813.
        #
        # THE SUBJECT LANDS AT 82, NOT 78, AND HE CONFIRMED 82. His pre-smooth bar is 79 -> 75; the
        # 20/60/20 season blend then averages him with his own '03 (98 -> 91) and '05 (93 -> 86),
        # which are the SAME assisted shape and carry 40% of the card, so 86 -> 82. 78 is not
        # reachable through this term: the neighbours would have to be cut too, and the smoother is
        # not a per-card knob. Measured and recorded in data/rounds/166.json.
        #
        # TWO OF HIS OWN OFF PINS WERE RELEASED BY ONE POINT TO LET THIS LAND, BY HIS EXPLICIT WORD.
        # r52's Clint Capela '18 off 61 +-1 and r139's Nene '11 off 66 +-2 were both already standing
        # on the FLOOR of their bands (60 and 64) with zero room down, and both are assisted-diet
        # bigs, so the discount takes each one point lower. They are in data/anchors_superseded.json
        # with his reason and re-pinned at 60 +-2 and 65 +-2. Every other anchor holds untouched.
        # REJECTED, each measured on the whole pool: scaling the discount by t in [0,1] (t <= 0.10
        # holds the OLD pins and moves the subject by ZERO, t = 0.15 already takes Nene out, so there
        # was no partial form to hide behind); ranking the discounted value against a DISCOUNTED pool
        # instead of this file's raw one (the subject keeps 0.0615 of 0.0679, six tenths of a point);
        # and deleting the premium outright (the subject reaches 79 but Shaq '00-'02 fall to rim 97
        # and Zion '24 to 81, which is the volume-first doctrine itself, and 8 anchors fail).
        #
        # ONE COST THIS ROUND DOES PAY, AND IT IS THE ONE recal_145 ABOVE REFUSED TO PAY, NAMED BY
        # CARD: Deandre Ayton '26 is an assisted-diet big and his rim goes 71 -> 68, so his screenFit
        # (min(max(rim, mid), efficiency) in src/engine/tactics.ts) goes 71 -> 70 and no longer TIES
        # Rui Hachimura '26's 71. The tie was what handed Ayton the screen, via that file's own
        # roll tie-break (rim 71 to 27); without it Hachimura takes the screen and the pick-and-roll
        # set stands Ayton (3pt 4) IN A CORNER, failing tests/court.test.ts's "a man who cannot shoot
        # is never sent out to space the floor". THE BAR IS RIGHT AND THE FLOOR IS WRONG: the defect
        # is that the set corners the non-screener big at all. It cannot be reached from this file
        # without a per-player override and is flagged in data/rounds/166.json for the engine/ui lane.
        # PREM_FOOT / PREM_FULL / _pmpg / _pload are recal_145's, unchanged; recal_157 hoisted them to
        # the top of this function because the composite one term above now needs the same minutes.
        rim = min(1.0, rim + 0.07*max(0.0, (P['rimvol'](share*fga100*creation_factor(sh)) - 0.70)/0.30))
        mid = min(1.0, mid + 0.07*_pload*max(0.0, (P['midvol'](s10*fga100) - 0.70)/0.30))
        # RECAL_78 (his ruling, "Ty jerome still 82 OFF"): THE DEADEYE FLOORS ASK r51'S LOAD QUESTION.
        # These two floors pay 85% on ACCURACY and override the volume-first composite above them, and
        # their only gate was a RATE (2.5 attempts per 100). recal_51 already wrote the objection, for
        # the paint bonus: "attempts are a RATE — per hundred — so a 17-minute bench finisher can post
        # a starter's attempt rate while carrying no load." The floors never got the same treatment, so
        # a hot 88-shot midrange bought a 0.92-capped rating. The floor's LIFT is now scaled by the
        # real attempt COUNT against the median full-season sample in that zone (mid 105, rim 174,
        # measured over every card with mp >= 1200). A full sample keeps the floor exactly as before;
        # a half sample gets half the lift. No cliff (r43), and nobody with a real sample moves.
        # RECAL_126 (his ruling, "Stockton became overrated, on OFF"): THE FLOOR PAYS FOR A DIET,
        # NOT FOR A SAMPLE. recal_78 above scaled the floor's lift by the real shot COUNT and left
        # its other gate a CLIFF: 2.5 attempts per 100, clear it by a tenth and 85%-on-accuracy is
        # paid in full. A RATE that low does not describe a zone the card lives in, so the floor was
        # handing a specialist's bar to a bottom-quintile diet -- Kevin Durant '26 reads PAINT 82 on
        # a rim-attempt rate at the 18th percentile of 2026, Payton Pritchard '25 75 at the 16th and
        # Nicolas Batum '14 72 at the 15th, while Anthony Carter '08 reads MID 76 on 2.64 attempts
        # per 100 and Shane Battier '03 74 on 2.57. The bar now carries the shots behind it in
        # BOTH dimensions: recal_78's count ramp, times the card's own in-zone attempt-rate
        # PERCENTILE, ramped from DEYE_LO to DEYE_HI. The percentile is within-season and per-zone,
        # so the ramp is era-neutral by construction (Stockton's 3.13 midrange attempts in 1997 rank
        # ABOVE his 3.28 in 2001, and his '97 card keeps more of the floor than his '01 card does).
        # No cliff is added and one is removed: the lift now goes to zero continuously and the card
        # falls back on the volume-first composite it earned. The 2.5-per-100 gate stands underneath.
        # THE BAND IS THE FRONTIER, NOT A FITTED PAIR. Swept 0.25/0.75, 0.30/0.80, 0.35/0.85,
        # 0.40/0.80, 0.40/0.90, 0.50/0.90 and 0.50/1.00 on the whole pool: the subject SATURATES at
        # OFF 86 for every foot >= 0.40 (his mid diet is the 42nd percentile, his rim the 45th), so
        # the setting is not chosen against him. 0.40/0.90 is the least collateral that reaches the
        # saturation point AND keeps Stockton '97 strictly above '01, which is the order he ruled.
        DEYE_LO, DEYE_HI = 0.40, 0.90
        _diet = lambda pv: max(0.0, min(1.0, (pv - DEYE_LO) / (DEYE_HI - DEYE_LO)))
        _poss78 = (f(r.get('mp_v')) or 0.0) * lgpace.get(int(r['season']), 100.0) / 48.0
        _lift = lambda base, floor, att, ref, pv: base if floor <= base else base + (floor - base) * max(0.0, min(1.0, att / ref)) * _diet(pv)
        if fgp is not None and share*fga100 >= 2.5 and creation_factor(sh) >= 0.73:
            rim = _lift(rim, min(0.92, 0.85*P['rimfg'](fgp) + 0.15*P['rimvol'](share*fga100)), share*fga100*_poss78/100.0, 174.0, P['rimvol'](share*fga100))
        if fmid is not None and s10*fga100 >= 2.5:
            mid = _lift(mid, min(0.92, 0.85*P['midfg'](fmid) + 0.15*P['midvol'](s10*fga100)), s10*fga100*_poss78/100.0, 105.0, P['midvol'](s10*fga100))
    return rim, mid

# build fit matrices
X, Yr, Ym = [], [], []
attr_store = {}    # (pid,yr) -> dict of extras
for yr in sorted(rows_by):
    rows = rows_by[yr]
    base = season_pct(yr, ['x2p_pct','ft_pct','ftr','ht','x2p_per_100','usg','ts'])
    if yr >= 1997:
        vol_rim, fg_rim, vol_mid, fg_mid = [],[],[],[]
        packs = []
        for r in rows:
            sh = shoot.get((r['pid'], yr)); 
            if not sh: packs.append(None); continue
            fga100 = (r['x2p_per_100'] or 0) + (r['x3pa_per_100'] or 0)
            share, fgp = paint_stats(sh)
            s10=(f(sh['percent_fga_from_x10_16_range']) or 0)+(f(sh['percent_fga_from_x16_3p_range']) or 0)
            packs.append((sh,fga100))
            if share is not None: vol_rim.append(share*fga100); fg_rim.append(fgp)   # pool stays raw: adjusted value ranks as self-created-equivalent volume
            vol_mid.append(s10*fga100)
            fa,fb=f(sh['fg_percent_from_x10_16_range']),f(sh['fg_percent_from_x16_3p_range'])
            fg_mid.append(((fa or 0)+(fb or 0))/(2 if (fa and fb) else 1) or None)
        P2 = dict(rimvol=pctile(vol_rim), rimfg=pctile(fg_rim), midvol=pctile(vol_mid), midfg=pctile(fg_mid))
        for r, pk in zip(rows, packs):
            if not pk: continue
            rim, mid = rim_mid_measured(r, pk[0], P2, pk[1])                     # discounted -> stored for the player
            rim_raw, mid_raw = rim_mid_measured(r, pk[0], P2, pk[1], use_factor=False)  # raw -> training target
            if rim is None: continue
            sh2, fga2 = pk[0], pk[1]
            share2, fgp2 = paint_stats(sh2)
            s10b = (f(sh2['percent_fga_from_x10_16_range']) or 0) + (f(sh2['percent_fga_from_x16_3p_range']) or 0)
            fa2, fb2 = f(sh2['fg_percent_from_x10_16_range']), f(sh2['fg_percent_from_x16_3p_range'])
            fmid2 = ((fa2 or 0) + (fb2 or 0)) / (2 if (fa2 and fb2) else 1) or None
            a22 = f(sh2.get('percent_assisted_x2p_fg'))
            attr_store[(r['pid'],yr)] = dict(rim=rim, mid=mid, measured=True, comps=dict(
                rv=None if share2 is None else round(share2*fga2, 2), rf=None if fgp2 is None else round(fgp2, 3),
                a2=None if a22 is None else round(a22, 3), mv=round(s10b*fga2, 2), mf=None if fmid2 is None else round(fmid2, 3)))
            if yr in FIT_YEARS:
                ue = base['usg'](r['usg']) * base['ts'](r['ts'])   # volume x efficiency: sustained elite eff at max load = self-created zone mastery
                X.append([1, base['x2p_pct'](r['x2p_pct']), base['ft_pct'](r['ft_pct']), base['ftr'](r['ftr']), base['ht'](r['ht']), base['x2p_per_100'](r['x2p_per_100']), base['usg'](r['usg']), ue])
                Yr.append(rim_raw); Ym.append(mid_raw)

X=np.array(X); Yr=np.array(Yr); Ym=np.array(Ym)
br,*_ = np.linalg.lstsq(X, Yr, rcond=None); bm,*_ = np.linalg.lstsq(X, Ym, rcond=None)
r2 = lambda y,p: 1 - ((y-p)**2).sum()/((y-y.mean())**2).sum()
print(f"\nrim/mid inference fit on {len(X)} player-seasons (1997-2005): R2 rim={r2(Yr,X@br):.2f}, mid={r2(Ym,X@bm):.2f}")
# measured superstar residual: how far do elite volume-x-efficiency players ACTUALLY sit above the model?
ue_col = X[:, 7]
hi = ue_col >= 0.70
RES_RIM = float((Yr[hi] - (X@br)[hi]).mean()) if hi.sum() > 10 else 0.0
RES_MID = float((Ym[hi] - (X@bm)[hi]).mean()) if hi.sum() > 10 else 0.0
print(f"superstar residual (ue>=0.70, n={int(hi.sum())}): rim +{RES_RIM:.3f}, mid +{RES_MID:.3f}")
# DESIGN UPLIFT (declared, not inferred): the fitted residual is ~0 - the measured era does not support extra
# zone credit for volume x efficiency. Tomer's design ruling says inferred-era megastars must read like megastars,
# so this is a bounded feel knob tied to the measured ue signal, applied to INFERRED seasons only.
UPLIFT_RIM, UPLIFT_MID = 0.11, 0.09
# PRE-1997 MIDRANGE: FREE THROWS AND VOLUME CARRY IT (Tomer's ruling).
# The inferred era has no shot-location data, so the fitted model reads midrange mostly off 2P% — which
# for a jump-shooting forward is diluted by his layups. The two honest signals for a middy are the
# stroke (FT%) and how much he shot (2PA/100), so both are lifted out of the model and given their own
# weight. Rim is untouched: a finisher's evidence is not his free throw line.
# 0.45 is the FT COEFFICIENT, not the weight: the weight is 0.45 x his 2P-volume percentile, so a man
# who never shot gets none of it. Calibrated on Tomer's mark — Bird '82 (51% on 2s, 86% FT, 22 2PA/100)
# reads 88, inside the 88-90 he called for. MID_VOL_W is left at the 0.25 it has always been; volume
# gains its extra say through w_ft rather than by pushing the low-volume population down.
MID_FT_W, MID_VOL_W = 0.45, 0.25

# infer for pre-1997 seasons
for yr in sorted(rows_by):
    if yr >= 1997: continue
    base = season_pct(yr, ['x2p_pct','ft_pct','ftr','ht','x2p_per_100','usg','ts'])
    for r in rows_by[yr]:
        ue = base['usg'](r['usg']) * base['ts'](r['ts'])
        x = np.array([1, base['x2p_pct'](r['x2p_pct']), base['ft_pct'](r['ft_pct']), base['ftr'](r['ftr']), base['ht'](r['ht']), base['x2p_per_100'](r['x2p_per_100']), base['usg'](r['usg']), ue])
        ramp = max(0.0, min(1.0, (ue - 0.62) / 0.28))
        vol = base['x2p_per_100'](r['x2p_per_100']); p2 = base['x2p_pct'](r['x2p_pct'])
        ftp = base['ft_pct'](r['ft_pct'])
        rim_m = 0.75*float(np.clip(x@br,0,1)) + 0.25*vol   # volume-first holds in inference too (Steve Johnson rule)
        # FT% EARNS ITS WEIGHT IN PROPORTION TO HOW MUCH HE SHOT. Flat FT weight reads a stroke off men
        # who never took a jumper — Caldwell Jones '86 went 9 -> 30 on his free throws alone. Scaling by
        # the 2P-volume percentile keeps the signal where the phrase "high-volume middy" points.
        w_ft = MID_FT_W * vol
        mid_m = (1.0 - w_ft - MID_VOL_W)*float(np.clip(x@bm,0,1)) + w_ft*ftp + MID_VOL_W*vol
        if p2 < 0.40:                                      # low-2P% clamp: the FT-touch proxy can't outrun the actual shooting (Murphy rule)
            cap2 = 0.45 + 0.55*p2; rim_m = min(rim_m, cap2); mid_m = min(mid_m, cap2)
        attr_store[(r['pid'],yr)] = dict(rim=float(np.clip(rim_m + ramp*UPLIFT_RIM, 0, 1)), mid=float(np.clip(mid_m + ramp*UPLIFT_MID, 0, 1)), measured=False,
            feats=[r['x2p_pct'], r['ft_pct'], r['ftr'], r['ht'], r['x2p_per_100'], r['usg'], round(ue, 3), round(ramp, 3)])

# assemble full 17 sheet on each player's already-chosen peak season
# CAREER-CROSSING ZONE EVIDENCE: an inferred season borrows from the player's OWN measured years.
# His ruling shrank the window to two seasons — a prime year must not reach a decline phase.
CROSS_W, CROSS_SPAN = 0.45, 2
_crossed = 0
for (pid, yr2), ex in list(attr_store.items()):
    if ex.get('measured') or yr2 >= 1997: continue
    near = [attr_store[(pid, y)] for y in range(yr2 + 1, yr2 + 1 + CROSS_SPAN)
            if (pid, y) in attr_store and attr_store[(pid, y)].get('measured')]
    if not near: continue
    mr = sum(n['rim'] for n in near) / len(near)
    mm = sum(n['mid'] for n in near) / len(near)
    ex['cross'] = [len(near), round(ex['rim'], 3), round(ex['mid'], 3), round(mr, 3), round(mm, 3)]
    ex['rim'] = (1 - CROSS_W) * ex['rim'] + CROSS_W * mr
    ex['mid'] = (1 - CROSS_W) * ex['mid'] + CROSS_W * mm
    _crossed += 1
print(f'career-crossing zone evidence: {_crossed} inferred seasons blended with measured years')
pf100 = {}
for r in load("Per 100 Poss.csv"):
    k=(r['player_id'], r['season'])
    if k not in pf100 or is_tot(r['team']): pf100[k]=r
by_pid_yr = {(r['pid'], r['season']): r for yr in rows_by for r in rows_by[yr]}
prov = {}

for yr in sorted(rows_by):
    rows = rows_by[yr]
    P = season_pct(yr, ['ft_pct','ftr','x2p_pct','ht','x2p_per_100'])
    Pk = {k: pctile([f(pf100.get((r['pid'],str(yr)),{}).get(kk)) for r in rows]) for k,kk in
          [('orb','orb_per_100_poss'),('pf','pf_per_100_poss')]}
    hts = sorted([x['ht'] or 78 for x in rows]); ht_q75 = hts[int(0.75*len(hts))]
    Pk['pf_big'] = pctile([f(pf100.get((x['pid'],str(yr)),{}).get('pf_per_100_poss')) for x in rows if (x['ht'] or 78) >= ht_q75])
    Pk['pf_sml'] = pctile([f(pf100.get((x['pid'],str(yr)),{}).get('pf_per_100_poss')) for x in rows if (x['ht'] or 78) < ht_q75])
    Pa = {k: pctile([r2v for r2v in ([rr.get(k) for rr in rows])]) for k in ['drb','ast','stl','usg','ts','dbpm','blk','tov_pct']}
    # ballsec: turnovers per play USED (TOV%), with an allowance for creation load (AST% - passing
    # manufactures turnovers). Usage-relative and creation-adjusted, so it no longer punishes anyone who
    # merely touched the ball. Inverse within-season percentile.
    bsec = lambda rr: None if rr.get('tov_pct') is None else rr['tov_pct'] - 0.11 * (rr.get('ast') or 0)
    P_bsec = pctile([bsec(rr) for rr in rows])
    # recal_28 volume, recal_34 ballsec v4: the two percentiles the sheet now needs
    _vol = lambda rr: (rr.get('usg') or 20) * (1 - (rr.get('tov_pct') or 13) / 100.0)
    Pvol = pctile([_vol(rr) for rr in rows])
    # recal_79 (design-side "71") part 1: an assist that produces a made shot ENDS the possession, so
    # it counts as more than half of one in the responsibility denominator. 0.5 -> 0.8 ast.
    _bsec = lambda rr: (rr.get('tov_pct') or 13) * 25.0 / max(10.0, (rr.get('usg') or 20) + 0.8 * (rr.get('ast') or 15))
    Padj = pctile([_bsec(rr) for rr in rows])
    hts = sorted([x['ht'] or 78 for x in rows])
    ht_t33, ht_t67 = hts[int(0.33*len(hts))], hts[int(0.67*len(hts))]
    _cls = lambda h: 'pf_big' if h >= ht_t67 else ('pf_wng' if h >= ht_t33 else 'pf_grd')
    _pf = lambda x: f(pf100.get((x['pid'],str(yr)),{}).get('pf_per_100_poss'))
    for _k in ('pf_grd', 'pf_wng', 'pf_big'):
        Pk[_k] = pctile([_pf(x) for x in rows if _cls(x['ht'] or 78) == _k])
    g_p = pctile([f(by_pid_yr[(r['pid'],yr)].get('mp_v')) for r in rows])
    # the Brandon Clarke rule: talent is a PER-MINUTE claim too, and shrinks toward the season median.
    _tals = sorted(out_players[(x['pid'], yr)]['talent'] for x in rows if (x['pid'], yr) in out_players)
    TAL_MED = _tals[len(_tals) // 2] if _tals else 50
    for r in rows:
        pid=r['pid']
        p = out_players.get((pid, yr))
        if p is None: continue
        s100 = pf100.get((pid,str(yr)),{})
        ex = attr_store.get((pid,yr), dict(rim=0.5,mid=0.5,measured=False))
        ast_tov = None
        a,t = f(s100.get('ast_per_100_poss')), f(s100.get('tov_per_100_poss'))
        if a and t: ast_tov = a/t
        sc = lambda x: round(1+98*max(0,min(1,x)))
        # recal_79 credit ramp, HIS AMENDMENT: the floor is 2.0, not the round's 1.5, and full credit
        # still lands at 4.0 — so the span is 2.0. The round's own negative control, Westbrook '17,
        # sits at AST/TOV 1.91 and therefore took credit 0.16 under the 1.5 floor and breached the
        # round's <=2 red line; at 2.0 he takes ZERO and the r56 class is protected as intended.
        _credit = 0.0 if ast_tov is None else max(0.0, min(1.0, (ast_tov - 2.0) / 2.0))
        # recal_116 (HIS RULING, verbatim: "This is way too much ball sec for a very turnover prone
        # guy. In addition to the OFF being a touch heigher than Id like it to be.. More around 85").
        # THE CREATION ALLOWANCE WAS DIVIDING THE SAME FACT OUT TWICE. TOV% is already turnovers per
        # play USED; Padj then divides that by usage + 0.8*AST% a second time. At USG 38.4 / AST% 47
        # the allowance nearly DOUBLES the denominator, so Westbrook '15 lands on the 1.2nd percentile
        # of 2015's adjusted rate while turning it over 4.4 times a night — and on that leg he is
        # indistinguishable from Jordan '89 (0.012 vs 0.005). The adjusted leg cannot tell those two
        # apart at all; only the raw leg can (0.653 vs 0.250). So the RAW LEG'S CEILING rises,
        # 0.45 -> 0.54, and the credit ramp deepens with it, 0.20 -> 0.29, which leaves the FLOOR at
        # 0.25 EXACTLY where recal_79 put it: a passer whose AST/TOV clears 4.0 reads byte-identical,
        # and the whole move is charged to the man whose assists do not cover his turnovers.
        # 0.54 IS THE FRONTIER, NOT A CHOSEN NUMBER. Swept 0.52 / 0.53 / 0.54 / 0.545 / 0.55 / 0.60 /
        # 0.65 / 0.70 / 0.75 with the floor pinned. At 0.55 Jordan '89 OFF reads 97 against r102's
        # 99 +-1 and at 0.60 Sabonis '21 OFF reads 69 against r55's 71 +-1; 0.545 buys Westbrook
        # nothing over 0.54. This is the largest step with every standing anchor intact.
        # THREE OTHER SHAPES WERE MEASURED AND FAIL. (a) The raw leg re-read as turnovers per 100
        # POSSESSIONS (the literal "4.4 a game") reaches Westbrook 54, but it is not usage-relative at
        # all, so it charges every man who touches the ball: Jordan '88 95 -> 65 and the ballsec top
        # 12 becomes low-usage spot-up shooters. (b) The same substitution inside Padj's NUMERATOR
        # breaks 17 anchors, Jordan '88 ballsec included. (c) Shrinking the 0.8 assist coefficient,
        # which recal_108 also swept: at 0.30 Westbrook only reaches 64 and Stockton '90 falls
        # 62 -> 41; at 0.00 he reaches 58 and Stockton falls to 17, Kidd '99 55 -> 24, Magic '89
        # 64 -> 35. A gap cap on the allowance dies the same way — the passers' raw-minus-adjusted
        # gaps (Stockton +0.799, Magic +0.771, Kidd +0.683) are LARGER than Westbrook's +0.640.
        # The allowance is right for the passers it was built for; what was wrong was how loud it
        # was against the raw fact.
        _wraw = 0.54 - 0.29 * _credit
        p['attrs'] = dict(
            # mid hardened globally (^1.15): the top barely moves, the 60-85 band compresses a few points
            **{'3pt': sc((p['out']/99)**1.12)}, rim=sc(ex['rim']),
            mid=min(99, sc(ex['mid']**1.15) + round(3.5 * max(0.0, min(1.0, (yr - 2015) / 8.0)) if ex['measured'] else 0)),
            rim_mid_measured=ex['measured'],
            ft=round(100*(r['ft_pct'] or 0)),   # doctrine: FT is the pure stat itself
            fouldraw=sc(P['ftr'](r['ftr'])),
            orb=sc(Pk['orb'](f(s100.get('orb_per_100_poss')))**1.15), drb=sc(Pa['drb'](r['drb'])**1.15),
            playvol=sc(0.6*Pa['ast'](r['ast'])**1.12 + 0.4*max(0.0, min(1.0, (r['ast'] or 15)/44.0))),
            # recal_79 part 2: the RAW side (r56's 0.45) is blind to assists — a passer's turnovers were
            # charged exactly like a ball-stopper's. Its weight now shrinks for genuinely efficient
            # passers ONLY, keyed on AST/TOV and not on passing VOLUME, so r56's class does not move.
            ballsec=sc(1 - ((1 - _wraw) * Padj(_bsec(r)) + _wraw * Pa['tov_pct'](r.get('tov_pct')))),
            # efficiency hardened globally (^1.30): the median reads ~40, elite stays elite
            volume=sc(Pvol(_vol(r))**1.15),
            efficiency=sc(0.5*Pa['ts'](r['ts'])**1.05 + 0.5*(0.5 + ((r['ts'] or lg_ts.get(yr, 0.545)) - lg_ts.get(yr, 0.545))*6)),
            durability=sc(g_p(f(by_pid_yr[(pid,yr)].get('mp_v')))),
            rimprot=p['id'], perimdisrupt=sc(Pa['stl'](r['stl'])**1.30), height=round(r['ht'] or 78),
            perdef=p['pd'],
            # discipline is WITHIN SIZE CLASS: a big's job generates fouls, so "disciplined for his role" is the question
            discipline=sc(1-Pk[_cls(r['ht'] or 78)](f(s100.get('pf_per_100_poss')))),
            # raw inputs for the team offense engine (usage economy + skill curves); not displayed
            usg_raw=round(r['usg'] or 20.0, 1), ts_raw=round(r['ts'] or 0.5, 3),
            # era-relative TS: this player's efficiency against his own league, recentred on .570
            ts_rel=round(((r['ts'] or lg_ts.get(yr, 0.545)) - lg_ts.get(yr, 0.545)) + 0.570, 3))
        # MINUTES CONFIDENCE (recal_14): a rate on 800 minutes is a claim, not a season.
        # recal_156 (HIS RULING on John Stockton '99, verbatim: "Agree with 7", released for landing
        # by "Push 154-157"): the line's foot (1200) and full (2400) are read against the SEASON'S OWN
        # SCHEDULE, not a fixed 82 games — the minutes are scaled by 82 / SEASON_G[yr] before the line
        # is applied. 82-game seasons are unchanged to the byte; the four shortened schedules (1999,
        # 2012, 2020, 2021) stop being shrunk for games nobody played. Stockton '99 playvol 86 -> 95.
        # This released recal_51's Zion Williamson '21 OFF 90 +-1 pin to 92 by his explicit ruling —
        # a PROVED frontier, not a tuning failure: Stockton needs (82/50)^a >= 1.628 (a >= 0.985) and
        # holding Zion needs (82/72)^a <= 1.109 (a <= 0.797), so no exponent satisfies both.
        _mp = f(by_pid_yr[(pid,yr)].get('mp_v')) or 0.0
        _mp_sched = _mp * 82.0 / SEASON_G.get(yr, 82.0)
        mconf = 0.55 + 0.45 * max(0.0, min(1.0, (_mp_sched - 1200) / 1200))
        if mconf < 1.0:
            for _k in ('playvol', 'perimdisrupt', 'orb', 'drb', 'fouldraw', 'efficiency'):
                p['attrs'][_k] = int(round(50 + mconf * (p['attrs'][_k] - 50)))
            p['talent'] = int(round(TAL_MED + mconf * (p['talent'] - TAL_MED)))
        # provenance sidecar (display only; never enters the sim or the ratings)
        eb = out_brk.get((pid, yr), {})
        cx = ex.get('comps'); fts = ex.get('feats')
        r3 = lambda v: None if v is None else (round(v, 3) if isinstance(v, float) else v)
        prov[p['name']] = dict(
            **{'3pt': eb.get('out')},
            rim=([1, cx['rv'], cx['rf'], cx['a2']] if (ex['measured'] and cx) else [0] + [r3(v) for v in (fts or [])]),
            mid=([1, cx['mv'], cx['mf']] if (ex['measured'] and cx) else [0]),
            fouldraw=[r3(r['ftr'])], orb=[r3(f(s100.get('orb_per_100_poss')))], drb=[r3(r['drb'])],
            playvol=[r3(r['ast'])], ballsec=[r3(r.get('tov_pct')), r3(r['usg']), r3(r['ast'])],
            volume=[r3(r['usg']), r3(r.get('tov_pct'))], efficiency=[r3(r['ts'])], durability=[by_pid_yr[(pid,yr)].get('mp_v')],
            discipline=[r3(f(s100.get('pf_per_100_poss')))],
            rimprot=eb.get('idc'), perdef=eb.get('pdc'))
# ---------- season smoothing: 65% year / 20% previous / 15% next ----------
# Single-season rates on modest volume are noisy. Every card becomes a weighted blend of the season
# and its qualifying neighbours (both must have passed the minutes floor to exist in out_players) -
# shrinkage toward local true skill, tilted to the PAST (skill flows forward; future-leak is the
# dangerous direction, so it gets the smallest weight). Weights renormalise when a neighbour is absent;
# a season with no qualifying neighbour stands alone, byte-identical. Blended AFTER every per-season
# score (era handling, defense scale, the inferred-zone uplift) - rim_mid_measured reflects the centre.
W_Y, W_PREV, W_NEXT = 0.60, 0.20, 0.20   # his ruling: 20/60/20, renormalised to 75/25 at a career edge
TOP = ['talent', 'in', 'out', 'id', 'pd']
ATTR_INT = ['3pt','rim','mid','ft','fouldraw','orb','drb','playvol','ballsec','volume','efficiency','durability','rimprot','perimdisrupt','perdef','discipline']
ATTR_FLOAT = {'usg_raw': 1, 'ts_raw': 3, 'ts_rel': 3}   # 'height' is a fact, never smoothed
_pre = {k: (dict(v), dict(v['attrs'])) for k, v in out_players.items() if 'attrs' in v}
_moved = 0
for (pid, yr), p in out_players.items():
    if 'attrs' not in p: continue
    prev = _pre.get((pid, yr - 1)); nxt = _pre.get((pid, yr + 1))
    # INJURY-GAP REACH (his ruling): if the next season missed the minutes floor, reach the one after it.
    nxt_yr = yr + 1
    if not nxt:
        nxt = _pre.get((pid, yr + 2)); nxt_yr = yr + 2 if nxt else None
    if not prev and not nxt: continue
    _was = dict(_pre[(pid, yr)][1])
    ws = [(W_Y, _pre[(pid, yr)])] + ([(W_PREV, prev)] if prev else []) + ([(W_NEXT, nxt)] if nxt else [])
    tot = sum(wt for wt, _ in ws)
    blend = lambda get: sum(wt * get(src) for wt, src in ws) / tot
    for k in TOP: p[k] = int(round(blend(lambda src: src[0][k])))
    for k in ATTR_INT: p['attrs'][k] = int(round(blend(lambda src: src[1][k])))
    for k, d in ATTR_FLOAT.items(): p['attrs'][k] = round(blend(lambda src: src[1][k]), d)
    # only the attributes that actually changed are stored — the rest would be noise in the sidecar.
    if p['name'] in prov:
        prov[p['name']]['smooth'] = dict(
            prev=(yr - 1) if prev else None, next=nxt_yr, gap=(nxt_yr == yr + 2),
            w=[round(W_Y / tot, 3), round((W_PREV if prev else 0) / tot, 3), round((W_NEXT if nxt else 0) / tot, 3)],
            was={k: _was[k] for k in ATTR_INT if _was[k] != p['attrs'][k]})
    _moved += 1
print(f"season smoothing: {_moved} of {len(out_players)} cards blended with a neighbour")
# absolute DFG floors re-applied after smoothing: a proven lockdown season keeps its floor even when
# the years either side of it were ordinary.
_floored = 0
for (pid, yr), p in out_players.items():
    if 'attrs' not in p: continue
    _fl = dfg_floor(yr, p['player'])
    if _fl and p['attrs']['perdef'] < _fl:
        p['attrs']['perdef'] = _fl
        _floored += 1
    if _fl and p.get('pd', 0) < _fl:
        p['pd'] = _fl
print(f'DFG floors re-applied after smoothing: {_floored} cards')
for nm in ["Magic Johnson '90", "Stephen Curry '16", "Giannis Antetokounmpo '20"]:
    m = [p for p in players if p['name'] == nm]
    if m:
        p = m[0]; k = next(k for k, v in out_players.items() if v is p)
        b = _pre[k][1]
        print(f"  {nm:28s} 3pt {b['3pt']}->{p['attrs']['3pt']}  rim {b['rim']}->{p['attrs']['rim']}  efficiency {b['efficiency']}->{p['attrs']['efficiency']}  talent {_pre[k][0]['talent']}->{p['talent']}")

json.dump(players, open('players_stats.json','w',encoding='utf-8'), separators=(',',':'))
json.dump(prov, open('provenance.json','w',encoding='utf-8'), separators=(',',':'))
print(f"provenance for {len(prov)} player-seasons -> provenance.json")
print(f"pipeline version {PIPELINE_VERSION}")
CH=['Michael Jordan','Larry Bird','Kevin McHale','Charles Barkley','Shaquille O\'Neal','DeMar DeRozan','Stephen Curry','Steve Kerr','Reggie Miller','Klay Thompson']
print(f"\n{'player':20s} {'peak':>4s} {'rim':>4s} {'mid':>4s} meas")
for nm in CH:
    m=sorted([p for p in players if p['player']==nm], key=lambda x:-x['talent'])
    if m and 'attrs' in m[0]:
        a=m[0]['attrs']; print(f"{nm:20s} {m[0]['peak_season']:4d} {a['rim']:4d} {a['mid']:4d} {a['rim_mid_measured']}")
