"""THE FULL ATTRIBUTE AUDIT (all 17), report-only - nothing here changes a composite.

For every attribute: its terms and weights, whether any term is a TEAM-level quantity rather than a
player one, and what team exposure arrives by other routes. Then the two things worth naming:
each-stat-counts-once violations (a fact charged twice through two doors) with the effective double
weight quantified, and composites thin enough to be one stat wearing a composite's clothes.

Run:  python scripts/audit-attrs.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# attribute -> (terms with weights, team-level term?, team exposure by other routes)
TABLE = [
    ('3pt', '0.65 3PA/100 (era-adjusted) + 0.35 3P%; FT% fallback under 2 3PA/100; eye/gunner paths; high-volume premium',
     'none', 'era_mult is a LEAGUE 3PA rate (era normalisation, by design). No team term.'),
    ('rim', '0.65 paint-attempts/100 x creation_factor + 0.35 paint FG%; elite-conversion floor; high-volume premium; deadeye floor (r78 load-ramped)',
     'none', 'creation_factor reads ASSISTED SHARE - partly a teammate fact, not purely the man.'),
    ('mid', '0.65 mid-attempts/100 + 0.35 mid FG%; high-volume premium; deadeye floor (r78 load-ramped); +3.5 era bump for measured 2015+',
     'none', 'none beyond the era bump.'),
    ('ft', '100 x FT% - the raw stat itself (stated doctrine)', 'none', 'none.'),
    ('fouldraw', '1.00 percentile of FTr', 'none', 'none.'),
    ('orb', '1.00 percentile of ORB/100 (within size class) ^1.15', 'none', 'per-100 already normalises pace.'),
    ('drb', '1.00 percentile of DRB% ^1.15', 'none', 'DRB% is share-based, so teammate rebounders suppress it.'),
    ('playvol', '0.6 percentile(AST%)^1.12 + 0.4 linear(AST%/44)', 'none', 'AST% depends on teammates converting the pass.'),
    ('ballsec', '0.55 percentile(TOV%*25 / max(10, usg + 0.5 AST%)) + 0.45 percentile(TOV%)', 'none',
     'TOV% IS BOTH TERMS - see violation A.'),
    ('volume', '1.00 percentile(usg x (1 - TOV%/100)) ^1.15', 'none', 'TOV% again - see violation B.'),
    ('efficiency', '0.5 percentile(TS)^1.05 + 0.5 linear(TS - league TS)', 'none', 'league TS is a LEAGUE quantity (era normalisation).'),
    ('durability', '1.00 percentile of minutes played', 'none', 'minutes are a coach/roster fact as much as a player one.'),
    ('rimprot', 'ID = 0.55 BLK% + 0.25 height + 0.20 DBPM; +0.25 x drep; tracking rim-DFG blend; r53 voted ceiling',
     'none explicit', 'DBPM CARRIES TEAM DEFENCE (BPM 2.0 team adjustment) - see violation C. drep is league-vote reputation.'),
    ('perimdisrupt', '1.00 percentile of STL% ^1.30', 'none', 'none.'),
    ('height', 'raw inches', 'none', 'none - a physical fact.'),
    ('perdef', 'PD = 0.453 drep + 0.238 DBPM + 0.309 height_inv; no-vote shrink; tracking 6ft+ blend; 0.30 all-shots corroboration; voted band',
     'NONE (recal_76 removed the explicit team-DRtg term)', 'DBPM still carries team defence - accepted as the single door.'),
    ('discipline', '1.00 percentile of (1 - PF/100), within size class', 'none', "a big's role generates fouls; the size class handles it."),
]

THIN = [
    ('ft', 'FT% only - the raw stat, by stated doctrine'),
    ('fouldraw', 'FTr only'),
    ('orb', 'ORB/100 only'),
    ('drb', 'DRB% only'),
    ('perimdisrupt', 'STL% only'),
    ('discipline', 'PF/100 only'),
    ('durability', 'minutes only'),
    ('volume', 'usg and TOV% - one product, one percentile'),
    ('playvol', 'AST% ONLY, through two transforms (0.6 percentile + 0.4 linear) - reads as a blend, is one stat'),
    ('efficiency', 'TS ONLY, through two transforms (0.5 percentile + 0.5 era-relative) - same shape as playvol'),
]


def pearson(xs, ys):
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    n = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return n / (dx * dy) if dx and dy else 0.0


def main():
    prov = json.load(open(os.path.join(ROOT, 'data', 'provenance.json'), encoding='utf-8'))

    print('=' * 112)
    print('THE 17-ATTRIBUTE AUDIT - terms, team-level inputs, and team exposure by other routes')
    print('=' * 112)
    for name, terms, team, exposure in TABLE:
        print('\n%s' % name.upper())
        print('  terms      : %s' % terms)
        print('  team term? : %s' % team)
        print('  exposure   : %s' % exposure)

    print('\n' + '=' * 112)
    print('EACH-STAT-COUNTS-ONCE VIOLATIONS - a fact charged twice through two doors')
    print('=' * 112)

    # A. ballsec: TOV% is the numerator of the ratio AND the whole raw side.
    rows = []
    for m in prov.values():
        b = m.get('ballsec')
        if b and len(b) > 2 and None not in (b[0], b[1], b[2]):
            tov, usg, ast = b
            rows.append((tov * 25.0 / max(10.0, usg + 0.5 * ast), tov))
    rA = pearson([x[0] for x in rows], [x[1] for x in rows])
    effA = 0.45 + 0.55 * abs(rA)
    print('\nA. BALLSEC charges TOV%% twice   (n=%d)' % len(rows))
    print('   corr(ratio term, raw TOV%%) = %+.3f' % rA)
    print('   stated weights 0.55 ratio / 0.45 raw. The ratio NUMERATOR is TOV%, so the effective')
    print('   weight on TOV%% is 0.45 + 0.55 x %.3f = %.3f of a 1.00 composite.' % (abs(rA), effA))
    print('   usg and AST% enter ONLY as the denominator - a divisor of that same TOV%.')

    print('\nB. TOV%% ALSO drives VOLUME, and both attributes feed o_score')
    print('   volume = usg x (1 - TOV%/100); o_score weights volume 0.24 and ballsec 0.10.')
    print('   A turnover is charged in the shot-count AND in security - two doors, one fact.')

    dd = [(m['rimprot'][2], m['perdef'][1]) for m in prov.values()
          if m.get('rimprot') and m.get('perdef') and len(m['rimprot']) > 2 and len(m['perdef']) > 1
          and m['rimprot'][2] is not None and m['perdef'][1] is not None]
    eff_dbpm = 0.40 * 0.238 + 0.40 * 0.20
    print('\nC. DBPM is charged in BOTH rimprot and perdef, and d_score adds them   (n=%d)' % len(dd))
    print('   rimprot: ID carries DBPM at 0.20.   perdef: PD carries DBPM at 0.238.')
    print('   d_score (bigs) = 0.40 perdef + 0.40 rimprot')
    print('   -> effective DBPM weight in a big d_score = 0.40 x 0.238 + 0.40 x 0.20 = %.3f' % eff_dbpm)
    print('   AND DBPM carries the BPM 2.0 team adjustment, so TEAM DEFENCE still reaches d_score')
    print("   through rimprot's door after recal_76 closed perdef's explicit one.")
    print('   Using recal_76 own measurement, corr(team DRtg, DBPM) = -0.387:')
    print('   residual team-defence weight inside a big d_score ~= %.3f (|corr| basis).' % (eff_dbpm * 0.387))

    print('\n' + '=' * 112)
    print("THIN COMPOSITES - one stat wearing a composite's clothes")
    print('=' * 112)
    for n, why in THIN:
        print('  %-14s %s' % (n, why))
    print('\n  %d of 17 attributes are single-stat. Seven are honestly so; playvol and efficiency are' % len(THIN))
    print('  the two that LOOK like blends in the source and are not - worth knowing before any round')
    print('  proposes rebalancing weights that both point at the same number.')


if __name__ == '__main__':
    main()
