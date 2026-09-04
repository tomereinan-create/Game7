# recal_133 — what shape does the evidence want for the GLASS channel?
# The same instrument round 122 used for perdef: season-z real DRtg regressed on the five's own
# order statistics, entered beside the other three didx channels. 1,255 fieldable team-seasons.
import sys, os, math
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, REF_LOAD

DATA = [x for x in ROWS if x['real_drtg'] is not None]
for x in DATA:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['orbv'] = sorted((p['orb'] for p in x['five']), reverse=True)
    x['eff'] = sum(pd * w for pd, w in zip(x['pd'], REF_LOAD))


def zwithin(key):
    by = defaultdict(list)
    for x in DATA:
        by[x['y']].append(x)
    out = {}
    for y, g in by.items():
        vs = [key(x) for x in g]
        m = sum(vs) / len(vs)
        sd = math.sqrt(sum((v - m) ** 2 for v in vs) / max(1, len(vs) - 1)) or 1.0
        for x, v in zip(g, vs):
            out[id(x)] = (v - m) / sd
    return [out[id(x)] for x in DATA]


def ols(X, y):
    n, k = len(X), len(X[0])
    XtX = [[sum(X[i][a] * X[i][b] for i in range(n)) for b in range(k)] for a in range(k)]
    Xty = [sum(X[i][a] * y[i] for i in range(n)) for a in range(k)]
    M = [row[:] + [Xty[i]] for i, row in enumerate(XtX)]
    for c in range(k):
        p = max(range(c, k), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        pv = M[c][c]
        M[c] = [v / pv for v in M[c]]
        for r in range(k):
            if r != c and M[r][c]:
                f = M[r][c]
                M[r] = [a - f * b for a, b in zip(M[r], M[c])]
    beta = [M[i][k] for i in range(k)]
    yh = [sum(X[i][a] * beta[a] for a in range(k)) for i in range(n)]
    my = sum(y) / n
    ss = sum((y[i] - my) ** 2 for i in range(n))
    rs = sum((y[i] - yh[i]) ** 2 for i in range(n))
    return beta, 1 - rs / ss


Y = zwithin(lambda x: -x['real_drtg'])   # higher = better defence

base = {
    'effDi': zwithin(lambda x: x['eff']),
    'anchor': zwithin(lambda x: x['dec']['anchor']),
    'steals': zwithin(lambda x: min(99, x['dec']['steals'])),
}
drbz = [zwithin(lambda x, i=i: x['drb'][i]) for i in range(5)]

print('=== A. the SHIPPED glass, entered whole, beside the other three channels ===')
gl = zwithin(lambda x: x['dec']['glass'])
X = [[1.0, base['effDi'][i], base['anchor'][i], base['steals'][i], gl[i]] for i in range(len(DATA))]
b, r2 = ols(X, Y)
print(f"  const {b[0]:+.4f} effDi {b[1]:+.4f} anchor {b[2]:+.4f} steals {b[3]:+.4f} GLASS(1,.5,.1,.1,.1) {b[4]:+.4f}   R2 {r2:.4f}")

print('\n=== B. the five DRB order statistics entered separately ===')
X = [[1.0, base['effDi'][i], base['anchor'][i], base['steals'][i]] + [drbz[k][i] for k in range(5)] for i in range(len(DATA))]
b, r2 = ols(X, Y)
print(f"  const {b[0]:+.4f} effDi {b[1]:+.4f} anchor {b[2]:+.4f} steals {b[3]:+.4f}")
print('  drb_1..drb_5:', ' '.join(f'{v:+.4f}' for v in b[4:]), f'  R2 {r2:.4f}')
s = sum(max(0.0, v) for v in b[4:])
print('  implied shape (clipped at 0, normalised):', ' '.join(f'{max(0.0,v)/s:.3f}' for v in b[4:]))

print('\n=== C. FLAT glass (mean drb x 1.8), entered whole ===')
glf = zwithin(lambda x: sum(x['drb']) / 5 * 1.8 - x['opp_orb'] if 'opp_orb' in x else sum(x['drb']) / 5 * 1.8)
X = [[1.0, base['effDi'][i], base['anchor'][i], base['steals'][i], glf[i]] for i in range(len(DATA))]
b, r2 = ols(X, Y)
print(f"  const {b[0]:+.4f} effDi {b[1]:+.4f} anchor {b[2]:+.4f} steals {b[3]:+.4f} GLASS(flat) {b[4]:+.4f}   R2 {r2:.4f}")

print('\n=== D. R2 of the whole didx as a function of the glass blend beta (0 = shipped shape, 1 = flat) ===')
DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for beta in (0.0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
    w = [(1 - beta) * DRB_W[i] / 1.8 + beta * 0.2 for i in range(5)]
    g = zwithin(lambda x, w=w: sum(d * ww for d, ww in zip(x['drb'], w)))
    X = [[1.0, base['effDi'][i], base['anchor'][i], base['steals'][i], g[i]] for i in range(len(DATA))]
    b, r2 = ols(X, Y)
    print(f"  beta {beta:.1f}  glass beta {b[4]:+.4f}   R2 {r2:.4f}")

print('\n=== E. the same, but against the OPPONENT-ADJUSTED truth channel: real ORB% allowed ===')
print('  (skipped: bref opp-ORB is not in Team Summaries.csv on this checkout)')
