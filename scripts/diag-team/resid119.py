"""recal_119 — WHO the channel moves, and whether it moves them for the right reason.
The binding anchors are the ones the channel over-rewards: prints predicted vs real TOV% for the
named fives and the biggest residuals on the board."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib119 import B, BY, TOV_INT, TOV_SLOPE, TOV_REF, offs, gauge, dialer, srank, trank  # noqa: E402

SIZE = float(sys.argv[1]) if len(sys.argv) > 1 else 0.55
IDX = {(x['y'], x['ab']): x for x in B}


def tovhat(x, size=1.0):
    t = TOV_INT + TOV_SLOPE * x['wball']
    return TOV_REF + size * (t - TOV_REF)


NAMED = [(2024, 'BOS'), (2023, 'BOS'), (2025, 'BOS'), (2023, 'NYK'), (2005, 'SAC'), (2008, 'BOS'),
         (1996, 'CHI'), (2017, 'GSW'), (2000, 'LAL'), (2018, 'HOU'), (2024, 'DEN'),
         (1995, 'ORL'), (1988, 'BOS')]
off0 = offs(0.0)
offS = offs(SIZE)
g0, gS = gauge(off0), gauge(offS)
d0, dS = dialer(g0), dialer(gS)
print('=== the named fives at size %.2f ===' % SIZE)
print('  %-8s %7s %8s %8s %8s | %7s %7s | %5s %5s | %s' %
      ('five', 'wball', 'TOVhat', 'realTOV', 'err', 'offRaw', 'x mult', 'dial', 'after', 'rank -> (real)'))
for y, ab in NAMED:
    x = IDX[(y, ab)]
    th = tovhat(x, 1.0)
    m = offS[(y, ab)] / off0[(y, ab)]
    print("  %-8s %7.2f %8.2f %8.1f %+8.2f | %7.2f %7.4f | %5d %5d | %2d -> %-2d (real %2d) of %d" %
          ("%s '%02d" % (ab, y % 100), x['wball'], th, x['truth']['tov'], th - x['truth']['tov'],
           x['offRaw'], m, d0(y, ab), dS(y, ab),
           srank(off0, y, ab)[0], srank(offS, y, ab)[0], trank(y, ab)[0], len(BY[y])))

print()
print('=== the 12 fives the channel over-rewards most (TOVhat far BELOW their real TOV%%) ===')
rs = sorted(B, key=lambda x: tovhat(x, 1.0) - x['truth']['tov'])
for x in rs[:12]:
    print("  %-8s wball %5.1f  TOVhat %5.2f  real %5.1f  err %+5.2f   dial %2d -> %2d" %
          ("%s '%02d" % (x['ab'], x['y'] % 100), x['wball'], tovhat(x, 1.0), x['truth']['tov'],
           tovhat(x, 1.0) - x['truth']['tov'], d0(x['y'], x['ab']), dS(x['y'], x['ab'])))
print()
print('=== biggest DIAL movers at size %.2f ===' % SIZE)
mv = sorted(B, key=lambda x: -(dS(x['y'], x['ab']) - d0(x['y'], x['ab'])))
for x in mv[:8]:
    print("  %-8s %+3d  (%2d -> %2d)  wball %5.1f  realTOV %4.1f (rank %d)" %
          ("%s '%02d" % (x['ab'], x['y'] % 100), dS(x['y'], x['ab']) - d0(x['y'], x['ab']),
           d0(x['y'], x['ab']), dS(x['y'], x['ab']), x['wball'], x['truth']['tov'],
           sum(1 for z in BY[x['y']] if z['truth']['tov'] < x['truth']['tov']) + 1))
for x in mv[-8:]:
    print("  %-8s %+3d  (%2d -> %2d)  wball %5.1f  realTOV %4.1f (rank %d)" %
          ("%s '%02d" % (x['ab'], x['y'] % 100), dS(x['y'], x['ab']) - d0(x['y'], x['ab']),
           d0(x['y'], x['ab']), dS(x['y'], x['ab']), x['wball'], x['truth']['tov'],
           sum(1 for z in BY[x['y']] if z['truth']['tov'] < x['truth']['tov']) + 1))
print()
print('=== the summit: adjusted offRaw, top 6, size %.2f ===' % SIZE)
for k in sorted(gS['adj'], key=lambda k: -gS['adj'][k])[:6]:
    print("  %-8s adj %8.3f   dial %2d   (before: adj %8.3f dial %2d)" %
          ("%s '%02d" % (k[1], k[0] % 100), gS['adj'][k], dS(*k), g0['adj'][k], d0(*k)))
