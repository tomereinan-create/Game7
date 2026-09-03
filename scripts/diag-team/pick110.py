"""recal_110 — under the candidate package, who is still above the Bulls '96, and is the remaining
gap a TERM or the FIVE the OVR-max picker hands the formula?"""
import csv, io, json, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'diag-team'))
import anchors as A  # noqa: E402
from grid110 import off_of, BOARD, TRUTH  # noqa: E402
players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))
BY = {p['name']: p for p in players}
CAND = dict(clogc=1.2, amp=0.12, fit_cap=99.0, throttle=False)

for y in (1996, 2000):
    g = [(ab, f) for yy, ab, f in BOARD if yy == y]
    vals = sorted(((off_of(f, **CAND), ab, f) for ab, f in g), key=lambda t: -t[0])
    tru = sorted([ab for ab, _ in g if (y, ab) in TRUTH], key=lambda ab: -TRUTH[(y, ab)])
    print('=== %d, candidate package ===' % y)
    for i, (v, ab, f) in enumerate(vals[:7]):
        rt = tru.index(ab)+1 if ab in tru else 0
        print('  %2d. %-4s %7.2f   real rank %2d   %s' % (i+1, ab, v, rt, ' / '.join('%s %d' % (p['name'].split(" '")[0], p['o_ovr']) for p in f)))
    print()

print('=== the Bulls 96 FIVE the picker hands the formula, and the alternatives ===')
roster = [t for t in json.load(io.open(os.path.join(ROOT, 'src', 'data', 'teamseasons.json'), encoding='utf8'))
          if t['y'] == 1996 and t['ab'] == 'CHI'][0]['p']
men = [BY[n] for n in roster if n in BY]
print('  roster: ' + ', '.join('%s (ovr %d, o_ovr %d)' % (p['name'].split(" '")[0], p['ovr'], p['o_ovr']) for p in sorted(men, key=lambda p: -p['ovr'])))
cur = A.season_board(players, 1996)
five = [x for x in cur if x['ab'] == 'CHI'][0]['five']
print('  OVR-max five : %7.2f  %s' % (off_of(five, **CAND), ' / '.join(p['name'].split(" '")[0] for p in five)))
import itertools
best = sorted(((off_of(list(c), **CAND), c) for c in itertools.combinations(men, 5)), key=lambda t: -t[0])[:3]
for v, c in best:
    print('  OFF-max five : %7.2f  %s' % (v, ' / '.join(p['name'].split(" '")[0] for p in c)))

print()
print('=== raw fit spread under the candidate (is a cap still doing anything?) ===')
raws = []
for y, ab, f in BOARD:
    a = off_of(f, **CAND)
    b = off_of(f, **dict(CAND, fit_cap=0.0))
    raws.append(a - b)
raws.sort()
print('  fit contribution: min %.2f  p1 %.2f  p50 %.2f  p99 %.2f  max %.2f' %
      (raws[0], raws[len(raws)//100], raws[len(raws)//2], raws[99*len(raws)//100], raws[-1]))
