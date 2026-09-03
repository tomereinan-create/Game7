"""recal_110 — WHY does a star-plus-hole five read worse than five average men?
Decomposes team_offense term by term for the two named cases and their season's leaders."""
import csv, io, json, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import anchors as A  # noqa: E402
NS = A._team_ns()
K = NS['KNOBS']
creation = NS['creation']
players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))


def decompose(five):
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    e = [a.get('ts_rel', a['ts_raw']) for a in At]
    c = [creation(a) for a in At]
    delta = K['TEAM_USG'] - sum(u)
    w = [max(0.05, ci)*ui for ci, ui in zip(c, u)] if delta >= 0 else [max(0.0, ui - 12.0) for ui in u]
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
    off, lines = NS['team_offense'](five)
    e4 = [x/100.0 for _, _, x in lines]
    OFF_N = sum(a*b for a, b in zip(u2, e2))*2
    OFF_F = sum(a*b for a, b in zip(u2, e4))*2
    return dict(u=u, u2=u2, e=e, e2=e2, e4=e4, c=c, delta=delta, OFF_N=OFF_N, OFF_F=OFF_F, off=off,
                names=[p['name'] for p in five], o_ovr=[p['o_ovr'] for p in five])


def show(y, ab, tag=''):
    b = A.season_board(players, y)
    m = [x for x in b if x['ab'] == ab]
    if not m:
        print('%d %s: cannot field' % (y, ab))
        return None
    d = decompose(m[0]['five'])
    print("%s%d %s  offRaw %.2f   delta %+.1f   OFF_N %.2f   fit %+.2f" %
          (tag, y, ab, d['off'], d['delta'], d['OFF_N'], min(4.0, max(-4.0, 2.7*(d['OFF_F']-d['OFF_N'])))))
    print('   %-26s %5s %6s %6s %7s %7s %7s %7s' % ('name', 'o_ovr', 'usg', 'u2', 'ts_rel', 'e2', 'e4', 'creat'))
    for i in range(5):
        print('   %-26s %5d %6.1f %6.1f %7.3f %7.3f %7.3f %7.3f' %
              (d['names'][i], d['o_ovr'][i], d['u'][i], d['u2'][i], d['e'][i], d['e2'][i], d['e4'][i], d['c'][i]))
    print('   usage-weighted repriced TS %.4f  ->  OFF_N = 200 x it = %.2f' % (d['OFF_N']/200, d['OFF_N']))
    return d


print('=== CASE 1: Bulls 96 (real ORtg 1st of 29) vs Sonics 96 (real 8th) ===')
show(1996, 'CHI')
print()
show(1996, 'SEA')
print()
print('=== CASE 2: Lakers 00 (real ORtg 5th of 29) vs the 2000 engine leader ===')
show(2000, 'LAL')
g = sorted(A.season_board(players, 2000), key=lambda x: -x['off'])
print()
show(2000, g[0]['ab'], 'engine leader: ')

TRUTH = {}
with io.open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            TRUTH[(int(r['season']), r['abbreviation'])] = float(r['o_rtg'])
        except Exception:
            pass
print()
print('=== 1996 / 2000 boards: engine offRaw rank vs real ORtg rank ===')
for y in (1996, 2000):
    b = [x for x in A.season_board(players, y) if (y, x['ab']) in TRUTH]
    eng = sorted(b, key=lambda x: -x['off'])
    tru = sorted(b, key=lambda x: -TRUTH[(y, x['ab'])])
    print('  %d:' % y)
    for i, x in enumerate(eng[:9]):
        print('    engine %2d  %-4s offRaw %7.2f   real rank %2d (ORtg %.1f)' %
              (i+1, x['ab'], x['off'], tru.index(x)+1, TRUTH[(y, x['ab'])]))
