"""recal_119 — THE POSSESSION-LOSS CHANNEL. Dumps every fieldable best-five with its offRaw, its
usage-weighted ball security, and the real ORtg / TOV% / DRtg / MOV of that team-season, so the
channel can be fitted and swept without re-running team_offense for every candidate size (the
channel is a terminal multiplier, so offRaw_new = offRaw * mult(wball))."""
import csv, io, json, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
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
            TRUTH[(int(r['season']), r['abbreviation'])] = dict(
                ortg=float(r['o_rtg']), drtg=float(r['d_rtg']), mov=float(r['mov']),
                tov=float(r['tov_percent']), pace=float(r['pace']))
        except Exception:
            pass


def recon_usage(five):
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    c = [creation(a) for a in At]
    delta = K['TEAM_USG'] - sum(u)
    w = [max(0.05, ci) * ui for ci, ui in zip(c, u)] if delta >= 0 else [max(0.0, ui - 12.0) for ui in u]
    W = sum(w) or 1.0
    u2 = [max(K['FLOOR_USG'], ui + delta * wi / W) for ui, wi in zip(u, w)]
    s = sum(u2)
    return [x * K['TEAM_USG'] / s for x in u2], At


WHEEL = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'teamseasons.json'), encoding='utf8'))
seasons = sorted({t['y'] for t in WHEEL})
out = []
for y in seasons:
    for x in A.season_board(players, y):
        u2, At = recon_usage(x['five'])
        wball = sum(ui * a['ballsec'] for ui, a in zip(u2, At)) / K['TEAM_USG']
        wplay = sum(ui * a['playvol'] for ui, a in zip(u2, At)) / K['TEAM_USG']
        out.append(dict(y=y, ab=x['ab'], team=x['team'], offRaw=x['off'], drtgRef=x['drtg'],
                        wball=wball, wplay=wplay,
                        u2=[round(v, 4) for v in u2],
                        ball=[a['ballsec'] for a in At], play=[a['playvol'] for a in At],
                        usg=[a['usg_raw'] for a in At],
                        five=[p['name'] for p in x['five']],
                        truth=TRUTH.get((y, x['ab']))))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'tov119_board.json'
json.dump(out, io.open(os.path.join(HERE, OUT), 'w', encoding='utf8'))
print('%d fives - %d seasons - %d with truth -> %s' % (len(out), len(seasons), sum(1 for x in out if x['truth']), OUT))
