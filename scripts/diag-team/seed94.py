"""recal_94 — the readings the round's anchors are seeded from, taken through data/anchors.py itself
(the same path `npm run anchors` grades on), with the bref truth rank beside each."""
import csv, io, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import anchors as A  # noqa: E402

players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))
TRUTH = {}
with io.open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            y = int(r['season']); TRUTH[(y, r['abbreviation'])] = (float(r['o_rtg']), float(r['d_rtg']))
        except Exception:
            pass

WANT = [(2026, 'PHI'), (2026, 'OKC'), (2026, 'DET'), (2026, 'SAS'), (2026, 'BOS'),
        (2004, 'DET'), (2017, 'GSW'), (2005, 'CHI'), (2024, 'ORL'), (1998, 'NYK'),
        (2020, 'SAS'), (2006, 'POR'), (1996, 'CHI')]

print('%-12s %-5s %-4s %-4s %-9s %-9s' % ('team-season', 'dial', 'rk', 'n', 'truth rk', 'realDRtg'))
for y, ab in WANT:
    board = A.season_board(players, y)
    me = [x for x in board if x['ab'] == ab]
    if not me:
        print('%d %s: cannot field a five' % (y, ab)); continue
    me = me[0]
    d = A.team_dials(me['five'])
    rk = sum(1 for x in board if x['drtg'] < me['drtg']) + 1
    ork = sum(1 for x in board if x['off'] > me['off']) + 1
    have = [x for x in board if (y, x['ab']) in TRUTH]
    t = TRUTH.get((y, ab))
    trk = (sum(1 for x in have if TRUTH[(y, x['ab'])][1] < t[1]) + 1) if t else 0
    tork = (sum(1 for x in have if TRUTH[(y, x['ab'])][0] > t[0]) + 1) if t else 0
    print("%s '%02d   OFF dial %2d rank %2d/%d (truth %2d)   DEF dial %2d rank %2d/%d (truth %2d, DRtg %.1f)"
          % (ab, y % 100, d[0], ork, len(board), tork, d[1], rk, len(board), trk, t[1] if t else 0))
    print('           five: ' + ' | '.join(p['name'] for p in me['five']))
