"""perdef and rimprot, assembled from the receipts' source assertions, checked against the oracle."""
import bisect, csv, io, json, os, re, unicodedata
from collections import defaultdict

BREF = r'C:\Users\tomer\AppData\Local\Temp\claude\C--Users-tomer-Desktop\213b1108-7de9-4ece-b091-d21781a1f07f\scratchpad\bref'
GAME7 = r'C:\Users\tomer\Desktop\game7'
f = lambda x: None if x in ('', None, 'NA') else float(x)
L = lambda n: list(csv.DictReader(io.open(os.path.join(BREF, n), encoding='utf-8')))
adv, per100 = L('Advanced.csv'), L('Per 100 Poss.csv')
info = {r['player_id']: r for r in L('Player Career Info.csv')}
is_tot = lambda t: t in ('TOT', '2TM', '3TM', '4TM', '5TM')

# ---- team defensive rating ----
teamd = {}
for r in L('Team Summaries.csv'):
    try: teamd[(int(r['season']), r['abbreviation'])] = float(r['d_rtg'])
    except Exception: pass

# ---- defensive reputation: All-D selections and DPOY shares ----
alld = defaultdict(float)
for r in L('End of Season Teams.csv'):
    if r.get('type') == 'All-Defense':
        k = (r['player_id'], int(r['season']))
        alld[k] = max(alld[k], 1.0 if r.get('number_tm') == '1st' else 0.6)
dpoy = defaultdict(float)
for r in L('Player Award Shares.csv'):
    if 'dpoy' in (r.get('award') or ''):
        try: dpoy[(r['player_id'], int(r['season']))] = float(r['share'])
        except Exception: pass
rep_by_pid = defaultdict(dict)
for (pid, yr), v in list(alld.items()): rep_by_pid[pid][yr] = max(rep_by_pid[pid].get(yr, 0), v)
for (pid, yr), v in list(dpoy.items()): rep_by_pid[pid][yr] = max(rep_by_pid[pid].get(yr, 0), min(1.0, rep_by_pid[pid].get(yr, 0) + 0.5 * v))
def career_rep(pid, yr):
    best = 0.0
    for y2, v in rep_by_pid.get(pid, {}).items():
        best = max(best, v * max(0.0, 1 - 0.15 * abs(yr - y2)))
    return best

# ---- tracking ----
_nrm = lambda s: unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower().replace('.', '').replace("'", '').strip()
TRACKING = defaultdict(dict)
tp = os.path.join(GAME7, 'data', 'tracking_defense.csv')
if os.path.exists(tp):
    for r in csv.DictReader(io.open(tp, encoding='utf-8')):
        try:
            TRACKING[(int(r['season']), r['category'])][_nrm(r['player_name'])] = (float(r['diff_pct']), float(r['att'] or 0) * float(r['gp'] or 0))
        except Exception: pass
print(f'tracking rows loaded for {len({k[0] for k in TRACKING})} seasons')

p100 = {}
for r in per100:
    k = (r['player_id'], r['season'])
    if k not in p100 or is_tot(r['team']): p100[k] = r

rows_by = defaultdict(list)
for r in adv:
    if r.get('lg') not in ('NBA', 'BAA'): continue
    mp = f(r.get('mp'))
    if mp is None or mp < 1200 or int(r['season']) < 1980: continue
    if not p100.get((r['player_id'], r['season'])): continue
    if not is_tot(r['team']) and any(x['player_id'] == r['player_id'] and x['season'] == r['season'] and is_tot(x['team']) for x in adv): continue
    rows_by[int(r['season'])].append(r)

prov = json.load(io.open(os.path.join(GAME7, 'data', 'provenance.json'), encoding='utf-8'))
cards = json.load(io.open(os.path.join(GAME7, 'src', 'data', 'players_stats.json'), encoding='utf-8'))
PRE = {}
for c in cards:
    was = (prov.get(c['name'], {}).get('smooth') or {}).get('was') or {}
    PRE[c['name']] = {**c['attrs'], **was}

def pctile(vals):
    xs = sorted(v for v in vals if v is not None)
    return lambda v: 0.5 if (v is None or not xs) else bisect.bisect_left(xs, v) / len(xs)
def pctile_top(vals):
    xs = sorted(v for v in vals if v is not None)
    return lambda v: 0.5 if (v is None or len(xs) < 2) else min(1.0, bisect.bisect_left(xs, v) / (len(xs) - 1))
sc = lambda x: int(round(1 + 98 * max(0, min(1, x))))
name = lambda r: f"{r['player']} '{str(r['season'])[-2:]}"

W_PD = dict(drep=0.366, dbpm=0.192, teamd=0.192, height_inv=0.25)
W_ID = dict(blk=0.55, height=0.25, dbpm=0.20)
import sys
MIN_ATT, FULL_SAMPLE, RIM_GATE = float(sys.argv[1]) if len(sys.argv)>1 else 150.0, float(sys.argv[2]) if len(sys.argv)>2 else 350.0, 0.60

hit_pd = hit_id = tot = 0
from collections import defaultdict as _dd
ERA = _dd(lambda: [0,0,0]); EX = []; IMP = []
for yr in sorted(rows_by):
    rs = rows_by[yr]
    P = {k: pctile([f(r.get(c)) for r in rs]) for k, c in
         (('blk', 'blk_percent'), ('dbpm', 'dbpm'), ('ht', None), ('team_drtg', None))
         if c}
    P['ht'] = pctile([f(info.get(r['player_id'], {}).get('ht_in_in')) for r in rs])
    P['team_drtg'] = pctile([teamd.get((yr, r['team'])) for r in rs])
    def _trk(cat, nm):
        row = TRACKING.get((yr, cat), {}).get(_nrm(nm))
        if row is None: return None
        d, att = row
        return d * min(1.0, att / MIN_ATT) if att else None
    def _pct_for(cat):
        vals = [d * min(1.0, a / MIN_ATT) for d, a in TRACKING.get((yr, cat), {}).values() if a]
        return pctile_top(vals) if vals else None
    Pperim, Prim = _pct_for('Greater Than 15Ft'), _pct_for('Less Than 6Ft')
    _atts = sorted(a for _d, a in TRACKING.get((yr, 'Overall'), {}).values() if a)
    TGT_MED = _atts[len(_atts) // 2] if _atts else None
    def _tw(nm):
        row = TRACKING.get((yr, 'Overall'), {}).get(_nrm(nm))
        if not row or not TGT_MED: return 1.0
        return min(1.0, max(0.35, 1 - 0.6 * max(0.0, row[1] / TGT_MED - 1)))
    def _sw(nm):
        row = TRACKING.get((yr, 'Overall'), {}).get(_nrm(nm))
        return min(1.0, row[1] / FULL_SAMPLE) if row and row[1] else 0.0
    tmp = []
    for r in rs:
        ht = f(info.get(r['player_id'], {}).get('ht_in_in'))
        hp = P['ht'](ht)
        drep = career_rep(r['player_id'], yr)
        td = teamd.get((yr, r['team']))
        tD = 1 - P['team_drtg'](td) if td is not None else 0.5
        band = max(0.0, 1.0 - max(0.0, max(75.0 - (ht or 78), (ht or 78) - 80.0)) / 8.0)
        PD = (W_PD['drep'] * (drep * (1.2 - 0.8 * hp)) + W_PD['dbpm'] * P['dbpm'](f(r.get('dbpm')))
              + W_PD['teamd'] * tD + W_PD['height_inv'] * band)
        if drep == 0: PD = 0.5 + 0.70 * (PD - 0.5)
        ID = W_ID['blk'] * P['blk'](f(r.get('blk_percent'))) + W_ID['height'] * hp + W_ID['dbpm'] * P['dbpm'](f(r.get('dbpm')))
        ID = ID + 0.25 * (drep * hp)
        ID, PD = min(ID, 1.0), min(PD, 1.0)
        tmp.append((r, drep, PD, ID))
    Pvot = pctile([t[2] for t in tmp if t[1] >= 0.25])
    Prot = pctile_top([t[3] for t in tmp if t[3] >= RIM_GATE])
    for r, drep, PD, ID in tmp:
        ID2 = min(1.0, 0.55 + 0.47 * Prot(ID)) if ID >= RIM_GATE else min(ID, 0.54)
        if Prim is not None:
            rv = _trk('Less Than 6Ft', r['player'])
            if rv is not None:
                ID2 = min(1.0, 0.65 * ID2 + 0.35 * (0.10 + 0.90 * (1 - Prim(rv))))
        wv = min(1.0, drep / 0.30) if drep > 0.05 else 0.0
        novote = min(PD, 0.62)
        if Pperim is not None:
            dv = _trk('Greater Than 15Ft', r['player'])
            if dv is not None:
                d_meas = 1 - Pperim(dv)
                wm = 0.70 * _tw(r['player']) * _sw(r['player'])
                novote = min(0.84, (1 - wm) * novote + wm * (0.17 + 0.67 * d_meas))
        PD2 = (1 - wv) * novote + wv * (0.55 + 0.44 * Pvot(PD))
        t = PRE.get(name(r))
        if not t: continue
        tot += 1
        okp, oki = sc(PD2) == t.get('perdef'), sc(ID2) == t.get('rimprot')
        hit_pd += okp; hit_id += oki
        bucket = 'tracking' if yr >= 2014 else ('voted' if drep > 0.05 else 'plain')
        ERA[bucket][0] += 1; ERA[bucket][1] += okp; ERA[bucket][2] += oki
        if yr >= 2014 and drep <= 0.05:
            _dv = _trk('Greater Than 15Ft', r['player'])
            if Pperim and _dv is not None:
                _dm = 1 - Pperim(_dv)
                _nb, _tg = min(PD, 0.62), (t['perdef'] - 1) / 98.0
                _den = _nb - (0.17 + 0.67 * _dm)
                if abs(_den) > 0.05:
                    _row = TRACKING.get((yr, 'Overall'), {}).get(_nrm(r['player']))
                    IMP.append(((_nb - _tg) / _den, (_row[1] if _row else 0), _row[1]/TGT_MED if (_row and TGT_MED) else 0))
        if not okp and len(EX) < 8 and yr >= 2014 and drep <= 0.05:
            dv2 = _trk('Greater Than 15Ft', r['player'])
            dm = (1 - Pperim(dv2)) if (Pperim and dv2 is not None) else None
            EX.append(f"{name(r):26s} PD {PD:.4f} novote_base {min(PD,0.62):.4f} d_meas {dm if dm is None else round(dm,4)} "
                      f"wm {round(0.70*_tw(r['player'])*_sw(r['player']),4)} -> mine {sc(PD2)} want {t['perdef']} (target frac {(t['perdef']-1)/98:.4f})")
print(f'cards: {tot:,}')
print(f'  perdef  exact {hit_pd:,}  ({100*hit_pd/tot:.1f}%)')
print(f'  rimprot exact {hit_id:,}  ({100*hit_id/tot:.1f}%)')
for k, (n, p_, i_) in sorted(ERA.items()):
    print(f'   {k:<9} n={n:>5,}   perdef {100*p_/n:5.1f}%   rimprot {100*i_/n:5.1f}%')
import statistics as _st
print("")
print(f"implied wm on {len(IMP):,} no-vote tracked cards: median {_st.median(w for w,_a,_r in IMP):.4f}")
for lo, hi in ((0,0.6),(0.6,0.9),(0.9,1.2),(1.2,1.6),(1.6,2.5),(2.5,9)):
    sub = [w for w, a, rr in IMP if lo <= rr < hi]
    if len(sub) > 30:
        print(f"   att/median {lo}-{hi}: n={len(sub):>4}  median wm {_st.median(sub):.4f}")
