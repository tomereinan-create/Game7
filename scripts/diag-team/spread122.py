"""recal_122 — is the Warriors '17 reading a RANK problem or a SPREAD problem?"""
import io, json, math, os, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'variants122.py'), encoding='utf8').read().split("print('\\n================ BASELINE")[0])

BY = defaultdict(list)
for x in D:
    BY[x['y']].append(x)


def sd(v):
    m = sum(v) / len(v)
    return math.sqrt(sum((z - m) ** 2 for z in v) / max(1, len(v) - 1))


print(f'{"y":>5} {"n":>3} {"model sd":>9} {"real sd":>8} {"dial min":>8} {"dial max":>8} {"best":>5}')
for y in sorted(BY):
    g = BY[y]
    ms = sd([x['drtgRef'] for x in g]); rs = sd([x['truth']['drtg'] for x in g])
    dl = [x['def'] for x in g]
    best = min(g, key=lambda z: z['drtgRef'])
    print(f'{y:5d} {len(g):3d} {ms:9.3f} {rs:8.3f} {min(dl):8d} {max(dl):8d} {best["ab"]:>5}')

print('\n--- 2017, the subject season, whole board ---')
g = sorted(BY[2017], key=lambda z: z['drtgRef'])
tr = sorted(BY[2017], key=lambda z: z['truth']['drtg'])
trk = {id(x): i + 1 for i, x in enumerate(tr)}
for i, x in enumerate(g):
    pd = sorted((p['perdef'] for p in x['five']), reverse=True)
    print(f'{i+1:3d} {x["ab"]:>4} {x["def"]:3d}  drtgRef {x["drtgRef"]:8.3f}  realDRtg {x["truth"]["drtg"]:6.1f} (rk {trk[id(x)]:2d})  perdef {pd}')

print('\n--- WHERE the within-season spread collapses: sd across teams, by season ---')
print(f'{"y":>5} {"n":>3} {"sd pdmean":>9} {"sd anchor":>9} {"sd steals":>9} {"sd glass":>9} {"sd didx":>8} {"sd real":>8}')
for y in sorted(BY):
    g = BY[y]
    print(f'{y:5d} {len(g):3d} {sd([x["pdmean"] for x in g]):9.3f} {sd([min(99,x["dec"]["anchor"]) for x in g]):9.3f} '
          f'{sd([x["dec"]["steals"] for x in g]):9.3f} {sd([x["dec"]["glass"] for x in g]):9.3f} '
          f'{sd([x["dec"]["didx"] for x in g]):8.3f} {sd([x["truth"]["drtg"] for x in g]):8.3f}')

print('\n--- the CARD POOL behind it: perdef of the 5x n starters, per season ---')
print(f'{"y":>5} {"mean":>7} {"sd":>6} {"p10":>5} {"p90":>5} | {"decade means"}')
for y in sorted(BY):
    v = sorted(p['perdef'] for x in BY[y] for p in x['five'])
    n = len(v)
    print(f'{y:5d} {sum(v)/n:7.2f} {sd(v):6.2f} {v[int(0.1*n)]:5d} {v[int(0.9*n)]:5d}')
