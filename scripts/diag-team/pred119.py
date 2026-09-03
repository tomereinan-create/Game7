"""recal_119 — WHICH weighting of the five's ball security predicts a team's real turnover rate
best? A better predictor buys more fit per unit of anchor stress, so this is measured before the
size is chosen. Scored two ways: the within-season Spearman against -TOV% (what the dial can see)
and, for the winner, the pooled OLS."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib119 import B, BY, SEASONS, spear, pear  # noqa: E402


def wavg(x, vals, wts):
    tot = sum(wts) or 1.0
    return sum(v * w for v, w in zip(vals, wts)) / tot


PREDS = {
    'usage-weighted ballsec (shipped candidate)': lambda x: wavg(x, x['ball'], x['u2']),
    'plain mean ballsec': lambda x: sum(x['ball']) / 5.0,
    'usage^2-weighted ballsec': lambda x: wavg(x, x['ball'], [u * u for u in x['u2']]),
    'playvol-weighted ballsec': lambda x: wavg(x, x['ball'], x['play']),
    '(usage x playvol)-weighted ballsec': lambda x: wavg(x, x['ball'], [u * p for u, p in zip(x['u2'], x['play'])]),
    'natural-usage-weighted ballsec': lambda x: wavg(x, x['ball'], x['usg']),
    'worst ball-handler (min ballsec)': lambda x: min(x['ball']),
    'top-2 handlers by usage': lambda x: sum(b for _, b in sorted(zip(x['u2'], x['ball']))[-2:]) / 2.0,
}
print('=== predictor vs real TOV%%, within-season Spearman over %d seasons ===' % len(SEASONS))
rows = []
for nm, f in PREDS.items():
    rs = [spear([f(z) for z in BY[y]], [-z['truth']['tov'] for z in BY[y]]) for y in SEASONS]
    p = pear([f(z) for z in B], [-z['truth']['tov'] for z in B])
    rows.append((sum(rs) / len(rs), p, nm))
for r, p, nm in sorted(rows, reverse=True):
    print('  %-44s in-season rho %+.4f   pooled r %+.4f' % (nm, r, p))
