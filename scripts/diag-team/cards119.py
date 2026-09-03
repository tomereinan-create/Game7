"""recal_119 — WHAT MOVED ON THE CARDS. team_offense is exec'd by compute_ovr.py for the marginal
term, so `marg` moves; o_ovr / d_ovr / ovr must not (recal_37/40 took the marginal out of OVR).
Asserted against the pre-round file, never assumed."""
import io, json, sys

A = {p['name']: p for p in json.load(io.open(sys.argv[1], encoding='utf8'))}
B = {p['name']: p for p in json.load(io.open(sys.argv[2], encoding='utf8'))}
assert set(A) == set(B), 'card set changed'
for f in ('o_ovr', 'd_ovr', 'ovr', 'talent'):
    bad = [n for n in A if A[n].get(f) != B[n].get(f)]
    print('  %-8s moved on %5d of %d%s' % (f, len(bad), len(A),
                                           '   ' + ', '.join(bad[:5]) if bad else ''))
attrbad = [n for n in A if A[n]['attrs'] != B[n]['attrs']]
print('  %-8s moved on %5d of %d' % ('attrs', len(attrbad), len(A)))
d = [(abs(B[n].get('marg', 0) - A[n].get('marg', 0)), n) for n in A]
mv = [x for x in d if x[0]]
print('  %-8s moved on %5d of %d   max %d   mean %.2f' %
      ('marg', len(mv), len(A), max(x[0] for x in d),
       sum(x[0] for x in d) / len(d)))
for v, n in sorted(mv, reverse=True)[:6]:
    print('      %-28s marg %3d -> %3d' % (n, A[n].get('marg', 0), B[n].get('marg', 0)))
