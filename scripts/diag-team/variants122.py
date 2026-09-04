"""recal_122 — the team DEF dial: can ELITE defenders carry a five?

His ruling, on the Warriors '17 Team DB page (OFF 99, DEF 72): "2 Elite defenders, 3 decent. how 72 def?"

Today defenseVs' didx runs on the five's MEAN perdef (0.55*effDi), so two elite men are averaged
away by three ordinary ones — and the same mean makes a five of five uniformly-good men read like a
summit (Celtics '10 DEF 99, Jazz '98 91). This file measures top-heavy aggregations against
    (i)  the subject dial,
    (ii) the within-season Spearman of the dial vs real DRtg over the 47 seasons, and
    (iii) every team anchor in data/anchors.json.
The DEF gauge block in src/engine/gauges.ts is FROZEN (recal_108) and is NOT re-derived here, so
every candidate must be LEVEL-NEUTRAL on the 1,255 fives: it may re-shape the board, never lift it.
"""
import io, json, math, os, sys
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
D = json.load(io.open(os.path.join(HERE, 'joined.json'), encoding='utf8'))

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
DEF_WORST, DEF_MID, DEF_TOP = 113.0, 110.04, 107.58
DRTG_COEF = 0.181


def scale71(v, lo, mid, top):
    x = 1 + 49 * (v - lo) / (mid - lo) if v <= mid else 50 + 49 * (v - mid) / (top - mid)
    return int(round(max(1, min(99, x))))


def dial(drtg, y):
    adj = drtg - DEF_LEVEL.get(y, DEF_LEVEL[2026]) + DEF_LEVEL_REF
    return scale71(-adj, -DEF_WORST, -DEF_MID, -DEF_TOP)


def rank(v):
    idx = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0] * len(v); i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and v[idx[j + 1]] == v[idx[i]]: j += 1
        a = (i + j) / 2.0 + 1
        for k in range(i, j + 1): r[idx[k]] = a
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = rank(a), rank(b); n = len(a); ma = sum(ra) / n; mb = sum(rb) / n
    num = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    da = math.sqrt(sum((x - ma) ** 2 for x in ra)); db = math.sqrt(sum((x - mb) ** 2 for x in rb))
    return num / (da * db) if da and db else 0.0


def era(y):
    return '80s' if y < 1990 else '90s' if y < 2000 else '00s' if y < 2010 else '10s' if y < 2020 else '20s'


for x in D:
    pd = sorted((p['perdef'] for p in x['five']), reverse=True)
    rp = sorted((p['rimprot'] for p in x['five']), reverse=True)
    x['pd'] = pd
    x['rp'] = rp
    x['pdmean'] = sum(pd) / 5.0
    x['top2'] = (pd[0] + pd[1]) / 2.0
    x['spread'] = x['top2'] - x['pdmean']


def med(v):
    s = sorted(v); n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


SPREAD_MED = med([x['spread'] for x in D])
SPREAD_MEAN = sum(x['spread'] for x in D) / len(D)
RIM_RAW_MEAN = sum(min(99, x['dec']['anchor']) for x in D) / len(D)
print(f'pool: spread median {SPREAD_MED:.3f} mean {SPREAD_MEAN:.3f}   capped-anchor mean {RIM_RAW_MEAN:.3f}')
print(f'pool: perdef-mean mean {sum(x["pdmean"] for x in D)/len(D):.3f}   '
      f'capped anchor at 99 on {sum(1 for x in D if x["dec"]["anchor"] >= 99)} of {len(D)} fives')


def evaluate(name, lift, ref, rim_a=None, rim_b=None, rim_ref=None, quiet=False):
    """didx' = 0.55*effDi' + 0.13*anchor'*0.9 + steals + glass, both channels level-held."""
    out = []
    for x in D:
        eff = x['pdmean'] + lift * (x['spread'] - ref)
        if rim_a is None:
            anc = min(99, x['dec']['anchor'])
        else:
            hide = x['dec']['hide']
            anc = (rim_a * x['rp'][0] + rim_b * x['rp'][1]) * hide + rim_ref
            anc = min(99, anc)
        didx = (0.55 * eff + 0.13 * anc * 0.9 + 0.12 * min(99, x['dec']['steals']) * 0.9
                + 0.12 * max(0, 60 + x['dec']['glass'] / 4))
        drtg = 110 - DRTG_COEF * (didx - 55) + x['dec']['huntPen']
        out.append(dict(x=x, drtg=drtg, dial=dial(drtg, x['y']), didx=didx))
    mu = sum(o['drtg'] for o in out) / len(out)
    mu0 = sum(x['drtgRef'] for x in D) / len(D)
    if not quiet:
        print(f'\n### {name}   level drtgRef {mu0:.4f} -> {mu:.4f} ({mu-mu0:+.4f})')
    return out, mu - mu0


def fit(out, label='', quiet=False):
    by = defaultdict(list)
    for o in out:
        by[o['x']['y']].append(o)
    per = []
    for y, g in by.items():
        per.append((y, spearman([-o['drtg'] for o in g], [-o['x']['truth']['drtg'] for o in g])))
    m = sum(v for _, v in per) / len(per)
    dec = {}
    for e in ['80s', '90s', '00s', '10s', '20s']:
        gg = [o for o in out if era(o['x']['y']) == e]
        dec[e] = spearman([-o['drtg'] for o in gg], [-o['x']['truth']['drtg'] for o in gg])
    allrho = spearman([-o['drtg'] for o in out], [-o['x']['truth']['drtg'] for o in out])
    if not quiet:
        print(f'  FIT{label}: per-season mean {m:+.4f}   pooled-by-era ' +
              '  '.join(f'{e} {dec[e]:+.3f}' for e in dec))
    return m, allrho, dec


SUBJ = [(2017, 'GSW'), (2016, 'GSW'), (2015, 'GSW'), (1996, 'CHI'), (2004, 'DET'), (2010, 'BOS'),
        (1998, 'UTA'), (2014, 'SAS'), (2026, 'OKC'), (2016, 'CLE'), (1987, 'LAL'), (2026, 'PHI'),
        (2026, 'DET'), (2024, 'BOS')]


def show(out, label=''):
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    byseason = defaultdict(list)
    for o in out:
        byseason[o['x']['y']].append(o)
    for y, ab in SUBJ:
        o = ix.get((y, ab))
        if not o:
            print(f'  {ab} {y}: not fielded'); continue
        g = sorted(byseason[y], key=lambda z: z['drtg'])
        rk = 1 + [id(z) for z in g].index(id(o))
        tr = sorted(byseason[y], key=lambda z: z['x']['truth']['drtg'])
        trk = 1 + [id(z) for z in tr].index(id(o))
        print(f"  {ab} '{str(y)[2:]}  dial {o['dial']:3d}  (was {o['x']['def']:3d})  season DEF rank {rk:2d}/{len(g)}  real {trk:2d}")
    n99 = [o for o in out if o['dial'] >= 99]
    print(f'  fives at 99: {len(n99)} — ' + ', '.join(f"{o['x']['ab']} '{str(o['x']['y'])[2:]}" for o in sorted(n99, key=lambda z: z['drtg'])[:12]))


print('\n================ BASELINE (shipped) ================')
base = [dict(x=x, drtg=x['drtgRef'], dial=x['def'], didx=x['dec']['didx']) for x in D]
fit(base)
show(base)

print('\n================ CANDIDATES ================')
for lift in (0.4, 0.6, 0.8, 1.0, 1.2, 1.4):
    out, dl = evaluate(f'perdef top-2 premium, LIFT={lift} REF={SPREAD_MED}', lift, SPREAD_MED, quiet=True)
    m, a, dec = fit(out, quiet=True)
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    g17 = ix[(2017, 'GSW')]['dial']; b96 = ix[(1996, 'CHI')]['dial']; c10 = ix[(2010, 'BOS')]['dial']
    j98 = ix[(1998, 'UTA')]['dial']; p04 = ix[(2004, 'DET')]['dial']; okc = ix[(2026, 'OKC')]['dial']
    n99 = sum(1 for o in out if o['dial'] >= 99)
    print(f'LIFT {lift:.1f}  level {dl:+.4f}  fit {m:+.4f}  GSW17 {g17:3d}  CHI96 {b96:3d}  '
          f'BOS10 {c10:3d}  UTA98 {j98:3d}  DET04 {p04:3d}  OKC26 {okc:3d}  n99 {n99}')
