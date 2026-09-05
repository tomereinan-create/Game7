# recal_133 — second scan: the GLASS shape (who on the five is credited with the defensive board)
# and the perdef-vs-glass cross terms. Same wheel, same frozen gauge, same anchor grader.
import sys, os, json, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab133
from lab133 import ROWS, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

# REF_FIVE's own offensive-board side of `glass` is a constant across the wheel: recover it.
DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    ours = sum(d * w for d, w in zip(x['drb'], DRB_W))
    x['opp_orb'] = ours - x['dec']['glass']

OPP = ROWS[0]['opp_orb']
print('REF_FIVE offensive-board constant:', round(OPP, 4), ' (spread over the wheel:',
      round(max(x['opp_orb'] for x in ROWS) - min(x['opp_orb'] for x in ROWS), 6), ')')

KEY = [('76ers', 1985), ('Warriors', 2017), ('Bulls', 1996), ('Celtics', 2010), ('Bucks', 1985),
       ('76ers', 1980), ('Spurs', 2005), ('Bulls', 1998), ('Pistons', 2004), ('Thunder', 2026),
       ('Jazz', 1998), ('76ers', 1984), ('Celtics', 2024), ('Pistons', 2026), ('Lakers', 1987),
       ('76ers', 2026)]
print('\nDRB vectors:')
for t, y in KEY:
    x = next(r for r in ROWS if r['y'] == y and t in r['team'])
    print(f"  {x['team']} '{str(y)[2:]:<4} drb {x['drb']}  top-heavy read {sum(d*w for d,w in zip(x['drb'],DRB_W)):7.2f}  flat*1.8 {sum(x['drb'])/5*1.8:7.2f}  diff {sum(d*w for d,w in zip(x['drb'],DRB_W)) - sum(x['drb'])/5*1.8:+7.2f}")

n = len(ROWS)
print('\npool mean top-heavy read', round(sum(sum(d*w for d, w in zip(x['drb'], DRB_W)) for x in ROWS)/n, 3),
      ' pool mean flat*1.8', round(sum(sum(x['drb'])/5*1.8 for x in ROWS)/n, 3))

BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n


def board2(K):
    raw = []
    for x in ROWS:
        eff = sum(pd * (w / sum(K['load'])) for pd, w in zip(x['pd'], K['load']))
        a = x['dec']['anchor']
        anc = a if a <= K['knee'] else K['knee'] + (a - K['knee']) * K['soft']
        st = min(99.0, x['dec']['steals'])
        gw = K['drbw']
        gl = sum(d * w for d, w in zip(x['drb'], gw)) * (1.8 / sum(gw)) - x['opp_orb']
        gt = max(0.0, 60 + gl / 4)
        raw.append(K['w_di'] * eff + K['w_anc'] * anc * 0.9 + K['w_st'] * st * 0.9 + K['w_gl'] * gt)
    drt0 = [110 - DRTG_COEF * (d - 55) for d in raw]
    shift = BASE_MEAN - sum(drt0) / len(drt0)
    out = []
    for x, d, dr in zip(ROWS, raw, drt0):
        drtg = dr + shift
        out.append(dict(row=x, didx=d, drtg=drtg, dial=def_dial(drtg, x['y']), dialf=def_dial_f(drtg, x['y'])))
    return out, shift / DRTG_COEF


def variant(**kw):
    K = copy.deepcopy(SHIPPED)
    K['drbw'] = DRB_W[:]
    K.update(kw)
    return K


def line(tag, K):
    bd, hold = board2(K)
    r, _ = fit(bd)
    g = {k: find(bd, *v) for k, v in dict(PHI85=('76ers', 1985), GSW17=('Warriors', 2017),
                                          CHI96=('Bulls', 1996), OKC26=('Thunder', 2026),
                                          DET04=('Pistons', 2004), BOS24=('Celtics', 2024),
                                          PHI26=('76ers', 2026), LAL87=('Lakers', 1987),
                                          DET26=('Pistons', 2026)).items()}
    ok, lines = grade(bd, verbose=False)
    bad = [l.strip() for l in lines if l.strip().startswith('MISS')]
    print(f"  {tag:<24} PHI85 {g['PHI85']['dialf']:6.2f}->{g['PHI85']['dial']:<3} GSW17 {g['GSW17']['dialf']:6.2f} CHI96 {g['CHI96']['dialf']:6.2f} OKC26 {g['OKC26']['dialf']:6.2f} DET04 {g['DET04']['dialf']:6.2f} BOS24 {g['BOS24']['dialf']:6.2f} PHI26 {g['PHI26']['dialf']:6.2f} | rho {r:+.4f} | {'OK' if ok else 'MISS: ' + '; '.join(bad)}")
    return g['PHI85']['dial'], ok, r


print('\n=== H) glass shape: [1,.5,.1,.1,.1] blended toward flat (beta = share of FLAT) ===')
for b in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
    w = [(1 - b) * DRB_W[i] / 1.8 + b * 0.2 for i in range(5)]
    line(f'beta {b:.1f}', variant(drbw=w))

print('\n=== H2) glass shape + glass weight held, blended AND w_gl trimmed ===')
for b in (0.6, 0.8, 1.0):
    for t in (0.12, 0.10, 0.14, 0.16):
        w = [(1 - b) * DRB_W[i] / 1.8 + b * 0.2 for i in range(5)]
        line(f'beta {b:.1f} w_gl {t:.2f}', variant(drbw=w, w_gl=t, w_di=0.55 + (0.12 - t)))
