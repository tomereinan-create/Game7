# recal_133 — the GLASS channel has its own truth column: bref `drb_percent`, the share of available
# defensive boards a team actually secured. Which aggregation of the five's own drb ratings predicts
# it? Within-season Spearman over the 1,255 fieldable team-seasons, the same instrument as the dial.
import sys, os, csv, math
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, ROOT, REF_LOAD

TR = {}
with open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            y = int(r['season']); v = float(r['drb_percent'])
        except Exception:
            continue
        TR[(y, r['team'])] = v
        TR[(y, r['abbreviation'])] = v

DATA = []
for x in ROWS:
    v = TR.get((x['y'], x['team']))
    if v is None:
        v = TR.get((x['y'], x['ab']))
    if v is None:
        continue
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['real_drb'] = v
    DATA.append(x)
print('team-seasons with a real DRB% :', len(DATA), 'of', len(ROWS))


def rank(v):
    n = len(v); idx = sorted(range(n), key=lambda i: v[i]); r = [0.0]*n; i = 0
    while i < n:
        j = i
        while j+1 < n and v[idx[j+1]] == v[idx[i]]:
            j += 1
        a = (i+j)/2.0+1
        for k in range(i, j+1):
            r[idx[k]] = a
        i = j+1
    return r


def spear(a, b):
    n = len(a)
    if n < 3:
        return float('nan')
    ra, rb = rank(a), rank(b)
    ma, mb = sum(ra)/n, sum(rb)/n
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da = math.sqrt(sum((ra[i]-ma)**2 for i in range(n)))
    db = math.sqrt(sum((rb[i]-mb)**2 for i in range(n)))
    return num/(da*db) if da and db else float('nan')


BY = defaultdict(list)
for x in DATA:
    BY[x['y']].append(x)


def score(w, tag):
    rs = []
    for y, g in sorted(BY.items()):
        if len(g) < 3:
            continue
        rs.append(spear([sum(d*ww for d, ww in zip(x['drb'], w)) for x in g], [x['real_drb'] for x in g]))
    m = sum(rs)/len(rs)
    print(f"  {tag:<42} rho {m:+.4f}   (worst season {min(rs):+.3f})")
    return m


print('\n=== which aggregation of the five drb ratings predicts real DRB% ? ===')
score([1.0, 0.5, 0.1, 0.1, 0.1], 'SHIPPED stack [1, .5, .1, .1, .1]')
score([1.0, 0.0, 0.0, 0.0, 0.0], 'best boardman only')
score([1.0, 1.0, 0.0, 0.0, 0.0], 'top two, flat')
score([1.0, 0.7, 0.4, 0.2, 0.1], 'gentler stack')
score([w*1.8 for w in REF_LOAD], "recal_122's LOAD PROFILE [.24/.22/.20/.18/.16]")
score([0.2]*5, 'flat mean of the five')
score([1.0, 0.75, 0.5, 0.25, 0.1], 'linear ramp')
for b in (0.0, 0.25, 0.5, 0.75, 1.0):
    w = [(1-b)*[1.0, 0.5, 0.1, 0.1, 0.1][i]/1.8 + b*0.2 for i in range(5)]
    score(w, f'blend beta {b:.2f} (0 = shipped, 1 = flat)')

print('\n=== and the same, per decade, for the two that matter ===')
for w, tag in (([1.0, 0.5, 0.1, 0.1, 0.1], 'shipped'), ([x*1.8 for x in REF_LOAD], 'load profile')):
    out = []
    for dec in (1980, 1990, 2000, 2010, 2020):
        rs = [spear([sum(d*ww for d, ww in zip(x['drb'], w)) for x in g], [x['real_drb'] for x in g])
              for y, g in sorted(BY.items()) if y//10*10 == dec and len(g) >= 3]
        out.append(f'{dec}s {sum(rs)/len(rs):+.3f}')
    print(f'  {tag:<14}', ' · '.join(out))

print('\n=== the subject, and the named fives, on the two reads ===')
NAMED = [('76ers', 1985), ('Warriors', 2017), ('Bulls', 1996), ('Pistons', 2004), ('Celtics', 2010),
         ('Thunder', 2026), ('Bucks', 1985), ('76ers', 1984)]
for t, y in NAMED:
    x = next((r for r in DATA if r['y'] == y and t in r['team']), None)
    if not x:
        continue
    g = BY[y]
    sh = sorted(g, key=lambda z: -sum(d*w for d, w in zip(z['drb'], [1.0, .5, .1, .1, .1])))
    lp = sorted(g, key=lambda z: -sum(d*w for d, w in zip(z['drb'], [w2*1.8 for w2 in REF_LOAD])))
    tr = sorted(g, key=lambda z: -z['real_drb'])
    print(f"  {x['team']} '{str(y)[2:]:<4} drb {x['drb']}  real DRB% {x['real_drb']:.1f} rank {tr.index(x)+1}/{len(g)}"
          f"   shipped-stack rank {sh.index(x)+1}   load-profile rank {lp.index(x)+1}")
