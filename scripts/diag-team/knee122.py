"""recal_122 — the CAP becomes a KNEE: unchanged below 99, a gentle slope above it, so the five's
rim protection stops being a dead ceiling shared by 626 of the 1,255 fives. Crossed with the
usage-weighted (assortative) perdef aggregation his ruling asks for.
"""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'grid122.py'), encoding='utf8').read().split("print('\\nBASELINE')")[0])

base = [dict(x=x, drtg=x['drtgRef'], dial=x['def']) for x in D]
m0, _, dec0 = fit(base, quiet=True)


def build2(tilt=0.0, soft=0.0, knee=99.0, w_di=0.55, w_anc=0.13, hold='mean'):
    ws = [0.2 + tilt * (2 - i) * 0.05 for i in range(5)]
    out = []
    for x in D:
        eff = sum(w * p for w, p in zip(ws, x['pd']))
        a = x['dec']['anchor']
        anc = a if a <= knee else knee + (a - knee) * soft
        didx = (w_di * eff + w_anc * anc * 0.9 + 0.12 * min(99, x['dec']['steals']) * 0.9
                + 0.12 * max(0, 60 + x['dec']['glass'] / 4))
        out.append(dict(x=x, drtg=110 - DRTG_COEF * (didx - 55) + x['dec']['huntPen'], didx=didx))
    if hold == 'mean':
        sh = sum(o['drtg'] for o in out) / len(out) - sum(z['drtgRef'] for z in D) / len(D)
    else:
        b = next(o for o in out if o['x']['y'] == 1996 and o['x']['ab'] == 'CHI')
        sh = b['drtg'] - b['x']['drtgRef']
    for o in out:
        o['drtg'] -= sh
        o['dial'] = dial(o['drtg'], o['x']['y'])
    return out


def slacks(out):
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    return [(ab + str(y)[2:], ix[(y, ab)]['dial'], tol - abs(ix[(y, ab)]['dial'] - t)) for ab, y, t, tol in PINS]


print(f'baseline fit {m0:+.4f}  ' + ' '.join(f'{a}{d}({s:+d})' for a, d, s in slacks(base)))
print()
print(f'{"soft":>5} {"tilt":>5} {"hold":>5} {"fit":>8} {"d fit":>8} {"GSW17":>6} {"BOS10":>6} {"UTA98":>6} {"n99":>4} {"minslack":>8}  anchors')
rows = []
for soft in (0.0, 0.15, 0.25, 0.35, 0.5):
    for tilt in (0.0, 0.4, 0.6, 0.8, 1.0, 1.2):
        for hold in ('mean',):
            out = build2(tilt=tilt, soft=soft, hold=hold)
            m, _, dec = fit(out, quiet=True)
            ix = {(o['x']['y'], o['x']['ab']): o for o in out}
            sl = slacks(out)
            bad = audit(out)
            g = ix[(2017, 'GSW')]['dial']
            print(f'{soft:5.2f} {tilt:5.2f} {hold:>5} {m:+8.4f} {m-m0:+8.4f} {g:6d} {ix[(2010,"BOS")]["dial"]:6d} '
                  f'{ix[(1998,"UTA")]["dial"]:6d} {sum(1 for o in out if o["dial"]>=99):4d} {min(s for _,_,s in sl):8d}  '
                  + ('OK   ' if not bad else 'BREAK') + '  ' + ' '.join(f'{a}{d}({s:+d})' for a, d, s in sl))
            if not bad:
                rows.append((g, m, soft, tilt, min(s for _, _, s in sl)))
print('\nno anchor broken, sorted by subject then fit:')
for r in sorted(rows, key=lambda z: (-z[0], -z[1]))[:12]:
    print('  GSW17 %2d  fit %+.4f  soft %.2f tilt %.2f  minslack %d' % r)

print('\n=== FINE: tilt fixed at 0.40 = the reference fives OWN usage shares (.24/.22/.20/.18/.16) ===')
for soft in (0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70):
    out = build2(tilt=0.40, soft=soft, hold='mean')
    m, _, dec = fit(out, quiet=True)
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    sl = slacks(out); bad = audit(out)
    print(f'soft {soft:.2f}  fit {m:+.4f} ({m-m0:+.4f})  ' + ' '.join(f'{k}{v:+.3f}' for k, v in dec.items())
          + f'  GSW17 {ix[(2017,"GSW")]["dial"]:2d} n99 {sum(1 for o in out if o["dial"]>=99):2d} '
          + ('OK   ' if not bad else 'BREAK ' + ','.join(bad)) + ' ' + ' '.join(f'{a}{d}({s:+d})' for a, d, s in sl))

print('\n=== the level shift each candidate needs (drtg points), tilt 0.40 ===')
for soft in (0.45, 0.50, 0.55):
    ws = [0.2 + 0.40 * (2 - i) * 0.05 for i in range(5)]
    tot = 0.0
    for x in D:
        eff = sum(w * p for w, p in zip(ws, x['pd']))
        a = x['dec']['anchor']
        anc = a if a <= 99 else 99 + (a - 99) * soft
        didx = 0.55 * eff + 0.13 * anc * 0.9 + 0.12 * min(99, x['dec']['steals']) * 0.9 + 0.12 * max(0, 60 + x['dec']['glass'] / 4)
        tot += (110 - DRTG_COEF * (didx - 55) + x['dec']['huntPen']) - x['drtgRef']
    sh = tot / len(D)
    print(f'  soft {soft:.2f}: mean drtg shift {sh:+.6f}  -> DIDX_HOLD = {sh/DRTG_COEF:+.6f} didx points')
