"""recal_79 (design-side round "71") — the ballsec AST/TOV probe.

Reproduces the round's premise and its red-line failure without touching the pipeline.

Our shipped formula (CONFIRMED to match the round exactly — the first time in five rounds):
    ratio   = tov_pct * 25 / max(10, usg + 0.5*ast)
    ballsec = sc(1 - (0.55*P_ratio + 0.45*P_tov))

The round's fix: 0.5*ast -> 0.8*ast in the denominator, and shrink the raw side for efficient
passers only:  credit = clamp((ast_tov - 1.5)/2.5, 0, 1);  w_raw = 0.45 - 0.20*credit.

Run:  python scripts/ballsec79.py
"""
import csv, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    cards = {p['name']: p for p in json.load(open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf-8'))}
    p100 = {}
    for r in csv.DictReader(open(os.path.join(ROOT, 'data', 'bref', 'Per 100 Poss.csv'), encoding='utf-8')):
        if r['lg'] != 'NBA':
            continue
        try:
            k = (r['player'], int(r['season']))
            if r['team'] == 'TOT' or k not in p100:
                p100[k] = (float(r['ast_per_100_poss'] or 0), float(r['tov_per_100_poss'] or 0))
        except (TypeError, ValueError):
            pass

    def ratio(c):
        A, T = p100.get((c['player'], c['peak_season']), (0, 0))
        return A / T if T else 0.0

    print('AST/TOV and the round\'s credit for every named man (credit 0 at 1.5, full at 4.0):')
    for nm in ["John Stockton '97", "John Stockton '90", "Chris Paul '09", "Steve Nash '07",
               "Magic Johnson '90", "Magic Johnson '89", "James Harden '19",
               "Russell Westbrook '17", "Michael Jordan '89"]:
        c = cards.get(nm)
        if not c:
            print(f'  {nm:22s} NOT IN POOL')
            continue
        r = ratio(c)
        credit = max(0.0, min(1.0, (r - 1.5) / 2.5))
        print(f'  {nm:22s} AST/TOV {r:4.2f}  credit {credit:4.2f}  w_raw {0.45 - 0.20 * credit:.3f}  shipped ballsec {c["attrs"]["ballsec"]:2d}')

    print()
    print('THE RED LINE: the round requires Harden \'19 and Westbrook \'17 to move <= 2.')
    wb = ratio(cards["Russell Westbrook '17"])
    print(f"  Westbrook '17 sits at AST/TOV {wb:.2f}, ABOVE the round's own 1.5 credit floor, so he")
    print(f'  necessarily takes credit {max(0.0, min(1.0, (wb - 1.5) / 2.5)):.2f} — the round assumed "near credit 0".')
    print('  Measured in full pipeline runs: he moves +5 with both parts, +3 with part 2 alone.')
    print(f'  For him to sit at credit 0 the floor must be >= {wb:.2f}; a floor of 2.0 would zero him')
    print("  while costing Stockton '97 only 0.06 of credit. RECORDED, NOT APPLIED.")

if __name__ == '__main__':
    main()
