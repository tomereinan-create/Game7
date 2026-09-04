"""recal_122 — un-cap the anchor at a weight that HOLDS its variance, then buy the tilt with the fit."""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'grid122.py'), encoding='utf8').read().split("print('\\nBASELINE')")[0])


def sdv(v):
    m = sum(v) / len(v)
    return math.sqrt(sum((z - m) ** 2 for z in v) / (len(v) - 1))


sd_cap = sdv([min(99, x['dec']['anchor']) for x in D])
for a, b in ((1.0, 0.0), (0.9, 0.1), (0.85, 0.15), (0.75, 0.25)):
    s = sdv([a * x['rp'][0] + b * x['rp'][1] for x in D])
    print(f'sd(anchor capped) {sd_cap:.3f}   sd({a}rp1+{b}rp2) {s:.3f}   variance-holding w_anc = {0.13*sd_cap/s:.4f}')

base = [dict(x=x, drtg=x['drtgRef'], dial=x['def']) for x in D]
m0, _, dec0 = fit(base, quiet=True)


def slackmin(out):
    ix = {(o['x']['y'], o['x']['ab']): o for o in out}
    return min(tol - abs(ix[(y, ab)]['dial'] - t) for ab, y, t, tol in PINS)


print(f'\nbaseline fit {m0:+.4f}   GSW17 72  min anchor slack {slackmin(base)}\n')
print(f'{"rim":>10} {"w_anc":>6} {"tilt":>5} {"fit":>8} {"d":>8} {"GSW17":>6} {"BOS10":>6} {"UTA98":>6} {"slack":>6} {"n99":>4}  anchors')
best = []
for a, b in ((1.0, 0.0), (0.9, 0.1)):
    for wa in (0.08, 0.09, 0.10, 0.11, 0.13):
        wd = 0.55 + (0.13 - wa) * 0.9 * (94.234 / 58.934) * 0  # perdef weight left alone; level is re-held below
        for t in (0.6, 0.8, 1.0, 1.2, 1.4):
            out, sh = build(tilt=t, rim_a=a, rim_b=b, w_anc=wa, hold='mean')
            m, _, dec = fit(out, quiet=True)
            ix = {(o['x']['y'], o['x']['ab']): o for o in out}
            bad = audit(out)
            g17 = ix[(2017, 'GSW')]['dial']
            print(f'{a:5.2f}/{b:.2f} {wa:6.2f} {t:5.2f} {m:+8.4f} {m-m0:+8.4f} {g17:6d} '
                  f'{ix[(2010,"BOS")]["dial"]:6d} {ix[(1998,"UTA")]["dial"]:6d} {slackmin(out):6d} '
                  f'{sum(1 for o in out if o["dial"]>=99):4d}  ' + ('OK' if not bad else 'BREAK ' + ','.join(bad)))
            if not bad and g17 >= 76:
                best.append((m, a, b, wa, t, g17, slackmin(out)))
print('\nreachable (GSW17 >= 76, every anchor holds), best fit first:')
for r in sorted(best, reverse=True)[:10]:
    print('  fit %+.4f  rim %.2f/%.2f w_anc %.2f tilt %.2f  GSW17 %d  slack %d' % r)
