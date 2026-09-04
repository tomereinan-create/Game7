# recal_133 — the frontier. One knob at a time, over the whole 1,255-five wheel.
import sys, os, json, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, SHIPPED, board, fit, find, grade, REF_LOAD, def_dial_f

for x in ROWS:
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)

# pool profile
n = len(ROWS)
pool = dict(
    effDi=sum(sum(pd*w for pd, w in zip(x['pd'], REF_LOAD)) for x in ROWS)/n,
    anchor=sum(x['dec']['anchor'] for x in ROWS)/n,
    excess=sum(max(0, x['dec']['anchor']-99) for x in ROWS)/n,
    steals=sum(min(99, x['dec']['steals']) for x in ROWS)/n,
    glass=sum(x['dec']['glass'] for x in ROWS)/n,
    gterm=sum(max(0, 60+x['dec']['glass']/4) for x in ROWS)/n,
    pd1=sum(x['pd'][0] for x in ROWS)/n,
    pdrest=sum(sum(x['pd'][1:])/4 for x in ROWS)/n,
    pd5=sum(x['pd'][4] for x in ROWS)/n,
    spread=sum(x['pd'][0]-x['pd'][4] for x in ROWS)/n,
)
print('POOL MEANS:', json.dumps({k: round(v, 3) for k, v in pool.items()}))

KEY = [('76ers', 1985), ('Warriors', 2017), ('Bulls', 1996), ('Celtics', 2010), ('Bucks', 1985),
       ('76ers', 1980), ('Spurs', 2005), ('Bulls', 1998), ('Pistons', 2004), ('Thunder', 2026),
       ('Jazz', 1998), ('76ers', 1984), ('Celtics', 2024), ('Pistons', 2026), ('Lakers', 1987),
       ('76ers', 2026)]
print('\nPROFILES (pd vector | anchor | rp1,rp2 | steals | glass | gterm-effDi):')
for t, y in KEY:
    x = next(r for r in ROWS if r['y'] == y and t in r['team'])
    eff = sum(pd*w for pd, w in zip(x['pd'], REF_LOAD))
    gt = max(0, 60+x['dec']['glass']/4)
    print(f"  {x['team']} '{str(y)[2:]:<4} pd {x['pd']}  eff {eff:6.2f}  anc {x['dec']['anchor']:6.2f} (rp {x['rp'][0]},{x['rp'][1]})  st {min(99,x['dec']['steals']):5.2f}  gl {x['dec']['glass']:6.2f} gt {gt:5.2f}  eff-gt {eff-gt:+6.2f}  pd1-rest {x['pd'][0]-sum(x['pd'][1:])/4:+6.2f}")


def variant(**kw):
    K = copy.deepcopy(SHIPPED)
    K.update(kw)
    return K


def line(tag, K):
    bd, hold = board(K)
    r, _ = fit(bd)
    subj = find(bd, '76ers', 1985)
    gsw = find(bd, 'Warriors', 2017)
    chi = find(bd, 'Bulls', 1996)
    okc = find(bd, 'Thunder', 2026)
    det = find(bd, 'Pistons', 2004)
    ok, _ = grade(bd, verbose=False)
    print(f"  {tag:<26} PHI85 {subj['dialf']:6.2f}->{subj['dial']:<3} | GSW17 {gsw['dialf']:6.2f} CHI96 {chi['dialf']:6.2f} OKC26 {okc['dialf']:6.2f} DET04 {det['dialf']:6.2f} | rho {r:+.4f} | anchors {'OK' if ok else 'MISS'}")
    return subj['dial'], ok, r


print('\n=== A) glass weight -> perdef ===')
for t in (0.12, 0.10, 0.08, 0.06, 0.04, 0.02, 0.0):
    line(f'w_gl {t:.2f}', variant(w_gl=t, w_di=0.55 + (0.12 - t)))
print('\n=== B) anchor weight -> perdef ===')
for t in (0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.0):
    line(f'w_anc {t:.2f}', variant(w_anc=t, w_di=0.55 + (0.13 - t) * 0.9))
print('\n=== C) steals weight -> perdef ===')
for t in (0.12, 0.09, 0.06, 0.03, 0.0):
    line(f'w_st {t:.2f}', variant(w_st=t, w_di=0.55 + (0.12 - t) * 0.9))
print('\n=== D) ANCHOR_SOFT ===')
for t in (0.5, 0.4, 0.3, 0.2, 0.1, 0.0):
    line(f'soft {t:.2f}', variant(soft=t))
print('\n=== F) load profile sharpened/flattened (w_i ^ g) ===')
for g in (0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0):
    w = [x ** g for x in REF_LOAD]
    line(f'gamma {g:.1f}', variant(load=w))
print('\n=== G) shift d off slot 1 into slots 2-5 (negative = onto slot 1) ===')
for d in (-0.08, -0.04, 0.0, 0.04, 0.08, 0.12):
    w = [REF_LOAD[0] - d] + [REF_LOAD[i] + d / 4 for i in range(1, 5)]
    line(f'delta1 {d:+.2f}', variant(load=w))
