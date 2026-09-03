"""recal_119 — THE FRONTIER. size -> Boston '24 dial / Bulls '96 / Warriors '17 / Rockets '18 / fit.
The OFF gauge block is re-frozen at every size (gauge105.ts's rule), so each row is the scale the
round would actually ship at that size."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib119 import (B, BY, SEASONS, TOV_INT, TOV_SLOPE, TOV_REF, offs, fit, gauge, dialer,  # noqa: E402
                    srank, trank)

print('TOVhat = %.4f %+.5f * wball    TOV_REF %.3f (league mean)' % (TOV_INT, TOV_SLOPE, TOV_REF))
print()
print('  %5s %7s | %5s %6s | %5s %5s %5s %5s %5s | %4s %s' %
      ('size', 'fit', 'BOS24', 'rank', 'CHI96', 'GSW17', 'HOU18', 'LAL00', 'DEN24', '@99', 'breaks'))
for size in [0.0, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0, 2.5, 3.0]:
    off = offs(size)
    f, _ = fit(off)
    g = gauge(off)
    d = dialer(g)
    r = srank(off, 2024, 'BOS')
    above = [k for k in g['adj'] if g['adj'][k] > g['adj'][(2017, 'GSW')]]
    n99 = sum(1 for k in g['adj'] if d(*k) == 99)
    br = []
    if above:
        br.append('>GSW17: ' + ','.join("%s'%02d" % (k[1], k[0] % 100)
                                        for k in sorted(above, key=lambda k: -g['adj'][k])[:3]))
    if abs(d(1996, 'CHI') - 68) > 3:
        br.append('CHI96 68+-3')
    if abs(d(2000, 'LAL') - 64) > 4:
        br.append('LAL00 64+-4')
    print('  %5.2f %7.4f | %5d %3d/%-2d | %5d %5d %5d %5d %5d | %4d %s' %
          (size, f, d(2024, 'BOS'), r[0], r[1], d(1996, 'CHI'), d(2017, 'GSW'), d(2018, 'HOU'),
           d(2000, 'LAL'), d(2024, 'DEN'), n99, ' | '.join(br)))
