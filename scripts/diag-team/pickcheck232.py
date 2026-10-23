"""recal_232 — prove data/anchors.py's team_five IS src/engine/bestfive.ts teamFive, on every wheel
team-season: the same SET of men and the same NUMBER of men marked out of position (the only two
things a team number can depend on), and drtg_ref equal to the port's to 1e-9.

Reads the JSON scripts/diag-team/after232.ts writes (the TS side, through the app's own functions):
    npx vite-node scripts/diag-team/after232.ts <before.json> <after.json>
    python scripts/diag-team/pickcheck232.py <after.json>
"""
import io, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data'))
sys.dont_write_bytecode = True
import anchors as A  # noqa: E402

players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))
ts = json.load(io.open(sys.argv[1], encoding='utf8'))['out']
seasons = sorted({int(k.split()[0]) for k in ts})
seen, bad, marked, fielded = 0, [], 0, 0
for y in seasons:
    board = {r['ab']: r for r in A.season_board(players, y)}
    for key, rec in ts.items():
        yy, ab = key.split()
        if int(yy) != y:
            continue
        seen += 1
        t_full = all(rec['five'])
        p = board.get(ab)
        if not t_full:
            if p is not None:
                bad.append((key, 'python fields a five the port does not'))
            continue
        fielded += 1
        if p is None:
            bad.append((key, 'the port fields a five python does not'))
            continue
        want = sorted(rec['five'])
        got = sorted(q['name'] for q in p['five'])
        k_ts = sum(1 for o in rec['oop'] if o)
        k_py = sum(1 for q in p['five'] if q.get('oop'))
        marked += 1 if k_ts else 0
        d = abs(p['drtg'] - rec['gauge']['drtgRef'])
        if want != got or k_ts != k_py or d > 1e-9:
            bad.append((key, want, got, k_ts, k_py, d))
print('team-seasons compared: %d · fielded by both: %d · of them re-solved with a mark: %d' % (seen, fielded, marked))
assert seen == 1314, 'the check ran on %d team-seasons, not the whole wheel' % seen
print('python team_five disagrees with bestfive.ts teamFive on:', len(bad))
for b in bad[:15]:
    print('  ', b)
sys.exit(1 if bad else 0)
