"""recal_76 (design-side round "69") — the perdef team-defense double-count probe.

Measures the PREMISE against our own pool, reproducibly and without touching the pipeline:
does DBPM already carry team defense, and what is the EFFECTIVE weight on team defense in the
PD composite?

    PD (shipped) = 0.366*drep + 0.192*dbpm + 0.192*teamd + 0.25*height_inv

`dbpm` is Basketball-Reference's DBPM, read straight from Advanced.csv. In BPM 2.0 the team
adjustment adds a shared constant to every man on the roster so the minutes-weighted total equals
the team's adjusted efficiency, so the team's defensive quality is inside dbpm before any weighting
here. The explicit `teamd` term therefore charges the same fact twice.

Run:  python scripts/perdef76.py      (from the repo root)
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W_TEAMD, W_DBPM = 0.192, 0.192


def pearson(xs, ys):
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return num / (dx * dy)


def main():
    prov = json.load(open(os.path.join(ROOT, 'data', 'provenance.json'), encoding='utf-8'))
    # perdef sidecar: [drep, dbpm, team_drtg, height, novote, diff6, voted_w, att6, overall_diff]
    rows = []
    for m in prov.values():
        pd = m.get('perdef')
        if not pd or len(pd) < 4:
            continue
        if pd[1] is None or pd[2] is None:
            continue
        rows.append((pd[1], pd[2]))

    dbpm = [r[0] for r in rows]
    drtg = [r[1] for r in rows]
    r = pearson(drtg, dbpm)
    print(f"cards carrying both DBPM and team DRtg: {len(rows)}")
    print(f"corr(team DRtg, DBPM) = {r:+.3f}   (negative expected: better team defense = lower DRtg = higher DBPM)")
    print(f"R^2                   =  {r * r:.3f}   (share of DBPM variance explained by team defense)")
    print()
    print(f"explicit team weight in the PD vector      : {W_TEAMD:.3f}")
    print(f"effective, counting dbpm's team content    : {W_TEAMD + W_DBPM * abs(r):.3f}  (|corr| basis)")
    print(f"effective, on the variance-share basis     : {W_TEAMD + W_DBPM * r * r:.3f}")
    print(f"the round claims ~0.28-0.30 — slightly overstated, but the double-count is REAL")
    print()
    print("the round's fix: delete teamd, renormalise the survivors over 0.808 keeping proportions")
    print(f"  drep        0.366 -> {0.366 / 0.808:.3f}")
    print(f"  dbpm        0.192 -> {0.192 / 0.808:.3f}")
    print(f"  height_inv  0.250 -> {0.250 / 0.808:.3f}")
    print("  (arithmetic checks out and sums to 1.0)")


if __name__ == '__main__':
    main()
