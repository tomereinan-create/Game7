"""recal_100 — the OFFENSE side under the same era-relative treatment. MEASURED ONLY: his ruling
was about DEF, and doctrine says an unruled dial does not move. This is the evidence for the round
file's COST note, so the next OFF ruling starts from a number instead of a hunch."""
import io, json, math, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(io.open(os.path.join(HERE, 'joined.json'), encoding='utf8'))


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


def scale71(v, mn, mid, top):
    x = 1 + 49.0*(v-mn)/(mid-mn) if v <= mid else 50 + 49.0*(v-mid)/(top-mid)
    return int(round(max(1.0, min(99.0, x))))


BS = defaultdict(list)
for x in d:
    BS[x['y']].append(x)
byo = defaultdict(list)
for x in d:
    byo[dec(x['y'])].append(x)
MU = {y: sum(z['offRaw'] for z in g)/len(g) for y, g in BS.items()}
MU_REF = sum(MU.values())/len(MU)
print('shipped OFF dial decade means: ' + '  '.join('%d %4.1f' % (k, sum(z['off'] for z in g)/len(g)) for k, g in sorted(byo.items())))
print('offRaw          decade means: ' + '  '.join('%d %6.2f' % (k, sum(z['offRaw'] for z in g)/len(g)) for k, g in sorted(byo.items())))
print('DEF dial        decade means: ' + '  '.join('%d %4.1f' % (k, sum(z['def'] for z in g)/len(g)) for k, g in sorted(byo.items())))
print()
vals = {(x['y'], x['team']): x['offRaw'] - MU[x['y']] + MU_REF for x in d}
vs = sorted(vals.values())
gsw = vals[(2017, 'Golden State Warriors')]
adj = {k: scale71(v, vs[0], vs[min(len(vs)-1, round(0.5*(len(vs)-1)))], gsw) for k, v in vals.items()}
print('IF the same era-relative shift were applied to OFF (summit still the Warriors 17):')
print('  decade means: ' + '  '.join('%d %4.1f' % (k, sum(adj[(z['y'], z['team'])] for z in g)/len(g)) for k, g in sorted(byo.items())))
print('  OFF fit (within-season Spearman vs real ORtg, mean over 47 seasons): shipped %.3f -> shifted %.3f' % (
    sum(spearman([z['off'] for z in g], [z['truth']['ortg'] for z in g]) for g in BS.values())/len(BS),
    sum(spearman([adj[(z['y'], z['team'])] for z in g], [z['truth']['ortg'] for z in g]) for g in BS.values())/len(BS)))
for y, t in ((2017, 'Golden State Warriors'), (2007, 'Phoenix Suns'), (1987, 'Los Angeles Lakers'),
             (1996, 'Chicago Bulls'), (2026, 'Oklahoma City Thunder'), (2026, 'Denver Nuggets')):
    cur = [x['off'] for x in d if x['y'] == y and x['team'] == t]
    if cur:
        print('  %-26s %d  OFF %2d -> %2d' % (t, y, cur[0], adj[(y, t)]))
print()
print('MEAN OFF - MEAN DEF by decade — the balance a DEF-only fix changes:')
print('  %-8s %8s %8s %8s | %8s %8s' % ('decade', 'OFF', 'DEF now', 'gap now', 'DEF (a)', 'gap (a)'))
