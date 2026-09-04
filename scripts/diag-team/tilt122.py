"""recal_122 — WHICH AGGREGATION DOES THE DATA WANT? the tilt curve and the anchor's dead channel.

Within-season Spearman is invariant to level and to any constant, so every level-hold constant below
is irrelevant to the FIT column and matters only to the DIAL columns.
"""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'variants122.py'), encoding='utf8').read().split('print(\'\\n================ BASELINE')[0])


def build(tilt=0.0, rim_a=None, rim_b=0.0, w_di=0.55, w_anc=0.13, hold=True):
    """effDi = order-statistic mean with a linear tilt; anchor optionally un-capped as rim_a*rp1+rim_b*rp2."""
    ws = [0.2 + tilt * (2 - i) * 0.05 for i in range(5)]
    rows = []
    for x in D:
        eff = sum(w * p for w, p in zip(ws, x['pd']))
        if rim_a is None:
            anc = min(99, x['dec']['anchor'])
        else:
            anc = min(99, (rim_a * x['rp'][0] + rim_b * x['rp'][1]) * x['dec']['hide'])
        rows.append((x, eff, anc))
    off_di = sum(e for _, e, _ in rows) / len(rows) - sum(x['pdmean'] for x in D) / len(D) if hold else 0.0
    off_an = sum(a for _, _, a in rows) / len(rows) - RIM_RAW_MEAN if hold else 0.0
    out = []
    for x, eff, anc in rows:
        didx = (w_di * (eff - off_di) + w_anc * (anc - off_an) * 0.9
                + 0.12 * min(99, x['dec']['steals']) * 0.9 + 0.12 * max(0, 60 + x['dec']['glass'] / 4))
        # hold the didx level too when the weights themselves changed
        drtg = 110 - DRTG_COEF * (didx - 55) + x['dec']['huntPen']
        out.append(dict(x=x, drtg=drtg, dial=dial(drtg, x['y']), didx=didx))
    if hold:
        mu = sum(o['drtg'] for o in out) / len(out)
        mu0 = sum(x['drtgRef'] for x in D) / len(D)
        for o in out:
            o['drtg'] -= (mu - mu0)
            o['dial'] = dial(o['drtg'], o['x']['y'])
    return out


IX = lambda out: {(o['x']['y'], o['x']['ab']): o for o in out}
KEY = [(2017, 'GSW'), (1996, 'CHI'), (2010, 'BOS'), (1998, 'UTA'), (2004, 'DET'), (2026, 'OKC'), (1987, 'LAL'), (2026, 'PHI')]


def line(label, out):
    m, a, dec = fit(out, quiet=True)
    ix = IX(out)
    n99 = sum(1 for o in out if o['dial'] >= 99)
    cells = '  '.join(f"{ab}{str(y)[2:]} {ix[(y,ab)]['dial']:3d}" for y, ab in KEY)
    print(f'{label:34s} fit {m:+.4f}  {cells}  n99 {n99}')


print('\n--- the TILT of the perdef order statistic (t=0 is the shipped MEAN) ---')
for t in (-1.0, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0):
    line(f'tilt {t:+.2f}', build(tilt=t))

print('\n--- the ANCHOR channel: it is CAPPED for 626 of 1255 fives (a dead half-pool) ---')
print('    pool spread of rim_a*rp1+rim_b*rp2, level-held, perdef untouched:')
for a, b in ((1.0, 0.0), (0.85, 0.15), (0.75, 0.25), (0.65, 0.35), (0.6, 0.4), (0.5, 0.5)):
    line(f'rim {a:.2f}*rp1+{b:.2f}*rp2', build(rim_a=a, rim_b=b))

print('\n--- the anchor un-capped AND re-weighted (perdef weight pays for it) ---')
for wd, wa in ((0.55, 0.13), (0.51, 0.17), (0.47, 0.21), (0.43, 0.25), (0.39, 0.29), (0.35, 0.33)):
    line(f'w_di {wd:.2f} / w_anc {wa:.2f}', build(rim_a=0.75, rim_b=0.25, w_di=wd, w_anc=wa))

print('\n--- BOTH: a mild tilt plus the un-capped anchor ---')
for t in (0.0, 0.5, 1.0, 1.5):
    for wd, wa in ((0.47, 0.21), (0.39, 0.29)):
        line(f'tilt {t:+.2f} w {wd:.2f}/{wa:.2f}', build(tilt=t, rim_a=0.75, rim_b=0.25, w_di=wd, w_anc=wa))
