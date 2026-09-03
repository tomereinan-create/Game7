"""recal_119 — the anchor MARGINS, continuous rather than rounded, so the shipped size is not
chosen on a rail. Two constraints bind: the all-time summit ordering (Warriors '17 must stay above
the Rockets '18 on the adjusted index, which is what recal_71's `99 = the 2017 Warriors` means) and
the Bulls '96 offdial pin 68+-3."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib119 import BY, offs, fit, gauge, srank  # noqa: E402

INT, SLOPE, REF = 18.10, -0.0744, 13.78


def s71c(v, mn, md, tp):
    return max(1.0, min(99.0, 1 + 49.0 * (v - mn) / (md - mn) if v <= md else 50 + 49.0 * (v - md) / (tp - md)))


print('  %5s %7s | %8s %8s %8s | %8s %8s | %5s %6s' %
      ('size', 'fit', 'CHI96', 'LAL00', 'BOS24', 'GSW-HOU', 'headroom', 'BOS', 'rank'))
print('  %5s %7s | %8s %8s %8s | %8s %8s' %
      ('', '', 'dial<=71', 'dial<=68', 'dial', 'adj pts', 'to CHI71.5'))
for i in range(0, 15):
    size = 0.30 + 0.02 * i
    off = offs(size, intercept=INT, slope=SLOPE, ref=REF)
    f, _ = fit(off)
    g = gauge(off)
    c = lambda y, ab: s71c(g['adj'][(y, ab)], g['mn'], g['md'], g['top'])
    marg = g['adj'][(2017, 'GSW')] - g['adj'][(2018, 'HOU')]
    print('  %5.2f %7.4f | %8.2f %8.2f %8.2f | %+8.3f %8.2f | %5d %2d/%-2d' %
          (size, f, c(1996, 'CHI'), c(2000, 'LAL'), c(2024, 'BOS'), marg, 71.5 - c(1996, 'CHI'),
           round(c(2024, 'BOS')), srank(off, 2024, 'BOS')[0], len(BY[2024])))
