"""Verify candidate formulas against the oracle, one attribute at a time.

The pre-smoothing target for every card is recoverable — `smooth.was` records exactly the attributes
smoothing changed — so each formula can be tested on 10,000 cards without running the pipeline or
touching the ones next to it.
"""
import bisect, csv, io, json, os
from collections import defaultdict

BREF = r'C:\Users\tomer\AppData\Local\Temp\claude\C--Users-tomer-Desktop\213b1108-7de9-4ece-b091-d21781a1f07f\scratchpad\bref'
GAME7 = r'C:\Users\tomer\Desktop\game7'
f = lambda x: None if x in ('', None, 'NA') else float(x)

adv = list(csv.DictReader(io.open(os.path.join(BREF, 'Advanced.csv'), encoding='utf-8')))
prov = json.load(io.open(os.path.join(GAME7, 'data', 'provenance.json'), encoding='utf-8'))
cards = json.load(io.open(os.path.join(GAME7, 'src', 'data', 'players_stats.json'), encoding='utf-8'))
BY = {c['name']: c for c in cards}

# ---- the pre-smoothing target: the shipped value, unless smoothing moved it ----
PRE = {}
for c in cards:
    was = (prov.get(c['name'], {}).get('smooth') or {}).get('was') or {}
    PRE[c['name']] = {**c['attrs'], **was}

# ---- the season pools: every qualifying row, by season ----
rows_by = defaultdict(list)
seen = defaultdict(list)
for r in adv:
    yr = int(r['season'])
    if yr >= 1980:
        seen[(r['player_id'], yr)].append(r)
for (pid, yr), rs in seen.items():
    tot = next((x for x in rs if x.get('team') in ('TOT', '2TM', '3TM', '4TM', '5TM')), None)
    row = tot or max(rs, key=lambda x: f(x.get('mp')) or 0)
    if (f(row.get('mp')) or 0) >= 1200:
        rows_by[yr].append(row)
print(f'card rows by season: {sum(len(v) for v in rows_by.values()):,} across {len(rows_by)} seasons')

def pctile(vals):
    xs = sorted(v for v in vals if v is not None)
    def p(v):
        if v is None or not xs:
            return 0.5
        return bisect.bisect_left(xs, v) / len(xs)
    return p

sc = lambda x: int(round(1 + 98 * max(0.0, min(1.0, x))))

# ---- the name of a card, and its row ----
def card_name(row):
    return f"{row['player']} '{str(row['season'])[-2:]}"

def check(label, fn, key, tol=0):
    """fn(row, season_percentiles) -> candidate value for attribute `key`."""
    hit = miss = 0
    worst = []
    for yr, rs in rows_by.items():
        P = {
            'ts': pctile([f(x.get('ts_percent')) for x in rs]),
            'ast': pctile([f(x.get('ast_percent')) for x in rs]),
            'drb': pctile([f(x.get('drb_percent')) for x in rs]),
            'orb': pctile([f(x.get('orb_percent')) for x in rs]),
            'stl': pctile([f(x.get('stl_percent')) for x in rs]),
            'blk': pctile([f(x.get('blk_percent')) for x in rs]),
            'usg': pctile([f(x.get('usg_percent')) for x in rs]),
            'tov': pctile([f(x.get('tov_percent')) for x in rs]),
            'mp': pctile([f(x.get('mp')) for x in rs]),
            'dbpm': pctile([f(x.get('dbpm')) for x in rs]),
            'bpm': pctile([f(x.get('bpm')) for x in rs]),
        }
        P['rows'] = rs
        for r in rs:
            n = card_name(r)
            tgt = PRE.get(n, {}).get(key)
            if tgt is None:
                continue
            try:
                got = fn(r, P)
            except Exception:
                continue
            if got is None:
                continue
            if abs(got - tgt) <= tol:
                hit += 1
            else:
                miss += 1
                if len(worst) < 6:
                    worst.append(f'{n} got {got} want {tgt}')
    total = hit + miss
    pct = 100 * hit / total if total else 0
    print(f'  {label:<52} {hit:>6,}/{total:,}  {pct:5.1f}%' + ('' if pct > 99.5 else '   e.g. ' + '; '.join(worst[:3])))
    return pct

print('\nDURABILITY — within-season percentile of minutes')
check('sc(P_mp(mp))', lambda r, P: sc(P['mp'](f(r.get('mp')))), 'durability')

print('\nEFFICIENCY — half percentile, half value against league TS')
lg_ts = {yr: (sum(f(x.get('ts_percent')) or 0 for x in rs) / len(rs)) for yr, rs in rows_by.items()}
for gamma in (1.0, 1.05, 1.1):
    check(f'sc(0.5*P_ts^{gamma} + 0.5*(0.5+(ts-lgTS)*6))',
          lambda r, P, g=gamma: sc(0.5 * P['ts'](f(r.get('ts_percent'))) ** g
                                   + 0.5 * (0.5 + (f(r.get('ts_percent')) - lg_ts[int(r['season'])]) * 6)), 'efficiency')

print('\nPLAYVOL — percentile of assist rate, hardened, plus the value itself')
for gamma in (1.12, 1.0):
    check(f'sc(0.6*P_ast^{gamma} + 0.4*clamp(ast/44))',
          lambda r, P, g=gamma: sc(0.6 * P['ast'](f(r.get('ast_percent'))) ** g
                                   + 0.4 * max(0.0, min(1.0, (f(r.get('ast_percent')) or 15) / 44.0))), 'playvol')

print('\nVOLUME — true shot volume, usg x (1 - tov/100), hardened')
def volume(r, P):
    vals = [(f(x.get('usg_percent')) or 20) * (1 - (f(x.get('tov_percent')) or 13) / 100.0) for x in P['rows']]
    pv = pctile(vals)
    v = (f(r.get('usg_percent')) or 20) * (1 - (f(r.get('tov_percent')) or 13) / 100.0)
    return sc(pv(v) ** 1.15)
check('sc(P_vol^1.15)', volume, 'volume')

print('\nBALLSEC — 0.65 x responsibility ratio + 0.35 x raw TOV, inverted')
def ballsec(r, P):
    ratio = lambda x: (f(x.get('tov_percent')) or 13) * 25.0 / max(10.0, (f(x.get('usg_percent')) or 20) + 0.5 * (f(x.get('ast_percent')) or 15))
    padj = pctile([ratio(x) for x in P['rows']])
    return sc(1 - (0.65 * padj(ratio(r)) + 0.35 * P['tov'](f(r.get('tov_percent')))))
check('sc(1 - (0.65*P_ratio + 0.35*P_tov))', ballsec, 'ballsec')
