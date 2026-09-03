"""recal_119 — THE CEILING of the whole idea, and the shipped constants checked at their ROUNDED
values. The oracle channel prices the team's REAL turnover rate; the card channel prices what the
five's ball security predicts. The gap between them is how much of the possession signal the cards
can carry, and it is the honest bound on what any sizing of this term can buy."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib119 import B, BY, SEASONS, TOV_INT, TOV_SLOPE, TOV_REF, offs, fit, gauge, dialer, srank  # noqa: E402

print('exact OLS:  TOVhat = %.5f %+.6f * wball   TOV_REF %.4f' % (TOV_INT, TOV_SLOPE, TOV_REF))
INT, SLOPE, REF = 18.10, -0.0744, 13.78
print('shipped  :  TOVhat = %.4f %+.5f * wball   TOV_REF %.4f' % (INT, SLOPE, REF))
print()


def oracle(size, ref=None):
    ref = TOV_REF if ref is None else ref
    return {(x['y'], x['ab']): x['offRaw'] * (1 - (ref + size * (x['truth']['tov'] - ref)) / 100.0) / (1 - ref / 100.0)
            for x in B}


print('=== the CEILING: what if the channel could read the real TOV%%? ===')
print('  %6s %10s %10s' % ('size', 'cards', 'oracle'))
for size in (0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0):
    print('  %6.2f %10.4f %10.4f' % (size, fit(offs(size))[0], fit(oracle(size))[0]))
print('  (oracle at size 1.0 is the physically exact possession correction)')
print()

print('=== the frontier again, on the ROUNDED shipped constants ===')
print('  %5s %7s | %5s %6s | %5s %5s %5s %5s | %8s %s' %
      ('size', 'fit', 'BOS24', 'rank', 'CHI96', 'LAL00', 'GSW17', 'HOU18', 'GSW-HOU', 'verdict'))
for size in (0.0, 0.30, 0.40, 0.45, 0.50, 0.54, 0.55, 0.60, 0.70, 1.00):
    off = offs(size, intercept=INT, slope=SLOPE, ref=REF)
    f, _ = fit(off)
    g = gauge(off)
    d = dialer(g)
    marg = g['adj'][(2017, 'GSW')] - g['adj'][(2018, 'HOU')]
    chi, lal = d(1996, 'CHI'), d(2000, 'LAL')
    ovr = int(round((chi + 99) / 2.0))
    ok = (abs(chi - 68) <= 3 and abs(lal - 64) <= 4 and abs(ovr - 84) <= 3 and marg > 0
          and srank(off, 1996, 'CHI')[0] <= 6 and srank(off, 2000, 'LAL')[0] <= 5)
    print('  %5.2f %7.4f | %5d %3d/%-2d | %5d %5d %5d %5d | %+8.3f %s' %
          (size, f, d(2024, 'BOS'), srank(off, 2024, 'BOS')[0], len(BY[2024]), chi, lal,
           d(2017, 'GSW'), d(2018, 'HOU'), marg, 'PASS' if ok else 'FAIL'))
