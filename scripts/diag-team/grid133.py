# recal_133 — with the glass shape locked at the value its OWN truth column picks, can a second
# evidence-backed knob reach 94 with every pin held and the dial fit intact?
import sys, os, copy, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['opp_orb'] = sum(d * w for d, w in zip(x['drb'], DRB_W)) - x['dec']['glass']
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n
SH = [1.0, 0.5, 0.35, 0.35, 0.35]
SCALED = [w * 1.8 / sum(SH) for w in SH]


def board(K):
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


def V(**kw):
    K = copy.deepcopy(SHIPPED)
    K.update(dict(drbw=SCALED[:], a2=0.35))
    K.update(kw)
    return K


rows = []
for a2 in (0.35, 0.30, 0.25, 0.20, 0.15, 0.10):
    for wgl in (0.120, 0.125, 0.130, 0.135, 0.140):
        for soft in (0.50, 0.45, 0.40, 0.35):
            for wst in (0.12, 0.11, 0.10):
                K = V(a2=a2, w_gl=wgl, soft=soft, w_st=wst,
                      w_di=0.55 + (0.12 - wgl) + (0.12 - wst) * 0.9)
                bd, hold = board(K)
                ok, lines = grade(bd, verbose=False)
                if not ok:
                    continue
                s = find(bd, '76ers', 1985)
                r, _ = fit(bd)
                rows.append((s['dial'], -r, s['dialf'], r, hold, a2, wgl, soft, wst,
                             find(bd, 'Warriors', 2017)['dialf'], find(bd, 'Bulls', 1996)['dialf']))
rows.sort()
print(f"feasible: {len(rows)}")
print('  PHI85   rho      hold     a2    w_gl   soft  w_st  | GSW17  CHI96')
for r in rows[:25]:
    print(f"  {r[2]:6.2f}->{r[0]:<3} {r[3]:+.4f} {r[4]:+7.4f}  {r[5]:.2f}  {r[6]:.3f}  {r[7]:.2f}  {r[8]:.2f}  | {r[9]:6.2f} {r[10]:6.2f}")
