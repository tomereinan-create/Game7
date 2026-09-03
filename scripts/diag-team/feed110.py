"""recal_110 — the amplification must REDISTRIBUTE, not inflate.

(1 + AMP*feed) is a multiplier, so the fives with the highest offRaw and the highest feed gain the
most absolute points and the top of the scale runs away from everyone else: the Bulls '96 rose from
8th to 5th of 1996 on offRaw and their DIAL still fell 68 -> 66, because the Warriors '17 summit
stretched faster. Centring the term on the league's own mean feed keeps the level and the spread
where they are and lets only the DIFFERENTIAL land.
"""
import csv, io, json, math, os, sys
from collections import defaultdict
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import anchors as A  # noqa: E402
NS = A._team_ns()
K = NS['KNOBS']
creation = NS['creation']
players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))
TRUTH = {}
with io.open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            TRUTH[(int(r['season']), r['abbreviation'])] = float(r['o_rtg'])
        except Exception:
            pass
WHEEL = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'teamseasons.json'), encoding='utf8'))
BOARD = []
for y in sorted({t['y'] for t in WHEEL}):
    for row in A.season_board(players, y):
        BOARD.append((y, row['ab'], row['five']))


def off_of(five, amp=0.16, fref=0.0, clogfree=0.71):
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    e = [a.get('ts_rel', a['ts_raw']) for a in At]
    c = [creation(a) for a in At]
    delta = K['TEAM_USG'] - sum(u)
    w = [max(0.05, ci)*ui for ci, ui in zip(c, u)] if delta >= 0 else [max(0.0, ui-12.0) for ui in u]
    W = sum(w) or 1.0
    u2 = [max(K['FLOOR_USG'], ui + delta*wi/W) for ui, wi in zip(u, w)]
    s = sum(u2)
    u2 = [x*K['TEAM_USG']/s for x in u2]
    e2 = []
    for ui, u2i, ei, ci in zip(u, u2, e, c):
        d = u2i - ui
        if d >= 0:
            slope = K['SLOPE_UP_MAX'] - (K['SLOPE_UP_MAX']-K['SLOPE_UP_MIN'])*ci
            e2.append(ei*(1 - slope*d/100))
        else:
            gate = min(1.0, max(0.0, (ei-0.545)/0.10))
            e2.append(ei*(1 + K['SLOPE_DOWN']*gate*(-d)/100))
    feed = sum(ci*u2i for ci, u2i in zip(c, u2))/K['TEAM_USG']
    e3 = [x*(1 + amp*(feed - fref)) for x in e2]
    outs = [a['3pt'] for a in At]
    e4 = []
    for i, (a, u2i, ei) in enumerate(zip(At, u2, e3)):
        x = ei
        if u2i < 13:
            x *= 1 - 0.010*(13-u2i)
        if u2i > 32:
            x *= 1 - 0.006*(u2i-32)
        if a['3pt'] < 40 and a['mid'] < 45:
            spc = sum(max(0, outs[j]-55) for j in range(5) if j != i)/(4*44)
            free = max(0.0, 1.0 - c[i]/clogfree) if clogfree else 1.0
            x *= 1 - 0.07*free*(1-min(1.0, spc/0.55))
            if a['usg_raw'] < 20:
                x *= 1 + 0.06*max(creation(At[j])*outs[j]/99 for j in range(5) if j != i)
            elif a['usg_raw'] >= 24:
                x *= 1 + 0.05*min(1.0, spc/0.55)
        e4.append(ei*min(1.12, max(0.90, x/ei)))
    OFF_N = sum(a*b for a, b in zip(u2, e3))*2
    OFF_F = sum(a*b for a, b in zip(u2, e4))*2
    OFF = OFF_N + min(4.0, max(-4.0, K['FIT_WIDEN']*(OFF_F-OFF_N)))
    OFF += sum(u2i*(a['fouldraw']/99)*(a['ft']/100) for u2i, a in zip(u2, At))*0.06
    wTS = sum(a*b for a, b in zip(u2, e4))/K['TEAM_USG']
    OFF *= 1 + 0.0006*sum(max(0, a['orb']-50) for a in At)*min(1.2, max(0.8, (1.0-wTS)/0.4))
    return OFF


def feed_of(five):
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    c = [creation(a) for a in At]
    delta = K['TEAM_USG'] - sum(u)
    w = [max(0.05, ci)*ui for ci, ui in zip(c, u)] if delta >= 0 else [max(0.0, ui-12.0) for ui in u]
    W = sum(w) or 1.0
    u2 = [max(K['FLOOR_USG'], ui + delta*wi/W) for ui, wi in zip(u, w)]
    s = sum(u2)
    u2 = [x*K['TEAM_USG']/s for x in u2]
    return sum(ci*u2i for ci, u2i in zip(c, u2))/K['TEAM_USG']


feeds = sorted(feed_of(f) for _, _, f in BOARD)
MEAN = sum(feeds)/len(feeds)
print('league feed: min %.3f  p10 %.3f  MEAN %.4f  median %.3f  p90 %.3f  max %.3f' %
      (feeds[0], feeds[len(feeds)//10], MEAN, feeds[len(feeds)//2], feeds[9*len(feeds)//10], feeds[-1]))


def rank_v(v):
    idx = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0]*len(v)
    i = 0
    while i < len(idx):
        j = i
        while j+1 < len(idx) and v[idx[j+1]] == v[idx[i]]:
            j += 1
        a = (i+j)/2.0+1
        for k in range(i, j+1):
            r[idx[k]] = a
        i = j+1
    return r


def sp(a, b):
    ra, rb = rank_v(a), rank_v(b)
    n = len(a)
    ma, mb = sum(ra)/n, sum(rb)/n
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da = math.sqrt(sum((x-ma)**2 for x in ra))
    db = math.sqrt(sum((x-mb)**2 for x in rb))
    return num/(da*db) if da and db else 0.0


BY = defaultdict(list)
for y, ab, f in BOARD:
    if (y, ab) in TRUTH:
        BY[y].append((y, ab))
NAMED = [(1996, 'CHI'), (2000, 'LAL'), (1997, 'UTA'), (1996, 'SEA'), (2017, 'GSW'), (1987, 'LAL'), (1986, 'BOS')]


def run(label, **kw):
    off = {(y, ab): off_of(f, **kw) for y, ab, f in BOARD}
    fit = sum(sp([off[k] for k in g], [TRUTH[k] for k in g]) for g in BY.values())/len(BY)
    out = []
    for y, ab in NAMED:
        g = sorted([k for k in off if k[0] == y], key=lambda k: -off[k])
        out.append('%s%02d %2d' % (ab, y % 100, g.index((y, ab))+1))
    vals = sorted(off.values())
    gsw = off[(2017, 'GSW')]
    med = vals[len(vals)//2]
    print('%-40s fit %.3f med %6.1f  GSW-med %5.2f | %s' % (label, fit, med, gsw-med, ' '.join(out)))


print()
print('rank inside own season. Real: CHI96 1 . LAL00 5 . UTA97 2 . SEA96 8 . GSW17 1 . LAL87 1 . BOS86 3')
print('GSW-med is the summit stretch: the bigger it gets, the more every other five compresses.')
print()
run('SHIPPED-equivalent (amp 0.06, throttled)', amp=0.0, clogfree=0.0)
for am in (0.10, 0.16, 0.22, 0.28):
    run('CENTRED amp %.2f (fref %.3f)' % (am, MEAN), amp=am, fref=MEAN)
