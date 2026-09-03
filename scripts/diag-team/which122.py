"""recal_122 — WHICH ORDER STATISTIC does real defence actually pay for?

Within each season, z-score every candidate feature of the five and the target (-real DRtg), pool the
47 seasons, and read the partial weights. This decides the aggregation before any knob is chosen.
"""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'variants122.py'), encoding='utf8').read().split("print('\\n================ BASELINE")[0])

FEATS = {
    'pd_mean': lambda x: x['pdmean'],
    'pd_1': lambda x: x['pd'][0],
    'pd_2': lambda x: x['pd'][1],
    'pd_3': lambda x: x['pd'][2],
    'pd_4': lambda x: x['pd'][3],
    'pd_5': lambda x: x['pd'][4],
    'pd_top2': lambda x: x['top2'],
    'pd_bot2': lambda x: (x['pd'][3] + x['pd'][4]) / 2,
    'rp_1': lambda x: x['rp'][0],
    'rp_2': lambda x: x['rp'][1],
    'rp_mean': lambda x: sum(x['rp']) / 5,
    'anchor_capped': lambda x: min(99, x['dec']['anchor']),
    'anchor_raw': lambda x: x['dec']['anchor'],
    'steals': lambda x: x['dec']['steals'],
    'glass': lambda x: x['dec']['glass'],
}

BY = defaultdict(list)
for x in D:
    BY[x['y']].append(x)


def zs(vals):
    n = len(vals); m = sum(vals) / n
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / max(1, n - 1)) or 1.0
    return [(v - m) / sd for v in vals]


Z = {k: [] for k in FEATS}
ZY = []
for y, g in BY.items():
    for k, f in FEATS.items():
        Z[k].extend(zs([f(x) for x in g]))
    ZY.extend(zs([-x['truth']['drtg'] for x in g]))

n = len(ZY)
print(f'n = {n} team-seasons, {len(BY)} seasons, all features season-z-scored\n')
print('--- univariate correlation with (-real DRtg), higher = better defence ---')
for k in FEATS:
    r = sum(Z[k][i] * ZY[i] for i in range(n)) / n
    print(f'  {k:16s} r = {r:+.4f}')


def ols(keys):
    import itertools
    m = len(keys)
    X = [[Z[k][i] for k in keys] for i in range(n)]
    A = [[sum(X[i][a] * X[i][b] for i in range(n)) for b in range(m)] for a in range(m)]
    bv = [sum(X[i][a] * ZY[i] for i in range(n)) for a in range(m)]
    for i in range(m):
        A[i].append(bv[i])
    for c in range(m):
        p = max(range(c, m), key=lambda r: abs(A[r][c]))
        A[c], A[p] = A[p], A[c]
        pv = A[c][c]
        for j in range(c, m + 1):
            A[c][j] /= pv
        for r in range(m):
            if r != c and A[r][c]:
                f = A[r][c]
                for j in range(c, m + 1):
                    A[r][j] -= f * A[c][j]
    beta = [A[i][m] for i in range(m)]
    pred = [sum(beta[a] * X[i][a] for a in range(m)) for i in range(n)]
    ss = sum((ZY[i] - pred[i]) ** 2 for i in range(n)); tt = sum(v * v for v in ZY)
    return beta, 1 - ss / tt


print('\n--- the five perdef ORDER STATISTICS entered together (does the top carry it?) ---')
keys = ['pd_1', 'pd_2', 'pd_3', 'pd_4', 'pd_5']
b, r2 = ols(keys)
print('  ' + '  '.join(f'{k} {v:+.4f}' for k, v in zip(keys, b)) + f'   R2 {r2:.4f}')
print('  (equal weights would be the MEAN; a falling profile means elites carry, a rising one means weak links decide)')

print('\n--- with the other channels held ---')
keys = ['pd_1', 'pd_2', 'pd_3', 'pd_4', 'pd_5', 'rp_1', 'rp_2', 'steals', 'glass']
b, r2 = ols(keys)
print('  ' + '  '.join(f'{k} {v:+.4f}' for k, v in zip(keys, b)) + f'   R2 {r2:.4f}')

print('\n--- the shipped channels, as shipped ---')
for keys in (['pd_mean'], ['pd_mean', 'anchor_capped', 'steals', 'glass'],
             ['pd_mean', 'rp_1', 'rp_2', 'steals', 'glass'],
             ['pd_mean', 'pd_top2', 'anchor_capped', 'steals', 'glass'],
             ['pd_mean', 'pd_1', 'rp_1', 'steals', 'glass']):
    b, r2 = ols(keys)
    print('  ' + '  '.join(f'{k} {v:+.4f}' for k, v in zip(keys, b)) + f'   R2 {r2:.4f}')

print('\n=== THE SAME REGRESSION, SPLIT AT 2014 (where the starters\' perdef sd halves: 15.5 -> 11) ===')
for lo, hi, lab in ((1980, 2013, 'pre-tracking 1980-2013'), (2014, 2026, 'tracking era 2014-2026')):
    ZS = {k: [] for k in FEATS}; YS = []
    for y, g in BY.items():
        if not (lo <= y <= hi): continue
        for k, f in FEATS.items():
            ZS[k].extend(zs([f(x) for x in g]))
        YS.extend(zs([-x['truth']['drtg'] for x in g]))
    nn = len(YS)
    saveZ = {k: Z[k] for k in Z}; saveY = list(ZY)
    Z.clear(); Z.update(ZS)
    ZY.clear(); ZY.extend(YS)
    globals()['n'] = nn
    keys = ['pd_1', 'pd_2', 'pd_3', 'pd_4', 'pd_5']
    b, r2 = ols(keys)
    print(f'  {lab} (n={nn}): ' + '  '.join(f'{k} {v:+.4f}' for k, v in zip(keys, b)) + f'   R2 {r2:.4f}')
    keys = ['pd_mean', 'pd_top2', 'rp_1', 'steals', 'glass']
    b, r2 = ols(keys)
    print(f'     + ' + '  '.join(f'{k} {v:+.4f}' for k, v in zip(keys, b)) + f'   R2 {r2:.4f}')
    keys = ['pd_mean', 'anchor_capped', 'steals', 'glass']
    b, r2 = ols(keys)
    print(f'     shipped channels: ' + '  '.join(f'{k} {v:+.4f}' for k, v in zip(keys, b)) + f'   R2 {r2:.4f}')
    Z.clear(); Z.update(saveZ)
    ZY.clear(); ZY.extend(saveY)
    globals()['n'] = len(ZY)
