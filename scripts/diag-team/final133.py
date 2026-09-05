# recal_133 — the candidate, exactly as it will be written into the two engines.
#   (1) the defensive-glass stack:  d0 + 0.5*d1 + 0.1*(d2+d3+d4)  ->  d0 + 0.5*d1 + 0.35*(d2+d3+d4),
#       times GLASS_HOLD so the stack's own spread over the 1,255 fives is unchanged;
#   (2) ANCHOR_2ND (the second rim protector's share) 0.35 -> 0.20;
#   (3) DIDX_HOLD re-derived so the pool's mean drtgRef stays exactly where recal_101 froze the gauge.
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


def sd(v):
    m = sum(v) / len(v)
    return math.sqrt(sum((z - m) ** 2 for z in v) / (len(v) - 1))


NEW_W = [1.0, 0.5, 0.35, 0.35, 0.35]
old = [x['stack'] for x in ROWS]
new = [sum(d * w for d, w in zip(x['drb'], NEW_W)) for x in ROWS]
GLASS_HOLD = sd(old) / sd(new)
print(f"glass stack sd  shipped {sd(old):.4f}   [1,.5,.35,.35,.35] {sd(new):.4f}")
print(f"GLASS_HOLD (spread-holding scale) = {sd(old):.6f} / {sd(new):.6f} = {GLASS_HOLD:.6f}")
print(f"  means: shipped {sum(old)/n:.3f}  new x hold {sum(new)/n*GLASS_HOLD:.3f}")
GH = round(GLASS_HOLD, 4)
print(f"  rounded to 4dp for the source: {GH}")

A2 = 0.20


def board(a2=A2, gh=GH, gw=NEW_W, hold=None):
    raw = []
    for x in ROWS:
        eff = sum(pd * w for pd, w in zip(x['pd'], REF_LOAD))
        a = x['rp'][0] + a2 * x['rp'][1] * (x['rp'][1] / 99)
        anc = a if a <= 99.0 else 99.0 + (a - 99.0) * 0.5
        st = min(99.0, x['dec']['steals'])
        gl = sum(d * w for d, w in zip(x['drb'], gw)) * gh - x['opp_orb']
        raw.append(0.55 * eff + 0.13 * anc * 0.9 + 0.12 * st * 0.9 + 0.12 * max(0.0, 60 + gl / 4))
    if hold is None:
        drt0 = [110 - DRTG_COEF * (d - 55) for d in raw]
        hold = (BASE_MEAN - sum(drt0) / len(drt0)) / DRTG_COEF
    out = []
    for x, d in zip(ROWS, raw):
        drtg = 110 - DRTG_COEF * (d - hold - 55)
        out.append(dict(row=x, didx=d - hold, drtg=drtg, dial=def_dial(drtg, x['y']),
                        dialf=def_dial_f(drtg, x['y']), glass=sum(dd * w for dd, w in zip(x['drb'], gw)) * gh - x['opp_orb']))
    return out, hold


bd, hold = board()
print(f"\nDIDX_HOLD -> {hold:.6f}   (rounded {round(hold,4)})")
bd, hold = board(hold=round(hold, 4))
r, k = fit(bd)
print(f"mean drtgRef {sum(e['drtg'] for e in bd)/n:.6f}  (shipped {BASE_MEAN:.6f})")
print(f"within-season DEF rho {r:+.4f} over {k} seasons   (shipped +0.7764)")
print(f"glass min {min(e['glass'] for e in bd):.2f}  max {max(e['glass'] for e in bd):.2f}"
      f"   -> gterm min {60+min(e['glass'] for e in bd)/4:.2f}  (the max(0,...) clamp is not touched)")

print('\n--- the ten teams ---')
for t, y in (('76ers', 1985), ('76ers', 1984), ('Celtics', 2010), ('Bucks', 1985), ('Bulls', 1996),
             ('Bulls', 1998), ('Spurs', 2005), ('Pistons', 2004), ('Warriors', 2017),
             ('Thunder', 2026), ('Jazz', 1998), ('76ers', 1980)):
    e = find(bd, t, y)
    print(f"  {e['row']['team']} '{str(y)[2:]:<4} DEF {e['dial']:>2} (f {e['dialf']:6.2f})  drtgRef {e['drtg']:.4f}")

print('\n--- anchors ---')
ok, _ = grade(bd)
print('\nALL PINS:', 'OK' if ok else 'MISS')

print('\n--- each half alone ---')
for tag, kw in (('glass shape only', dict(a2=0.35)), ('ANCHOR_2ND only', dict(gw=DRB_W, gh=1.0))):
    b2, h2 = board(**kw)
    r2, _ = fit(b2)
    s = find(b2, '76ers', 1985)
    print(f"  {tag:<20} PHI85 {s['dialf']:6.2f}->{s['dial']:<3} GSW17 {find(b2,'Warriors',2017)['dialf']:6.2f} "
          f"CHI96 {find(b2,'Bulls',1996)['dialf']:6.2f} rho {r2:+.4f} {'OK' if grade(b2, verbose=False)[0] else 'MISS'}")

print('\n--- all-time DEF top 15, after ---')
allt = sorted(bd, key=lambda z: (-z['dial'], z['drtg']))
for i, e in enumerate(allt[:15]):
    print(f"  {i+1:>2}. {e['row']['team']} '{str(e['row']['y'])[2:]:<4} DEF {e['dial']:>2}  drtgRef {e['drtg']:.3f}")
print('  76ers 85 all-time rank:', next(i+1 for i, e in enumerate(allt) if e['row']['y'] == 1985 and '76ers' in e['row']['team']))

print('\n--- movers: how many dials moved, and the biggest ---')
mv = [(e['dial'] - e['row']['def'], e['row']) for e in bd]
print('  moved:', sum(1 for d, _ in mv if d != 0), 'of', n, '  max |move|', max(abs(d) for d, _ in mv))
for d, rr in sorted(mv, key=lambda z: z[0])[:8]:
    print(f"    {rr['team']} '{str(rr['y'])[2:]:<4} {rr['def']:>2} -> {rr['def']+d:>2}  ({d:+d})")
for d, rr in sorted(mv, key=lambda z: -z[0])[:8]:
    print(f"    {rr['team']} '{str(rr['y'])[2:]:<4} {rr['def']:>2} -> {rr['def']+d:>2}  ({d:+d})")
