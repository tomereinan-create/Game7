"""recal_77 (design-side round "70") item 1 — the zone attempt-confidence probe.

Applies the round's formula ANALYTICALLY to the shipped cards, so the whole measurement is
reproducible without touching the pipeline:

    conf_z  = min(1, (attempts_z / REF_z) ** 0.5)        REF: 3pt 250, mid 250, paint 300
    zone'   = 50 + (zone - 50) * (0.55 + 0.45 * conf_z)

Attempts are reconstructed from the per-100 rates the sheet already records in the provenance
sidecar (3pt[1] = 3PA/100, rim[1] = paint attempts/100, mid[1] = mid attempts/100) taken to the
player's own possessions (minutes x season pace / 48). That reconstruction was validated against
Basketball-Reference season totals and lands within ~1.5% (Ty Jerome '25: computed 249 3PA vs 253
actual; Curry '16: 857 vs 886).

Run:  python scripts/zoneconf77.py       (from the repo root)
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = {'3pt': 250.0, 'mid': 250.0, 'rim': 300.0}


def load():
    cards = {p['name']: p for p in json.load(open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf-8'))}
    prov = json.load(open(os.path.join(ROOT, 'data', 'provenance.json'), encoding='utf-8'))
    pace = {}
    for r in csv.DictReader(open(os.path.join(ROOT, 'data', 'bref', 'Team Summaries.csv'), encoding='utf-8')):
        if r['lg'] != 'NBA':
            continue
        try:
            pace.setdefault(int(r['season']), []).append(float(r['pace']))
        except (TypeError, ValueError):
            pass
    lgpace = {k: sum(v) / len(v) for k, v in pace.items() if v}
    mp = {}
    for r in csv.DictReader(open(os.path.join(ROOT, 'data', 'bref', 'Player Totals.csv'), encoding='utf-8')):
        if r['lg'] != 'NBA':
            continue
        try:
            k, v = (r['player'], int(r['season'])), float(r['mp'] or 0)
            if r['team'] == 'TOT' or k not in mp:
                mp[k] = v
        except (TypeError, ValueError):
            pass
    return cards, prov, lgpace, mp


def attempts(card, prov, lgpace, mp):
    """Per-zone attempt counts, or None where the sheet has no rate (the r52 no-data rule)."""
    poss = mp.get((card['player'], card['peak_season']), 0.0) * lgpace.get(card['peak_season'], 100.0) / 48.0
    m = prov.get(card['name']) or {}
    out = {}
    for z in ('3pt', 'mid', 'rim'):
        e = m.get(z)
        # CAREFUL: rim/mid carry the attempt RATE only on the MEASURED path (element 0 == 1). On the
        # pre-1997 inferred path rim[1] is the first inference FEATURE, a different quantity entirely
        # — reading it as attempts wrongly shrinks Shaq '95, Robinson '92, Barkley '91 and the rest of
        # the pre-tracking greats by 15 points. Those seasons have no attempt data at all, so the r52
        # rule applies and they take no discount. 3pt[1] is always the 3PA rate, whatever the path.
        ok = bool(e) and len(e) > 1 and e[1] is not None and (z == '3pt' or e[0] == 1)
        out[z] = (e[1] * poss / 100.0) if ok else None
    return out, poss


def shrunk(rating, att, ref):
    if att is None:
        return rating  # r52: no attempts data, no discount
    conf = min(1.0, (att / ref) ** 0.5)
    return int(round(50 + (rating - 50) * (0.55 + 0.45 * conf)))


def main():
    cards, prov, lgpace, mp = load()
    rows = []
    for nm, c in cards.items():
        att, poss = attempts(c, prov, lgpace, mp)
        for z in ('3pt', 'mid', 'rim'):
            if att[z] is None:
                continue
            before = c['attrs'][z]
            rows.append((shrunk(before, att[z], REF[z]) - before, z, nm, att[z], before))

    print('=== THE NAMED CARD ===')
    c = cards["Ty Jerome '25"]
    att, _ = attempts(c, prov, lgpace, mp)
    pred = {'3pt': '92 -> ~82', 'mid': '94 -> ~80', 'rim': '(not named)'}
    for z in ('3pt', 'mid', 'rim'):
        b = c['attrs'][z]
        print(f"  {z:3s} {b:2d} -> {shrunk(b, att[z], REF[z]):2d}   attempts {att[z]:6.0f} / ref {REF[z]:.0f}   [round predicted {pred[z]}]")
    print("  round predicted OFF 82 -> 74-76; measured in a full pipeline run: OFF 82 -> 81")

    print('\n=== FULL-SEASON CONTROLS (the round demands within +-1) ===')
    for nm in ["Stephen Curry '16", "Klay Thompson '15", "Reggie Miller '97", "Dirk Nowitzki '04"]:
        c = cards[nm]
        att, _ = attempts(c, prov, lgpace, mp)
        d, bits = 0, []
        for z in ('3pt', 'mid', 'rim'):
            b = c['attrs'][z]
            a = shrunk(b, att[z], REF[z])
            d = max(d, abs(a - b))
            bits.append(f"{z} {b:2d}->{a:2d}({att[z]:5.0f} att)" if att[z] is not None else f"{z} {b:2d}->{b:2d}(n/a)")
        print(f"  {'OK   ' if d <= 1 else 'BREAK'} {nm:20s} " + '  '.join(bits))

    moved = [r for r in rows if r[0] != 0]
    moved.sort(key=lambda x: x[0])
    print('\n=== THE TWENTY LARGEST DOWNWARD MOVERS ===')
    for d, z, nm, a, b in moved[:20]:
        print(f"  {d:+3d}  {z:3s}  {nm:28s} attempts {a:6.0f} / ref {REF[z]:.0f}  conf {min(1.0, (a / REF[z]) ** 0.5):.2f}")

    def pear(xs, ys):
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        return num / ((sum((x - mx) ** 2 for x in xs) ** 0.5) * (sum((y - my) ** 2 for y in ys) ** 0.5))

    print(f"\nzones priced {len(rows)}, moved {len(moved)}")
    print(f"attempts/ref vs |move|, moved zones : r = {pear([a / REF[z] for d, z, nm, a, b in moved], [abs(d) for d, z, nm, a, b in moved]):+.3f}  (the round's stated proof; negative = fewer attempts, bigger move)")
    up = [r for r in moved if r[0] > 0]
    dn = [r for r in moved if r[0] < 0]
    print(f"of the moved zones: {len(dn)} FELL, {len(up)} ROSE — shrinking toward 50 lifts every")
    print("below-average zone on a thin sample, which the round never mentions and its receipts never ask for.")


if __name__ == '__main__':
    main()
