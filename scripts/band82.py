"""recal_82 (design-side round "73") - the rimprot voted-band feasibility proof.

The round asks for a graded entry (drep/0.80) plus an EVIDENCE CEILING inside the voted band:

    P_evid = percentile, within the voted pool, of (0.65 * P_blk + 0.35 * P_dbpm)
    ceil_v = 88 + 11 * P_evid          <- protocol v2 says tune these two constants
    rimprot_voted = min(band_value, ceil_v)

Protocol v2: if the three targets and the five anchors cannot hold together, print the pool
distribution and STOP. This script decides that question exactly rather than by search, for BOTH
the round's evidence term (with DBPM) and a DBPM-free variant, since recal_81 removed DBPM from
rim protection on Tomer's ruling.

Run:  python scripts/band82.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP_NOVOTE = 88.0   # r53: a no-vote rim protector caps here
GRAD_DENOM = 0.80   # the round's widened denominator, rimprot only

# name -> (role, low target, high target)
NAMED = [
    ("Caldwell Jones '82", 'A', 94, 96),
    ("Bobby Jones '82", 'B', 94, 96),
    ("Joakim Noah '09", 'C', 89, 91),
    ("Rudy Gobert '19", 'anchor', 97, 99),
    ("Victor Wembanyama '24", 'anchor', 97, 99),
    ("Dikembe Mutombo '97", 'anchor', 97, 99),
    ("Tim Duncan '03", 'anchor', 97, 99),
    ("Ben Wallace '04", 'anchor', 97, 99),
]


def load():
    prov = json.load(open(os.path.join(ROOT, 'data', 'provenance.json'), encoding='utf-8'))
    cards = {p['name']: p for p in json.load(open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf-8'))}
    pool = {}
    for nm, m in prov.items():
        i = m.get('rimprot')
        c = cards.get(nm)
        if not i or len(i) < 4 or c is None or not c.get('big'):
            continue
        blk, _ht, dbpm, drep = i[0], i[1], i[2], i[3]
        if None in (blk, dbpm, drep) or drep <= 0.05:
            continue
        pool.setdefault(c['peak_season'], []).append((nm, blk, dbpm, drep, c['attrs']['rimprot']))
    return prov, cards, pool


def pct(vals, v):
    return 0.5 if len(vals) < 2 else sum(1 for x in vals if x < v) / (len(vals) - 1)


def evid(pool, cards, prov, nm, use_dbpm):
    c, m = cards[nm], prov[nm]
    i = m['rimprot']
    grp = pool[c['peak_season']]
    pb = pct([g[1] for g in grp], i[0])
    pd = pct([g[2] for g in grp], i[2])
    return (0.65 * pb + 0.35 * pd) if use_dbpm else pb, i, c, len(grp)


def constraints(pool, cards, prov, use_dbpm):
    """Each named card becomes a linear constraint on (base, span) of ceil = base + span*P."""
    out = []
    for nm, role, lo, hi in NAMED:
        if nm not in cards or nm not in prov or not prov[nm].get('rimprot'):
            continue
        pe, i, c, n = evid(pool, cards, prov, nm, use_dbpm)
        band = float(c['attrs']['rimprot'])
        w = min(1.0, i[3] / GRAD_DENOM) if i[3] > 0.05 else 0.0
        # out = (1-w)*CAP + w*min(band, ceil)
        # solve the ceil interval that lands `out` inside [lo, hi]
        if w <= 0:
            continue
        need_lo = (lo - (1 - w) * CAP_NOVOTE) / w   # min(band, ceil) must be >= this
        need_hi = (hi - (1 - w) * CAP_NOVOTE) / w   # ... and <= this
        out.append(dict(nm=nm, role=role, pe=pe, band=band, w=w, lo=lo, hi=hi,
                        need_lo=need_lo, need_hi=need_hi, blk=i[0], dbpm=i[2], drep=i[3], n=n))
    return out


def report(label, cons):
    print('\n' + '=' * 104)
    print(label)
    print('=' * 104)
    print(f"{'card':26s} {'role':7s} {'blk':>5s} {'dbpm':>5s} {'drep':>5s} {'P_evid':>6s} {'w':>5s} {'band':>5s}  ceil must be in")
    for c in cons:
        hi = 'any' if c['need_hi'] >= c['band'] else f"{c['need_hi']:.1f}"
        print(f"{c['nm']:26s} {c['role']:7s} {c['blk']:5.1f} {c['dbpm']:5.1f} {c['drep']:5.2f} {c['pe']:6.2f} {c['w']:5.2f} {c['band']:5.0f}  [{c['need_lo']:.1f}, {hi}]")

    # A ceiling that rises with evidence cannot give a LOWER cap to a card with HIGHER evidence.
    bad = []
    for a in cons:
        for b in cons:
            if a is b:
                continue
            # a needs ceil >= need_lo at P=a.pe ; b needs ceil <= need_hi at P=b.pe
            if b['need_hi'] < b['band'] and b['pe'] >= a['pe'] and b['need_hi'] < a['need_lo']:
                bad.append((a, b))
    if not bad:
        print('\n  FEASIBLE on the named set: no monotonicity contradiction found.')
        return False
    print('\n  INFEASIBLE - the ceiling rises with evidence, so these pairs cannot both hold:')
    seen = set()
    for a, b in bad:
        k = (a['nm'], b['nm'])
        if k in seen:
            continue
        seen.add(k)
        print(f"    {a['nm']} needs ceil >= {a['need_lo']:.1f} at P_evid {a['pe']:.2f}")
        print(f"    {b['nm']} needs ceil <= {b['need_hi']:.1f} at P_evid {b['pe']:.2f}  <- HIGHER evidence, LOWER cap required")
        print()
    return True


def main():
    prov, cards, pool = load()
    infeasible = []
    for label, use_dbpm in [("VARIANT (a) - the round as written: P_evid = 0.65 P_blk + 0.35 P_dbpm", True),
                            ("VARIANT (b) - DBPM-FREE (blk% alone), per Tomer's recal_81 ruling", False)]:
        cons = constraints(pool, cards, prov, use_dbpm)
        infeasible.append(report(label, cons))

    print('\n' + '=' * 104)
    print('THE POOL DISTRIBUTION protocol v2 requires on a stop - voted bigs, (blk%, DBPM, drep)')
    print('=' * 104)
    allv = [g for grp in pool.values() for g in grp]
    blks = sorted(g[1] for g in allv)
    dbps = sorted(g[2] for g in allv)
    dreps = sorted(g[3] for g in allv)
    q = lambda v, f: v[int(f * (len(v) - 1))]
    print(f'  voted bigs across all seasons: n={len(allv)}, seasons={len(pool)}, median pool size={sorted(len(v) for v in pool.values())[len(pool)//2]}')
    for nm, v in (('blk%', blks), ('DBPM', dbps), ('drep', dreps)):
        print(f'  {nm:5s} p10 {q(v,.10):6.2f}  p25 {q(v,.25):6.2f}  median {q(v,.50):6.2f}  p75 {q(v,.75):6.2f}  p90 {q(v,.90):6.2f}  max {v[-1]:6.2f}')
    frac = sum(1 for g in allv if g[3] >= 0.30) / len(allv)
    print(f'  share of voted bigs at drep >= 0.30 (full membership under the CURRENT 0.30 denominator): {frac:.0%}')
    print(f'  share at drep >= 0.80 (full membership under the round\'s proposed denominator):          {sum(1 for g in allv if g[3] >= 0.80)/len(allv):.0%}')

    print('\n' + '=' * 104)
    print('VERDICT')
    print('=' * 104)
    if all(infeasible):
        print('  BOTH variants are INFEASIBLE. The targets cannot hold together under ANY (base, span),')
        print('  with or without DBPM, so the DBPM collision does not even get to be the deciding question.')
    elif infeasible[0] and not infeasible[1]:
        print('  Only the DBPM-FREE variant can hold the targets.')
    elif infeasible[1] and not infeasible[0]:
        print('  ONLY the round as written (with DBPM) can hold the targets - his ruling would need an exception.')
    else:
        print('  Both variants are feasible on the named set; constants still need fitting.')


if __name__ == '__main__':
    main()
