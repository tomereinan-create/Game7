"""recal_119 — every OFF-side anchor, graded at every candidate size, on the re-frozen gauge.
DEF is untouched by this round (defense_vs never sees the channel), so only the pins with an
offensive component can move: CHI '96 offdial 68+-3 and ovrdial 84+-3, LAL '00 offdial 64+-4 and
its rank<=5, CHI '96 rank<=6, GSW '17 offdial 99 tol 0 (and, in spirit, the summit's uniqueness)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib119 import offs, fit, gauge, dialer, srank  # noqa: E402

CHI_DEF, LAL_DEF = 99, 77   # the DEF dials, which this round cannot move


def row(size):
    off = offs(size)
    f, _ = fit(off)
    g = gauge(off)
    d = dialer(g)
    chi, lal, gsw = d(1996, 'CHI'), d(2000, 'LAL'), d(2017, 'GSW')
    ovr = int(round((chi + CHI_DEF) / 2.0))
    rchi = srank(off, 1996, 'CHI')[0]
    rlal = srank(off, 2000, 'LAL')[0]
    above = sum(1 for k in g['adj'] if g['adj'][k] > g['adj'][(2017, 'GSW')])
    n99 = sum(1 for k in g['adj'] if d(*k) == 99)
    ok = (abs(chi - 68) <= 3 and abs(lal - 64) <= 4 and gsw == 99 and abs(ovr - 84) <= 3
          and rchi <= 6 and rlal <= 5 and above == 0)
    return dict(size=size, fit=f, chi=chi, lal=lal, gsw=gsw, ovr=ovr, rchi=rchi, rlal=rlal,
                above=above, n99=n99, ok=ok, bos=d(2024, 'BOS'), rbos=srank(off, 2024, 'BOS')[0])


print('  %5s %7s | %5s %5s | %5s %6s %5s %6s %5s %6s | %5s %4s | %s' %
      ('size', 'fit', 'BOS24', 'rank', 'CHI96', 'r<=6', 'LAL00', 'r<=5', 'GSW17', 'CHIovr',
       'above', '@99', 'ALL ANCHORS'))
for size in [0.0, 0.30, 0.40, 0.45, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60, 0.70, 0.90, 1.00, 1.30, 2.00]:
    r = row(size)
    print('  %5.2f %7.4f | %5d %5d | %5d %6d %5d %6d %5d %6d | %5d %4d | %s' %
          (r['size'], r['fit'], r['bos'], r['rbos'], r['chi'], r['rchi'], r['lal'], r['rlal'],
           r['gsw'], r['ovr'], r['above'], r['n99'], 'PASS' if r['ok'] else 'FAIL'))
