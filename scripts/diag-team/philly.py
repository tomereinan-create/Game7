import json, math, os
from collections import defaultdict
HERE=os.path.dirname(os.path.abspath(__file__))
sw=json.load(open(os.path.join(HERE,'sweep.json'),encoding='utf8'))
data=json.load(open(os.path.join(HERE,'joined.json'),encoding='utf8'))
byname={(x['y'],x['team']):x for x in data}
P=byname[(2026,'Philadelphia 76ers')]
PAINT=P['dec']['paintOrient']

print('=== 2026 season: gauge DEF vs real DRtg (all 30) ===')
g=[x for x in data if x['y']==2026]
print(f'{"team":26s} {"rec":8s} {"gDEF":>5s} {"gRk":>4s} {"realDRtg":>9s} {"tRk":>4s} {"gOFF":>5s} {"realORtg":>9s} {"drtgRef":>8s}')
for x in sorted(g,key=lambda z:-z['def']):
    print(f'{x["team"]:26s} {str(x["rec"]):8s} {x["def"]:5d} {x["gauge_def_rank"]:4d} {x["truth"]["drtg"]:9.1f} {x["truth_def_rank"]:4d} {x["off"]:5d} {x["truth"]["ortg"]:9.1f} {x["drtgRef"]:8.3f}')

print()
print('=== PHILADELPHIA 76ers 2026 ===')
print('record', P['rec'], ' real ORtg', P['truth']['ortg'], 'rank', P['truth_off_rank'],
      ' real DRtg', P['truth']['drtg'], 'rank', P['truth_def_rank'], ' MOV', P['truth']['mov'], ' SRS', P['truth']['srs'])
print('gauge OFF', P['off'], '(rank', P['gauge_off_rank'], ') gauge DEF', P['def'], '(rank', P['gauge_def_rank'],')')
print('offRaw', round(P['offRaw'],3), ' drtgRef', round(P['drtgRef'],3))
print()
print('the chosen five (max total OVR, PG..C):')
print(f'{"name":26s} {"ovr":>4s} {"o_ovr":>6s} {"d_ovr":>6s} {"perdef":>7s} {"rimprot":>8s} {"perimd":>7s} {"drb":>4s} {"disc":>5s} {"ht":>4s} {"usg":>5s} {"3pt":>4s}')
for p in P['five']:
    print(f'{p["name"]:26s} {p["ovr"]:4d} {p["o_ovr"]:6d} {p["d_ovr"]:6d} {p["perdef"]:7d} {p["rimprot"]:8d} {p["perimdisrupt"]:7d} {p["drb"]:4d} {p["discipline"]:5d} {p["height"]:4d} {p["usg"]:5.1f} {p["three"]:4d}')
print('bench:')
for p in P['bench']:
    print(f'  {p["name"]:26s} ovr {p["ovr"]:3d} d_ovr {p["d_ovr"]:3d} perdef {p["perdef"]:3d} rimprot {p["rimprot"]:3d}')

d=P['dec']
print()
print('DEF decomposition (defenseVs(five, REF_FIVE), assignment=optimal):')
print(f'  sum perdef      {d["sumPerdef"]:8.2f}   (mean {d["sumPerdef"]/5:.2f})')
print(f'  deficit         {d["deficit"]:8.2f}   = sum over non-anchor of max(0, 60-perdef)')
print(f'  anchor cap      {37.5*d["anchor"]/99:8.2f}   = 37.5 * anchor/99')
print(f'  cover           {d["cover"]:8.2f}   = min(deficit, cap) * min(1, paintOrient*2={min(1,PAINT*2):.2f})')
print(f'  effDi           {d["effDi"]:8.2f}   = (sum perdef + cover)/5   <-- cover is worth +{d["cover"]/5:.2f} of effDi')
print(f'  anchor          {d["anchor"]:8.2f}   = rp1 + 0.35*rp2*(rp2/99), hide={d["hide"]:.2f} (never degrades: REF C shoots 25)')
print(f'  steals          {d["steals"]:8.2f}   onball {d["onball"]:.2f} team {d["team"]:.2f}')
print(f'  glass           {d["glass"]:8.2f}')
print(f'  huntPen         {d["huntPen"]:8.2f}   (always 0 for the gauge: optimal board vs itself)')
print()
print('  didx contributions:')
print(f'    0.42*effDi          = {d["cDi"]:7.3f}')
print(f'    0.26*anchor*0.9     = {d["cAnchor"]:7.3f}')
print(f'    0.20*steals*0.9     = {d["cSteal"]:7.3f}')
print(f'    0.12*max(0,60+g/4)  = {d["cGlass"]:7.3f}')
print(f'    didx                = {d["didx"]:7.3f}')
print(f'  drtg = 110 - 0.181*(didx-55) + huntPen + discPts')
print(f'       = 110 - 0.181*({d["didx"]:.3f}-55) + 0 + {d["discPts"]:.3f} = {P["drtgRef"]:.3f}')
print()
DEF_MID=109.14; DEF_TOP=107.03; DEF_WORST=112.87
def gauge(v):
    return max(1,min(99, 50+49*((-v)-(-DEF_MID))/((-DEF_TOP)-(-DEF_MID)) if -v> -DEF_MID else 1+49*((-v)-(-DEF_WORST))/((-DEF_MID)-(-DEF_WORST))))
print(f'  gauge: drtgRef {P["drtgRef"]:.3f} vs median anchor {DEF_MID} / summit {DEF_TOP} -> DEF {round(gauge(P["drtgRef"]))}')

print()
print('=== COUNTERFACTUALS for Philly 2026 (each single term removed/halved) ===')
def redo(cover_mul=1.0,wA=0.26,wDi=0.42,wS=0.20,wG=0.12,disc=1.0):
    effDi=(d['sumPerdef']+cover_mul*d['cover'])/5
    didx=wDi*effDi+wA*d['anchor']*0.9+wS*min(99,d['steals'])*0.9+wG*max(0,60+d['glass']/4)
    return 110-0.181*(didx-55)+disc*d['discPts']
# rank Philly among 2026 under each variant, recomputing everyone
def variant_rank(**kw):
    out=[]
    for x in g:
        dd=x['dec']
        effDi=(dd['sumPerdef']+kw.get('cover_mul',1.0)*dd['cover'])/5
        didx=kw.get('wDi',0.42)*effDi+kw.get('wA',0.26)*dd['anchor']*0.9+kw.get('wS',0.20)*min(99,dd['steals'])*0.9+kw.get('wG',0.12)*max(0,60+dd['glass']/4)
        v=110-0.181*(didx-55)+kw.get('disc',1.0)*dd['discPts']
        out.append((v,x['team']))
    out.sort()
    r=[i+1 for i,(v,t) in enumerate(out) if t=='Philadelphia 76ers'][0]
    return r, dict(out)['Philadelphia 76ers'] if False else [v for v,t in out if t=='Philadelphia 76ers'][0]
print(f'  truth says Philadelphia 2026 defence ranks {P["truth_def_rank"]}/30 (DRtg {P["truth"]["drtg"]})')
for lbl,kw in [('as shipped',{}),
               ('cover halved',dict(cover_mul=0.5)),('cover removed',dict(cover_mul=0.0)),
               ('anchor weight halved 0.26->0.13',dict(wA=0.13,wDi=0.55)),
               ('anchor weight ->0.10',dict(wA=0.10,wDi=0.58)),
               ('discipline points off',dict(disc=0.0)),
               ('steals halved 0.20->0.10',dict(wS=0.10,wDi=0.52)),
               ('glass ->0.05',dict(wG=0.05,wDi=0.49)),
               ('cover off + anchor 0.10',dict(cover_mul=0.0,wA=0.10,wDi=0.58)),
               ('cover off + anchor 0.10 + disc off',dict(cover_mul=0.0,wA=0.10,wDi=0.58,disc=0.0))]:
    r,v=variant_rank(**kw)
    print(f'  {lbl:36s} drtgRef {v:8.3f}  2026 DEF rank {r:2d}/30')
