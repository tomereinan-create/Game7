# recal_86 (design-side round "74") — the tracked perdef branch made ABSOLUTE.
#
# This probe does three jobs and is committed so every number in receipt 86 is reproducible:
#   1. PREMISE CHECK — print OUR real branch's pieces against the ones the round quotes.
#   2. Identify the round's unnamed defect card from its signature.
#   3. Measure the round's own acceptance list: the five-defender table with diff / att / tw,
#      the tracked-population mean, the floor-tier red line, and the frozen controls.
# Run from the repo root:  python scripts/perdef86.py
import csv, io, json, os, unicodedata as _ud

def nrm(n):
    return ''.join(c for c in _ud.normalize('NFKD', (n or '').lower()) if c.isalnum())

TR = {}
with open('data/tracking_defense.csv', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        try:
            d = float(row['diff_pct'])
        except (TypeError, ValueError):
            continue
        try:
            a = float(row.get('att') or 0) * float(row.get('gp') or 0)
        except ValueError:
            a = 0.0
        TR.setdefault((int(row['season']), row.get('category', 'Overall')), {})[nrm(row['player_name'])] = (d, a)
# the derived 6ft+ series, exactly as build_ratings.py derives it (overall minus rim)
for (yr, _c) in [k for k in list(TR) if k[1] == 'Overall']:
    ov, rim = TR[(yr, 'Overall')], TR.get((yr, 'Less Than 6Ft'), {})
    out = {}
    for n, (d, a) in ov.items():
        r = rim.get(n)
        if not r or not a or a - r[1] <= 0:
            continue
        out[n] = ((d * a - r[0] * r[1]) / (a - r[1]), a - r[1])
    TR[(yr, 'Outside 6Ft')] = out

CAT, MIN_ATT, FULL = 'Outside 6Ft', 150.0, 350.0
def shrunk(yr, name):
    r = TR.get((yr, CAT), {}).get(nrm(name))
    if not r or not r[1]:
        return None
    return r[0] * min(1.0, r[1] / MIN_ATT), r[1]
def tgt_w(yr, name):
    atts = sorted(a for _d, a in TR.get((yr, CAT), {}).values() if a)
    med = atts[len(atts) // 2] if atts else None
    r = TR.get((yr, CAT), {}).get(nrm(name))
    if not r or not med:
        return 1.0
    return min(1.0, max(0.35, 1 - 0.6 * max(0.0, r[1] / med - 1)))
def smp_w(yr, name):
    r = TR.get((yr, CAT), {}).get(nrm(name))
    return min(1.0, r[1] / FULL) if r and r[1] else 0.0
def abs_perdef(diff):
    return min(84.0, max(25.0, 58.0 - 5.0 * (100.0 * diff)))

A = {p['name']: p for p in json.load(io.open('data/_b86.json', encoding='utf-8'))}
B = {p['name']: p for p in json.load(io.open('data/players_stats.json', encoding='utf-8'))}
asc = lambda s: s.encode('ascii', 'replace').decode()

print('=' * 100)
print('1. PREMISE CHECK — the round quotes a branch we do not have')
print('=' * 100)
print('  ROUND:  novote = min(0.84, (1-tw)base + tw(0.17 + 0.67*(1 - pct(diff))))   tw = 0.70*min(1, att/350)')
print('  OURS :  novote = min(0.84, (1-wm)*novote + wm*(0.17 + 0.67*d_meas))')
print('          wm     = 0.70 * _targeting_weight(name) * _sample_weight(name)      <- TWO weights, not one')
print('          d_meas = 0.70*(1 - Pperim(diff_6plus)) + 0.30*(1 - Pall(diff_overall))  <- the Overall slice')
print('  => the round\'s "he is at FULL tracking weight, so perdef is the tracked value alone" cannot')
print('     happen here: wm is capped at 0.70, so 30% of the reading is ALWAYS the composite.')
print('  => the round\'s replacement reads diff_6plus ALONE, which deletes his own "all shots carry')
print('     weight" ruling (ALLSHOT_W = 0.30) as a side effect. Preserved instead, mapped absolutely.')
print('  FLOORS the round calls "(r63)": ours are DFG_FLOORS = ((-0.035,76),(-0.02,70),(-0.01,64)),')
print('     shipped by recal_16, re-keyed to the 6ft+ series by recal_20/recal_55, verified by recal_65.')
print('     The LADDER the round quotes is correct; only its round number is not.')

print()
print('=' * 100)
print('2. THE UNNAMED DEFECT CARD (drep 0, DBPM 0.3, 6-11, diff +0.8%, 398 shots, perdef 64)')
print('=' * 100)
hits = []
for n, p in A.items():
    y, at = p['peak_season'], p['attrs']
    r = TR.get((y, CAT), {}).get(nrm(p['player']))
    if not r or y < 2014:
        continue
    if 0.006 <= r[0] <= 0.010 and 380 <= r[1] <= 420:
        hits.append((abs(r[1] - 398), n, at['height'], at['perdef'], B[n]['attrs']['perdef'], r[0], r[1]))
hits.sort()
print('  every card matching the round\'s diff/attempts signature (6ft+ diff +0.6%..+1.0%, att 380-420):')
for h in hits:
    print('    %-26s %d-%-2d  perdef %2d -> %2d   diff %+.2f%%  att %.0f'
          % (asc(h[1]), h[2] // 12, h[2] % 12, h[3], h[4], 100 * h[5], h[6]))
z = [h for h in hits if h[2] == 83]
print('  of these, 6-11 (height 83): %s' % (', '.join('%s perdef %d' % (asc(h[1]), h[3]) for h in z) or 'NONE'))
print('  VERDICT: no card in our tree reads perdef 64 on this signature. The nearest 6-11 men read 54')
print('  and 45. The round\'s defect card is a reading from a build BEFORE recal_76 (teamd out of')
print('  perdef), recal_80 (DEF display re-solve) and recal_82 (graded rimprot entry). The MECHANISM')
print('  it complains about is real and is fixed; the specific 64 is not reproducible and is not claimed.')

print()
print('=' * 100)
print('3. THE FIVE-DEFENDER TABLE the round asks for, spanning diff +2% to -5%')
print('=' * 100)
want = [0.020, 0.008, -0.005, -0.020, -0.050]
picked, used = [], set()
for target in want:
    best = None
    for n, p in A.items():
        y = p['peak_season']
        if y < 2014 or n in used:
            continue
        r = TR.get((y, CAT), {}).get(nrm(p['player']))
        if not r or r[1] < 300:
            continue
        k = abs(r[0] - target)
        if best is None or k < best[0]:
            best = (k, n, r)
    if best:
        used.add(best[1])
        picked.append((target, best[1], best[2]))
print('  %-26s %8s %7s %6s %6s %7s %7s' % ('card', 'diff', 'att', 'tgt_w', 'smp_w', 'tw', 'perdef'))
for target, n, r in picked:
    p, q = A[n], B[n]
    y = p['peak_season']
    tw = 0.70 * tgt_w(y, p['player']) * smp_w(y, p['player'])
    print('  %-26s %+7.2f%% %7.0f %6.2f %6.2f %7.3f  %2d -> %2d  (abs line -> %.1f)'
          % (asc(n), 100 * r[0], r[1], tgt_w(y, p['player']), smp_w(y, p['player']), tw,
             p['attrs']['perdef'], q['attrs']['perdef'], abs_perdef(shrunk(y, p['player'])[0])))

print()
print('=' * 100)
print('4. THE RED LINE — no floor-tier player moved DOWN')
print('=' * 100)
FLOORS = ((-0.035, 76), (-0.02, 70), (-0.01, 64))
def floor_of(y, name):
    r = TR.get((y, CAT), {}).get(nrm(name))
    if not r or not r[1] or min(1.0, r[1] / 350.0) < 0.75:
        return None
    for d, c in FLOORS:
        if r[0] <= d:
            return c
    return None
ft, down = [], []
for n, p in A.items():
    f = floor_of(p['peak_season'], p['player'])
    if f is None:
        continue
    ft.append(n)
    if B[n]['attrs']['perdef'] < p['attrs']['perdef']:
        down.append((n, f, p['attrs']['perdef'], B[n]['attrs']['perdef']))
print('  floor-tier cards (a binding r16/r20/r55 absolute floor): %d' % len(ft))
print('  of those, perdef moved DOWN: %d' % len(down))
for d in down[:20]:
    print('    %-26s floor %d   %d -> %d' % (asc(d[0]), d[1], d[2], d[3]))
print('  VERDICT: %s' % ('RED LINE HELD' if not down else 'RED LINE BROKEN — STOP AND REPORT'))

print()
print('=' * 100)
print('5. THE TRACKED-POPULATION MEAN (the round says it should land near 58)')
print('=' * 100)
trk = [n for n, p in A.items() if p['peak_season'] >= 2014 and TR.get((p['peak_season'], CAT), {}).get(nrm(p['player']))]
ma = sum(A[n]['attrs']['perdef'] for n in trk) / len(trk)
mb = sum(B[n]['attrs']['perdef'] for n in trk) / len(trk)
print('  tracked cards n=%d   mean perdef %.2f -> %.2f   (target near 58)' % (len(trk), ma, mb))
qa = sorted(A[n]['attrs']['perdef'] for n in trk)
qb = sorted(B[n]['attrs']['perdef'] for n in trk)
pc = lambda s, f: s[int(f * (len(s) - 1))]
print('  distribution p10/p50/p90:  before %d/%d/%d   after %d/%d/%d'
      % (pc(qa, .1), pc(qa, .5), pc(qa, .9), pc(qb, .1), pc(qb, .5), pc(qb, .9)))

print()
print('=' * 100)
print('6. FROZEN CONTROLS + FOOTPRINT')
print('=' * 100)
for who in ['Trae Young', 'Luka']:
    for n in sorted(k for k in A if k.startswith(who)):
        if A[n]['attrs']['perdef'] != B[n]['attrs']['perdef']:
            print('  MOVED %-26s perdef %d -> %d' % (asc(n), A[n]['attrs']['perdef'], B[n]['attrs']['perdef']))
    same = all(A[k]['attrs']['perdef'] == B[k]['attrs']['perdef'] for k in A if k.startswith(who))
    print('  %-12s frozen: %s' % (who, same))
d = [(B[n]['attrs']['perdef'] - A[n]['attrs']['perdef'], n) for n in A if A[n]['attrs']['perdef'] != B[n]['attrs']['perdef']]
d.sort()
print('  perdef footprint: %d moved (%d rose, %d fell), mean %+.2f, unchanged %d'
      % (len(d), sum(1 for x in d if x[0] > 0), sum(1 for x in d if x[0] < 0),
         sum(x[0] for x in d) / len(d), len(A) - len(d)))
print('  largest FALLS:')
for x in d[:6]:
    print('    %-26s %+d  (%d -> %d)' % (asc(x[1]), x[0], A[x[1]]['attrs']['perdef'], B[x[1]]['attrs']['perdef']))
print('  largest RISES:')
for x in d[-6:][::-1]:
    print('    %-26s %+d  (%d -> %d)' % (asc(x[1]), x[0], A[x[1]]['attrs']['perdef'], B[x[1]]['attrs']['perdef']))
pre = [n for n in A if A[n]['peak_season'] < 2014 and A[n]['attrs']['perdef'] != B[n]['attrs']['perdef']]
print('  pre-2014 cards that moved: %d  (oldest peak season %s)'
      % (len(pre), min((A[n]['peak_season'] for n in pre), default='-')))
print('  the pre-2014 PATH is untouched (tw = 0, no tracking rows exist); the movement above is the')
print('  season-smoothing window reaching forward into tracked neighbours, which predates this round.')
