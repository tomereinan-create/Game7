"""recal_122 — the fine grid around the landing, with every anchor's SLACK printed."""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'grid122.py'), encoding='utf8').read().split("print('\\nBASELINE')")[0])


def slack(out):
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    s = []
    for ab, y, t, tol in PINS:
        o = ix.get((y, ab))
        s.append(f'{ab}{str(y)[2:]} {o["dial"]:2d}/{t}±{tol}({tol-abs(o["dial"]-t):+d})')
    return '  '.join(s)


base = [dict(x=x, drtg=x['drtgRef'], dial=x['def']) for x in D]
print('BASELINE                     ', slack(base))
m0, _, dec0 = fit(base, quiet=True)
print(f'  fit {m0:+.4f}   per-decade ' + ' '.join(f'{k} {v:+.3f}' for k, v in dec0.items()))

print()
for a, b in ((1.0, 0.0), (0.9, 0.1), (0.85, 0.15)):
    for t in (0.6, 0.8, 1.0):
        for h in ('mean', 'bulls'):
            out, sh = build(tilt=t, rim_a=a, rim_b=b, hold=h)
            m, _, dec = fit(out, quiet=True)
            ix = {(o['x']['y'], o['x']['ab']): o for o in out}
            bad = audit(out)
            print(f'rim {a:.2f}/{b:.2f} tilt {t:.2f} {h:5s} fit {m:+.4f} ({m-m0:+.4f})  GSW17 {ix[(2017,"GSW")]["dial"]:2d}  '
                  f'BOS10 {ix[(2010,"BOS")]["dial"]:2d}  UTA98 {ix[(1998,"UTA")]["dial"]:2d}  '
                  f'n99 {sum(1 for o in out if o["dial"]>=99):2d}  ' + ('OK ' if not bad else 'BREAK '))
            print('       ', slack(out))
