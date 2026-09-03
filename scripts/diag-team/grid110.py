"""recal_110 — the two levers that actually reach the named cases, gridded on all 1,255 fives.

  FIT_CAP     — every interaction Tomer ever ruled into this formula reaches OFF only through `fit`,
                and `fit` is clamped to +-4. 21.5% of the board is ON a rail (188 floor, 82 ceiling)
                and the raw spread is -18.2 .. +9.1. The Lakers '00 raw fit is -8.07.
  AMP_THROTTLE— creation amplification is multiplied by max(0, 1 - u2/30), so a five's creation is
                credited only to its LOW-usage men. The Bulls '96 feed 0.640 against Seattle's 0.517
                is the largest gap on the 1996 board and almost none of it is allowed to land.
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


def off_of(five, fit_cap=4.0, amp=0.06, throttle=True, widen=2.7, clog=0.07, clogc=0.0, hub=0.05):
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
    e3 = [x*(1 + amp*feed*(max(0.0, 1-u2i/30) if throttle else 1.0)) for x, u2i in zip(e2, u2)]
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
            x *= 1 - clog*max(0.0, 1.0 - clogc*c[i])*(1-min(1.0, spc/0.55))
            if a['usg_raw'] < 20:
                x *= 1 + 0.06*max(creation(At[j])*outs[j]/99 for j in range(5) if j != i)
            elif a['usg_raw'] >= 24:
                x *= 1 + hub*min(1.0, spc/0.55)
        e4.append(ei*min(1.12, max(0.90, x/ei)))
    OFF_N = sum(a*b for a, b in zip(u2, e2))*2
    OFF_F = sum(a*b for a, b in zip(u2, e4))*2
    OFF = OFF_N + min(fit_cap, max(-fit_cap, widen*(OFF_F-OFF_N)))
    OFF += sum(u2i*(a['fouldraw']/99)*(a['ft']/100) for u2i, a in zip(u2, At))*0.06
    wTS = sum(a*b for a, b in zip(u2, e4))/K['TEAM_USG']
    OFF *= 1 + 0.0006*sum(max(0, a['orb']-50) for a in At)*min(1.2, max(0.8, (1.0-wTS)/0.4))
    return OFF


assert all(abs(off_of(f) - NS['team_offense'](f)[0]) < 1e-9 for _, _, f in BOARD)
print('reimplementation matches shipped team_offense on all %d fives' % len(BOARD))


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
NAMED = [(1996, 'CHI'), (2000, 'LAL'), (1997, 'UTA'), (1996, 'SEA'), (2017, 'GSW'), (2013, 'MIA'), (1987, 'LAL')]


def run(label, **kw):
    off = {(y, ab): off_of(f, **kw) for y, ab, f in BOARD}
    fit = sum(sp([off[k] for k in g], [TRUTH[k] for k in g]) for g in BY.values())/len(BY)
    out = []
    for y, ab in NAMED:
        g = sorted([k for k in off if k[0] == y], key=lambda k: -off[k])
        out.append('%s%02d %2d' % (ab, y % 100, g.index((y, ab))+1))
    print('%-46s fit %.3f | %s' % (label, fit, '  '.join(out)))
    return off, fit


print('rank inside its own season (engine). Real: CHI96 1 . LAL00 5 . UTA97 2 . SEA96 8 . GSW17 1 . MIA13 2 . LAL87 1')
print()
run('SHIPPED')
print()
print('--- clog x(1-c) + no cap + throttle OFF, sweeping the amplification ---')
for cc in (1.0, 1.2):
    for am in (0.06, 0.09, 0.12, 0.15):
        run('clogc %.1f  amp %.2f' % (cc, am), clogc=cc, fit_cap=99.0, throttle=False, amp=am)
print()
print('--- and the hub bonus, which a dominant post draws whatever the spacing ---')
for cc in (1.0, 1.2):
    for hb in (0.05, 0.09, 0.13):
        run('clogc %.1f  amp 0.09  hub %.2f' % (cc, hb), clogc=cc, fit_cap=99.0, throttle=False, amp=0.09, hub=hb)
print()
print('--- narrowing: the two rulings want CHI96 <=2 and LAL00 <=5 ---')
for cc in (1.2, 1.4, 1.6):
    for am in (0.09, 0.12, 0.15, 0.18):
        run('clogc %.1f  amp %.2f' % (cc, am), clogc=cc, fit_cap=99.0, throttle=False, amp=am)
