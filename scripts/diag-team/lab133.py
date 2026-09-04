# recal_133 — the DEF lab. Recomputes every fieldable five's didx / drtgRef / DEF dial under a
# parametrised didx, re-holds the pool mean (DIDX_HOLD's job), applies the FROZEN gauge block of
# src/engine/gauges.ts, and grades every DEF anchor plus the 47-season within-season Spearman.
#
# Everything it needs is already in sweep.json: each five's perdefs, its anchor (raw x hide, and
# hide == 1 for all 1,255 gauge readings), its steals and its glass. Nothing is re-derived.
import json, csv, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

DRTG_COEF = 0.181
DEF_WORST, DEF_MID, DEF_TOP = 113.0, 110.04, 107.58
DEF_LEVEL = {
    1980: 109.962, 1981: 110.079, 1982: 109.953, 1983: 110.007, 1984: 110.010, 1985: 110.062,
    1986: 109.898, 1987: 109.909, 1988: 109.830, 1989: 109.980, 1990: 109.931, 1991: 109.981,
    1992: 110.031, 1993: 109.731, 1994: 109.890, 1995: 109.878, 1996: 110.012, 1997: 110.035,
    1998: 110.091, 1999: 109.976, 2000: 110.058, 2001: 109.972, 2002: 110.014, 2003: 109.971,
    2004: 110.020, 2005: 110.158, 2006: 110.078, 2007: 110.021, 2008: 110.037, 2009: 110.042,
    2010: 110.033, 2011: 110.006, 2012: 110.003, 2013: 110.017, 2014: 109.973, 2015: 109.877,
    2016: 109.899, 2017: 109.987, 2018: 110.173, 2019: 110.126, 2020: 110.198, 2021: 110.336,
    2022: 110.206, 2023: 110.245, 2024: 110.204, 2025: 110.347, 2026: 110.254,
}
DEF_LEVEL_REF = 110.0319
REF_LOAD = [0.24, 0.22, 0.20, 0.18, 0.16]   # REF_FIVE's own usage shares, sorted descending


def scale71(v, lo, mid, top):
    x = 1 + 49 * (v - lo) / (mid - lo) if v <= mid else 50 + 49 * (v - mid) / (top - mid)
    return int(round(max(1.0, min(99.0, x))))


def def_dial(drtg, season):
    adj = drtg - DEF_LEVEL.get(season, DEF_LEVEL[2026]) + DEF_LEVEL_REF
    return scale71(-adj, -DEF_WORST, -DEF_MID, -DEF_TOP)


def def_dial_f(drtg, season):
    """the unrounded dial, so 'headroom to the next integer' is measurable"""
    adj = drtg - DEF_LEVEL.get(season, DEF_LEVEL[2026]) + DEF_LEVEL_REF
    v = -adj
    lo, mid, top = -DEF_WORST, -DEF_MID, -DEF_TOP
    x = 1 + 49 * (v - lo) / (mid - lo) if v <= mid else 50 + 49 * (v - mid) / (top - mid)
    return max(1.0, min(99.0, x))


sw = json.load(open(os.path.join(HERE, 'sweep.json'), encoding='utf8'))
ROWS = sw['rows']

# ---- truth -------------------------------------------------------------------------------
TRUTH = {}
with open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            y = int(r['season'])
        except Exception:
            continue
        def num(k):
            try: return float(r[k])
            except Exception: return None
        rec = dict(drtg=num('d_rtg'), ortg=num('o_rtg'))
        TRUTH[(y, r['team'])] = rec
        TRUTH[(y, r['abbreviation'])] = rec

for x in ROWS:
    t = TRUTH.get((x['y'], x['team'])) or TRUTH.get((x['y'], x['ab']))
    x['real_drtg'] = t['drtg'] if t else None
    pds = sorted((p['perdef'] for p in x['five']), reverse=True)
    x['pd'] = pds


def spearman(a, b):
    n = len(a)
    if n < 3:
        return float('nan')
    def rk(v):
        idx = sorted(range(n), key=lambda i: v[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[idx[j + 1]] == v[idx[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                r[idx[k]] = avg
            i = j + 1
        return r
    ra, rb = rk(a), rk(b)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    da = math.sqrt(sum((ra[i] - ma) ** 2 for i in range(n)))
    db = math.sqrt(sum((rb[i] - mb) ** 2 for i in range(n)))
    return num / (da * db) if da and db else float('nan')


# ---- the parametrised didx ---------------------------------------------------------------
SHIPPED = dict(w_di=0.55, w_anc=0.13, w_st=0.12, w_gl=0.12,
               knee=99.0, soft=0.5, load=REF_LOAD[:], floor=0.0)


def didx_of(x, K):
    load = K['load']
    tot = sum(load)
    eff = sum(pd * (w / tot) for pd, w in zip(x['pd'], load))
    a = x['dec']['anchor']
    anc = a if a <= K['knee'] else K['knee'] + (a - K['knee']) * K['soft']
    st = min(99.0, x['dec']['steals'])
    gl = max(0.0, 60 + x['dec']['glass'] / 4)
    return K['w_di'] * eff + K['w_anc'] * anc * 0.9 + K['w_st'] * st * 0.9 + K['w_gl'] * gl


BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / len(ROWS)


def board(K):
    """every five's drtgRef + dial under K, with the pool mean re-held exactly where it is now"""
    raw = [didx_of(x, K) for x in ROWS]
    # drtg = 110 - DRTG_COEF*(didx - hold - 55); choose hold so mean drtgRef is unchanged
    drt0 = [110 - DRTG_COEF * (d - 55) for d in raw]
    shift = BASE_MEAN - sum(drt0) / len(drt0)
    out = []
    for x, d, dr in zip(ROWS, raw, drt0):
        drtg = dr + shift
        out.append(dict(row=x, didx=d, drtg=drtg,
                        dial=def_dial(drtg, x['y']), dialf=def_dial_f(drtg, x['y'])))
    # the DIDX_HOLD constant that produces this shift
    hold = shift / DRTG_COEF * -1
    return out, hold + 0.0


def fit(bd):
    byseason = defaultdict(list)
    for e in bd:
        if e['row']['real_drtg'] is not None:
            byseason[e['row']['y']].append(e)
    rhos = []
    for y, g in sorted(byseason.items()):
        if len(g) < 3:
            continue
        rhos.append(spearman([-e['drtg'] for e in g], [-e['row']['real_drtg'] for e in g]))
    return sum(rhos) / len(rhos), len(rhos)


def find(bd, team, y):
    for e in bd:
        if e['row']['y'] == y and team in e['row']['team']:
            return e
    return None


ANCHORS = [
    # (team-substring, season, target, tol, label)
    ('Bulls', 1996, 99, 0, 'Bulls 96 SUMMIT (tol 0)'),
    ('Pistons', 2004, 84, 4, 'Pistons 04'),
    ('Warriors', 2017, 81, 5, 'Warriors 17 (at floor 76)'),
    ('Lakers', 1987, 67, 6, 'Lakers 87'),
    ('76ers', 2026, 51, 6, '76ers 26'),
    ('Thunder', 2026, 80, 4, 'Thunder 26 (reads 84)'),
    ('Pistons', 2026, 75, 6, 'Pistons 26'),
    ('Celtics', 2024, 65, 3, 'Celtics 24'),
]
RANK_PINS = [
    (2026, 'PHI', 'min', 7), (2026, 'OKC', 'max', 2), (2005, 'CHI', 'max', 18),
    (1998, 'NYK', 'max', 16), (2024, 'ORL', 'max', 21), (2020, 'SAS', 'min', 6),
    (2006, 'POR', 'min', 15),
]


def grade(bd, verbose=True):
    ok = True
    lines = []
    for team, y, tgt, tol, lab in ANCHORS:
        e = find(bd, team, y)
        d = e['dial']
        good = abs(d - tgt) <= tol
        ok &= good
        lines.append(f"  {'OK ' if good else 'MISS'} {lab:<28} {d:>3}  (target {tgt} +-{tol}, f={e['dialf']:.2f})")
    # rank pins
    byseason = defaultdict(list)
    for e in bd:
        byseason[e['row']['y']].append(e)
    for y, ab, kind, lim in RANK_PINS:
        g = sorted(byseason[y], key=lambda e: (-e['dial'], e['row']['team']))
        rk = next((i + 1 for i, e in enumerate(g) if e['row']['ab'] == ab), None)
        good = (rk is not None) and (rk >= lim if kind == 'min' else rk <= lim)
        ok &= good
        lines.append(f"  {'OK ' if good else 'MISS'} rank pin {y} {ab} {kind}_rank {lim:<3}  -> {rk}")
    # Thunder >= 76ers order, 2026
    okc, phi = find(bd, 'Thunder', 2026), find(bd, '76ers', 2026)
    good = okc['dial'] > phi['dial']
    ok &= good
    lines.append(f"  {'OK ' if good else 'MISS'} order OKC26 ({okc['dial']}) > PHI26 ({phi['dial']})")
    if verbose:
        print('\n'.join(lines))
    return ok, lines


NAMED = [('76ers', 1985), ('76ers', 1984), ('Celtics', 2010), ('Bucks', 1985), ('Bulls', 1996),
         ('Bulls', 1998), ('Spurs', 2005), ('Pistons', 2004), ('Warriors', 2017),
         ('Thunder', 2026), ('Jazz', 1998), ('76ers', 1980)]


def report(bd, hold, title):
    print('=' * 78)
    print(title)
    r, n = fit(bd)
    print(f"  DIDX_HOLD -> {hold:.4f}   within-season DEF rho (mean of {n}) = {r:+.4f}")
    byera = defaultdict(list)
    for e in bd:
        byera[(e['row']['y'] // 10) * 10].append(e)
    eras = []
    for d in sorted(byera):
        g = defaultdict(list)
        for e in byera[d]:
            if e['row']['real_drtg'] is not None:
                g[e['row']['y']].append(e)
        rs = [spearman([-e['drtg'] for e in gg], [-e['row']['real_drtg'] for e in gg]) for gg in g.values() if len(gg) >= 3]
        eras.append(f"{d}s {sum(rs)/len(rs):+.4f}")
    print('  ', ' · '.join(eras))
    print('  --- named ---')
    for t, y in NAMED:
        e = find(bd, t, y)
        if not e:
            continue
        season = sorted([z for z in bd if z['row']['y'] == y], key=lambda z: -z['dial'])
        srk = next(i + 1 for i, z in enumerate(season) if z is e)
        allt = sorted(bd, key=lambda z: (-z['dial'], z['drtg']))
        art = next(i + 1 for i, z in enumerate(allt) if z is e)
        print(f"   {e['row']['team']} '{str(y)[2:]:<4} DEF {e['dial']:>2} (f {e['dialf']:5.2f})  season {srk}/{len(season)}  all-time #{art}  didx {e['didx']:.2f}")
    print('  --- anchors ---')
    grade(bd)


if __name__ == '__main__':
    bd, hold = board(SHIPPED)
    report(bd, hold, 'SHIPPED')
