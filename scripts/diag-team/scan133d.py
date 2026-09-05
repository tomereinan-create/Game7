# recal_133 — the candidate: the GLASS channel read through recal_122's own load profile
# (.24/.22/.20/.18/.16) instead of the pre-122 top-heavy order-statistic stack [1, .5, .1, .1, .1],
# alone and with one second knob.
import sys, os, json, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['orb'] = sorted((p['orb'] for p in x['five']), reverse=True)
    x['opp_orb'] = sum(d * w for d, w in zip(x['drb'], DRB_W)) - x['dec']['glass']
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n
LOADW = [w * 1.8 for w in REF_LOAD]     # the load profile, rescaled to the stack's own 1.8 total


def board5(K):
    ld, gw = K['load'], K['drbw']
    tl = sum(ld)
    raw = []
    for x in ROWS:
        eff = sum(pd * (w / tl) for pd, w in zip(x['pd'], ld))
        a = x['rp'][0] + K['a2'] * x['rp'][1] * (x['rp'][1] / 99)
        anc = a if a <= K['knee'] else K['knee'] + (a - K['knee']) * K['soft']
        st = min(99.0, x['dec']['steals'])
        gl = sum(d * w for d, w in zip(x['drb'], gw)) - x['opp_orb']
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


def line(tag, K, show=False):
    bd, hold = board5(K)
    r, _ = fit(bd)
    g = {k: find(bd, *v) for k, v in dict(PHI85=('76ers', 1985), GSW17=('Warriors', 2017),
                                          CHI96=('Bulls', 1996), OKC26=('Thunder', 2026),
                                          DET04=('Pistons', 2004), BOS24=('Celtics', 2024),
                                          PHI26=('76ers', 2026), LAL87=('Lakers', 1987)).items()}
    ok, lines = grade(bd, verbose=False)
    bad = [l.strip()[5:].split('(')[0].strip() for l in lines if l.strip().startswith('MISS')]
    print(f"  {tag:<30} PHI85 {g['PHI85']['dialf']:6.2f}->{g['PHI85']['dial']:<3} GSW17 {g['GSW17']['dialf']:6.2f} CHI96 {g['CHI96']['dialf']:6.2f} OKC26 {g['OKC26']['dialf']:6.2f} DET04 {g['DET04']['dialf']:6.2f} BOS24 {g['BOS24']['dialf']:6.2f} PHI26 {g['PHI26']['dialf']:6.2f} LAL87 {g['LAL87']['dialf']:6.2f} | hold {hold:+.4f} rho {r:+.4f} | {'OK' if ok else 'MISS ' + ' / '.join(bad)}")
    if show:
        grade(bd)
    return bd, r, ok


print('baseline:')
line('shipped', variant())
print('\n=== P) glass read through the LOAD PROFILE (.24/.22/.20/.18/.16 x 1.8) ===')
line('load-profile glass', variant(drbw=LOADW))
print('\n=== P + one second knob ===')
for t in (0.35, 0.30, 0.25, 0.20, 0.15, 0.10, 0.0):
    line(f'  + ANCHOR_2ND {t:.2f}', variant(drbw=LOADW, a2=t))
print()
for t in (0.50, 0.45, 0.40, 0.35, 0.30):
    line(f'  + ANCHOR_SOFT {t:.2f}', variant(drbw=LOADW, soft=t))
print()
for t in (0.12, 0.13, 0.14, 0.15, 0.16):
    line(f'  + w_gl {t:.2f} (->perdef)', variant(drbw=LOADW, w_gl=t, w_di=0.55 + (0.12 - t)))
print()
for t in (0.12, 0.10, 0.08, 0.06):
    line(f'  + w_st {t:.2f} (->perdef)', variant(drbw=LOADW, w_st=t, w_di=0.55 + (0.12 - t) * 0.9))
print()
for t in (0.13, 0.15, 0.17, 0.19):
    line(f'  + w_anc {t:.2f} (<-perdef)', variant(drbw=LOADW, w_anc=t, w_di=0.55 - (t - 0.13) * 0.9))
print('\n=== Q) the glass DIVISOR (how much a board point is worth) with the load profile ===')
for d in (4.0, 3.5, 3.0, 2.5):
    K = variant(drbw=LOADW)
    K['div'] = d
    # emulate by scaling the drb weights and the opponent constant together: gterm = 60 + glass/div
    # -> equivalent to w_gl * glass / div ; scale w_gl instead and re-centre with the hold
    K2 = variant(drbw=[w * (4.0 / d) for w in LOADW], w_gl=SHIPPED['w_gl'])
    # the opponent constant must scale too, else the level shifts (the hold absorbs it anyway)
    line(f'  divisor {d:.1f}', K2)
