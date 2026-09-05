# recal_133 — (f) clean [1, a, b, b, b] glass shapes graded against the channel's OWN truth
# (bref drb_percent), then the board with the winner, alone and with one second knob.
import sys, os, math, copy, csv
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, ROOT, SHIPPED, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
TR = {}
with open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            y = int(r['season']); v = float(r['drb_percent'])
        except Exception:
            continue
        TR[(y, r['team'])] = v; TR[(y, r['abbreviation'])] = v
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['stack'] = sum(d * w for d, w in zip(x['drb'], DRB_W))
    x['opp_orb'] = x['stack'] - x['dec']['glass']
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)
    x['real_drb'] = TR.get((x['y'], x['team']), TR.get((x['y'], x['ab'])))
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n
BY = defaultdict(list)
for x in ROWS:
    BY[x['y']].append(x)


def rank(v):
    m = len(v); idx = sorted(range(m), key=lambda i: v[i]); r = [0.0]*m; i = 0
    while i < m:
        j = i
        while j+1 < m and v[idx[j+1]] == v[idx[i]]:
            j += 1
        a = (i+j)/2.0+1
        for k in range(i, j+1):
            r[idx[k]] = a
        i = j+1
    return r


def spear(a, b):
    m = len(a)
    ra, rb = rank(a), rank(b)
    ma, mb = sum(ra)/m, sum(rb)/m
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(m))
    da = math.sqrt(sum((ra[i]-ma)**2 for i in range(m)))
    db = math.sqrt(sum((rb[i]-mb)**2 for i in range(m)))
    return num/(da*db) if da and db else float('nan')


def drbfit(w):
    rs = [spear([sum(d*ww for d, ww in zip(x['drb'], w)) for x in g], [x['real_drb'] for x in g])
          for y, g in sorted(BY.items()) if len(g) >= 3]
    return sum(rs)/len(rs)


print('=== clean [1, a, b, b, b] shapes vs the channel\'s own truth (real DRB%) ===')
best = None
for a in (0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1.0):
    for b in (0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5):
        r = drbfit([1.0, a, b, b, b])
        if best is None or r > best[0]:
            best = (r, a, b)
print(f"  best clean shape: [1, {best[1]}, {best[2]}, {best[2]}, {best[2]}]  rho {best[0]:+.4f}"
      f"   (shipped [1, .5, .1, .1, .1] {drbfit(DRB_W):+.4f})")
for a, b in ((0.5, 0.1), (0.6, 0.25), (0.65, 0.25), (0.7, 0.25), (0.65, 0.3), (0.7, 0.3), (0.75, 0.35), (1.0, 0.5)):
    print(f"   [1, {a}, {b}, {b}, {b}]  rho {drbfit([1.0, a, b, b, b]):+.4f}   sum {1+a+3*b:.2f}")

SHAPE = [1.0, best[1], best[2], best[2], best[2]]
SCALED = [w * 1.8 / sum(SHAPE) for w in SHAPE]
print(f"  winner rescaled to the stack\'s own 1.8 total: {[round(z,4) for z in SCALED]}")


def board7(K):
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
    K.update(dict(drbw=DRB_W[:], a2=0.35))
    K.update(kw)
    return K


def line(tag, K):
    bd, hold = board7(K)
    r, _ = fit(bd)
    g = {k: find(bd, *v) for k, v in dict(PHI85=('76ers', 1985), GSW17=('Warriors', 2017),
                                          CHI96=('Bulls', 1996), OKC26=('Thunder', 2026),
                                          DET04=('Pistons', 2004), BOS24=('Celtics', 2024),
                                          PHI26=('76ers', 2026), LAL87=('Lakers', 1987),
                                          DET26=('Pistons', 2026)).items()}
    ok, lines = grade(bd, verbose=False)
    bad = [l.strip()[5:].split('(')[0].strip() for l in lines if l.strip().startswith('MISS')]
    print(f"  {tag:<34} PHI85 {g['PHI85']['dialf']:6.2f}->{g['PHI85']['dial']:<3} GSW17 {g['GSW17']['dialf']:6.2f} CHI96 {g['CHI96']['dialf']:6.2f} OKC26 {g['OKC26']['dialf']:6.2f} DET04 {g['DET04']['dialf']:6.2f} BOS24 {g['BOS24']['dialf']:6.2f} PHI26 {g['PHI26']['dialf']:6.2f} DET26 {g['DET26']['dialf']:6.2f} | hold {hold:+.4f} rho {r:+.4f} | {'OK' if ok else 'MISS ' + ' / '.join(bad)}")
    return bd, r, ok


print('\n=== the board with the DRB%-optimal glass shape ===')
line('shipped', variant())
line('drb-optimal shape', variant(drbw=SCALED))
print('\n  + a second knob:')
for t in (0.35, 0.30, 0.25, 0.20, 0.15):
    line(f'   ANCHOR_2ND {t:.2f}', variant(drbw=SCALED, a2=t))
for t in (0.50, 0.45, 0.40, 0.35, 0.30, 0.25):
    line(f'   ANCHOR_SOFT {t:.2f}', variant(drbw=SCALED, soft=t))
for t in (0.12, 0.13, 0.14, 0.15):
    line(f'   w_gl {t:.3f}', variant(drbw=SCALED, w_gl=t, w_di=0.55 + (0.12 - t)))
