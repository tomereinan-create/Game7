"""recal_119 — FIT THE CHANNEL, THEN SWEEP ITS SIZE.

teamOffense has no possession-loss channel: the baseline is usage-weighted repriced TS and nothing
else, so a five that never turns the ball over is priced identically to one that coughs it up on an
eighth of its trips. Across all 1,255 fives offRaw correlates +0.167 with -TOV% where the real ORtg
correlates +0.451.

The cards carry the signal. This fits TOV% from the five's usage-weighted ball security by OLS,
prices the lost possessions physically -- OFF *= (1 - tov/100) / (1 - TOV_REF/100) -- and sweeps the
size, re-freezing the OFF gauge block at every size exactly as scripts/gauge105.ts does, so the
anchor dials are read on the scale the round would actually ship.
"""
import io, json, math, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
B = json.load(io.open(os.path.join(HERE, 'tov119_board.json'), encoding='utf8'))
BY = defaultdict(list)
for x in B:
    BY[x['y']].append(x)
SEASONS = sorted(BY)


def rank(v):
    idx = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and v[idx[j + 1]] == v[idx[i]]:
            j += 1
        a = (i + j) / 2.0 + 1
        for k in range(i, j + 1):
            r[idx[k]] = a
        i = j + 1
    return r


def pear(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    da = math.sqrt(sum((x - ma) ** 2 for x in a))
    db = math.sqrt(sum((x - mb) ** 2 for x in b))
    return num / (da * db) if da and db else 0.0


def spear(a, b):
    return pear(rank(a), rank(b))


def ols(x, y):
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxy = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    sxx = sum((v - mx) ** 2 for v in x)
    b = sxy / sxx
    return my - b * mx, b


# ---- the fit ----
wb = [x['wball'] for x in B]
tv = [x['truth']['tov'] for x in B]
a0, b0 = ols(wb, tv)
TOV_REF = sum(tv) / len(tv)
print('=== THE FIT: real TOV%% from the five\'s usage-weighted ball security, all %d fives ===' % len(B))
print('  league mean TOV%%  %.3f      mean wball %.2f  (sd %.2f)' %
      (TOV_REF, sum(wb) / len(wb), math.sqrt(sum((v - sum(wb) / len(wb)) ** 2 for v in wb) / (len(wb) - 1))))
print('  TOVhat = %.4f %+.5f * wball        pearson %.3f   spearman %.3f' %
      (a0, b0, pear(wb, tv), spear(wb, tv)))
resid = [tv[i] - (a0 + b0 * wb[i]) for i in range(len(B))]
print('  residual sd %.3f  against a raw TOV%% sd of %.3f' %
      (math.sqrt(sum(v * v for v in resid) / (len(B) - 2)),
       math.sqrt(sum((v - TOV_REF) ** 2 for v in tv) / (len(B) - 1))))
print('  offRaw   vs -TOV%%: pearson %.3f' % pear([x['offRaw'] for x in B], [-t for t in tv]))
print('  realORtg vs -TOV%%: pearson %.3f' % pear([x['truth']['ortg'] for x in B], [-t for t in tv]))
print()

# rails: keep the predictor inside the observed league range
LO, HI = min(tv), max(tv)
print('  observed TOV%% range %.1f .. %.1f   ;  TOVhat range %.2f .. %.2f' %
      (LO, HI, a0 + b0 * max(wb), a0 + b0 * min(wb)))
print()


def mult(x, size, a=a0, b=b0, ref=None, lo=10.0, hi=18.0):
    ref = TOV_REF if ref is None else ref
    t = a + b * x['wball']
    t = min(hi, max(lo, ref + size * (t - ref)))
    return (1 - t / 100.0) / (1 - ref / 100.0)


def offs(size, **kw):
    return {(x['y'], x['ab']): x['offRaw'] * mult(x, size, **kw) for x in B}


def fit(off):
    per = {}
    for y in SEASONS:
        g = BY[y]
        per[y] = spear([off[(x['y'], x['ab'])] for x in g], [x['truth']['ortg'] for x in g])
    return sum(per.values()) / len(per), per


# ---- the gauge, re-frozen at every size exactly as scripts/gauge105.ts does ----
def gauge(off):
    lvl = {}
    for y in SEASONS:
        g = BY[y]
        lvl[y] = round(sum(off[(x['y'], x['ab'])] for x in g) / len(g), 3)
    ref = round(sum(lvl.values()) / len(lvl), 4)
    adj = {k: off[k] - lvl[k[0]] + ref for k in off}
    vals = sorted(adj.values())
    mn = round(vals[0] * 100) / 100
    md = round(vals[int(round(0.5 * (len(vals) - 1)))] * 100) / 100
    top = round(adj[(2017, 'GSW')] * 100) / 100
    return lvl, ref, mn, md, top, adj


def s71(v, mn, md, tp):
    x = 1 + 49.0 * (v - mn) / (md - mn) if v <= md else 50 + 49.0 * (v - md) / (tp - md)
    return int(round(max(1.0, min(99.0, x))))


NAMED = [(2024, 'BOS'), (2023, 'BOS'), (2025, 'BOS'), (2023, 'NYK'), (2005, 'SAC'), (2008, 'BOS'),
         (1996, 'CHI'), (2017, 'GSW'), (2000, 'LAL'), (2018, 'HOU'), (2024, 'DEN')]


def srank(off, y, ab):
    g = BY[y]
    v = off[(y, ab)]
    return sum(1 for x in g if off[(x['y'], x['ab'])] > v) + 1, len(g)


def trank(y, ab):
    g = BY[y]
    v = [x for x in g if x['ab'] == ab][0]['truth']['ortg']
    return sum(1 for x in g if x['truth']['ortg'] > v) + 1, len(g)


print('=== FRONTIER: size -> dials (OFF gauge re-frozen at each size, gauge105.ts rule) ===')
print('  %5s %6s | %4s %5s | %4s %4s %4s %4s %4s | %s' %
      ('size', 'fit', 'BOS24', 'rank', 'CHI96', 'GSW17', 'HOU18', 'LAL00', 'DEN24', 'notes'))
for size in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
    off = offs(size)
    f, _ = fit(off)
    lvl, ref, mn, md, top, adj = gauge(off)
    d = lambda y, ab: s71(adj[(y, ab)], mn, md, top)
    r = srank(off, 2024, 'BOS')
    hou = adj[(2018, 'HOU')] > adj[(2017, 'GSW')]
    print('  %5.2f %6.4f | %4d %2d/%-2d | %4d %4d %4d %4d %4d | %s' %
          (size, f, d(2024, 'BOS'), r[0], r[1], d(1996, 'CHI'), d(2017, 'GSW'), d(2018, 'HOU'),
           d(2000, 'LAL'), d(2024, 'DEN'),
           ('HOU18>GSW17 ' if hou else '') + ('CHI96 out of 68+-3 ' if abs(d(1996, 'CHI') - 68) > 3 else '') +
           ('LAL00 out of 64+-4' if abs(d(2000, 'LAL') - 64) > 4 else '')))
