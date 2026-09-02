"""recal_100 — WHERE THE LEVEL DRIFT IS. Decade means of the shipped dials, and the per-season
league mean of drtgRef that the all-time gauge maps. Reads scripts/diag-team/joined.json."""
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
print('%-6s %5s | %8s %6s %6s | %8s %6s %6s | %9s %8s' %
      ('decade', 'n', 'DEF mean', 'med', 'max', 'OFF mean', 'med', 'max', 'drtgRef', 'offRaw'))
for k in sorted(by):
    g = by[k]
    dd = sorted(x['def'] for x in g); oo = sorted(x['off'] for x in g)
    print('%-6s %5d | %8.1f %6d %6d | %8.1f %6d %6d | %9.3f %8.2f' %
          (k, len(g), sum(dd)/len(dd), dd[len(dd)//2], dd[-1], sum(oo)/len(oo), oo[len(oo)//2], oo[-1],
           sum(x['drtgRef'] for x in g)/len(g), sum(x['offRaw'] for x in g)/len(g)))

print()
print('per-season league level (what an era-relative recentring would subtract):')
bs = defaultdict(list)
for x in d:
    bs[x['y']].append(x)
print('%6s %4s %10s %7s %10s %7s | %8s %8s' % ('season', 'n', 'drtgRef mu', 'sd', 'offRaw mu', 'sd', 'DEF mean', 'DEF max'))
for y in sorted(bs):
    g = bs[y]
    r = [x['drtgRef'] for x in g]; o = [x['offRaw'] for x in g]
    print('%6d %4d %10.3f %7.3f %10.2f %7.2f | %8.1f %8d' %
          (y, len(g), sum(r)/len(r), sd(r), sum(o)/len(o), sd(o), sum(x['def'] for x in g)/len(g), max(x['def'] for x in g)))

print()
print('REAL DRtg / ORtg league level, for comparison (bref):')
print('%6s %10s %8s %10s %8s' % ('season', 'DRtg mu', 'sd', 'ORtg mu', 'sd'))
for y in sorted(bs):
    g = bs[y]
    r = [x['truth']['drtg'] for x in g]; o = [x['truth']['ortg'] for x in g]
    print('%6d %10.2f %8.2f %10.2f %8.2f' % (y, sum(r)/len(r), sd(r), sum(o)/len(o), sd(o)))
