"""recal_100 — the before/after, one script.

    npx vite-node scripts/diag-team/sweep.ts && python scripts/diag-team/fit.py   # on the OLD engine
    cp scripts/diag-team/joined.json scripts/diag-team/joined_before.json
    ...apply the round, then the same two, then joined_after.json...
    python scripts/diag-team/ba100.py
"""
import io, json, math, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))

TEN = [(2026, 'Oklahoma City Thunder'), (2026, 'Detroit Pistons'), (2026, 'Philadelphia 76ers'),
       (2026, 'Boston Celtics'), (1996, 'Chicago Bulls'), (2004, 'Detroit Pistons'),
       (2005, 'San Antonio Spurs'), (2008, 'Boston Celtics'), (2017, 'Golden State Warriors'),
       (2013, 'Miami Heat')]


def load(t):
    return json.load(io.open(os.path.join(HERE, 'joined_%s.json' % t), encoding='utf8'))


def dec(y):
    return 1980 if y < 1990 else 1990 if y < 2000 else 2000 if y < 2010 else 2010 if y < 2020 else 2020


def rank(v):
    idx = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0]*len(v); i = 0
    while i < len(idx):
        j = i
        while j+1 < len(idx) and v[idx[j+1]] == v[idx[i]]: j += 1
        a = (i+j)/2.0 + 1
        for k in range(i, j+1): r[idx[k]] = a
        i = j+1
    return r


def spearman(a, b):
    ra, rb = rank(a), rank(b); n = len(a); ma = sum(ra)/n; mb = sum(rb)/n
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da = math.sqrt(sum((x-ma)**2 for x in ra)); db = math.sqrt(sum((x-mb)**2 for x in rb))
    return num/(da*db) if da and db else 0.0


A, B = load('before'), load('after')
ia = {(x['y'], x['team']): x for x in A}
ib = {(x['y'], x['team']): x for x in B}

print('=== TEN TEAMS — the dial the team screen shows ===')
print('%-28s %10s %10s | %10s %10s' % ('', 'DEF before', 'DEF after', 'OFF before', 'OFF after'))
for y, t in TEN:
    a, b = ia[(y, t)], ib[(y, t)]
    print("%-28s %10d %10d | %10d %10d" % ("%s '%02d" % (t, y % 100), a['def'], b['def'], a['off'], b['off']))

print()
print('=== DECADE MEANS ===')
print('%-8s %5s | %9s %9s %6s %6s | %9s %9s' % ('decade', 'n', 'DEF before', 'DEF after', 'med', 'max', 'OFF before', 'OFF after'))
for k in (1980, 1990, 2000, 2010, 2020):
    ga = [x for x in A if dec(x['y']) == k]; gb = [x for x in B if dec(x['y']) == k]
    db = sorted(x['def'] for x in gb)
    print('%-8s %5d | %9.1f %9.1f %6d %6d | %9.1f %9.1f' %
          (k, len(ga), sum(x['def'] for x in ga)/len(ga), sum(db)/len(db), db[len(db)//2], db[-1],
           sum(x['off'] for x in ga)/len(ga), sum(x['off'] for x in gb)/len(gb)))

print()
print('=== FIT (within-season Spearman, mean over 47 seasons) ===')
for key, sign, lab in (('def', -1, 'DEF'), ('off', +1, 'OFF')):
    for tag, rows in (('ALL', None),) + tuple((str(k), k) for k in (1980, 1990, 2000, 2010, 2020)):
        def f(src):
            bs = defaultdict(list)
            for x in src:
                if rows is None or dec(x['y']) == rows:
                    bs[x['y']].append(x)
            v = [spearman([z[key] for z in g], [sign*z['truth']['drtg' if key == 'def' else 'ortg'] for z in g])
                 for g in bs.values() if len(g) >= 3]
            return sum(v)/len(v)
        print('  %-4s %-5s  %+.3f -> %+.3f' % (lab, tag, f(A), f(B)))

print()
print('=== 2026, every team, with the real DRtg rank ===')
g26 = sorted([x for x in B if x['y'] == 2026], key=lambda z: -z['def'])
for x in g26:
    print('  %-26s %3d -> %3d   real DRtg rank %2d/24 (%.1f)' %
          (x['team'], ia[(x['y'], x['team'])]['def'], x['def'], x['truth_def_rank'], x['truth']['drtg']))

print()
n99 = [x for x in B if x['def'] == 99]
print('fives reading 99: %d  (%s)' % (len(n99), ', '.join("%s '%02d" % (x['team'], x['y'] % 100) for x in n99)))
print('OFF readings that moved: %d of %d   offRaw moved: %d' % (
    sum(1 for k in ia if ia[k]['off'] != ib[k]['off']), len(ia),
    sum(1 for k in ia if ia[k]['offRaw'] != ib[k]['offRaw'])))
