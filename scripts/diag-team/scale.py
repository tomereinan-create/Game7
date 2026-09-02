import json, math, os
from collections import defaultdict
HERE=os.path.dirname(os.path.abspath(__file__))
data=json.load(open(os.path.join(HERE,'joined.json'),encoding='utf8'))
byseason=defaultdict(list)
for x in data: byseason[x['y']].append(x)
def sd(v):
    m=sum(v)/len(v); return math.sqrt(sum((z-m)**2 for z in v)/max(1,len(v)-1))
so=[sd([x['offRaw'] for x in g]) for g in byseason.values()]
sdd=[sd([x['drtgRef'] for x in g]) for g in byseason.values()]
to=[sd([x['truth']['ortg'] for x in g]) for g in byseason.values()]
td=[sd([x['truth']['drtg'] for x in g]) for g in byseason.values()]
print('=== SCALE: how many real points of spread does each engine side carry? (within-season sd, mean over 47 seasons) ===')
print(f'  engine offRaw  sd {sum(so)/len(so):6.3f}   real ORtg sd {sum(to)/len(to):6.3f}   engine/real = {(sum(so)/len(so))/(sum(to)/len(to)):.2f}x')
print(f'  engine drtgRef sd {sum(sdd)/len(sdd):6.3f}   real DRtg sd {sum(td)/len(td):6.3f}   engine/real = {(sum(sdd)/len(sdd))/(sum(td)/len(td)):.2f}x')
print()
print('  all-time range the gauge maps:')
print(f'    OFF  104.36 .. 137.67  = 33.31 offRaw pts over 98 gauge pts  ->  2.94 gauge pts per real point')
print(f'    DEF  112.87 .. 107.03  =  5.84 drtgRef pts over 98 gauge pts -> 16.78 gauge pts per real point')
print(f'    the DEF dial magnifies its input {33.31/5.84:.1f}x more than the OFF dial does')
print()
print('  consequence: a 0.5 DRtg error in the defensive index moves the dial ~%d points; a 0.5 ORtg error moves OFF ~%d.'%(round(0.5*16.78),round(0.5*2.94)))
print(f'  the discipline channel alone has range 3.13 drtgRef pts = {3.13*16.78:.0f} gauge points.')
