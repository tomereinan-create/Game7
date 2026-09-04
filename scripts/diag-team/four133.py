# recal_133 — the four-factor instrument. didx's three physical channels each have their OWN truth
# column in data/bref/Team Summaries.csv:
#     shot defence  -> opp_e_fg_percent      (the perdef + rim-anchor channels)
#     ball pressure -> opp_tov_percent       (the steals channel)
#     the glass     -> drb_percent           (the glass channel)
# recal_94 chose the channel WEIGHTS against DRtg. Nobody has ever checked the channel SHAPES
# against the outcome each channel is supposed to produce. Within-season Spearman, 1,255 fives.
import sys, os, csv, math
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, ROOT, REF_LOAD

COLS = ('opp_e_fg_percent', 'opp_tov_percent', 'drb_percent')
TR = {}
with open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            y = int(r['season'])
        except Exception:
            continue
        d = {}
        for c in COLS:
            try:
                d[c] = float(r[c])
            except Exception:
                d[c] = None
        TR[(y, r['team'])] = d
        TR[(y, r['abbreviation'])] = d

for x in ROWS:
    t = TR.get((x['y'], x['team'])) or TR.get((x['y'], x['ab'])) or {}
    x['t'] = t
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)


def rank(v):
    m = len(v); idx = sorted(range(m), key=lambda i: v[i]); r = [0.0]*m; i = 0
    while i < m:
        j = i
        while j+1 < m and v[idx[j+1]] == v[idx[i]]:
            j += 1
        a = (i+j)/2.0+1
        for k in range(i, j+1):
            r[idx[k]] = a
        i = j+1
    return r


def spear(a, b):
    m = len(a)
    ra, rb = rank(a), rank(b)
    ma, mb = sum(ra)/m, sum(rb)/m
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(m))
    da = math.sqrt(sum((ra[i]-ma)**2 for i in range(m)))
    db = math.sqrt(sum((rb[i]-mb)**2 for i in range(m)))
    return num/(da*db) if da and db else float('nan')


def score(f, col, sign=-1.0):
    by = defaultdict(list)
    for x in ROWS:
        if x['t'].get(col) is not None:
            by[x['y']].append(x)
    rs = [spear([f(x) for x in g], [sign * x['t'][col] for x in g]) for g in by.values() if len(g) >= 3]
    return sum(rs)/len(rs), len(rs)


print('=== SHOT DEFENCE: the rim anchor vs opponent eFG% (sign flipped: higher read = lower eFG) ===')
print('   (the anchor is read beside nothing here — it is the raw channel test recal_94 never ran)')
for a2 in (0.0, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.45, 0.60):
    r, k = score(lambda x, a=a2: x['rp'][0] + a * x['rp'][1] * (x['rp'][1]/99), 'opp_e_fg_percent')
    print(f"  ANCHOR_2ND {a2:.2f}   rho {r:+.4f}   ({k} seasons)")
print('  --- for reference, the five\'s perdef through the load profile:')
r, k = score(lambda x: sum(pd*w for pd, w in zip(x['pd'], REF_LOAD)), 'opp_e_fg_percent')
print(f"  effDi (load profile)  rho {r:+.4f}")

print('\n=== BALL PRESSURE: the steals read vs opponent TOV% ===')
r, _ = score(lambda x: min(99, x['dec']['steals']), 'opp_tov_percent', sign=+1.0)
print(f"  shipped steals        rho {r:+.4f}")
r, _ = score(lambda x: x['dec']['team'], 'opp_tov_percent', sign=+1.0)
print(f"  team perimdisrupt     rho {r:+.4f}")
r, _ = score(lambda x: x['dec']['onball'], 'opp_tov_percent', sign=+1.0)
print(f"  onball only           rho {r:+.4f}")

print('\n=== THE GLASS: the drb stack vs real DRB% ===')
for w, tag in (([1.0, .5, .1, .1, .1], 'SHIPPED [1, .5, .1, .1, .1]'),
               ([1.0, .5, .35, .35, .35], '[1, .5, .35, .35, .35]'),
               ([1.0, .6, .25, .25, .25], '[1, .6, .25, .25, .25]'),
               ([1.0, .5, .3, .3, .3], '[1, .5, .3, .3, .3]'),
               ([1.0, .5, .4, .4, .4], '[1, .5, .4, .4, .4]'),
               ([1.0, .45, .35, .35, .35], '[1, .45, .35, .35, .35]'),
               ([1.0, .55, .35, .35, .35], '[1, .55, .35, .35, .35]')):
    r, _ = score(lambda x, w=w: sum(d*ww for d, ww in zip(x['drb'], w)), 'drb_percent', sign=+1.0)
    print(f"  {tag:<30} rho {r:+.4f}")

print('\n=== the SUBJECT and the pinned fives on the two channels being re-shaped ===')
for t, y in (('76ers', 1985), ('Warriors', 2017), ('Bulls', 1996), ('Pistons', 2004),
             ('Thunder', 2026), ('Celtics', 2010), ('Bucks', 1985), ('76ers', 1984)):
    x = next((r for r in ROWS if r['y'] == y and t in r['team']), None)
    if not x:
        continue
    print(f"  {x['team']} '{str(y)[2:]:<4} rp {x['rp'][:2]} anchor .35 {x['rp'][0]+0.35*x['rp'][1]**2/99:6.2f} "
          f"-> .20 {x['rp'][0]+0.20*x['rp'][1]**2/99:6.2f}   real opp eFG {x['t'].get('opp_e_fg_percent')}   "
          f"drb {x['drb']}  real DRB% {x['t'].get('drb_percent')}")
