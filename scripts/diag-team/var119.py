"""recal_119 — WHICH PREDICTOR, and is the pooled slope the honest one?

The scan measured the five's usage-weighted ballsec at rho 0.745 with -TOV% WITHIN season; the
pooled correlation is only -0.50, because both the cards and the league's real turnover rate drift
hard across eras. This asks (a) what the within-season picture is, (b) whether a within-season
(fixed-effects) slope is steeper than the pooled one, (c) whether a second predictor earns its
place, and (d) what each choice does to the fit and to the Bulls '96, which is the binding anchor.
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
    return my - sxy / sxx * mx, sxy / sxx


print('=== era drift, decade by decade ===')
print('  %6s %6s %8s %8s %8s' % ('decade', 'n', 'wball', 'realTOV', 'rho(in-season)'))
for dec in (1980, 1990, 2000, 2010, 2020):
    g = [x for x in B if dec <= x['y'] < dec + 10]
    rs = [spear([z['wball'] for z in BY[y]], [-z['truth']['tov'] for z in BY[y]])
          for y in SEASONS if dec <= y < dec + 10]
    print('  %6d %6d %8.2f %8.2f %8.3f' % (dec, len(g), sum(z['wball'] for z in g) / len(g),
                                           sum(z['truth']['tov'] for z in g) / len(g),
                                           sum(rs) / len(rs)))
allrho = [spear([z['wball'] for z in BY[y]], [-z['truth']['tov'] for z in BY[y]]) for y in SEASONS]
print('  within-season rho(wball, -TOV%%) averaged over 47 seasons: %.3f' % (sum(allrho) / len(allrho)))
print('  pooled pearson %.3f' % pear([x['wball'] for x in B], [-x['truth']['tov'] for x in B]))
print()

print('=== the slope: pooled vs within-season (fixed effects) ===')
a0, b0 = ols([x['wball'] for x in B], [x['truth']['tov'] for x in B])
num = den = 0.0
for y in SEASONS:
    g = BY[y]
    mx = sum(z['wball'] for z in g) / len(g)
    my = sum(z['truth']['tov'] for z in g) / len(g)
    num += sum((z['wball'] - mx) * (z['truth']['tov'] - my) for z in g)
    den += sum((z['wball'] - mx) ** 2 for z in g)
bfe = num / den
print('  pooled slope   %+.5f TOV%% per ballsec pt' % b0)
print('  within-season  %+.5f  (%.2fx the pooled slope)' % (bfe, bfe / b0))
print()

print('=== does a second predictor earn its place? (within-season, on the residual) ===')
for nm, f in (('wplay (playmaking volume)', lambda z: z['wplay']),
              ('offRaw itself', lambda z: z['offRaw'])):
    rs = []
    for y in SEASONS:
        g = BY[y]
        mx = sum(z['wball'] for z in g) / len(g)
        my = sum(z['truth']['tov'] for z in g) / len(g)
        res = [(z['truth']['tov'] - my) - bfe * (z['wball'] - mx) for z in g]
        mz = sum(f(z) for z in g) / len(g)
        rs.append(pear([f(z) - mz for z in g], res))
    print('  %-28s residual pearson %.3f' % (nm, sum(rs) / len(rs)))
