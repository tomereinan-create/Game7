"""recal_105 — before/after, one script. Reads joined_before.json / joined_after.json.
Team OVR is src/ui/TeamDb.tsx's ovrOf: round((off + def) / 2) of the two all-time dials."""
import io, json, math, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))

TEN = [(1996, 'Chicago Bulls'), (1997, 'Chicago Bulls'), (2017, 'Golden State Warriors'),
       (1987, 'Los Angeles Lakers'), (1986, 'Boston Celtics'), (2014, 'San Antonio Spurs'),
       (2005, 'Phoenix Suns'), (2026, 'Oklahoma City Thunder'), (2024, 'Boston Celtics'),
       (2013, 'Miami Heat')]


def load(t):
    return json.load(io.open(os.path.join(HERE, 'joined_%s.json' % t), encoding='utf8'))


def dec(y):
    return 1980 if y < 1990 else 1990 if y < 2000 else 2000 if y < 2010 else 2010 if y < 2020 else 2020


def ovr(x):
    return round((x['off'] + x['def']) / 2)


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

print('=== TEN TEAMS — the Team DB row: OFF / DEF / OVR ===')
print('%-28s %14s %14s %14s' % ('', 'OFF', 'DEF', 'OVR'))
for y, t in TEN:
    a, b = ia[(y, t)], ib[(y, t)]
    print("%-28s %6d -> %-5d %6d -> %-5d %6d -> %-5d" %
          ("%s '%02d" % (t, y % 100), a['off'], b['off'], a['def'], b['def'], ovr(a), ovr(b)))

print()
print('=== DECADE MEANS ===')
print('%-8s %5s | %9s %9s %6s %6s | %9s %9s | %9s %9s' %
      ('decade', 'n', 'OFF before', 'OFF after', 'med', 'max', 'DEF before', 'DEF after', 'OVR before', 'OVR after'))
for k in (1980, 1990, 2000, 2010, 2020):
    ga = [x for x in A if dec(x['y']) == k]; gb = [x for x in B if dec(x['y']) == k]
    ob = sorted(x['off'] for x in gb)
    print('%-8s %5d | %9.1f %9.1f %6d %6d | %9.1f %9.1f | %9.1f %9.1f' %
          (k, len(ga), sum(x['off'] for x in ga)/len(ga), sum(ob)/len(ob), ob[len(ob)//2], ob[-1],
           sum(x['def'] for x in ga)/len(ga), sum(x['def'] for x in gb)/len(gb),
           sum(ovr(x) for x in ga)/len(ga), sum(ovr(x) for x in gb)/len(gb)))

print()
print('=== FIT: within-season Spearman, mean over 47 seasons (a per-season shift is monotone) ===')
for key, sign, lab in (('off', +1, 'OFF'), ('def', -1, 'DEF')):
    for tag, k in (('ALL', None),) + tuple((str(d), d) for d in (1980, 1990, 2000, 2010, 2020)):
        def f(src):
            bs = defaultdict(list)
            for x in src:
                if k is None or dec(x['y']) == k:
                    bs[x['y']].append(x)
            v = [spearman([z[key] for z in g], [sign*z['truth']['drtg' if key == 'def' else 'ortg'] for z in g])
                 for g in bs.values() if len(g) >= 3]
            return sum(v)/len(v)
        print('  %-4s %-5s  %+.3f -> %+.3f' % (lab, tag, f(A), f(B)))

print()
print('=== DEF UNTOUCHED (assert) ===')
print('  DEF dial readings that moved: %d of %d' % (sum(1 for k in ia if ia[k]['def'] != ib[k]['def']), len(ia)))
print('  drtgRef readings that moved:  %d of %d' % (sum(1 for k in ia if ia[k]['drtgRef'] != ib[k]['drtgRef']), len(ia)))
print('  offRaw readings that moved:   %d of %d  (teamOffense is untouched)' %
      (sum(1 for k in ia if ia[k]['offRaw'] != ib[k]['offRaw']), len(ia)))
print('  OFF dial readings that moved: %d of %d' % (sum(1 for k in ia if ia[k]['off'] != ib[k]['off']), len(ia)))
n99 = [x for x in B if x['off'] == 99]
print('  fives reading OFF 99: %d  (%s)' % (len(n99), ', '.join("%s '%02d" % (x['team'], x['y'] % 100) for x in sorted(n99, key=lambda z: -z['offRaw'])[:10])))

print()
print('=== ALL-TIME TOP 10 BY TEAM OVR, after ===')
srt = sorted(B, key=lambda x: (-ovr(x), -x['off']))
for i, x in enumerate(srt[:10]):
    a = ia[(x['y'], x['team'])]
    print("  %2d. %-26s '%02d  OFF %2d DEF %2d OVR %2d   (was OFF %2d DEF %2d OVR %2d)  real MOV %+.1f" %
          (i+1, x['team'], x['y'] % 100, x['off'], x['def'], ovr(x), a['off'], a['def'], ovr(a), x['truth']['mov']))

print()
print('=== 2026 TOP 8 BY TEAM OVR, after, with the real NET rating rank ===')
g26 = [x for x in B if x['y'] == 2026]
net = sorted(g26, key=lambda z: -(z['truth']['ortg'] - z['truth']['drtg']))
for i, x in enumerate(sorted(g26, key=lambda z: -ovr(z))[:8]):
    a = ia[(x['y'], x['team'])]
    print('  %d. %-26s OFF %2d DEF %2d OVR %2d   (was %2d/%2d/%2d)   real NET rank %2d/24 (%+.1f)' %
          (i+1, x['team'], x['off'], x['def'], ovr(x), a['off'], a['def'], ovr(a),
           net.index(x)+1, x['truth']['ortg'] - x['truth']['drtg']))

print()
print('=== does the COMPOSITE hold up? OVR vs real MOV / wins, all 1,255 ===')
for lab, src in (('before', A), ('after', B)):
    bs = defaultdict(list)
    for x in src:
        bs[x['y']].append(x)
    mov = sum(spearman([ovr(z) for z in g], [z['truth']['mov'] for z in g]) for g in bs.values())/len(bs)
    win = sum(spearman([ovr(z) for z in g], [z['truth']['w'] for z in g]) for g in bs.values())/len(bs)
    print('  %-6s  within-season Spearman(OVR, MOV) %.3f   Spearman(OVR, W) %.3f' % (lab, mov, win))
