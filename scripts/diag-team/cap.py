import json, math, os
from collections import defaultdict
HERE=os.path.dirname(os.path.abspath(__file__))
data=json.load(open(os.path.join(HERE,'joined.json'),encoding='utf8'))
byseason=defaultdict(list)
for x in data: byseason[x['y']].append(x)
def rank(v):
    idx=sorted(range(len(v)),key=lambda i:v[i]); r=[0.0]*len(v); i=0
    while i<len(idx):
        j=i
        while j+1<len(idx) and v[idx[j+1]]==v[idx[i]]: j+=1
        a=(i+j)/2.0+1
        for k in range(i,j+1): r[idx[k]]=a
        i=j+1
    return r
def spearman(a,b):
    ra,rb=rank(a),rank(b); n=len(a); ma=sum(ra)/n; mb=sum(rb)/n
    num=sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da=math.sqrt(sum((x-ma)**2 for x in ra)); db=math.sqrt(sum((x-mb)**2 for x in rb))
    return num/(da*db) if da and db else 0.0
PAINT=data[0]['dec']['paintOrient']

for x in data:
    x['def_resid']=x['gauge_def_pct']-x['truth_def_pct']
    x['off_resid']=x['gauge_off_pct']-x['truth_off_pct']
over=[x for x in data if x['dec']['anchor']>99]
print(f'=== the uncapped anchor ===')
print(f'  defenseVs uses `0.26 * anchor * 0.9` with NO min(99,...); teamDefense (standalone) uses min(99, anchor).')
print(f'  fives whose anchor exceeds 99: {len(over)} of {len(data)} ({len(over)/len(data):.1%})')
mx=max(data,key=lambda x:x['dec']['anchor'])
print(f'  max anchor: {mx["dec"]["anchor"]:.2f}  {mx["team"]} {mx["y"]}')
print(f'  mean def residual, anchor>99 group: {sum(x["def_resid"] for x in over)/len(over):+.3f}  vs rest {sum(x["def_resid"] for x in data if x["dec"]["anchor"]<=99)/(len(data)-len(over)):+.3f}')
print(f'  mean gauge DEF, anchor>99 group: {sum(x["def"] for x in over)/len(over):.1f}  vs rest {sum(x["def"] for x in data if x["dec"]["anchor"]<=99)/(len(data)-len(over)):.1f}')
print(f'  their real DRtg rank (mean): {sum(x["truth_def_rank"] for x in over)/len(over):.1f} vs their gauge rank {sum(x["gauge_def_rank"] for x in over)/len(over):.1f}')
print()

for x in data:
    d=x['dec']
    x['_perdef']=d['sumPerdef']/5
    x['_cover']=d['cover']/5
    x['_anchor']=d['anchor']
    x['_steal']=min(99,d['steals'])*0.9
    x['_glass']=max(0,60+d['glass']/4)
    x['_disc']=d['discPts']

def sc(x,wDi=0.42,wA=0.26,wS=0.20,wG=0.12,cm=1.0,dm=1.0,cap=False):
    a=min(99,x['_anchor']) if cap else x['_anchor']
    didx=wDi*(x['_perdef']+cm*x['_cover'])+wA*a*0.9+wS*x['_steal']+wG*x['_glass']
    return 0.181*didx-dm*x['_disc']
def fit(f): return sum(spearman([f(x) for x in g],[-x['truth']['drtg'] for x in g]) for g in byseason.values())/len(byseason)

print(f'{"variant":50s} {"rho":>7s} {"delta":>7s}')
base=fit(lambda x: sc(x))
def row(l,**kw):
    v=fit(lambda x,kw=kw: sc(x,**kw)); print(f'{l:50s} {v:+7.3f} {v-base:+7.3f}')
row('shipped')
row('min(99, anchor) [match teamDefense]', cap=True)
row('cover x0', cm=0.0)
row('disc off', dm=0.0)
row('cap + cover x0', cap=True, cm=0.0)
row('cap + cover x0 + disc off', cap=True, cm=0.0, dm=0.0)
row('cap + cover x0 + disc off + anchor 0.13', cap=True, cm=0.0, dm=0.0, wA=0.13, wDi=0.55)
row('cap + cover x0 + disc off + anchor 0.10', cap=True, cm=0.0, dm=0.0, wA=0.10, wDi=0.58)
row('cap + cover x0 + disc off + anchor 0.05 + glass 0.12', cap=True, cm=0.0, dm=0.0, wA=0.05, wDi=0.63)

print()
print('=== what each variant does to Philadelphia 2026 and to the 2026 top of the board ===')
g26=[x for x in data if x['y']==2026]
def show(l,**kw):
    vals=sorted(((sc(x,**kw),x) for x in g26), key=lambda t:-t[0])
    r=[i+1 for i,(v,x) in enumerate(vals) if x['team']=='Philadelphia 76ers'][0]
    top=', '.join(f'{x["ab"]}' for v,x in vals[:5])
    print(f'  {l:46s} PHI rank {r:2d}/24   top5: {top}')
show('shipped')
show('cap anchor', cap=True)
show('cap + cover x0', cap=True, cm=0.0)
show('cap + cover x0 + disc off', cap=True, cm=0.0, dm=0.0)
show('cap + cover x0 + disc off + anchor 0.10', cap=True, cm=0.0, dm=0.0, wA=0.10, wDi=0.58)
print('  TRUTH 2026 top5 by DRtg:', ', '.join(x['ab'] for x in sorted(g26,key=lambda z:z['truth']['drtg'])[:5]), '  PHI truth rank among these 24 =',
      sorted(g26,key=lambda z:z['truth']['drtg']).index([x for x in g26 if x['team']=='Philadelphia 76ers'][0])+1)

print()
print('=== discipline: why does the discipline penalty hurt the fit? ===')
def pear(a,b):
    n=len(a); ma=sum(a)/n; mb=sum(b)/n
    num=sum((a[i]-ma)*(b[i]-mb) for i in range(n))
    da=math.sqrt(sum((z-ma)**2 for z in a)); db=math.sqrt(sum((z-mb)**2 for z in b))
    return num/(da*db) if da and db else 0.0
md=[sum(p['discipline'] for p in x['five'])/5 for x in data]
print(f'  corr(mean discipline of the five, within-season real DRtg-relative) = {pear(md,[x["rel_drtg"] for x in data]):+.3f}  (positive = more disciplined -> WORSE real defence)')
print(f'  spearman(mean discipline, -rel_drtg) = {spearman(md,[-x["rel_drtg"] for x in data]):+.3f}')
print(f'  discPts mean {sum(x["_disc"] for x in data)/len(data):.3f}  max {max(x["_disc"] for x in data):.3f}  -> up to {max(x["_disc"] for x in data)/ (109.14-107.03) * 49:.0f} gauge points')

print()
print('=== best five picker: OVR-max vs a defence-aware pick ===')
print('  (see altfive.ts for the recomputed sweep)')
