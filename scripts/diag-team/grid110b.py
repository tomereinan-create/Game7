"""recal_110 — the RESTRUCTURED candidate, gridded on all 1,255 fives.

Three findings drive it.

  (A) OFF_N — the number that carries ~97% of a five's offence — is built from e2, the usage-repriced
      TS, and NOTHING else. Creation amplification (e3) and every one of Tomer's interactions (e4)
      reach OFF only through `fit`, which is clamped to +-4. So the whole of "how these five men fit
      together" is worth at most 4 points against a ~20-point spread in average efficiency. That is
      why five average men beat a star and a hole.
  (B) Creation amplification is throttled by max(0, 1 - u2/30), so a five's creation is credited only
      to its LOW-usage men. The Bulls '96 feed is 0.640 against Seattle's 0.517 — the largest gap on
      the 1996 board — and almost none of it is allowed to land. It is also in the WRONG PLACE: shot
      quality created by the five's passers is part of the baseline, not an interaction bonus.
  (C) The paint-clog penalty is charged at full strength to a man who creates his own shot. Shaq '00
      takes the whole -7% for his teammates' spacing; the Lakers' raw fit is -8.07, clamped to -4.

The restructure: creation amplification moves into the BASELINE (e2 -> e2a, used by OFF_N as well as
by the interaction chain), so `fit` goes back to carrying only the interactions and its clamp stops
truncating a fifth of the league. The clog penalty is scaled by the paint man's own creation.
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
        BOARD.append((y, row['ab'], row['team'], row['five']))


def off_of(five, amp=0.06, base_amp=False, throttle=True, clogc=0.0, fit_cap=4.0, widen=2.7, role=0.0):
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
    if role:
        C = sum(c) or 1.0
        tgt = [K['TEAM_USG']*ci/C for ci in c]
        u2 = [max(K['FLOOR_USG'], (1-role)*a + role*b) for a, b in zip(u2, tgt)]
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
    thr = [(max(0.0, 1-u2i/30) if throttle else 1.0) for u2i in u2]
    e3 = [x*(1 + amp*feed*t) for x, t in zip(e2, thr)]
    base = e3 if base_amp else e2          # what OFF_N is built from
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
            x *= 1 - 0.07*max(0.0, 1.0 - clogc*c[i])*(1-min(1.0, spc/0.55))
            if a['usg_raw'] < 20:
                x *= 1 + 0.06*max(creation(At[j])*outs[j]/99 for j in range(5) if j != i)
            elif a['usg_raw'] >= 24:
                x *= 1 + 0.05*min(1.0, spc/0.55)
        e4.append(ei*min(1.12, max(0.90, x/ei)))
    OFF_N = sum(a*b for a, b in zip(u2, base))*2
    OFF_F = sum(a*b for a, b in zip(u2, e4))*2
    OFF = OFF_N + min(fit_cap, max(-fit_cap, widen*(OFF_F-OFF_N)))
    OFF += sum(u2i*(a['fouldraw']/99)*(a['ft']/100) for u2i, a in zip(u2, At))*0.06
    wTS = sum(a*b for a, b in zip(u2, e4))/K['TEAM_USG']
    OFF *= 1 + 0.0006*sum(max(0, a['orb']-50) for a in At)*min(1.2, max(0.8, (1.0-wTS)/0.4))
    return OFF


assert all(abs(off_of(f) - NS['team_offense'](f)[0]) < 1e-9 for _, _, _, f in BOARD)
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
for y, ab, _, f in BOARD:
    if (y, ab) in TRUTH:
        BY[y].append((y, ab))
NAMED = [(1996, 'CHI'), (2000, 'LAL'), (1997, 'UTA'), (1996, 'SEA'), (2017, 'GSW'), (2013, 'MIA'), (1987, 'LAL'), (1994, 'HOU')]


def run(label, **kw):
    off = {(y, ab): off_of(f, **kw) for y, ab, _, f in BOARD}
    fit = sum(sp([off[k] for k in g], [TRUTH[k] for k in g]) for g in BY.values())/len(BY)
    out = []
    for y, ab in NAMED:
        if (y, ab) not in off:
            continue
        g = sorted([k for k in off if k[0] == y], key=lambda k: -off[k])
        out.append('%s%02d %2d' % (ab, y % 100, g.index((y, ab))+1))
    med = sorted(off.values())[len(off)//2]
    print('%-52s fit %.3f  med %6.1f | %s' % (label, fit, med, ' '.join(out)))
    return off


if __name__ == '__main__':
    print('rank inside own season. Real: CHI96 1 . LAL00 5 . UTA97 2 . SEA96 8 . GSW17 1 . MIA13 2 . LAL87 1 . HOU94 15')
    print()
    run('SHIPPED')
    print()
    print('--- amp in the BASELINE (structurally clean), throttle off, clog by creation, cap opened ---')
    for am in (0.10, 0.13, 0.16):
        for cc in (1.0, 1.4):
            for cap in (4.0, 8.0, 12.0):
                run('base amp %.2f  clogc %.1f  cap %.0f' % (am, cc, cap),
                    amp=am, base_amp=True, throttle=False, clogc=cc, fit_cap=cap)
    print()
    print('--- the same with FIT_WIDEN raised, so the interactions carry more once uncapped ---')
    for am in (0.10, 0.13):
        for wd in (3.5, 4.5):
            run('base amp %.2f  clogc 1.2  cap 12  widen %.1f' % (am, wd),
                amp=am, base_amp=True, throttle=False, clogc=1.2, fit_cap=12.0, widen=wd)
