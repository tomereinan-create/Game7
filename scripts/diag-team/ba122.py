"""recal_122 — BEFORE / AFTER, read out of the shipped sweep.

The AFTER is what the engine now writes (sweep.json / joined.json). The BEFORE is reconstructed
exactly from the same rows: recal_121's didx was
    0.55*mean(perdef) + 0.13*min(99, anchor)*0.9 + 0.12*min(99, steals)*0.9 + 0.12*max(0, 60+glass/4)
and every input to it is in the sweep. Nothing here is remembered.
"""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'variants122.py'), encoding='utf8').read().split("print('\\n================ BASELINE")[0])

for x in D:
    old_didx = (0.55 * x['pdmean'] + 0.13 * min(99, x['dec']['anchor']) * 0.9
                + 0.12 * min(99, x['dec']['steals']) * 0.9 + 0.12 * max(0, 60 + x['dec']['glass'] / 4))
    x['old_drtg'] = 110 - DRTG_COEF * (old_didx - 55) + x['dec']['huntPen']
    x['old_def'] = dial(x['old_drtg'], x['y'])
    x['new_def'] = x['def']

BY = defaultdict(list)
for x in D:
    BY[x['y']].append(x)


def rk(y, x, key):
    g = sorted(BY[y], key=key)
    return 1 + [id(z) for z in g].index(id(x))


def fit2(key):
    per = []
    for y, g in BY.items():
        per.append(spearman([-key(z) for z in g], [-z['truth']['drtg'] for z in g]))
    dec = {}
    for e, lo, hi in (('80s', 1980, 1989), ('90s', 1990, 1999), ('00s', 2000, 2009), ('10s', 2010, 2019), ('20s', 2020, 2026)):
        p = [spearman([-key(z) for z in BY[y]], [-z['truth']['drtg'] for z in BY[y]]) for y in BY if lo <= y <= hi]
        dec[e] = sum(p) / len(p)
    return sum(per) / len(per), dec


b, bd = fit2(lambda z: z['old_drtg'])
a, ad = fit2(lambda z: z['drtgRef'])
print(f'FIT (within-season Spearman of the DEF dial vs real DRtg, mean of 47 seasons)')
print(f'  ALL   before {b:+.4f}   after {a:+.4f}   ({a-b:+.4f})')
for e in bd:
    print(f'  {e}   before {bd[e]:+.4f}   after {ad[e]:+.4f}   ({ad[e]-bd[e]:+.4f})')

TEN = [(2017, 'GSW'), (2016, 'GSW'), (2015, 'GSW'), (1996, 'CHI'), (2004, 'DET'), (2010, 'BOS'),
       (1998, 'UTA'), (2014, 'SAS'), (2026, 'OKC'), (2016, 'CLE')]
IX = {(x['y'], x['ab']): x for x in D}
print('\nTEN TEAMS  (OFF is bit-identical: this round touches defence only)')
print(f'{"team":16s} {"OFF":>4s} {"DEF b>a":>10s} {"OVR b>a":>10s} {"dial rank b>a":>14s} {"real":>5s}')
for y, ab in TEN:
    x = IX[(y, ab)]
    ob, oa = round((x['off'] + x['old_def']) / 2), round((x['off'] + x['new_def']) / 2)
    print(f'{ab+" ’"+str(y)[2:]:16s} {x["off"]:4d} {x["old_def"]:4d}>{x["new_def"]:<4d} {ob:4d}>{oa:<4d} '
          f'{rk(y,x,lambda z: z["old_drtg"]):5d}>{rk(y,x,lambda z: z["drtgRef"]):<4d} of {len(BY[y]):2d} '
          f'{rk(y,x,lambda z: z["truth"]["drtg"]):5d}')

print('\nFIVES AT 99')
for lab, key in (('before', 'old_def'), ('after', 'new_def')):
    n = [x for x in D if x[key] >= 99]
    print(f'  {lab}: {len(n)} — ' + ', '.join(f'{x["ab"]} ’{str(x["y"])[2:]}' for x in sorted(n, key=lambda z: z['drtgRef'])))

mv = [x['new_def'] - x['old_def'] for x in D]
print(f'\nMOVERS: {sum(1 for m in mv if m)} of {len(D)} dials moved, mean {sum(mv)/len(mv):+.2f}, '
      f'max {max(mv):+d} ({max(D, key=lambda z: z["new_def"]-z["old_def"])["ab"]}), '
      f'min {min(mv):+d} ({min(D, key=lambda z: z["new_def"]-z["old_def"])["ab"]})')
print('  biggest rises: ' + ', '.join(f'{x["ab"]}’{str(x["y"])[2:]} {x["old_def"]}>{x["new_def"]}'
      for x in sorted(D, key=lambda z: z['old_def'] - z['new_def'])[:6]))
print('  biggest falls: ' + ', '.join(f'{x["ab"]}’{str(x["y"])[2:]} {x["old_def"]}>{x["new_def"]}'
      for x in sorted(D, key=lambda z: z['new_def'] - z['old_def'])[:6]))
print(f'  pool mean drtgRef before {sum(x["old_drtg"] for x in D)/len(D):.4f}  after {sum(x["drtgRef"] for x in D)/len(D):.4f}')
