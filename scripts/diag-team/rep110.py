"""recal_110 — the round's report: the two named cases, the ten teams, the all-time OVR top 10."""
import csv, io, json, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
A = json.load(io.open(os.path.join(HERE, 'joined_before.json'), encoding='utf8'))
B = json.load(io.open(os.path.join(HERE, 'joined_after.json'), encoding='utf8'))
ia = {(x['y'], x['team']): x for x in A}
ib = {(x['y'], x['team']): x for x in B}
TRUTH = {}
with io.open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            TRUTH[(int(r['season']), r['abbreviation'])] = (float(r['o_rtg']), float(r['mov']))
        except Exception:
            pass


def ovr(x):
    return round((x['off'] + x['def'])/2)


def rk(src, y, team, key):
    g = sorted([x for x in src if x['y'] == y], key=lambda z: -z[key])
    return [i for i, x in enumerate(g) if x['team'] == team][0] + 1, len(g)


def trk(y, ab, src):
    g = [x for x in src if x['y'] == y and (y, x['ab']) in TRUTH]
    g.sort(key=lambda x: -TRUTH[(y, x['ab'])][0])
    return [i for i, x in enumerate(g) if x['ab'] == ab][0] + 1, len(g)


TEN = [(1996, 'Chicago Bulls', 'CHI'), (1997, 'Chicago Bulls', 'CHI'), (1998, 'Chicago Bulls', 'CHI'),
       (2000, 'Los Angeles Lakers', 'LAL'), (1997, 'Utah Jazz', 'UTA'), (1996, 'Seattle SuperSonics', 'SEA'),
       (1987, 'Los Angeles Lakers', 'LAL'), (1986, 'Boston Celtics', 'BOS'),
       (2017, 'Golden State Warriors', 'GSW'), (1994, 'Houston Rockets', 'HOU'),
       (2014, 'San Antonio Spurs', 'SAS'), (2013, 'Miami Heat', 'MIA')]
print('=== TEN TEAMS — offRaw rank in its own season, and the Team DB row ===')
print('%-26s %14s %16s %14s %14s' % ('', 'offRaw rank', 'OFF', 'DEF', 'OVR'))
for y, team, ab in TEN:
    a, b = ia[(y, team)], ib[(y, team)]
    ra = rk(A, y, team, 'offRaw')
    rb = rk(B, y, team, 'offRaw')
    tr = trk(y, ab, B)
    print("%-26s %5d -> %-3d (real %2d)  %3d -> %-3d   %3d -> %-3d   %3d -> %-3d" %
          ("%s '%02d" % (ab, y % 100), ra[0], rb[0], tr[0], a['off'], b['off'], a['def'], b['def'], ovr(a), ovr(b)))

print()
print('=== the two named cases, in full ===')
for y, team, ab in ((1996, 'Chicago Bulls', 'CHI'), (2000, 'Los Angeles Lakers', 'LAL')):
    a, b = ia[(y, team)], ib[(y, team)]
    print("  %s '%02d   offRaw %.2f -> %.2f   season rank %d -> %d of %d (real %d)   OFF %d -> %d   OVR %d -> %d" %
          (ab, y % 100, a['offRaw'], b['offRaw'], rk(A, y, team, 'offRaw')[0], rk(B, y, team, 'offRaw')[0],
           rk(B, y, team, 'offRaw')[1], trk(y, ab, B)[0], a['off'], b['off'], ovr(a), ovr(b)))

print()
print('=== ALL-TIME TOP 10 BY TEAM OVR, after ===')
for i, x in enumerate(sorted(B, key=lambda z: (-ovr(z), -z['off']))[:10]):
    a = ia[(x['y'], x['team'])]
    t = TRUTH.get((x['y'], x['ab']))
    print("  %2d. %-26s '%02d  OFF %2d DEF %2d OVR %2d  (was %2d/%2d/%2d)  real MOV %+.1f" %
          (i+1, x['team'], x['y'] % 100, x['off'], x['def'], ovr(x), a['off'], a['def'], ovr(a), t[1] if t else 0))

print()
print('=== ALL-TIME TOP 10 BY OFF DIAL, after ===')
for i, x in enumerate(sorted(B, key=lambda z: (-z['off'], -z['offRaw']))[:10]):
    print("  %2d. %-26s '%02d  OFF %2d   real ORtg rank %d/%d" %
          (i+1, x['team'], x['y'] % 100, x['off'], *trk(x['y'], x['ab'], B)))

print()
print('=== 2026, by team OVR after ===')
g26 = sorted([x for x in B if x['y'] == 2026], key=lambda z: -ovr(z))[:8]
for i, x in enumerate(g26):
    a = ia[(x['y'], x['team'])]
    print('  %d. %-26s OFF %2d DEF %2d OVR %2d  (was %2d/%2d/%2d)' %
          (i+1, x['team'], x['off'], x['def'], ovr(x), a['off'], a['def'], ovr(a)))

print()
print('=== movers ===')
print('  OFF dial moved on %d of %d   DEF dial moved on %d   offRaw moved on %d' %
      (sum(1 for k in ia if ia[k]['off'] != ib[k]['off']), len(ia),
       sum(1 for k in ia if ia[k]['def'] != ib[k]['def']),
       sum(1 for k in ia if abs(ia[k]['offRaw'] - ib[k]['offRaw']) > 1e-9)))
print('  fives reading OFF 99: %d   (%s)' %
      (sum(1 for x in B if x['off'] == 99), ', '.join("%s '%02d" % (x['team'], x['y'] % 100) for x in B if x['off'] == 99)))
