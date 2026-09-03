"""recal_110 — is the interaction channel CLAMPED? OFF_N carries only the repriced TS; creation
amplification and every one of Tomer's interactions reach OFF solely through `fit`, which is
clamped to +-FIT_CAP. And each player's own stack is clamped to [0.90, 1.12] of his repriced TS."""
import io, json, os, sys
from collections import defaultdict
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data'))
import anchors as A  # noqa: E402
NS = A._team_ns()
K = NS['KNOBS']
creation = NS['creation']
players = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf8'))
WHEEL = json.load(io.open(os.path.join(ROOT, 'src', 'data', 'teamseasons.json'), encoding='utf8'))
BOARD = []
for y in sorted({t['y'] for t in WHEEL}):
    for row in A.season_board(players, y):
        BOARD.append((y, row['ab'], row['five']))


def parts(five):
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
    e3 = [x*(1 + K['AMP_MAX']*feed*max(0.0, 1-u2i/30)) for x, u2i in zip(e2, u2)]
    outs = [a['3pt'] for a in At]
    raw, e4, floored, capped = [], [], 0, 0
    for i, (a, u2i, ei) in enumerate(zip(At, u2, e3)):
        x = ei
        if u2i < 13:
            x *= 1 - 0.010*(13-u2i)
        if u2i > 32:
            x *= 1 - 0.006*(u2i-32)
        if a['3pt'] < 40 and a['mid'] < 45:
            spc = sum(max(0, outs[j]-55) for j in range(5) if j != i)/(4*44)
            x *= 1 - 0.07*(1-min(1.0, spc/0.55))
            if a['usg_raw'] < 20:
                x *= 1 + 0.06*max(creation(At[j])*outs[j]/99 for j in range(5) if j != i)
            elif a['usg_raw'] >= 24:
                x *= 1 + 0.05*min(1.0, spc/0.55)
        r = x/ei
        raw.append(r)
        if r < 0.90:
            floored += 1
        if r > 1.12:
            capped += 1
        e4.append(ei*min(1.12, max(0.90, r)))
    OFF_N = sum(a*b for a, b in zip(u2, e2))*2
    OFF_F = sum(a*b for a, b in zip(u2, e4))*2
    raw_fit = K['FIT_WIDEN']*(OFF_F-OFF_N)
    return OFF_N, raw_fit, floored, capped, feed


rows = [(y, ab, parts(f)) for y, ab, f in BOARD]
lo = sum(1 for _, _, p in rows if p[1] <= -K['FIT_CAP'])
hi = sum(1 for _, _, p in rows if p[1] >= K['FIT_CAP'])
print('=== the FIT clamp (+-%.1f), the only door every interaction goes through ===' % K['FIT_CAP'])
print('  fives clamped at the FLOOR  -%.1f : %4d of %d (%.1f%%)' % (K['FIT_CAP'], lo, len(rows), 100*lo/len(rows)))
print('  fives clamped at the CEILING +%.1f : %4d of %d (%.1f%%)' % (K['FIT_CAP'], hi, len(rows), 100*hi/len(rows)))
print('  fives within 0.5 of a rail          : %4d (%.1f%%)' %
      (sum(1 for _, _, p in rows if abs(p[1]) >= K['FIT_CAP']-0.5), 100*sum(1 for _, _, p in rows if abs(p[1]) >= K['FIT_CAP']-0.5)/len(rows)))
raws = sorted(p[1] for _, _, p in rows)
print('  raw fit spread: min %.2f  p10 %.2f  median %.2f  p90 %.2f  max %.2f' %
      (raws[0], raws[len(raws)//10], raws[len(raws)//2], raws[9*len(raws)//10], raws[-1]))
print()
print('=== the per-player stack cap [0.90, 1.12] ===')
print('  player-readings at the FLOOR 0.90 : %d of %d' % (sum(p[2] for _, _, p in rows), 5*len(rows)))
print('  player-readings at the CAP  1.12  : %d of %d' % (sum(p[3] for _, _, p in rows), 5*len(rows)))
print()
print('=== the named and control fives ===')
NAMED = [(1996, 'CHI'), (1996, 'SEA'), (2000, 'LAL'), (2000, 'UTA'), (1997, 'UTA'), (2017, 'GSW'), (2013, 'MIA')]
for y, ab in NAMED:
    p = [r for r in rows if r[0] == y and r[1] == ab]
    if not p:
        continue
    OFF_N, raw_fit, fl, cp, feed = p[0][2]
    tag = ' <-- CLAMPED' if abs(raw_fit) >= K['FIT_CAP'] else ''
    print("  %s '%02d  OFF_N %7.2f   raw fit %+6.2f -> %+5.2f%s   feed %.3f   players floored %d capped %d" %
          (ab, y % 100, OFF_N, raw_fit, min(K['FIT_CAP'], max(-K['FIT_CAP'], raw_fit)), tag, feed, fl, cp))
