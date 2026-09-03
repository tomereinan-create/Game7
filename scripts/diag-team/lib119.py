"""recal_119 — the shared measurement bench: the board, the OLS fit, the OFF gauge re-freeze
(mirroring scripts/gauge105.ts) and the within-season Spearman fit, so every probe reads the same
numbers. The possession-loss channel is a TERMINAL MULTIPLIER, so a size sweep never has to re-run
team_offense: offRaw_new = offRaw * (1 - tov/100) / (1 - TOV_REF/100)."""
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


_tv = [x['truth']['tov'] for x in B]
_wb = [x['wball'] for x in B]
_n = len(B)
_mx, _my = sum(_wb) / _n, sum(_tv) / _n
TOV_SLOPE = sum((_wb[i] - _mx) * (_tv[i] - _my) for i in range(_n)) / sum((v - _mx) ** 2 for v in _wb)
TOV_INT = _my - TOV_SLOPE * _mx
TOV_REF = _my


def offs(size, lo=9.0, hi=19.0, intercept=None, slope=None, ref=None):
    a = TOV_INT if intercept is None else intercept
    b = TOV_SLOPE if slope is None else slope
    r = TOV_REF if ref is None else ref
    o = {}
    for x in B:
        t = a + b * x['wball']
        t = min(hi, max(lo, r + size * (t - r)))
        o[(x['y'], x['ab'])] = x['offRaw'] * (1 - t / 100.0) / (1 - r / 100.0)
    return o


def fit(off):
    per = {y: spear([off[(x['y'], x['ab'])] for x in BY[y]], [x['truth']['ortg'] for x in BY[y]])
           for y in SEASONS}
    return sum(per.values()) / len(per), per


def gauge(off):
    """The frozen OFF block, re-derived exactly as scripts/gauge105.ts derives it."""
    lvl = {y: round(sum(off[(x['y'], x['ab'])] for x in BY[y]) / len(BY[y]), 3) for y in SEASONS}
    ref = round(sum(lvl.values()) / len(lvl), 4)
    adj = {k: off[k] - lvl[k[0]] + ref for k in off}
    vals = sorted(adj.values())
    mn = round(vals[0] * 100) / 100
    md = round(vals[int(round(0.5 * (len(vals) - 1)))] * 100) / 100
    top = round(adj[(2017, 'GSW')] * 100) / 100
    return dict(lvl=lvl, ref=ref, mn=mn, md=md, top=top, adj=adj)


def s71(v, mn, md, tp):
    x = 1 + 49.0 * (v - mn) / (md - mn) if v <= md else 50 + 49.0 * (v - md) / (tp - md)
    return int(round(max(1.0, min(99.0, x))))


def dialer(g):
    return lambda y, ab: s71(g['adj'][(y, ab)], g['mn'], g['md'], g['top'])


def srank(off, y, ab):
    v = off[(y, ab)]
    return sum(1 for x in BY[y] if off[(x['y'], x['ab'])] > v) + 1, len(BY[y])


def trank(y, ab):
    v = [x for x in BY[y] if x['ab'] == ab][0]['truth']['ortg']
    return sum(1 for x in BY[y] if x['truth']['ortg'] > v) + 1, len(BY[y])
