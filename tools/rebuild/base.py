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
import csv, json, math
from collections import defaultdict

import sys
DATA = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/bball-reference-datasets-master/Data"
MIN_MP = 1200          # minutes floor for a season to count
MIN_SEASON = 1980      # stats-only doctrine: every axis measured, no priors (3PT line exists from 1980)
MODERN = (2011, 2025)  # reference pool for absolute OUT scale
SHORTLINE = {1995, 1996, 1997}  # 22ft uniform line -> discount 3P% a touch
ERA_ALPHA = 0.5   # dampening for the 3PT-volume era multiplier: (modern_rate/era_rate)^alpha
ERA_CAP   = 3.0   # multiplier ceiling

WEIGHTS = dict(
  IN  = dict(x2p_per_100=0.40, x2p_pct=0.35, ftr=0.25),
  OUT = dict(x3pa_rate=0.65, x3p_pct=0.35),   # volume-first: taking them at league % IS the skill
  ID  = dict(blk=0.55, height=0.25, dbpm=0.20),   # rim protection = shot DETERRENCE; rebounding has its own attribute (was triple-counted)
  PD  = dict(drep=0.42, stl=0.08, dbpm=0.13, teamd=0.11, trust=0.12, height_inv=0.14),
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
for r in load("Team Summaries.csv"):
    try: teamd[(int(r['season']), r['abbreviation'])] = float(r['d_rtg'])
    except: pass
    try: lg3ar[int(r['season'])].append(float(r['x3p_ar']))
    except: pass
lg3ar = {yr: sum(v)/len(v) for yr, v in lg3ar.items() if v}
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
        OUT = max(gun, eye)   # two ways to be a shooter (calibrated: d > c > a >= b)
    ID  = W['ID']['blk']*P['blk'](r['blk']) + W['ID']['height']*P['ht'](r['ht']) + W['ID']['dbpm']*P['dbpm'](r['dbpm'])
    # reputation term: All-D/DPOY votes are the only recorded measure of pre-tracking perimeter D.
    # height splits the credit: small defenders' votes -> pd, big defenders' votes -> id (rim protectors get All-D too)
    hp = P['ht'](r['ht'])
    tD = 1 - P['team_drtg'](r['team_drtg']) if r['team_drtg'] is not None else 0.5   # lower d_rtg = better
    trust = P['mp_v'](r['mp_v']) * (1 - 0.6*P['usg'](r['usg']))   # heavy minutes = trust; usage discounts but never zeroes it (star wings were being punished for scoring)
    PD  = W['PD']['drep']*(r['drep']*(1.2-0.8*hp)) + W['PD']['stl']*P['stl'](r['stl']) + W['PD']['dbpm']*P['dbpm'](r['dbpm']) + W['PD']['teamd']*tD + W['PD']['trust']*trust + W['PD']['height_inv']*(1-hp)
    if r['drep'] == 0:   # evidence is weak without votes: shrink toward league middle (fixes both steal-gamblers and quiet solid defenders)
        PD = 0.5 + WEIGHTS['PD_SHRINK_NOVOTE']*(PD-0.5)
    ID  = ID + 0.25*(r['drep']*hp)   # big-man defensive votes reinforce rim protection
    ID  = min(ID, 1.0); PD = min(PD, 1.0)
    TAL = 0.72*P['bpm'](r['bpm']) + 0.28*P['usg'](r['usg'])   # dominance x volume: kills the low-usage-specialist BPM bias
    # provenance: which OUT path won, and the raw defensive components (display only)
    path = 2 if (r['x3pa_per_100'] or 0) < 2 else (1 if eye > gun else 0)
    BRK = dict(
        out=[path, r['x3pa_per_100'], era_mult(r['season']), r['x3p_pct'], round(vol, 3), round(acc, 3), round(gate, 3)],
        idc=[r['blk'], r['ht'], r['dbpm'], round(r['drep'], 3),
             (TRACKING.get((r['season'], 'Less Than 6Ft'), {}).get(_nrm(r['name'])) or (None,))[0]],
        pdc=[round(r['drep'], 3), r['stl'], r['dbpm'], r['team_drtg'], r['mp_v'], r['usg'], r['ht'], 1 if r['drep'] == 0 else 0,
             (TRACKING.get((r['season'], 'Greater Than 15Ft'), {}).get(_nrm(r['name'])) or (None,))[0],
             round(min(1.0, r['drep'] / 0.35) if r['drep'] > 0.05 else 0.0, 2)],
    )
    OUT = min(1.0, OUT + 0.07*max(0.0, (vol - 0.70)/0.30))   # HIGH-VOLUME PREMIUM: top-volume shooters get a margin (never subtracts)
    return IN, OUT, ID, PD, TAL, BRK

# within-season percentile functions
import unicodedata as _ud
def _nrm(n): return ''.join(c for c in _ud.normalize('NFKD', (n or '').lower()) if c.isalnum())
TRACKING = {}          # (season, category) -> {norm name: (diff_pct, attempts)}
TRK_CATS = {'overall': 'Overall', 'rim': 'Less Than 6Ft', 'perim': 'Greater Than 15Ft', 'three': '3 Pointers'}
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
    Pvot = pctile([t[1][3] for t in tmp if t[0]['drep'] >= 0.25])
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
    Pperim = _pct_for('Greater Than 15Ft')
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
        # GRADED entry to the voted band (the Kawhi-'26 cliff fix): membership is a weight, not a switch.
        # Full selections (drep>=0.35) sit purely in the voted band; fading legends blend down SMOOTHLY;
        # trace votes (<=0.05) still buy nothing (the Iverson rule holds).
        wv = min(1.0, r['drep'] / 0.35) if r['drep'] > 0.05 else 0.0
        novote = min(PD, 0.58)
        if Pperim is not None:
            dv = _trk('Greater Than 15Ft', r['name'])
            if dv is not None:
                d_meas = 1 - Pperim(dv)                                        # a lower defended-FG% diff is a better defender
                novote = min(0.80, 0.30*novote + 0.70*(0.15 + 0.63*d_meas))    # measured evidence widens the no-vote band to ~78
        PD2 = (1 - wv) * novote + wv * (0.55 + 0.44 * Pvot(PD))   # no-vote cap 54 -> 58 (recal 5)
        # v3: every qualified season is a draftable player. Identity = player + year.
        sc = lambda x: round(1+98*x)
        out_players[(r['pid'], yr)] = dict(
            name=r['name'] + " '" + str(yr)[-2:], player=r['name'], peak_season=yr, _bpm=r['bpm'] or -99,
            talent=round(55+44*TAL), **{'in':sc(IN)}, out=sc(OUT), id=sc(ID2), pd=sc(PD2))

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
    mid = 0.65*P['midvol'](s10*fga100) + 0.35*P['midfg'](fmid)
    # zone deadeye (same convexity rule as 3PT): elite conversion on real attempts earns its own path.
    # Applies only to stored attributes (use_factor=True), never to inference training targets;
    # rim deadeye also requires self-creation (assisted-heavy finishing is not shot-making).
    if use_factor:   # HIGH-VOLUME PREMIUM (stored attributes only, never inference targets)
        rim = min(1.0, rim + 0.07*max(0.0, (P['rimvol'](share*fga100) - 0.70)/0.30))
        mid = min(1.0, mid + 0.07*max(0.0, (P['midvol'](s10*fga100) - 0.70)/0.30))
        if fgp is not None and share*fga100 >= 2.5 and creation_factor(sh) >= 0.73:
            rim = max(rim, min(0.92, 0.85*P['rimfg'](fgp) + 0.15*P['rimvol'](share*fga100)))
        if fmid is not None and s10*fga100 >= 2.5:
            mid = max(mid, min(0.92, 0.85*P['midfg'](fmid) + 0.15*P['midvol'](s10*fga100)))
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

# infer for pre-1997 seasons
for yr in sorted(rows_by):
    if yr >= 1997: continue
    base = season_pct(yr, ['x2p_pct','ft_pct','ftr','ht','x2p_per_100','usg','ts'])
    for r in rows_by[yr]:
        ue = base['usg'](r['usg']) * base['ts'](r['ts'])
        x = np.array([1, base['x2p_pct'](r['x2p_pct']), base['ft_pct'](r['ft_pct']), base['ftr'](r['ftr']), base['ht'](r['ht']), base['x2p_per_100'](r['x2p_per_100']), base['usg'](r['usg']), ue])
        ramp = max(0.0, min(1.0, (ue - 0.62) / 0.28))
        vol = base['x2p_per_100'](r['x2p_per_100']); p2 = base['x2p_pct'](r['x2p_pct'])
        rim_m = 0.75*float(np.clip(x@br,0,1)) + 0.25*vol   # volume-first holds in inference too (Steve Johnson rule)
        mid_m = 0.75*float(np.clip(x@bm,0,1)) + 0.25*vol
        if p2 < 0.40:                                      # low-2P% clamp: the FT-touch proxy can't outrun the actual shooting (Murphy rule)
            cap2 = 0.45 + 0.55*p2; rim_m = min(rim_m, cap2); mid_m = min(mid_m, cap2)
        attr_store[(r['pid'],yr)] = dict(rim=float(np.clip(rim_m + ramp*UPLIFT_RIM, 0, 1)), mid=float(np.clip(mid_m + ramp*UPLIFT_MID, 0, 1)), measured=False,
            feats=[r['x2p_pct'], r['ft_pct'], r['ftr'], r['ht'], r['x2p_per_100'], r['usg'], round(ue, 3), round(ramp, 3)])

# assemble full 17 sheet on each player's already-chosen peak season
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
    Pa = {k: pctile([r2v for r2v in ([rr.get(k) for rr in rows])]) for k in ['drb','ast','stl','usg','ts','dbpm','blk']}
    # ballsec: turnovers per play USED (TOV%), with an allowance for creation load (AST% - passing
    # manufactures turnovers). Usage-relative and creation-adjusted, so it no longer punishes anyone who
    # merely touched the ball. Inverse within-season percentile.
    bsec = lambda rr: None if rr.get('tov_pct') is None else rr['tov_pct'] - 0.11 * (rr.get('ast') or 0)
    P_bsec = pctile([bsec(rr) for rr in rows])
    g_p = pctile([f(by_pid_yr[(r['pid'],yr)].get('mp_v')) for r in rows])
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
        p['attrs'] = dict(
            # mid hardened globally (^1.15): the top barely moves, the 60-85 band compresses a few points
            **{'3pt': p['out']}, rim=sc(ex['rim']), mid=sc(ex['mid']**1.15), rim_mid_measured=ex['measured'],
            ft=round(100*(r['ft_pct'] or 0)),   # doctrine: FT is the pure stat itself
            fouldraw=sc(P['ftr'](r['ftr'])),
            orb=sc(Pk['orb'](f(s100.get('orb_per_100_poss')))), drb=sc(Pa['drb'](r['drb'])),
            playvol=sc(Pa['ast'](r['ast'])), ballsec=sc(1-P_bsec(bsec(r))),
            # efficiency hardened globally (^1.30): the median reads ~40, elite stays elite
            usage=sc(Pa['usg'](r['usg'])), efficiency=sc(Pa['ts'](r['ts'])**1.30),
            durability=sc(g_p(f(by_pid_yr[(pid,yr)].get('mp_v')))),
            rimprot=p['id'], perimdisrupt=sc(Pa['stl'](r['stl'])), height=round(r['ht'] or 78),
            perdef=p['pd'], passqual=sc(pctile([ (f(pf100.get((x['pid'],str(yr)),{}).get('ast_per_100_poss')) or 0)/max(0.5,(f(pf100.get((x['pid'],str(yr)),{}).get('tov_per_100_poss')) or 0.5)) for x in rows])(ast_tov)),
            # discipline is WITHIN SIZE CLASS: a big's job generates fouls, so "disciplined for his role" is the question
            discipline=sc(1-(Pk['pf_big'] if (r['ht'] or 78) >= ht_q75 else Pk['pf_sml'])(f(s100.get('pf_per_100_poss')))),
            # raw inputs for the team offense engine (usage economy + skill curves); not displayed
            usg_raw=round(r['usg'] or 20.0, 1), ts_raw=round(r['ts'] or 0.5, 3),
            # era-relative TS: this player's efficiency against his own league, recentred on .570
            ts_rel=round(((r['ts'] or lg_ts.get(yr, 0.545)) - lg_ts.get(yr, 0.545)) + 0.570, 3))
        # provenance sidecar (display only; never enters the sim or the ratings)
        eb = out_brk.get((pid, yr), {})
        cx = ex.get('comps'); fts = ex.get('feats')
        r3 = lambda v: None if v is None else (round(v, 3) if isinstance(v, float) else v)
        prov[p['name']] = dict(
            **{'3pt': eb.get('out')},
            rim=([1, cx['rv'], cx['rf'], cx['a2']] if (ex['measured'] and cx) else [0] + [r3(v) for v in (fts or [])]),
            mid=([1, cx['mv'], cx['mf']] if (ex['measured'] and cx) else [0]),
            fouldraw=[r3(r['ftr'])], orb=[r3(f(s100.get('orb_per_100_poss')))], drb=[r3(r['drb'])],
            playvol=[r3(r['ast'])], ballsec=[r3(r.get('tov_pct')), r3(r['ast'])], passqual=[r3(ast_tov)],
            usage=[r3(r['usg'])], efficiency=[r3(r['ts'])], durability=[by_pid_yr[(pid,yr)].get('mp_v')],
            discipline=[r3(f(s100.get('pf_per_100_poss')))],
            rimprot=eb.get('idc'), perdef=eb.get('pdc'))
# ---------- season smoothing: 65% year / 20% previous / 15% next ----------
# Single-season rates on modest volume are noisy. Every card becomes a weighted blend of the season
# and its qualifying neighbours (both must have passed the minutes floor to exist in out_players) -
# shrinkage toward local true skill, tilted to the PAST (skill flows forward; future-leak is the
# dangerous direction, so it gets the smallest weight). Weights renormalise when a neighbour is absent;
# a season with no qualifying neighbour stands alone, byte-identical. Blended AFTER every per-season
# score (era handling, defense scale, the inferred-zone uplift) - rim_mid_measured reflects the centre.
W_Y, W_PREV, W_NEXT = 0.65, 0.20, 0.15
TOP = ['talent', 'in', 'out', 'id', 'pd']
ATTR_INT = ['3pt','rim','mid','ft','fouldraw','orb','drb','playvol','ballsec','usage','efficiency','durability','rimprot','perimdisrupt','perdef','passqual','discipline']
ATTR_FLOAT = {'usg_raw': 1, 'ts_raw': 3, 'ts_rel': 3}   # 'height' is a fact, never smoothed
_pre = {k: (dict(v), dict(v['attrs'])) for k, v in out_players.items() if 'attrs' in v}
_moved = 0
for (pid, yr), p in out_players.items():
    if 'attrs' not in p: continue
    prev = _pre.get((pid, yr - 1)); nxt = _pre.get((pid, yr + 1))
    if not prev and not nxt: continue
    ws = [(W_Y, _pre[(pid, yr)])] + ([(W_PREV, prev)] if prev else []) + ([(W_NEXT, nxt)] if nxt else [])
    tot = sum(wt for wt, _ in ws)
    blend = lambda get: sum(wt * get(src) for wt, src in ws) / tot
    for k in TOP: p[k] = int(round(blend(lambda src: src[0][k])))
    for k in ATTR_INT: p['attrs'][k] = int(round(blend(lambda src: src[1][k])))
    for k, d in ATTR_FLOAT.items(): p['attrs'][k] = round(blend(lambda src: src[1][k]), d)
    _moved += 1
print(f"season smoothing: {_moved} of {len(out_players)} cards blended with a neighbour")
for nm in ["Magic Johnson '90", "Stephen Curry '16", "Giannis Antetokounmpo '20"]:
    m = [p for p in players if p['name'] == nm]
    if m:
        p = m[0]; k = next(k for k, v in out_players.items() if v is p)
        b = _pre[k][1]
        print(f"  {nm:28s} 3pt {b['3pt']}->{p['attrs']['3pt']}  rim {b['rim']}->{p['attrs']['rim']}  efficiency {b['efficiency']}->{p['attrs']['efficiency']}  talent {_pre[k][0]['talent']}->{p['talent']}")

json.dump(players, open('players_stats.json','w',encoding='utf-8'), separators=(',',':'))
json.dump(prov, open('provenance.json','w',encoding='utf-8'), separators=(',',':'))
print(f"provenance for {len(prov)} player-seasons -> provenance.json")
CH=['Michael Jordan','Larry Bird','Kevin McHale','Charles Barkley','Shaquille O\'Neal','DeMar DeRozan','Stephen Curry','Steve Kerr','Reggie Miller','Klay Thompson']
print(f"\n{'player':20s} {'peak':>4s} {'rim':>4s} {'mid':>4s} meas")
for nm in CH:
    m=sorted([p for p in players if p['player']==nm], key=lambda x:-x['talent'])
    if m and 'attrs' in m[0]:
        a=m[0]['attrs']; print(f"{nm:20s} {m[0]['peak_season']:4d} {a['rim']:4d} {a['mid']:4d} {a['rim_mid_measured']}")
