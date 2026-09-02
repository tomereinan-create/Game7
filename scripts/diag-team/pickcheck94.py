"""recal_94 — prove the python five-picker in data/anchors.py IS src/engine/bestfive.ts.
Compares the set it picks against scripts/diag-team/sweep.json (written by the TS picker) for all
1,255 fieldable team-seasons."""
import io, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import anchors as A  # noqa: E402

players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))
sw = json.load(io.open(os.path.join(HERE, 'sweep.json'), encoding='utf8'))
ts = {(r['y'], r['team']): set(p['name'] for p in r['five']) for r in sw['rows']}

bad = []
_seen = 0
seasons = sorted({y for y, _ in ts})
for y in seasons:
    for row in A.season_board(players, y):
        want = ts.get((y, row['team']))
        _seen += 1
        got = set(p['name'] for p in row['five'])
        if want is not None and want != got:
            bad.append((y, row['team'], sorted(want - got), sorted(got - want)))
print('team-seasons compared:', len(ts))
assert len(ts) == 1255 and _seen == len(ts), 'the check ran on %d boards, not the full sweep' % _seen
print('python picker disagrees with bestfive.ts on:', len(bad))
for b in bad[:15]:
    print('  ', b)
sys.exit(1 if bad else 0)
