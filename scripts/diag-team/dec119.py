"""recal_119 — the subject five, term by term, and the 2024 board it sits in."""
import io, json, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import anchors as A  # noqa: E402
NS = A._team_ns()
K = NS['KNOBS']
creation = NS['creation']
players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))
BOARD = json.load(io.open(os.path.join(HERE, 'tov119_board.json'), encoding='utf8'))
BY = {(x['y'], x['ab']): x for x in BOARD}


def decompose(five, label):
    At = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in At]
    e = [a.get('ts_rel', a['ts_raw']) for a in At]
    c = [creation(a) for a in At]
    delta = K['TEAM_USG'] - sum(u)
    w = [max(0.05, ci) * ui for ci, ui in zip(c, u)] if delta >= 0 else [max(0.0, ui - 12.0) for ui in u]
    W = sum(w) or 1.0
    u2 = [max(K['FLOOR_USG'], ui + delta * wi / W) for ui, wi in zip(u, w)]
    s = sum(u2)
    u2 = [x * K['TEAM_USG'] / s for x in u2]
    e2 = []
    for ui, u2i, ei, ci in zip(u, u2, e, c):
        d = u2i - ui
        if d >= 0:
            slope = K['SLOPE_UP_MAX'] - (K['SLOPE_UP_MAX'] - K['SLOPE_UP_MIN']) * ci
            e2.append(ei * (1 - slope * d / 100))
        else:
            gate = min(1.0, max(0.0, (ei - 0.545) / 0.10))
            e2.append(ei * (1 + K['SLOPE_DOWN'] * gate * (-d) / 100))
    feed = sum(ci * u2i for ci, u2i in zip(c, u2)) / K['TEAM_USG']
    amp = 1 + K['AMP_MAX'] * (feed - K['FEED_REF'])
    e3 = [x * amp for x in e2]
    off, lines = NS['team_offense'](five)
    e4 = [x / 100.0 for _, _, x in lines]
    OFF_N = sum(a * b for a, b in zip(u2, e3)) * 2
    OFF_F = sum(a * b for a, b in zip(u2, e4)) * 2
    fit = min(4.0, max(-4.0, 2.7 * (OFF_F - OFF_N)))
    ft = sum(ui * (a['fouldraw'] / 99) * (a['ft'] / 100) for ui, a in zip(u2, At)) * 0.06
    wTS = sum(a * b for a, b in zip(u2, e4)) / 100.0
    miss = min(1.2, max(0.8, (1 - wTS) / 0.4))
    orbm = 1 + 0.0006 * sum(max(0, a['orb'] - 50) for a in At) * miss
    wball = sum(ui * a['ballsec'] for ui, a in zip(u2, At)) / 100.0
    print('--- %s ---   offRaw %.2f' % (label, off))
    print('   %-24s %6s %6s %7s %7s %7s %7s %6s %6s' %
          ('name', 'usg', 'u2', 'ts_rel', 'e2', 'e3', 'e4', 'creat', 'ballsec'))
    for i in range(5):
        print('   %-24s %6.1f %6.1f %7.3f %7.3f %7.3f %7.3f %6.3f %6.0f' %
              (five[i]['name'], u[i], u2[i], e[i], e2[i], e3[i], e4[i], c[i], At[i]['ballsec']))
    print('   sum usg %.1f (delta %+.1f)  feed %.3f -> amp x%.4f' % (sum(u), delta, feed, amp))
    print('   OFF_N %.2f  + fit %+.2f  + ft %+.2f  ) x orb %.4f  = %.2f' % (OFF_N, fit, ft, orbm, off))
    print('   usage-weighted repriced TS %.4f   usage-weighted ballsec %.2f' % (OFF_N / 200, wball))
    return dict(off=off, wball=wball)


for y, ab in ((2024, 'BOS'), (2024, 'DEN'), (2023, 'BOS'), (2023, 'NYK')):
    b = BY[(y, ab)]
    five = [A.find_card(players, n) for n in b['five']]
    decompose(five, "%s '%02d  (real ORtg %.1f, TOV%% %.1f)" % (ab, y % 100, b['truth']['ortg'], b['truth']['tov']))
    print()

print('=== the 2024 board: engine offRaw rank vs real ===')
g = [x for x in BOARD if x['y'] == 2024]
eng = sorted(g, key=lambda x: -x['offRaw'])
tru = sorted(g, key=lambda x: -x['truth']['ortg'])
print('  %3s %-4s %8s %7s %7s %7s %6s' % ('#', 'ab', 'offRaw', 'wball', 'realO', 'realTOV', 'realrk'))
for i, x in enumerate(eng):
    print('  %3d %-4s %8.2f %7.2f %7.1f %7.1f %6d%s' %
          (i + 1, x['ab'], x['offRaw'], x['wball'], x['truth']['ortg'], x['truth']['tov'],
           tru.index(x) + 1, '   <<<' if x['ab'] == 'BOS' else ''))
