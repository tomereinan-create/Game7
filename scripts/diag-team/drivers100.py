"""recal_100 — WHAT drifts across eras, term by term. If the level drift lives in one channel of
didx, the fix belongs in that channel; if it lives in all of them, it is a league-level effect and
the fix belongs in the scale."""
import io, json, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(io.open(os.path.join(HERE, 'joined.json'), encoding='utf8'))


def dec(y):
    return 1980 if y < 1990 else 1990 if y < 2000 else 2000 if y < 2010 else 2010 if y < 2020 else 2020


def sd(v):
    m = sum(v)/len(v)
    return (sum((x-m)**2 for x in v)/max(1, len(v)-1))**0.5


by = defaultdict(list)
for x in d:
    by[dec(x['y'])].append(x)
C = 0.181
print('the didx channels of the OVR-max five, by decade (drtg = 110 - 0.181*(didx-55))')
print('%-6s %5s | %8s %8s %8s %8s | %8s %9s' % ('decade', 'n', 'perdefMu', 'anchor', 'steals', 'glassT', 'didx', 'drtgRef'))
for k in sorted(by):
    g = by[k]
    pm = [x['dec']['sumPerdef']/5 for x in g]
    an = [min(99, x['dec']['anchor']) for x in g]
    st = [min(99, x['dec']['steals']) for x in g]
    gl = [max(0, 60 + x['dec']['glass']/4) for x in g]
    di = [x['dec']['didx'] for x in g]
    print('%-6s %5d | %8.2f %8.2f %8.2f %8.2f | %8.2f %9.3f' %
          (k, len(g), sum(pm)/len(pm), sum(an)/len(an), sum(st)/len(st), sum(gl)/len(gl),
           sum(di)/len(di), sum(x['drtgRef'] for x in g)/len(g)))

print()
print('how much of the 80s -> 20s drtgRef drift each channel owns (DRtg points, + = modern reads WORSE)')
a = by[1980]; b = by[2020]
for lab, f, w in (('perdef  x0.55', lambda x: x['dec']['sumPerdef']/5, 0.55),
                  ('anchor  x0.117', lambda x: min(99, x['dec']['anchor']), 0.13*0.9),
                  ('steals  x0.108', lambda x: min(99, x['dec']['steals']), 0.12*0.9),
                  ('glass   x0.12', lambda x: max(0, 60 + x['dec']['glass']/4), 0.12)):
    ma = sum(f(x) for x in a)/len(a); mb = sum(f(x) for x in b)/len(b)
    print('  %-16s 80s %6.2f -> 20s %6.2f  (%+6.2f)   DRtg contribution %+6.3f' % (lab, ma, mb, mb-ma, -C*w*(mb-ma)))
print('  %-16s %38s   TOTAL           %+6.3f' % ('', '', sum(x['drtgRef'] for x in b)/len(b) - sum(x['drtgRef'] for x in a)/len(a)))

print()
print('and the same for the whole 30-man ROSTER pool of each decade (is it the five or the league?)')
for k in sorted(by):
    g = by[k]
    allp = [p['perdef'] for x in g for p in x['five']] + [p['perdef'] for x in g for p in x['bench']]
    fivep = [p['perdef'] for x in g for p in x['five']]
    print('  %s  best-five perdef %5.2f (sd %4.2f)   whole roster perdef %5.2f   n_roster %d' %
          (k, sum(fivep)/len(fivep), sd(fivep), sum(allp)/len(allp), len(allp)))
