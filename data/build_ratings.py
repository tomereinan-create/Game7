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
PIPELINE_VERSION = 107   # printed every run and written to src/data/pipeline.json
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
        team_drtg=teamd.get((int(r['season']), r['team'])), mp_v=mp,
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

def score_season(r, P):
    W = WEIGHTS
    IN  = W['IN']['x2p_per_100']*P['x2p_per_100'](r['x2p_per_100']) + W['IN']['x2p_pct']*P['x2p_pct'](r['x2p_pct']) + W['IN']['ftr']*P['ftr'](r['ftr'])
    # OUT: absolute vs modern pool (all seasons >=1980 have measured 3P data)
    if True:
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
        eye = 0.0
        if p3 is not None and (r['x3pa_per_100'] or 0)*era_mult(r['season']) >= 3.0:
            eye = min(0.95, 0.88*acc + 0.12*vol)   # season-level deadeye: near-pure accuracy, volume nudge
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
    PD  = W['PD']['drep']*(r['drep']*rep_hf) + W['PD']['dbpm']*P['dbpm'](r['dbpm']) + W['PD']['height_inv'] * max(0.0, 1.0 - max(0.0, max(75.0-(r['ht'] or 78), (r['ht'] or 78)-80.0))/8.0)
    if r['drep'] == 0:   # evidence is weak without votes: shrink toward league middle (fixes both steal-gamblers and quiet solid defenders)
        PD = 0.5 + WEIGHTS['PD_SHRINK_NOVOTE']*(PD-0.5)
    ID  = ID + 0.25*(r['drep']*hp)   # big-man defensive votes reinforce rim protection
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
DBPM_CEIL_BAR, DBPM_CEIL_FULL = 0.0, 1.0   # DBPM band the ceiling grades on; the BLOCK band is
# recal_92's own BLK_BAR/BLK_FULL, reused deliberately - there is ONE definition of "block evidence"
# in this file and both rim gates read it, so a later ruling moves one number, not two.
def _ceiling_evidence(blk_pctile, dbpm, drep):
    dbp = max(0.0, min(1.0, ((dbpm if dbpm is not None else 0.0) - DBPM_CEIL_BAR) / (DBPM_CEIL_FULL - DBPM_CEIL_BAR)))
    return max(min(1.0, max(0.0, drep)), _blk_evidence(blk_pctile) * dbp)
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
        # the very top SATURATES (0.47 slope, clamped): season smoothing blends a peak with its
        # neighbours, so only a man who is the league's best deterrent for years running lands on 99
        ID2 = min(1.0, 0.55 + 0.47 * Prot(ID)) if ID >= RIM_GATE else min(ID, 0.54)
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
        _w53 = min(1.0, max(0.0, r['drep'])) * _blk_evidence(P['blk'](r['blk'])) if r['drep'] > 0.05 else 0.0
        _cap53 = (88 - 1) / 98.0
        _row6 = TRACKING.get((yr, 'Less Than 6Ft'), {}).get(_nrm(r['name']))
        if _row6 and _row6[1] and min(1.0, _row6[1] / 350.0) >= 0.75 and _row6[0] <= -0.040:
            _cap53 = (92 - 1) / 98.0
        # recal_95: the tier above is the CEILING A BIG CAN EARN; what he is actually held to is that
        # tier graded by the evidence behind it (blocks and DBPM), or by his votes, whichever is more.
        _cap53 = NOVOTE_FLOOR + (_cap53 - NOVOTE_FLOOR) * _ceiling_evidence(P['blk'](r['blk']), r['dbpm'], r['drep'])
        ID2 = (1 - _w53) * min(ID2, _cap53) + _w53 * ID2
        # GRADED entry to the voted band (the Kawhi-'26 cliff fix): membership is a weight, not a switch.
        # Full selections (drep>=0.35) sit purely in the voted band; fading legends blend down SMOOTHLY;
        # trace votes (<=0.05) still buy nothing (the Iverson rule holds).
        wv = min(1.0, r['drep'] / 0.30) if r['drep'] > 0.05 else 0.0   # recal_20: graded band enters sooner
        novote = min(PD, 0.62)   # recal_13: no-vote cap 0.58 -> 0.62
        # recal_55: PRE-2014 NO-REP DBPM RELIEF, at his "big increase" size. Before tracking exists
        # a no-vote defender had no way past the cap no matter what DBPM said; elite-DBPM unvoted
        # men now reach ~78-80. The negative control holds by construction: a bad DBPM percentile
        # makes 0.28 + 0.60 x P less than the cap he already had, so gamblers move zero.
        if yr < 2014 and r['drep'] <= 0.05:
            novote = max(novote, min(0.80, 0.28 + 0.60 * P['dbpm'](r['dbpm'])))
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
        PD2 = (1 - wv) * novote + wv * (0.55 + 0.45 * Pvot(PD))   # no-vote cap 54 -> 58 (recal 5)
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
def creation_factor(sh):
    a2 = f(sh.get('percent_assisted_x2p_fg'))
    return 1.0 if a2 is None else (1 - 0.45*a2)   # 45% max discount for fully-assisted rim diets

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
    rim = 0.65*P['rimvol'](share*fga100*(creation_factor(sh) if use_factor else 1.0)) + 0.35*P['rimfg'](fgp)
    # ELITE-CONVERSION FLOOR (recal_16, widened by recal_19): accuracy AND volume.
    if use_factor and fgp is not None and share * fga100 >= 6.0:
        rim = max(rim, min(0.68, 0.28 + 0.42 * P['rimfg'](fgp) + 0.15 * P['rimvol'](share*fga100)))
    mid = 0.65*P['midvol'](s10*fga100) + 0.35*P['midfg'](fmid)
    # zone deadeye (same convexity rule as 3PT): elite conversion on real attempts earns its own path.
    # Applies only to stored attributes (use_factor=True), never to inference training targets;
    # rim deadeye also requires self-creation (assisted-heavy finishing is not shot-making).
    if use_factor:   # HIGH-VOLUME PREMIUM (stored attributes only, never inference targets)
        rim = min(1.0, rim + 0.07*max(0.0, (P['rimvol'](share*fga100) - 0.70)/0.30))
        mid = min(1.0, mid + 0.07*max(0.0, (P['midvol'](s10*fga100) - 0.70)/0.30))
        # RECAL_78 (his ruling, "Ty jerome still 82 OFF"): THE DEADEYE FLOORS ASK r51'S LOAD QUESTION.
        # These two floors pay 85% on ACCURACY and override the volume-first composite above them, and
        # their only gate was a RATE (2.5 attempts per 100). recal_51 already wrote the objection, for
        # the paint bonus: "attempts are a RATE — per hundred — so a 17-minute bench finisher can post
        # a starter's attempt rate while carrying no load." The floors never got the same treatment, so
        # a hot 88-shot midrange bought a 0.92-capped rating. The floor's LIFT is now scaled by the
        # real attempt COUNT against the median full-season sample in that zone (mid 105, rim 174,
        # measured over every card with mp >= 1200). A full sample keeps the floor exactly as before;
        # a half sample gets half the lift. No cliff (r43), and nobody with a real sample moves.
        _poss78 = (f(r.get('mp_v')) or 0.0) * lgpace.get(int(r['season']), 100.0) / 48.0
        _lift = lambda base, floor, att, ref: base if floor <= base else base + (floor - base) * max(0.0, min(1.0, att / ref))
        if fgp is not None and share*fga100 >= 2.5 and creation_factor(sh) >= 0.73:
            rim = _lift(rim, min(0.92, 0.85*P['rimfg'](fgp) + 0.15*P['rimvol'](share*fga100)), share*fga100*_poss78/100.0, 174.0)
        if fmid is not None and s10*fga100 >= 2.5:
            mid = _lift(mid, min(0.92, 0.85*P['midfg'](fmid) + 0.15*P['midvol'](s10*fga100)), s10*fga100*_poss78/100.0, 105.0)
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
        _wraw = 0.45 - 0.20 * _credit
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
        _mp = f(by_pid_yr[(pid,yr)].get('mp_v')) or 0.0
        mconf = 0.55 + 0.45 * max(0.0, min(1.0, (_mp - 1200) / 1200))
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
