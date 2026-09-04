# recal_133 — THE FRONTIER. How far can the 76ers '85 fall with every pin held?
# Random + local search over the didx channel weights and the two shape knobs, grading the whole
# 1,255-five wheel through the frozen gauge at every point.
import sys, os, json, copy, random, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['opp_orb'] = sum(d * w for d, w in zip(x['drb'], DRB_W)) - x['dec']['glass']
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n


def board3(K):
    ld, gw = K['load'], K['drbw']
    tl, tg = sum(ld), sum(gw)
    raw = []
    for x in ROWS:
        eff = sum(pd * (w / tl) for pd, w in zip(x['pd'], ld))
        a = x['dec']['anchor']
        anc = a if a <= K['knee'] else K['knee'] + (a - K['knee']) * K['soft']
        st = min(99.0, x['dec']['steals'])
        gl = sum(d * w for d, w in zip(x['drb'], gw)) * (1.8 / tg) - x['opp_orb']
        raw.append(K['w_di'] * eff + K['w_anc'] * anc * 0.9 + K['w_st'] * st * 0.9
                   + K['w_gl'] * max(0.0, 60 + gl / 4))
    drt0 = [110 - DRTG_COEF * (d - 55) for d in raw]
    shift = BASE_MEAN - sum(drt0) / len(drt0)
    return [dict(row=x, didx=d, drtg=dr + shift, dial=def_dial(dr + shift, x['y']),
                 dialf=def_dial_f(dr + shift, x['y'])) for x, d, dr in zip(ROWS, raw, drt0)], shift / DRTG_COEF


def base_K():
    K = copy.deepcopy(SHIPPED)
    K['drbw'] = DRB_W[:]
    return K


def evaluate(K):
    bd, hold = board3(K)
    ok, lines = grade(bd, verbose=False)
    subj = find(bd, '76ers', 1985)
    r, _ = fit(bd)
    return dict(ok=ok, subj=subj['dialf'], dial=subj['dial'], rho=r, hold=hold, bd=bd,
                miss=[l.strip()[5:] for l in lines if l.strip().startswith('MISS')])


K0 = base_K()
e0 = evaluate(K0)
print(f"SHIPPED  PHI85 {e0['subj']:.2f} -> {e0['dial']}   rho {e0['rho']:+.4f}   anchors {'OK' if e0['ok'] else 'MISS'}")

random.seed(133)
best = None
tried = 0
# search: the four channel weights, ANCHOR_SOFT, the load tilt off slot 1, the glass shape blend
for it in range(4000):
    K = base_K()
    K['w_di'] = 0.55 + random.uniform(-0.15, 0.15)
    K['w_anc'] = max(0.0, 0.13 + random.uniform(-0.10, 0.12))
    K['w_st'] = max(0.0, 0.12 + random.uniform(-0.12, 0.08))
    K['w_gl'] = max(0.0, 0.12 + random.uniform(-0.10, 0.12))
    K['soft'] = min(1.0, max(0.0, 0.5 + random.uniform(-0.5, 0.4)))
    d1 = random.uniform(-0.10, 0.14)
    K['load'] = [REF_LOAD[0] - d1] + [REF_LOAD[i] + d1 / 4 for i in range(1, 5)]
    b = random.uniform(0.0, 1.0)
    K['drbw'] = [(1 - b) * DRB_W[i] / 1.8 + b * 0.2 for i in range(5)]
    if min(K['load']) <= 0:
        continue
    tried += 1
    e = evaluate(K)
    if not e['ok']:
        continue
    if best is None or e['subj'] < best[0]['subj']:
        best = (e, K, dict(d1=d1, b=b))
        print(f"  [{it:4d}] PHI85 {e['subj']:6.2f} -> {e['dial']:<3} rho {e['rho']:+.4f}  "
              f"w {K['w_di']:.3f}/{K['w_anc']:.3f}/{K['w_st']:.3f}/{K['w_gl']:.3f} soft {K['soft']:.2f} d1 {d1:+.3f} b {b:.2f}")

print(f"\nsearched {tried} feasible-shape points")
if best:
    e, K, meta = best
    print('BEST (unconstrained on fit):')
    print(f"  PHI85 {e['subj']:.2f} -> {e['dial']}   rho {e['rho']:+.4f} (shipped {e0['rho']:+.4f})")
    print('  K =', json.dumps({k: (v if not isinstance(v, list) else [round(z, 4) for z in v]) for k, v in K.items()}))
    grade(e['bd'])

# the same, but only accepting points whose fit is NOT worse than shipped
print('\n=== FRONTIER WITH FIT HELD (rho >= shipped) ===')
best2 = None
random.seed(1331)
for it in range(4000):
    K = base_K()
    K['w_di'] = 0.55 + random.uniform(-0.15, 0.15)
    K['w_anc'] = max(0.0, 0.13 + random.uniform(-0.10, 0.12))
    K['w_st'] = max(0.0, 0.12 + random.uniform(-0.12, 0.08))
    K['w_gl'] = max(0.0, 0.12 + random.uniform(-0.10, 0.12))
    K['soft'] = min(1.0, max(0.0, 0.5 + random.uniform(-0.5, 0.4)))
    d1 = random.uniform(-0.10, 0.14)
    K['load'] = [REF_LOAD[0] - d1] + [REF_LOAD[i] + d1 / 4 for i in range(1, 5)]
    b = random.uniform(0.0, 1.0)
    K['drbw'] = [(1 - b) * DRB_W[i] / 1.8 + b * 0.2 for i in range(5)]
    if min(K['load']) <= 0:
        continue
    e = evaluate(K)
    if not e['ok'] or e['rho'] < e0['rho']:
        continue
    if best2 is None or e['subj'] < best2[0]['subj']:
        best2 = (e, K, dict(d1=d1, b=b))
        print(f"  [{it:4d}] PHI85 {e['subj']:6.2f} -> {e['dial']:<3} rho {e['rho']:+.4f}  "
              f"w {K['w_di']:.3f}/{K['w_anc']:.3f}/{K['w_st']:.3f}/{K['w_gl']:.3f} soft {K['soft']:.2f} d1 {d1:+.3f} b {b:.2f}")
if best2:
    e, K, meta = best2
    print('BEST with fit held:')
    print(f"  PHI85 {e['subj']:.2f} -> {e['dial']}   rho {e['rho']:+.4f}")
    print('  K =', json.dumps({k: (v if not isinstance(v, list) else [round(z, 4) for z in v]) for k, v in K.items()}))
