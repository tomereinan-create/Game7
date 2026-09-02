import json, csv, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

sw = json.load(open(os.path.join(HERE, 'sweep.json'), encoding='utf8'))
rows = sw['rows']

truth = {}
with open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf8') as f:
    for r in csv.DictReader(f):
        if r['lg'] != 'NBA':
            continue
        try:
            y = int(r['season'])
        except:
            continue
        def num(k):
            try: return float(r[k])
            except: return None
        truth[(y, r['team'])] = dict(ab=r['abbreviation'], ortg=num('o_rtg'), drtg=num('d_rtg'),
                                     srs=num('srs'), mov=num('mov'), w=num('w'), l=num('l'), pace=num('pace'))
        truth[(y, r['abbreviation'])] = truth[(y, r['team'])]

miss = []
for x in rows:
    t = truth.get((x['y'], x['team'])) or truth.get((x['y'], x['ab']))
    if t is None:
        miss.append((x['y'], x['team'], x['ab']))
    x['truth'] = t
print('unmatched to bref:', len(miss), miss[:10])

data = [x for x in rows if x['truth'] and x['truth']['ortg'] is not None and x['truth']['drtg'] is not None]
print('rows with ORtg/DRtg truth:', len(data))

# league-relative truth: raw ORtg/DRtg drift massively by era, so rank within season
byseason = defaultdict(list)
for x in data:
    byseason[x['y']].append(x)

def rank(vals):
    # average ranks, ascending
    idx = sorted(range(len(vals)), key=lambda i: vals[i])
    r = [0.0]*len(vals)
    i = 0
    while i < len(idx):
        j = i
        while j+1 < len(idx) and vals[idx[j+1]] == vals[idx[i]]:
            j += 1
        avg = (i+j)/2.0 + 1
        for k in range(i, j+1):
            r[idx[k]] = avg
        i = j+1
    return r

def spearman(a, b):
    if len(a) < 3: return float('nan')
    ra, rb = rank(a), rank(b)
    n = len(a)
    ma, mb = sum(ra)/n, sum(rb)/n
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da = math.sqrt(sum((ra[i]-ma)**2 for i in range(n)))
    db = math.sqrt(sum((rb[i]-mb)**2 for i in range(n)))
    return num/(da*db) if da and db else float('nan')

# relative truth per season: ORtg - season mean ORtg (same for DRtg)
for y, g in byseason.items():
    mo = sum(x['truth']['ortg'] for x in g)/len(g)
    md = sum(x['truth']['drtg'] for x in g)/len(g)
    ro = rank([x['truth']['ortg'] for x in g])           # higher ORtg = higher rank number
    rd = rank([-x['truth']['drtg'] for x in g])          # better D (lower drtg) = higher rank number
    go = rank([x['off'] for x in g])
    gd = rank([x['def'] for x in g])
    n = len(g)
    for i, x in enumerate(g):
        x['rel_ortg'] = x['truth']['ortg'] - mo
        x['rel_drtg'] = x['truth']['drtg'] - md   # negative = good defense
        x['n_season'] = n
        # display ranks 1 = best
        x['truth_off_rank'] = int(n - ro[i] + 1)
        x['truth_def_rank'] = int(n - rd[i] + 1)
        x['gauge_off_rank'] = int(n - go[i] + 1)
        x['gauge_def_rank'] = int(n - gd[i] + 1)
        x['off_rank_err'] = x['gauge_off_rank'] - x['truth_off_rank']
        x['def_rank_err'] = x['gauge_def_rank'] - x['truth_def_rank']
        # percentile within season, 0..1, 1 = best
        x['truth_off_pct'] = (n - x['truth_off_rank']) / (n - 1)
        x['truth_def_pct'] = (n - x['truth_def_rank']) / (n - 1)
        x['gauge_off_pct'] = (n - x['gauge_off_rank']) / (n - 1)
        x['gauge_def_pct'] = (n - x['gauge_def_rank']) / (n - 1)

def era(y):
    if y < 1990: return '80s'
    if y < 2000: return '90s'
    if y < 2010: return '00s'
    if y < 2020: return '10s'
    return '20s'

print()
print('=== FIT: Spearman (gauge vs truth), within-season-relative truth ===')
def report(g, label):
    so = spearman([x['off'] for x in g], [x['rel_ortg'] for x in g])
    sd = spearman([x['def'] for x in g], [-x['rel_drtg'] for x in g])
    sn = spearman([x['off']-x['def'] for x in g], [x['truth']['mov'] for x in g])
    swin = spearman([(x['off']+x['def'])/2 for x in g], [x['truth']['w'] for x in g])
    print(f'{label:>10}  n={len(g):5d}  OFF rho={so:+.3f}   DEF rho={sd:+.3f}   (OFF-DEF vs MOV {sn:+.3f}, OVR vs W {swin:+.3f})')
report(data, 'ALL')
for e in ['80s','90s','00s','10s','20s']:
    g = [x for x in data if era(x['y']) == e]
    if g: report(g, e)

print()
print('--- raw (non-relative) truth, for reference ---')
so = spearman([x['off'] for x in data], [x['truth']['ortg'] for x in data])
sd = spearman([x['def'] for x in data], [-x['truth']['drtg'] for x in data])
print(f'   ALL raw ORtg rho={so:+.3f}  raw DRtg rho={sd:+.3f}')

# per-season spearman, to see if the correlation is real inside a year
ps_off, ps_def = [], []
for y in sorted(byseason):
    g = byseason[y]
    ps_off.append((y, spearman([x['off'] for x in g], [x['rel_ortg'] for x in g])))
    ps_def.append((y, spearman([x['def'] for x in g], [-x['rel_drtg'] for x in g])))
print()
print('=== per-season Spearman (within one year) ===')
mo = sum(v for _, v in ps_off)/len(ps_off); md = sum(v for _, v in ps_def)/len(ps_def)
print(f'   mean over {len(ps_off)} seasons: OFF {mo:+.3f}  DEF {md:+.3f}')
print('   DEF worst seasons:', sorted(ps_def, key=lambda t: t[1])[:8])
print('   DEF best  seasons:', sorted(ps_def, key=lambda t: -t[1])[:5])
print('   OFF worst seasons:', sorted(ps_off, key=lambda t: t[1])[:8])

def table(g, key, label, n=25):
    print()
    print(f'=== WORST {n} {label} ===')
    print(f'{"team":28s} {"rec":8s} {"gauge":>5s} {"gRk":>4s} {"tRk":>4s} {"err":>5s} {"truthRtg":>9s}')
    for x in sorted(g, key=lambda z: -abs(z[key]))[:n]:
        side = 'def' if 'def' in key else 'off'
        gg = x[side]
        tr = x['truth']['drtg'] if side == 'def' else x['truth']['ortg']
        print(f'{x["team"]+" ’"+str(x["y"])[2:]:28s} {str(x["rec"]):8s} {gg:5d} {x[side+"_rank"] if False else x["gauge_"+side+"_rank"]:4d} {x["truth_"+side+"_rank"]:4d} {x[key]:+5d} {tr:9.1f}')

table(data, 'def_rank_err', 'DEF mismatches (rank error, gauge - truth)')
table(data, 'off_rank_err', 'OFF mismatches (rank error, gauge - truth)')

json.dump(data, open(os.path.join(HERE, 'joined.json'), 'w', encoding='utf8'))
print()
print('joined rows written:', len(data))
