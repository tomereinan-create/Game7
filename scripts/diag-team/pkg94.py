"""recal_94 — the package, measured on the sweep before it is applied.
Higher score = better defence. Mirrors defenseVs' didx/drtg exactly (hide=1, huntPen=0)."""
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
for x in data:
    d=x['dec']
    x['_perdef']=d['sumPerdef']/5; x['_cover']=d['cover']/5; x['_anchor']=d['anchor']
    x['_steal']=min(99,d['steals'])*0.9; x['_glass']=max(0,60+d['glass']/4); x['_disc']=d['discPts']
def sc(x,wDi=0.42,wA=0.26,wS=0.20,wG=0.12,cm=1.0,dm=1.0,cap=False):
    a=min(99,x['_anchor']) if cap else x['_anchor']
    didx=wDi*(x['_perdef']+cm*x['_cover'])+wA*a*0.9+wS*x['_steal']+wG*x['_glass']
    return 0.181*didx-dm*x['_disc']
def era(y):
    return '80s' if y<1990 else '90s' if y<2000 else '00s' if y<2010 else '10s' if y<2020 else '20s'
def fit(f, rows=None):
    bs=defaultdict(list)
    for x in (rows or data): bs[x['y']].append(x)
    return sum(spearman([f(x) for x in g],[-x['truth']['drtg'] for x in g]) for g in bs.values())/len(bs)
VAR=dict(
  shipped=dict(),
  pkgA=dict(cap=True,cm=0.0,dm=0.0),
  pkgB=dict(cap=True,cm=0.0,dm=0.0,wA=0.13,wDi=0.55),
  pkgC=dict(cap=True,cm=0.0,dm=0.0,wA=0.13,wDi=0.55,wS=0.12),
  pkgC16=dict(cap=True,cm=0.0,dm=0.0,wA=0.13,wDi=0.55,wS=0.16),
  pkgC08=dict(cap=True,cm=0.0,dm=0.0,wA=0.13,wDi=0.55,wS=0.08),
  pkgC00=dict(cap=True,cm=0.0,dm=0.0,wA=0.13,wDi=0.55,wS=0.00),
)
print(f'{"variant":14s} {"ALL":>7s} ' + ' '.join(f'{e:>7s}' for e in ['80s','90s','00s','10s','20s']))
for k,kw in VAR.items():
    f=lambda x,kw=kw: sc(x,**kw)
    line=f'{k:14s} {fit(f):+7.3f} '
    for e in ['80s','90s','00s','10s','20s']:
        line+=f'{fit(f,[x for x in data if era(x["y"])==e]):+7.3f} '
    print(line)
print()
print('2026 board under each variant (fieldable 24):')
g26=[x for x in data if x['y']==2026]
truth_rank={x['ab']:sorted(g26,key=lambda z:z['truth']['drtg']).index(x)+1 for x in g26}
for k,kw in VAR.items():
    vals=sorted(((sc(x,**kw),x) for x in g26),key=lambda t:-t[0])
    phi=[i+1 for i,(v,x) in enumerate(vals) if x['ab']=='PHI'][0]
    print(f'  {k:10s} PHI {phi:2d}/24  top8: ' + ', '.join(f'{x["ab"]}({truth_rank[x["ab"]]})' for v,x in vals[:8]))
print('  TRUTH      PHI 14/24  top8: ' + ', '.join(f'{x["ab"]}({truth_rank[x["ab"]]})' for x in sorted(g26,key=lambda z:z['truth']['drtg'])[:8]))
