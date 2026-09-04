# recal_133 — (e) a KNEE on the glass stack, the same law the rim anchor got at recal_94/122;
# and (f) the load-profile glass with w_gl re-set to hold the CHANNEL'S OWN SPREAD, not fitted.
import sys, os, math, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['stack'] = sum(d * w for d, w in zip(x['drb'], DRB_W))
    x['opp_orb'] = x['stack'] - x['dec']['glass']
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n
LOADW = [w * 1.8 for w in REF_LOAD]


def sd(v):
    m = sum(v) / len(v)
    return math.sqrt(sum((z - m) ** 2 for z in v) / (len(v) - 1))


stack_now = [x['stack'] for x in ROWS]
stack_load = [sum(d * w for d, w in zip(x['drb'], LOADW)) for x in ROWS]
print(f"glass stack sd: shipped [1,.5,.1,.1,.1] {sd(stack_now):.3f}   load-profile {sd(stack_load):.3f}"
      f"   ratio {sd(stack_now)/sd(stack_load):.4f}")
print(f"  -> w_gl that holds the channel's own spread: 0.12 x {sd(stack_now)/sd(stack_load):.4f} = "
      f"{0.12*sd(stack_now)/sd(stack_load):.4f}")
print(f"  means: shipped {sum(stack_now)/n:.3f}  load-profile {sum(stack_load)/n:.3f}")


def board6(K):
    ld, gw = K['load'], K['drbw']
    tl = sum(ld)
    raw = []
    for x in ROWS:
        eff = sum(pd * (w / tl) for pd, w in zip(x['pd'], ld))
        a = x['rp'][0] + K['a2'] * x['rp'][1] * (x['rp'][1] / 99)
        anc = a if a <= K['knee'] else K['knee'] + (a - K['knee']) * K['soft']
        st = min(99.0, x['dec']['steals'])
        s = sum(d * w for d, w in zip(x['drb'], gw))
        if K['gknee'] is not None and s > K['gknee']:
            s = K['gknee'] + (s - K['gknee']) * K['gsoft']
        gl = s - x['opp_orb']
        raw.append(K['w_di'] * eff + K['w_anc'] * anc * 0.9 + K['w_st'] * st * 0.9
                   + K['w_gl'] * max(0.0, 60 + gl / 4))
    drt0 = [110 - DRTG_COEF * (d - 55) for d in raw]
    shift = BASE_MEAN - sum(drt0) / len(drt0)
    return [dict(row=x, didx=d, drtg=dr + shift, dial=def_dial(dr + shift, x['y']),
                 dialf=def_dial_f(dr + shift, x['y'])) for x, d, dr in zip(ROWS, raw, drt0)], shift / DRTG_COEF


def variant(**kw):
    K = copy.deepcopy(SHIPPED)
    K.update(dict(drbw=DRB_W[:], a2=0.35, gknee=None, gsoft=0.5))
    K.update(kw)
    return K


def line(tag, K):
    bd, hold = board6(K)
    r, _ = fit(bd)
    g = {k: find(bd, *v) for k, v in dict(PHI85=('76ers', 1985), GSW17=('Warriors', 2017),
                                          CHI96=('Bulls', 1996), OKC26=('Thunder', 2026),
                                          DET04=('Pistons', 2004), BOS24=('Celtics', 2024),
                                          PHI26=('76ers', 2026), LAL87=('Lakers', 1987)).items()}
    ok, lines = grade(bd, verbose=False)
    bad = [l.strip()[5:].split('(')[0].strip() for l in lines if l.strip().startswith('MISS')]
    print(f"  {tag:<32} PHI85 {g['PHI85']['dialf']:6.2f}->{g['PHI85']['dial']:<3} GSW17 {g['GSW17']['dialf']:6.2f} CHI96 {g['CHI96']['dialf']:6.2f} OKC26 {g['OKC26']['dialf']:6.2f} DET04 {g['DET04']['dialf']:6.2f} BOS24 {g['BOS24']['dialf']:6.2f} PHI26 {g['PHI26']['dialf']:6.2f} LAL87 {g['LAL87']['dialf']:6.2f} | hold {hold:+.4f} rho {r:+.4f} | {'OK' if ok else 'MISS ' + ' / '.join(bad)}")
    return bd, r, ok


print('\n=== R) a KNEE on the shipped glass stack (soft 0.5) ===')
for k in (110, 120, 125, 130, 135, 140):
    line(f'gknee {k} soft .5', variant(gknee=float(k)))
print('\n=== R2) the same, soft 0.25 ===')
for k in (110, 120, 125, 130, 135, 140):
    line(f'gknee {k} soft .25', variant(gknee=float(k), gsoft=0.25))
print('\n=== S) load-profile glass, w_gl at the spread-holding value ===')
ratio = sd(stack_now) / sd(stack_load)
for t in (0.12, round(0.12 * ratio, 4), 0.14, 0.145, 0.15):
    line(f'load glass w_gl {t}', variant(drbw=LOADW, w_gl=t, w_di=0.55 + (0.12 - t)))
