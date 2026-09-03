"""recal_110 — candidate fixes for the star-plus-hole offence, measured on all 1,255 fieldable fives.

His rulings: "there is more work to do" (on the Bulls '96 reading 8th of 29 on offence while the real
1996 board has them 1st) and "How is this team 47 OFF with 2 all time great players" (Lakers '00).

The reimplementation below must reproduce the shipped team_offense EXACTLY on variant 'shipped' —
that assert is the first thing this script prints, and every other variant is that code with one
term changed.
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
SEASONS = sorted({t['y'] for t in WHEEL})
BOARD = []
for y in SEASONS:
    for row in A.season_board(players, y):
        BOARD.append((y, row['ab'], row['team'], row['five']))
print('fieldable fives: %d' % len(BOARD))


def off_of(five, shed=None, clog=None):
    """team_rating.team_offense, with two named terms swappable. shed=None/clog=None == shipped."""
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    e = [a.get('ts_rel', a['ts_raw']) for a in At]
    c = [creation(a) for a in At]
    delta = K['TEAM_USG'] - sum(u)
    if delta >= 0:
        w = [max(0.05, ci)*ui for ci, ui in zip(c, u)]
    elif shed is None:
        w = [max(0.0, ui - 12.0) for ui in u]
    else:
        w = [max(0.0, ui - 12.0) * shed(ci, ei) for ui, ci, ei in zip(u, c, e)]
    W = sum(w) or 1.0
    u2 = [max(K['FLOOR_USG'], ui + delta*wi/W) for ui, wi in zip(u, w)]
    s = sum(u2)
    u2 = [x*K['TEAM_USG']/s for x in u2]
    e2 = []
    for ui, u2i, ei, ci in zip(u, u2, e, c):
        d = u2i - ui
        if d >= 0:
            slope = K['SLOPE_UP_MAX'] - (K['SLOPE_UP_MAX']-K['SLOPE_UP_MIN'])*ci
            e2.append(ei * (1 - slope*d/100))
        else:
            gate = min(1.0, max(0.0, (ei - 0.545)/0.10))
            e2.append(ei * (1 + K['SLOPE_DOWN']*gate*(-d)/100))
    feed = sum(ci*u2i for ci, u2i in zip(c, u2)) / K['TEAM_USG']
    e3 = [x * (1 + K['AMP_MAX']*feed*max(0.0, 1 - u2i/30)) for x, u2i in zip(e2, u2)]
    outs = [a['3pt'] for a in At]
    e4 = []
    for i, (a, u2i, ei) in enumerate(zip(At, u2, e3)):
        x = ei
        if u2i < 13:
            x *= 1 - 0.010*(13 - u2i)
        if u2i > 32:
            x *= 1 - 0.006*(u2i - 32)
        if a['3pt'] < 40 and a['mid'] < 45:
            spc = sum(max(0, outs[j]-55) for j in range(5) if j != i) / (4*44)
            pen = 0.07 if clog is None else clog(c[i], a)
            x *= 1 - pen*(1 - min(1.0, spc/0.55))
            if a['usg_raw'] < 20:
                best_feed = max(creation(At[j]) * outs[j]/99 for j in range(5) if j != i)
                x *= 1 + 0.06*best_feed
            elif a['usg_raw'] >= 24:
                x *= 1 + 0.05*min(1.0, spc/0.55)
        x = ei * min(1.12, max(0.90, x/ei))
        e4.append(x)
    OFF_N = sum(a*b for a, b in zip(u2, e2))*2
    OFF_F = sum(a*b for a, b in zip(u2, e4))*2
    fit = min(K['FIT_CAP'], max(-K['FIT_CAP'], K['FIT_WIDEN']*(OFF_F - OFF_N)))
    OFF = OFF_N + fit
    OFF += sum(u2i*(a['fouldraw']/99)*(a['ft']/100) for u2i, a in zip(u2, At))*0.06
    wTS = sum(a*b for a, b in zip(u2, e4)) / K['TEAM_USG']
    mf = min(1.2, max(0.8, (1.0 - wTS)/(1.0 - 0.60)))
    OFF *= 1 + 0.0006*sum(max(0, a['orb']-50) for a in At)*mf
    return OFF


bad = [(y, ab) for y, ab, _, f in BOARD if abs(off_of(f) - NS['team_offense'](f)[0]) > 1e-9]
print('reimplementation matches shipped team_offense on %d/%d fives%s' %
      (len(BOARD)-len(bad), len(BOARD), '' if not bad else '  MISMATCH ' + str(bad[:3])))
assert not bad


def rank_v(vals):
    idx = sorted(range(len(vals)), key=lambda i: vals[i])
    r = [0.0]*len(vals)
    i = 0
    while i < len(idx):
        j = i
        while j+1 < len(idx) and vals[idx[j+1]] == vals[idx[i]]:
            j += 1
        a = (i+j)/2.0 + 1
        for k in range(i, j+1):
            r[idx[k]] = a
        i = j+1
    return r


def spearman(a, b):
    ra, rb = rank_v(a), rank_v(b)
    n = len(a)
    ma, mb = sum(ra)/n, sum(rb)/n
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da = math.sqrt(sum((x-ma)**2 for x in ra))
    db = math.sqrt(sum((x-mb)**2 for x in rb))
    return num/(da*db) if da and db else 0.0


def dec(y):
    return 1980 if y < 1990 else 1990 if y < 2000 else 2000 if y < 2010 else 2010 if y < 2020 else 2020


TEN = [(1996, 'CHI'), (1997, 'CHI'), (1998, 'CHI'), (2000, 'LAL'), (1997, 'UTA'), (1996, 'SEA'),
       (1987, 'LAL'), (1986, 'BOS'), (2017, 'GSW'), (1994, 'HOU'), (2014, 'SAS'), (2013, 'MIA')]


def report(name, **kw):
    off = {(y, ab): off_of(f, **kw) for y, ab, _, f in BOARD}
    by = defaultdict(list)
    for y, ab, _, f in BOARD:
        if (y, ab) in TRUTH:
            by[y].append((y, ab))
    fits = [spearman([off[k] for k in g], [TRUTH[k] for k in g]) for g in by.values() if len(g) >= 3]
    per = {}
    for d in (1980, 1990, 2000, 2010, 2020):
        v = [spearman([off[k] for k in g], [TRUTH[k] for k in g]) for y, g in by.items() if dec(y) == d and len(g) >= 3]
        per[d] = sum(v)/len(v)

    def rk(y, ab):
        g = sorted([k for k in off if k[0] == y], key=lambda k: -off[k])
        return g.index((y, ab)) + 1, len(g)

    def trk(y, ab):
        g = sorted([k for k in off if k[0] == y and k in TRUTH], key=lambda k: -TRUTH[k])
        return g.index((y, ab)) + 1
    print()
    print('=== %s ===' % name)
    print('  fit %.3f | %s' % (sum(fits)/len(fits), '  '.join('%d %.3f' % (d, v) for d, v in sorted(per.items()))))
    for y, ab in TEN:
        if (y, ab) not in off:
            continue
        r, n = rk(y, ab)
        print("    %s '%02d  offRaw %7.2f   engine rank %2d/%d   real rank %2d" % (ab, y % 100, off[(y, ab)], r, n, trk(y, ab)))
    return off


SHIPPED = report('SHIPPED')
report('(1) SHED BY CREATION: cut comes off the men who cannot create', shed=lambda c, e: max(0.05, 1.0 - c))
report('(2) SHED BY CREATION, sharper (1-c)^2', shed=lambda c, e: max(0.05, (1.0 - c)**2))
report('(3) SHED BY CREATION x EFFICIENCY', shed=lambda c, e: max(0.05, (1.0 - c)) * max(0.05, 1.0 - min(1.0, max(0.0, (e-0.50)/0.15))))
report('(4) CLOG scaled by the paint man\'s own creation (star gravity)', clog=lambda c, a: 0.07*(1.0 - 0.8*c))
report('(1)+(4) together', shed=lambda c, e: max(0.05, 1.0 - c), clog=lambda c, a: 0.07*(1.0 - 0.8*c))
