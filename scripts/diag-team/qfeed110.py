"""recal_110 — creation that cannot finish is not creation.

The centred amplification lifted the two named cases and the fit, and broke tests/offense.test.ts:
CHUCK5 (Iverson / Westbrook / DeRozan / Anthony / Young — five high-usage, low-efficiency creators)
overtook ROLE5 by nine points, because `creation` reads playvol and ballsec and says nothing about
whether the man can convert. Gating the feed by the creator's own efficiency — the SAME gate the
usage-shedding refund already uses, clamp((ts_rel - 0.545)/0.10) — is the fix, and it is the same
sentence the formula already says elsewhere: a man's LOAD is only worth refunding if he was
efficient to begin with.
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
P = {p['name']: p for p in players}
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


def peak(name):
    same = [p for p in players if p.get('player') == name]
    return sorted(same, key=lambda p: (p.get('talent', 0), p.get('ovr', 0)))[-1]


ARCH = {
    'GOAT5': ['Michael Jordan', 'LeBron James', 'Stephen Curry', "Shaquille O'Neal", 'Giannis Antetokounmpo'],
    'BALANCED': ['Stephen Curry', 'LeBron James', 'Kyle Korver', 'Shane Battier', 'Rudy Gobert'],
    'ROLE5': ['Kyle Korver', 'Shane Battier', 'Bruce Bowen', 'P.J. Tucker', 'Rudy Gobert'],
    'CHUCK5': ['Allen Iverson', 'Russell Westbrook', 'DeMar DeRozan', 'Carmelo Anthony', 'Trae Young'],
}
ARCH = {k: [peak(n) for n in v] for k, v in ARCH.items()}


def off_of(five, amp=0.22, fref=0.515, qgate=False, soft=1.0):
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    e = [a.get('ts_rel', a['ts_raw']) for a in At]
    c = [creation(a) for a in At]
    if qgate:
        c = [ci * ((1-soft) + soft*min(1.0, max(0.0, (ei - 0.545)/0.10))) for ci, ei in zip(c, e)]
    delta = K['TEAM_USG'] - sum(u)
    cw = [creation(a) for a in At]
    w = [max(0.05, ci)*ui for ci, ui in zip(cw, u)] if delta >= 0 else [max(0.0, ui-12.0) for ui in u]
    W = sum(w) or 1.0
    u2 = [max(K['FLOOR_USG'], ui + delta*wi/W) for ui, wi in zip(u, w)]
    s = sum(u2)
    u2 = [x*K['TEAM_USG']/s for x in u2]
    e2 = []
    for ui, u2i, ei, ci in zip(u, u2, e, cw):
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
            x *= 1 - 0.07*max(0.0, 1.0 - cw[i]/0.71)*(1-min(1.0, spc/0.55))
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


def feed_of(five, qgate, soft=1.0):
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    e = [a.get('ts_rel', a['ts_raw']) for a in At]
    c = [creation(a) for a in At]
    if qgate:
        c = [ci*((1-soft) + soft*min(1.0, max(0.0, (ei-0.545)/0.10))) for ci, ei in zip(c, e)]
    cw = [creation(a) for a in At]
    delta = K['TEAM_USG'] - sum(u)
    w = [max(0.05, ci)*ui for ci, ui in zip(cw, u)] if delta >= 0 else [max(0.0, ui-12.0) for ui in u]
    W = sum(w) or 1.0
    u2 = [max(K['FLOOR_USG'], ui + delta*wi/W) for ui, wi in zip(u, w)]
    s = sum(u2)
    u2 = [x*K['TEAM_USG']/s for x in u2]
    return sum(ci*u2i for ci, u2i in zip(c, u2))/K['TEAM_USG']


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
NAMED = [(1996, 'CHI'), (2000, 'LAL'), (1997, 'UTA'), (1996, 'SEA'), (2017, 'GSW')]

print('quality-gated feed over the 1,255 fives:')
for q in (False, True):
    fs = sorted(feed_of(f, q) for _, _, f in BOARD)
    print('  qgate=%-5s  min %.3f  MEAN %.4f  median %.3f  max %.3f' % (q, fs[0], sum(fs)/len(fs), fs[len(fs)//2], fs[-1]))
print()
print('%-34s %6s %8s %8s %8s %8s | %s' % ('variant', 'fit', 'GOAT5', 'BALANCED', 'ROLE5', 'CHUCK5', 'named ranks'))


def run(label, **kw):
    off = {(y, ab): off_of(f, **kw) for y, ab, f in BOARD}
    fit = sum(sp([off[k] for k in g], [TRUTH[k] for k in g]) for g in BY.values())/len(BY)
    a = {k: off_of(v, **kw) for k, v in ARCH.items()}
    out = []
    for y, ab in NAMED:
        g = sorted([k for k in off if k[0] == y], key=lambda k: -off[k])
        out.append('%s%02d %2d' % (ab, y % 100, g.index((y, ab))+1))
    ok = 'OK ' if (a['CHUCK5'] < a['ROLE5'] < a['BALANCED'] and a['GOAT5'] > a['BALANCED'] and a['GOAT5']-a['BALANCED'] <= 6.5) else 'BAND'
    print('%-34s %6.3f %8.2f %8.2f %8.2f %8.2f %s| %s' % (label, fit, a['GOAT5'], a['BALANCED'], a['ROLE5'], a['CHUCK5'], ok, ' '.join(out)))


run('SHIPPED-equivalent', amp=0.0)
for sf in (0.4, 0.5, 0.6, 0.7):
    fr = None
    fs = sorted(feed_of(f, True, sf) for _, _, f in BOARD)
    fr = round(sum(fs)/len(fs), 3)
    for am in (0.22, 0.30, 0.40):
        run('soft %.1f amp %.2f fref %.3f' % (sf, am, fr), amp=am, fref=fr, qgate=True, soft=sf)
