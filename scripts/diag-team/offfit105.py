"""recal_105 — can the SCALE reach his number? A per-season shift is monotone within a season, so a
five's rank inside its own year is exactly what the dial can express. This asks where the engine puts
the Bulls '96 on offence, and how well teamOffense ranks 1996 at all."""
import io, json, math, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(io.open(os.path.join(HERE, 'joined.json'), encoding='utf8'))
BS = defaultdict(list)
for x in d:
    BS[x['y']].append(x)


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


print('=== the ceiling the SCALE can reach for a five, given where the ENGINE ranks it ===')
print('A per-season shift cannot reorder a season. The best dial a five can get is set by its z')
print('inside its own year and by the all-time spread the gauge maps.')
print()
print('%-26s %5s %8s %6s %6s | %8s %6s' % ('team', 'year', 'offRaw', 'z', 'rank', 'realORtg', 'rank'))
for y, n in ((1996, 'Bulls'), (1997, 'Bulls'), (2017, 'Warriors'), (1987, 'Lakers'), (1986, 'Celtics')):
    g = BS[y]
    me = [x for x in g if n in x['team']][0]
    mu = sum(z['offRaw'] for z in g)/len(g)
    sd = (sum((z['offRaw']-mu)**2 for z in g)/max(1, len(g)-1))**0.5
    ro = sorted(g, key=lambda z: -z['offRaw']); rt = sorted(g, key=lambda z: -z['truth']['ortg'])
    print('%-26s %5d %8.2f %+6.2f %6d | %8.1f %6d' %
          (me['team'], y, me['offRaw'], (me['offRaw']-mu)/sd, ro.index(me)+1, me['truth']['ortg'], rt.index(me)+1))

print()
print('=== how well does teamOffense rank 1996 at all? (within-season Spearman vs real ORtg) ===')
per = {y: spearman([z['offRaw'] for z in g], [z['truth']['ortg'] for z in g]) for y, g in BS.items()}
print('  1996 OFF fit %.3f   ·   all-season mean %.3f' % (per[1996], sum(per.values())/len(per)))
worst = sorted(per.items(), key=lambda t: t[1])[:8]
print('  worst OFF seasons: ' + ', '.join('%d %.2f' % t for t in worst))
perd = {y: spearman([-z['drtgRef'] for z in g], [-z['truth']['drtg'] for z in g]) for y, g in BS.items()}
print('  1996 DEF fit %.3f   ·   all-season mean %.3f' % (perd[1996], sum(perd.values())/len(perd)))

print()
print('=== what OFF dial would the Bulls need for OVR >= 92, and is it reachable? ===')
b96 = [x for x in BS[1996] if 'Bulls' in x['team']][0]
print('  shipped: OFF %d · DEF %d · OVR %d' % (b96['off'], b96['def'], round((b96['off']+b96['def'])/2)))
need = 2*92 - b96['def']
print('  OVR >= 92 with DEF %d needs OFF >= %d' % (b96['def'], need))
g = sorted(BS[1996], key=lambda z: -z['offRaw'])
print('  the seven 1996 fives the ENGINE puts above them, with their real ORtg rank:')
rt = sorted(BS[1996], key=lambda z: -z['truth']['ortg'])
for x in g[:8]:
    tag = '  <-- Bulls' if 'Bulls' in x['team'] else ''
    print('    %-26s offRaw %.2f   realORtg %.1f (rank %2d)%s' % (x['team'], x['offRaw'], x['truth']['ortg'], rt.index(x)+1, tag))
