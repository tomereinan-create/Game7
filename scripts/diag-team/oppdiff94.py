"""recal_94 — did the round reorder the campaign ladder? Reads opp_before.json / opp_after.json."""
import json, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
A = json.load(open(os.path.join(HERE, 'opp_before.json'), encoding='utf8'))
B = json.load(open(os.path.join(HERE, 'opp_after.json'), encoding='utf8'))
assert len(A) == len(B)
print('ladder fives:', len(A))
print('OFF dial changed on:', sum(1 for a, b in zip(A, B) if a['off'] != b['off']), 'of', len(A))
d = [(b['def'] - a['def'], a) for a, b in zip(A, B)]
print('DEF dial changed on:', sum(1 for x, _ in d if x), '  mean move %+.1f  max |move| %d' % (sum(x for x, _ in d)/len(d), max(abs(x) for x, _ in d)))
print()
for src in sorted({r['src'] for r in A}):
    ga = [r for r in A if r['src'] == src]
    gb = [r for r in B if r['src'] == src]
    oa = sorted(range(len(ga)), key=lambda i: -ga[i]['def'])
    ob = sorted(range(len(gb)), key=lambda i: -gb[i]['def'])
    pa = {j: k for k, j in enumerate(oa)}
    pb = {j: k for k, j in enumerate(ob)}
    mx = max(abs(pa[j] - pb[j]) for j in pa)
    same = sum(1 for j in pa if pa[j] == pb[j])
    print('%-10s n=%3d  DEF rank held exactly for %3d  max rank move %2d' % (src, len(ga), same, mx))
print()
print('the eight rounds of the first campaign tier, OFF/DEF before -> after:')
for a, b in list(zip(A, B))[:8]:
    print('  round %2d  %-26s OFF %2d -> %2d   DEF %2d -> %2d' % (a['i']+1, a['team'], a['off'], b['off'], a['def'], b['def']))
print()
print('the ladder is ordered by RECORD (scripts/campaigns.ts), never by a dial, so no level changes place.')
