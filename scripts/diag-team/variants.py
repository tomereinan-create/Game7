import json, math, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, 'joined.json'), encoding='utf8'))

def rank(vals):
    idx=sorted(range(len(vals)),key=lambda i:vals[i]); r=[0.0]*len(vals); i=0
    while i<len(idx):
        j=i
        while j+1<len(idx) and vals[idx[j+1]]==vals[idx[i]]: j+=1
        a=(i+j)/2.0+1
        for k in range(i,j+1): r[idx[k]]=a
        i=j+1
    return r
def spearman(a,b):
    ra,rb=rank(a),rank(b); n=len(a); ma=sum(ra)/n; mb=sum(rb)/n
    num=sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da=math.sqrt(sum((x-ma)**2 for x in ra)); db=math.sqrt(sum((x-mb)**2 for x in rb))
    return num/(da*db) if da and db else float('nan')

byseason=defaultdict(list)
for x in data: byseason[x['y']].append(x)

def fit(score):
    """score(x) -> higher is better defense. Return pooled + mean-per-season Spearman vs truth."""
    pooled = spearman([score(x) for x in data], [-x['rel_drtg'] for x in data])
    per=[]
    for y,g in byseason.items():
        per.append(spearman([score(x) for x in g], [-x['truth']['drtg'] for x in g]))
    return pooled, sum(per)/len(per)

PAINT = None
for x in data[:1]: PAINT = x['dec']['paintOrient']
print('REF_FIVE paintOrient =', round(PAINT,4), ' -> cover gate min(1, paintOrient*2) =', round(min(1,PAINT*2),4))
print('CONSTANT for every team: hide=1, huntPen=0, guardedPaint=paintOrient\n')

def cover_of(x, cap=37.5, gate=None):
    a=x['dec']['anchor']; d=x['dec']['deficit']
    g = min(1, min(PAINT,PAINT)*2) if gate is None else gate
    return min(d, cap*(a/99))*g

def didx_of(x, wDi=0.42, wA=0.26, wS=0.20, wG=0.12, coverMul=1.0, anchorCap=37.5):
    effDi=(x['dec']['sumPerdef']+coverMul*cover_of(x,anchorCap))/5
    return wDi*effDi + wA*x['dec']['anchor']*0.9 + wS*min(99,x['dec']['steals'])*0.9 + wG*max(0,60+x['dec']['glass']/4)
def drtg_of(x, **kw):
    disc = kw.pop('disc',1.0)
    return 110-0.181*(didx_of(x,**kw)-55)+disc*x['dec']['discPts']

print(f'{"variant":52s} {"pooled":>7s} {"perSeason":>10s}')
def row(label, score):
    p,s=fit(score); print(f'{label:52s} {p:+7.3f} {s:+10.3f}')

row('CURRENT gauge DEF (as shipped)', lambda x: x['def'])
row('CURRENT -drtgRef (unrounded, same ordering)', lambda x: -x['drtgRef'])
print()
row('effDi alone (0.42*effDi)', lambda x: x['dec']['effDi'])
row('sum perdef alone (no cover)', lambda x: x['dec']['sumPerdef'])
row('anchor alone', lambda x: x['dec']['anchor'])
row('steals alone', lambda x: x['dec']['steals'])
row('glass alone', lambda x: x['dec']['glass'])
row('mean d_ovr of the five (card layer, no team math)', lambda x: sum(p['d_ovr'] for p in x['five'])/5)
row('mean perdef + 0.25*max rimprot', lambda x: x['dec']['sumPerdef']/5+0.25*max(p['rimprot'] for p in x['five']))
print()
print('--- didx weight variants (the four weights renormalised to 1.00) ---')
for wA in [0.26,0.20,0.13,0.06,0.0]:
    wDi=0.42+(0.26-wA)
    row(f'anchor weight {wA:.2f} (perdef weight {wDi:.2f})', lambda x,wA=wA,wDi=wDi: -drtg_of(x,wDi=wDi,wA=wA))
print()
print('--- cover (the deficit refund) ---')
for cm in [1.0,0.5,0.0]:
    row(f'cover x{cm}', lambda x,cm=cm: -drtg_of(x,coverMul=cm))
print()
print('--- both: anchor 0.13 + cover x0 ---')
row('anchor 0.13, perdef 0.55, cover x0', lambda x: -drtg_of(x,wDi=0.55,wA=0.13,coverMul=0.0))
row('anchor 0.13, perdef 0.55, cover x0.5', lambda x: -drtg_of(x,wDi=0.55,wA=0.13,coverMul=0.5))
row('anchor 0.10, perdef 0.58, cover x0, steals 0.24', lambda x: -drtg_of(x,wDi=0.58,wA=0.10,wS=0.24,coverMul=0.0))
row('anchor 0.16, perdef 0.52, cover x0.5', lambda x: -drtg_of(x,wDi=0.52,wA=0.16,coverMul=0.5))
print()
print('--- steals / glass / discipline off ---')
row('steals weight 0 (to perdef)', lambda x: -drtg_of(x,wDi=0.62,wS=0.0))
row('glass weight 0 (to perdef)', lambda x: -drtg_of(x,wDi=0.54,wG=0.0))
row('discipline points off', lambda x: -drtg_of(x,disc=0.0))

# --- OFFENSE side, same treatment ---
print()
print('=== OFFENSE variants ===')
def fitO(score):
    pooled=spearman([score(x) for x in data],[x['rel_ortg'] for x in data])
    per=[spearman([score(x) for x in g],[x['truth']['ortg'] for x in g]) for g in byseason.values()]
    return pooled,sum(per)/len(per)
def rowO(label,score):
    p,s=fitO(score); print(f'{label:52s} {p:+7.3f} {s:+10.3f}')
rowO('CURRENT gauge OFF', lambda x: x['off'])
rowO('offRaw unrounded', lambda x: x['offRaw'])
rowO('base only (no ft, no orb)', lambda x: x['offdec']['base'])
rowO('base+ft, no orb multiplier', lambda x: x['offdec']['base']+x['offdec']['ftPts'])
rowO('mean o_ovr of the five', lambda x: sum(p['o_ovr'] for p in x['five'])/5)
rowO('mean ts_rel of the five', lambda x: sum(p['ts_rel'] for p in x['five'])/5)
