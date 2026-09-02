"""recal_100 — the three candidate cures, measured side by side on the shipped sweep.

His ruling: "OKC at 59 DEF is wayyy to low. Should be low 80's or very high 70's. In general, no
2026 team having more than 61 DEF is insane."

  SHIPPED   drtgRef -> scale71(-drtgRef, -WORST, -MID, -TOP)                    (what he is looking at)
  (a) SHIFT  adj = drtgRef - mu[season] + MU_REF                                era-relative recentring
  (a') Z     adj = MU_REF + (drtgRef - mu[season]) * SD_REF / sd[season]        recentre AND rescale
  (c) BUCKET one (WORST, MID, TOP) triple re-frozen per decade                  five little dials

Every variant re-freezes the gauge on its OWN adjusted distribution, with the summit pinned to the
Bulls '96 per his recal_94 ruling ("Move the summit to Bulls '96"). Within-season Spearman is
reported for each: (a) and (a') are monotone WITHIN a season by construction, so the fit can only
move where integer rounding merges or splits ties.
"""
import io, json, math, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(io.open(os.path.join(HERE, 'joined.json'), encoding='utf8'))

TEN = [(2026, 'Oklahoma City Thunder'), (2026, 'Detroit Pistons'), (2026, 'Philadelphia 76ers'),
       (2026, 'Boston Celtics'), (1996, 'Chicago Bulls'), (2004, 'Detroit Pistons'),
       (2005, 'San Antonio Spurs'), (2008, 'Boston Celtics'), (2017, 'Golden State Warriors'),
       (2013, 'Miami Heat')]


def dec(y):
    return 1980 if y < 1990 else 1990 if y < 2000 else 2000 if y < 2010 else 2010 if y < 2020 else 2020


def sdev(v):
    m = sum(v)/len(v)
    return (sum((x-m)**2 for x in v)/max(1, len(v)-1))**0.5


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


BS = defaultdict(list)
for x in d:
    BS[x['y']].append(x)
MU = {y: sum(z['drtgRef'] for z in g)/len(g) for y, g in BS.items()}
SD = {y: sdev([z['drtgRef'] for z in g]) for y, g in BS.items()}
MU_REF = sum(MU.values())/len(MU)
SD_REF = sum(SD.values())/len(SD)
print('MU_REF (mean of the 47 season means) %.4f   SD_REF (mean of the 47 season sds) %.4f' % (MU_REF, SD_REF))


def v_ship(x):
    return x['drtgRef']


def v_shift(x):
    return x['drtgRef'] - MU[x['y']] + MU_REF


def v_z(x):
    return MU_REF + (x['drtgRef'] - MU[x['y']]) * SD_REF / SD[x['y']]


def scale71(v, mn, mid, top):
    x = 1 + 49.0*(v-mn)/(mid-mn) if v <= mid else 50 + 49.0*(v-mid)/(top-mid)
    return int(round(max(1.0, min(99.0, x))))


def dials(f, buckets=False):
    """Re-freeze on this variant's own distribution and return {(y,team): dial}."""
    val = {(x['y'], x['team']): -f(x) for x in d}   # negate: higher = better
    groups = {None: d} if not buckets else {k: [x for x in d if dec(x['y']) == k] for k in (1980, 1990, 2000, 2010, 2020)}
    out = {}
    for k, g in groups.items():
        vs = sorted(val[(x['y'], x['team'])] for x in g)
        worst, mid = vs[0], vs[min(len(vs)-1, round(0.5*(len(vs)-1)))]
        if buckets:
            top = vs[-1]
        else:
            b96 = [x for x in g if x['y'] == 1996 and 'Bulls' in x['team']][0]
            top = val[(1996, b96['team'])]
        for x in g:
            out[(x['y'], x['team'])] = scale71(val[(x['y'], x['team'])], worst, mid, top)
    return out


def report(name, dl):
    byd = defaultdict(list)
    for x in d:
        byd[dec(x['y'])].append(dl[(x['y'], x['team'])])
    line = '  '.join('%d %4.1f' % (k, sum(v)/len(v)) for k, v in sorted(byd.items()))
    fits = []
    for y, g in BS.items():
        fits.append(spearman([dl[(z['y'], z['team'])] for z in g], [-z['truth']['drtg'] for z in g]))
    per = {}
    for k in (1980, 1990, 2000, 2010, 2020):
        f = [spearman([dl[(z['y'], z['team'])] for z in g], [-z['truth']['drtg'] for z in g])
             for y, g in BS.items() if dec(y) == k]
        per[k] = sum(f)/len(f)
    g26 = sorted([x for x in d if x['y'] == 2026], key=lambda z: -dl[(z['y'], z['team'])])
    okc = dl[(2026, 'Oklahoma City Thunder')]
    med26 = sorted(dl[(x['y'], x['team'])] for x in d if x['y'] == 2026)[12]
    n99 = sum(1 for v in dl.values() if v == 99)
    print()
    print('=== %s ===' % name)
    print('  decade means: %s' % line)
    print('  fit  ALL %.3f | %s' % (sum(fits)/len(fits), '  '.join('%d %.3f' % (k, v) for k, v in sorted(per.items()))))
    print('  OKC 26 %d   2026 median %d   2026 top3 %s   fives at 99: %d' %
          (okc, med26, ', '.join('%s %d' % (x['ab'], dl[(x['y'], x['team'])]) for x in g26[:3]), n99))
    print('  TEN: ' + ' · '.join('%s%s %d' % (t.split()[-1], str(y)[2:], dl[(y, t)]) for y, t in TEN))
    return dl


SHIP = report('SHIPPED (what he ruled on)', {(x['y'], x['team']): x['def'] for x in d})
A = report('(a) SHIFT — era-relative recentring, summit = Bulls 96', dials(v_shift))
AZ = report("(a') Z — recentre AND rescale to the all-time within-season spread", dials(v_z))
C = report('(c) BUCKET — one gauge triple re-frozen per decade', dials(v_ship, buckets=True))

print()
print('=== the 2026 board under (a) and (a\'), with the real DRtg rank ===')
g26 = [x for x in d if x['y'] == 2026]
for x in sorted(g26, key=lambda z: -AZ[(z['y'], z['team'])]):
    print('  %-26s ship %2d   shift %2d   z %2d   | real DRtg rank %2d/24 (%.1f)' %
          (x['team'], x['def'], A[(x['y'], x['team'])], AZ[(x['y'], x['team'])], x['truth_def_rank'], x['truth']['drtg']))
