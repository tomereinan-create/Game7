# recal_133 — fine sweep of ANCHOR_2ND, with and without the glass reshape, both hold conventions.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab133 import ROWS, fit, find, grade, REF_LOAD, def_dial, def_dial_f, DRTG_COEF

DRB_W = [1.0, 0.5, 0.1, 0.1, 0.1]
NEW_W = [1.0, 0.5, 0.35, 0.35, 0.35]
for x in ROWS:
    x['drb'] = sorted((p['drb'] for p in x['five']), reverse=True)
    x['stack'] = sum(d * w for d, w in zip(x['drb'], DRB_W))
    x['opp_orb'] = x['stack'] - x['dec']['glass']
    x['rp'] = sorted((p['rimprot'] for p in x['five']), reverse=True)
n = len(ROWS)
BASE_MEAN = sum(x['drtgRef'] for x in ROWS) / n


def sd(v):
    m = sum(v)/len(v)
    return math.sqrt(sum((z-m)**2 for z in v)/(len(v)-1))


SD_OLD = sd([x['stack'] for x in ROWS])
SD_NEW = sd([sum(d*w for d, w in zip(x['drb'], NEW_W)) for x in ROWS])
HOLD_SPREAD = SD_OLD / SD_NEW
HOLD_SUM = 1.8 / sum(NEW_W)


def board(a2, gw, gh):
    raw = []
    for x in ROWS:
        eff = sum(pd*w for pd, w in zip(x['pd'], REF_LOAD))
        a = x['rp'][0] + a2 * x['rp'][1] * (x['rp'][1]/99)
        anc = a if a <= 99.0 else 99.0 + (a-99.0)*0.5
        st = min(99.0, x['dec']['steals'])
        gl = sum(d*w for d, w in zip(x['drb'], gw))*gh - x['opp_orb']
        raw.append(0.55*eff + 0.13*anc*0.9 + 0.12*st*0.9 + 0.12*max(0.0, 60+gl/4))
    drt0 = [110 - DRTG_COEF*(d-55) for d in raw]
    shift = BASE_MEAN - sum(drt0)/len(drt0)
    return [dict(row=x, drtg=dr+shift, dial=def_dial(dr+shift, x['y']), dialf=def_dial_f(dr+shift, x['y']))
            for x, dr in zip(ROWS, drt0)], shift/DRTG_COEF


def line(tag, a2, gw, gh):
    bd, hold = board(a2, gw, gh)
    r, _ = fit(bd)
    s = find(bd, '76ers', 1985)
    g = find(bd, 'Warriors', 2017)
    c = find(bd, 'Bulls', 1996)
    o = find(bd, 'Thunder', 2026)
    d4 = find(bd, 'Pistons', 2004)
    ok, lines = grade(bd, verbose=False)
    bad = [l.strip()[5:].split('(')[0].strip() for l in lines if l.strip().startswith('MISS')]
    print(f"  {tag:<34} PHI85 {s['dialf']:6.2f}->{s['dial']:<3} GSW17 {g['dialf']:6.2f} CHI96 {c['dialf']:6.2f} "
          f"OKC {o['dialf']:6.2f} DET04 {d4['dialf']:6.2f} | hold {hold:+.4f} rho {r:+.4f} | {'OK' if ok else 'MISS '+' / '.join(bad)}")


print(f"HOLD_SPREAD {HOLD_SPREAD:.6f}   HOLD_SUM {HOLD_SUM:.6f}")
print('\n=== ANCHOR_2ND alone (shipped glass) ===')
for a2 in (0.35, 0.30, 0.25, 0.22, 0.20, 0.18, 0.15, 0.12, 0.10):
    line(f'a2 {a2:.2f}', a2, DRB_W, 1.0)
print('\n=== ANCHOR_2ND with the glass reshaped, SPREAD held ===')
for a2 in (0.35, 0.30, 0.25, 0.22, 0.20, 0.18, 0.15, 0.12, 0.10, 0.05):
    line(f'a2 {a2:.2f} + glass(spread)', a2, NEW_W, HOLD_SPREAD)
print('\n=== ANCHOR_2ND with the glass reshaped, TOTAL WEIGHT held (1.8) ===')
for a2 in (0.35, 0.30, 0.25, 0.22, 0.20, 0.18, 0.15, 0.12, 0.10, 0.05):
    line(f'a2 {a2:.2f} + glass(sum)', a2, NEW_W, HOLD_SUM)
