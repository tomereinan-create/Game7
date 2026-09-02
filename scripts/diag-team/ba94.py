"""recal_94 — THE BEFORE/AFTER, one script.

    npx vite-node scripts/diag-team/sweep.ts       # writes sweep.json from the CURRENT engine
    python scripts/diag-team/fit.py                # joins it to data/bref/Team Summaries.csv -> joined.json
    cp scripts/diag-team/joined.json scripts/diag-team/joined_<before|after>.json
    python scripts/diag-team/ba94.py               # this file: the two, side by side

Fit is the Spearman of the SHIPPED DIAL (gauges.ts seasonGauges -> TeamDb's gaugeOf) against the
real o_rtg / d_rtg of `data/bref/Team Summaries.csv`, computed WITHIN each season and averaged over
the 47 seasons that carry any of the 1,255 fieldable team-seasons of src/data/teamseasons.json.
Ranking inside a season is the only fair test: raw ORtg/DRtg drift ~15 points across eras.
"""
import json, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def load(tag):
    p = os.path.join(HERE, 'joined_%s.json' % tag)
    if not os.path.exists(p):
        sys.exit('missing %s — see this file\'s header for how to make it' % p)
    return json.load(open(p, encoding='utf8'))


def rank(v):
    idx = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0]*len(v); i = 0
    while i < len(idx):
        j = i
        while j+1 < len(idx) and v[idx[j+1]] == v[idx[i]]: j += 1
        a = (i+j)/2.0 + 1
        for k in range(i, j+1): r[idx[k]] = a
        i = j+1
    return r


def spearman(a, b):
    ra, rb = rank(a), rank(b); n = len(a); ma = sum(ra)/n; mb = sum(rb)/n
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da = math.sqrt(sum((x-ma)**2 for x in ra)); db = math.sqrt(sum((x-mb)**2 for x in rb))
    return num/(da*db) if da and db else 0.0


def era(y):
    return '80s' if y < 1990 else '90s' if y < 2000 else '00s' if y < 2010 else '10s' if y < 2020 else '20s'


def perseason(rows, key, sign):
    """Mean over seasons of the within-season Spearman(dial, truth). sign=-1 for DRtg (lower better)."""
    by = defaultdict(list)
    for x in rows: by[x['y']].append(x)
    vals = [spearman([x[key] for x in g], [sign*x['truth']['drtg' if key == 'def' else 'ortg'] for x in g])
            for g in by.values() if len(g) >= 3]
    return sum(vals)/len(vals)


A, B = load('before'), load('after')
ERAS = ['80s', '90s', '00s', '10s', '20s']

print('=== FIT: within-season Spearman of the shipped DIAL vs bref, mean over 47 seasons ===')
print('%-6s %-9s %8s %8s %8s' % ('side', 'era', 'before', 'after', 'delta'))
for key, sign, label in (('def', -1, 'DEF'), ('off', +1, 'OFF')):
    for lab, fa, fb in [('ALL', A, B)] + [(e, [x for x in A if era(x['y']) == e], [x for x in B if era(x['y']) == e]) for e in ERAS]:
        b4, af = perseason(fa, key, sign), perseason(fb, key, sign)
        print('%-6s %-9s %+8.3f %+8.3f %+8.3f' % (label, lab, b4, af, af-b4))

print()
print('=== OFF IS UNTOUCHED: every one of the 1,255 offRaw readings is bit-identical ===')
ia = {(x['y'], x['team']): x for x in A}
moved = [k for k, x in ia.items() if abs(x['offRaw'] - {(z['y'], z['team']): z for z in B}[k]['offRaw']) > 0]
print('  offRaw readings that moved: %d of %d' % (len(moved), len(A)))
dialmoved = [k for k, x in ia.items() if x['off'] != {(z['y'], z['team']): z for z in B}[k]['off']]
print('  OFF dial readings that moved: %d of %d  (gauges.ts OFF_MIN/MID/TOP were NOT re-frozen)' % (len(dialmoved), len(A)))

print()
print('=== PHILADELPHIA 76ers 2026 ===')
for tag, rows in (('before', A), ('after', B)):
    x = [z for z in rows if z['y'] == 2026 and z['team'] == 'Philadelphia 76ers'][0]
    print('  %-6s DEF dial %2d  season rank %2d/%d   drtgRef %8.3f   (real DRtg %.1f, real rank %d/%d)'
          % (tag, x['def'], x['gauge_def_rank'], x['n_season'], x['drtgRef'], x['truth']['drtg'], x['truth_def_rank'], x['n_season']))

print()
print('=== 2026 DEF top 8 after, with the real DRtg rank beside each ===')
g = sorted([x for x in B if x['y'] == 2026], key=lambda z: (-z['def'], z['drtgRef']))
for i, x in enumerate(g[:8]):
    print('  %d. %-26s dial %2d   real DRtg rank %2d/%d (%.1f)' % (i+1, x['team'], x['def'], x['truth_def_rank'], x['n_season'], x['truth']['drtg']))

print()
print('=== all-time DEF top 10 after (lowest drtgRef) ===')
for i, x in enumerate(sorted(B, key=lambda z: z['drtgRef'])[:10]):
    print("  %2d. %-26s '%02d  drtgRef %8.3f  dial %2d" % (i+1, x['team'], x['y'] % 100, x['drtgRef'], x['def']))
print('  fives reading 99 (clamped past the Pistons ’04 summit): %d of %d'
      % (len([x for x in B if x['def'] == 99]), len(B)))
