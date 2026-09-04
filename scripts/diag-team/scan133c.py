# recal_133 — third scan: the RIM ANCHOR's own shape (the second rim protector, the knee height)
# and the anchor weight moved UPWARD, which is the direction the order-statistic regression asks for.
import sys, os, json, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['opp_orb'] = sum(d * w for d, w in zip(x['drb'], DRB_W)) - x['dec']['glass']
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n


def board4(K):
    ld, gw = K['load'], K['drbw']
    tl, tg = sum(ld), sum(gw)
    raw = []
    for x in ROWS:
        eff = sum(pd * (w / tl) for pd, w in zip(x['pd'], ld))
        a = x['rp'][0] + K['a2'] * x['rp'][1] * (x['rp'][1] / 99)
        anc = a if a <= K['knee'] else K['knee'] + (a - K['knee']) * K['soft']
        st = min(99.0, x['dec']['steals'])
        gl = sum(d * w for d, w in zip(x['drb'], gw)) * (1.8 / tg) - x['opp_orb']
        raw.append(K['w_di'] * eff + K['w_anc'] * anc * 0.9 + K['w_st'] * st * 0.9
                   + K['w_gl'] * max(0.0, 60 + gl / 4))
    drt0 = [110 - DRTG_COEF * (d - 55) for d in raw]
    shift = BASE_MEAN - sum(drt0) / len(drt0)
    return [dict(row=x, didx=d, drtg=dr + shift, dial=def_dial(dr + shift, x['y']),
                 dialf=def_dial_f(dr + shift, x['y'])) for x, d, dr in zip(ROWS, raw, drt0)], shift / DRTG_COEF


def variant(**kw):
    K = copy.deepcopy(SHIPPED)
    K['drbw'] = DRB_W[:]
    K['a2'] = 0.35
    K.update(kw)
    return K


def line(tag, K):
    bd, hold = board4(K)
    r, _ = fit(bd)
    g = {k: find(bd, *v) for k, v in dict(PHI85=('76ers', 1985), GSW17=('Warriors', 2017),
                                          CHI96=('Bulls', 1996), OKC26=('Thunder', 2026),
                                          DET04=('Pistons', 2004), BOS24=('Celtics', 2024),
                                          PHI26=('76ers', 2026)).items()}
    ok, lines = grade(bd, verbose=False)
    bad = [l.strip()[5:].split('(')[0].strip() for l in lines if l.strip().startswith('MISS')]
    print(f"  {tag:<26} PHI85 {g['PHI85']['dialf']:6.2f}->{g['PHI85']['dial']:<3} GSW17 {g['GSW17']['dialf']:6.2f} CHI96 {g['CHI96']['dialf']:6.2f} OKC26 {g['OKC26']['dialf']:6.2f} DET04 {g['DET04']['dialf']:6.2f} BOS24 {g['BOS24']['dialf']:6.2f} PHI26 {g['PHI26']['dialf']:6.2f} | rho {r:+.4f} | {'OK' if ok else 'MISS ' + ' / '.join(bad)}")


print('SHIPPED baseline:')
line('shipped', variant())
print('\n=== I) ANCHOR_2ND (the redundant second rim protector) ===')
for t in (0.45, 0.35, 0.25, 0.15, 0.05, 0.0):
    line(f'a2 {t:.2f}', variant(a2=t))
print('\n=== J) ANCHOR_KNEE height, soft 0.5 ===')
for t in (90.0, 95.0, 99.0, 105.0, 110.0, 115.0, 120.0):
    line(f'knee {t:.0f}', variant(knee=t))
print('\n=== K) ANCHOR_KNEE height with a HARD cap above (soft 0) ===')
for t in (99.0, 105.0, 110.0, 113.0, 115.0, 118.0, 120.0):
    line(f'knee {t:.0f} soft 0', variant(knee=t, soft=0.0))
print('\n=== L) anchor weight UP, perdef down (the regression direction) ===')
for t in (0.13, 0.16, 0.19, 0.22, 0.25):
    line(f'w_anc {t:.2f}', variant(w_anc=t, w_di=0.55 - (t - 0.13) * 0.9))
print('\n=== M) steals weight down onto the anchor (regression: steals ~0, anchor underweighted) ===')
for t in (0.12, 0.09, 0.06, 0.03, 0.0):
    line(f'w_st {t:.2f}->anc', variant(w_st=t, w_anc=0.13 + (0.12 - t)))
print('\n=== N) the glass blend b, with w_gl trimmed to hold the channel (best of scan b) ===')
for b in (0.0, 0.5, 0.75, 1.0):
    for t in (0.12, 0.13, 0.14, 0.15):
        w = [(1 - b) * DRB_W[i] / 1.8 + b * 0.2 for i in range(5)]
        line(f'b {b:.2f} w_gl {t:.2f}', variant(drbw=w, w_gl=t, w_di=0.55 + (0.12 - t)))
