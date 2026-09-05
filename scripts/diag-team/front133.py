# recal_133 — THE FRONTIER, stated properly: how low can the 76ers '85 go, as a function of how
# much within-season DEF fit the round is willing to spend, with every pin held?
import sys, os, json, copy, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['opp_orb'] = sum(d * w for d, w in zip(x['drb'], DRB_W)) - x['dec']['glass']
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n


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


def base_K():
    K = copy.deepcopy(SHIPPED)
    K.update(dict(drbw=DRB_W[:], a2=0.35))
    return K


def ev(K):
    bd, hold = board(K)
    ok, lines = grade(bd, verbose=False)
    s = find(bd, '76ers', 1985)
    r, _ = fit(bd)
    return dict(ok=ok, f=s['dialf'], dial=s['dial'], rho=r, hold=hold, bd=bd,
                miss=[l.strip()[5:].split('(')[0].strip() for l in lines if l.strip().startswith('MISS')])


e0 = ev(base_K())
print(f"SHIPPED  PHI85 {e0['f']:.2f} -> {e0['dial']}  rho {e0['rho']:+.4f}")

random.seed(2026)
POOL = []
for it in range(9000):
    K = base_K()
    K['w_di'] = 0.55 + random.uniform(-0.12, 0.12)
    K['w_anc'] = max(0.0, 0.13 + random.uniform(-0.09, 0.09))
    K['w_st'] = max(0.0, 0.12 + random.uniform(-0.10, 0.06))
    K['w_gl'] = max(0.0, 0.12 + random.uniform(-0.08, 0.08))
    K['soft'] = min(1.0, max(0.0, 0.5 + random.uniform(-0.45, 0.4)))
    K['a2'] = max(0.0, 0.35 + random.uniform(-0.3, 0.15))
    d1 = random.uniform(-0.08, 0.10)
    K['load'] = [REF_LOAD[0] - d1] + [REF_LOAD[i] + d1 / 4 for i in range(1, 5)]
    if min(K['load']) <= 0:
        continue
    a = random.uniform(0.3, 1.1)
    b = random.uniform(0.05, 0.6)
    sh = [1.0, a, b, b, b]
    K['drbw'] = [w * 1.8 / sum(sh) for w in sh]
    e = ev(K)
    if e['ok']:
        POOL.append((e, K))

print(f"feasible points found: {len(POOL)} of 9000")
print('\n=== FRONTIER: best reachable 76ers \'85 at each fit budget (all pins held) ===')
print('  fit floor      best PHI85     rho      knobs')
for floor in (0.7764, 0.7750, 0.7740, 0.7727, 0.7700, 0.7650, 0.7600, 0.7500, 0.7400, 0.0):
    cand = [p for p in POOL if p[0]['rho'] >= floor]
    if not cand:
        print(f"  rho >= {floor:.4f}   (none)")
        continue
    e, K = min(cand, key=lambda p: p[0]['f'])
    print(f"  rho >= {floor:.4f}   {e['f']:6.2f} -> {e['dial']:<3}  {e['rho']:+.4f}  "
          f"w {K['w_di']:.3f}/{K['w_anc']:.3f}/{K['w_st']:.3f}/{K['w_gl']:.3f} soft {K['soft']:.2f} a2 {K['a2']:.2f} "
          f"load1 {K['load'][0]:.3f} drbw {[round(z,3) for z in K['drbw']]}")

print('\n=== which pin binds? at the best point for each floor, the slack on every pin ===')
cand = [p for p in POOL if p[0]['rho'] >= 0.7700]
if cand:
    e, K = min(cand, key=lambda p: p[0]['f'])
    bd = e['bd']
    for lab, (t, y) in dict(GSW17=('Warriors', 2017), CHI96=('Bulls', 1996), OKC26=('Thunder', 2026),
                            DET04=('Pistons', 2004), BOS24=('Celtics', 2024), PHI26=('76ers', 2026),
                            DET26=('Pistons', 2026), LAL87=('Lakers', 1987)).items():
        g = find(bd, t, y)
        print(f"   {lab} {g['dialf']:6.2f} -> {g['dial']}")
