"""recal_122 — the joint grid: how much top-heaviness can the dead anchor channel PAY FOR?

The rim anchor is capped at 99 on 626 of the 1,255 fives, so half the board has the same rim reading
and the five's best rim protector earns nothing. Un-capping it BUYS fit (+0.014). A top-heavy perdef
tilt — the aggregation his ruling asks for — COSTS fit. This grid spends one on the other and reports
the subject, the anchors and the fit together.
"""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'variants122.py'), encoding='utf8').read().split("print('\\n================ BASELINE")[0])

# every team:defdial anchor in data/anchors.json (value pins), plus the DEF rank pins of recal_94
PINS = [('CHI', 1996, 99, 0), ('DET', 2004, 84, 4), ('LAL', 1987, 67, 6), ('PHI', 2026, 51, 6),
        ('OKC', 2026, 80, 4), ('DET', 2026, 75, 6), ('BOS', 2024, 65, 3)]
RANKS = [('PHI', 2026, 'min', 7), ('OKC', 2026, 'max', 2), ('CHI', 2005, 'max', 18),
         ('NYK', 1998, 'max', 16), ('ORL', 2024, 'max', 21), ('SAS', 2020, 'min', 6), ('POR', 2006, 'min', 15)]
KEY = [(2017, 'GSW'), (2016, 'GSW'), (2015, 'GSW'), (1996, 'CHI'), (2004, 'DET'), (2010, 'BOS'),
       (1998, 'UTA'), (2014, 'SAS'), (2026, 'OKC'), (2016, 'CLE')]


def build(tilt=0.0, rim_a=None, rim_b=0.0, w_di=0.55, w_anc=0.13, hold='mean'):
    ws = [0.2 + tilt * (2 - i) * 0.05 for i in range(5)]
    rows = []
    for x in D:
        eff = sum(w * p for w, p in zip(ws, x['pd']))
        anc = min(99, x['dec']['anchor']) if rim_a is None else (rim_a * x['rp'][0] + rim_b * x['rp'][1]) * x['dec']['hide']
        rows.append((x, eff, anc))
    out = []
    for x, eff, anc in rows:
        didx = (w_di * eff + w_anc * anc * 0.9 + 0.12 * min(99, x['dec']['steals']) * 0.9
                + 0.12 * max(0, 60 + x['dec']['glass'] / 4))
        out.append(dict(x=x, drtg=110 - DRTG_COEF * (didx - 55) + x['dec']['huntPen'], didx=didx))
    if hold == 'mean':
        sh = sum(o['drtg'] for o in out) / len(out) - sum(x['drtgRef'] for x in D) / len(D)
    else:  # hold on the summit his ruling named: Bulls '96 read exactly what they read today
        b = next(o for o in out if o['x']['y'] == 1996 and o['x']['ab'] == 'CHI')
        sh = b['drtg'] - b['x']['drtgRef']
    for o in out:
        o['drtg'] -= sh
        o['dial'] = dial(o['drtg'], o['x']['y'])
    return out, sh


def audit(out):
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    bad = []
    for ab, y, t, tol in PINS:
        o = ix.get((y, ab))
        if o is None: continue
        if abs(o['dial'] - t) > tol: bad.append(f'{ab}{str(y)[2:]} {o["dial"]}!={t}+-{tol}')
    by = defaultdict(list)
    for o in out: by[o['x']['y']].append(o)
    for ab, y, kind, lim in RANKS:
        g = sorted(by[y], key=lambda z: z['drtg'])
        o = ix.get((y, ab))
        if o is None: continue
        r = 1 + [id(z) for z in g].index(id(o))
        if kind == 'max' and r > lim: bad.append(f'{ab}{str(y)[2:]} rk{r}>{lim}')
        if kind == 'min' and r < lim: bad.append(f'{ab}{str(y)[2:]} rk{r}<{lim}')
    okc = ix.get((2026, 'OKC')); phi = ix.get((2026, 'PHI'))
    if okc and phi and okc['dial'] < phi['dial']: bad.append('OKC26<PHI26')
    return bad


def line(label, out, sh):
    m, a, dec = fit(out, quiet=True)
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    cells = ' '.join(f"{ab}{str(y)[2:]}{ix[(y,ab)]['dial']:3d}" for y, ab in KEY)
    bad = audit(out)
    n99 = sum(1 for o in out if o['dial'] >= 99)
    print(f'{label:30s} fit {m:+.4f} sh {sh:+.3f} {cells} n99 {n99:3d} ' + ('OK' if not bad else 'BREAK ' + ','.join(bad)))


print('\nBASELINE')
base = [dict(x=x, drtg=x['drtgRef'], dial=x['def']) for x in D]
line('shipped', base, 0.0)

print('\n--- un-capped anchor alone, held on the pool mean vs held on the summit ---')
for a, b in ((1.0, 0.0), (0.9, 0.1), (0.85, 0.15), (0.8, 0.2), (0.75, 0.25), (0.7, 0.3), (0.6, 0.4)):
    for h in ('mean', 'bulls'):
        out, sh = build(rim_a=a, rim_b=b, hold=h)
        line(f'rim {a:.2f}/{b:.2f} hold={h}', out, sh)

print('\n--- the tilt PAID FOR by the un-capped anchor (rim 0.85/0.15) ---')
for t in (0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5):
    for h in ('mean', 'bulls'):
        out, sh = build(tilt=t, rim_a=0.85, rim_b=0.15, hold=h)
        line(f'tilt {t:+.2f} hold={h}', out, sh)

print('\n--- and with more weight on the (now live) anchor ---')
for t in (0.5, 1.0):
    for wd, wa in ((0.55, 0.13), (0.52, 0.16), (0.49, 0.19)):
        out, sh = build(tilt=t, rim_a=0.85, rim_b=0.15, w_di=wd, w_anc=wa, hold='bulls')
        line(f'tilt {t:+.2f} w {wd:.2f}/{wa:.2f}', out, sh)
