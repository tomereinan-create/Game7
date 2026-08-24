"""Parity harness for the duplicated team engine (audit ruling 4).

Reads a JSON list of lineups (each a list of five player names) on stdin, scores every
pairing through data/team_rating.py — the design side's reference implementation — and
prints one JSON object per lineup pair: {off, drtg, net, margin}. tests/parity.test.ts
feeds the same lineups through src/engine/offense.ts and fails if any figure differs by
more than 0.5 points. Read-only: this file computes, it never writes ratings.

    python data/parity_check.py < lineups.json
"""
import io, json, os, re, sys

_here = os.path.dirname(os.path.abspath(__file__))
src = io.open(os.path.join(_here, 'team_rating.py'), encoding='utf-8').read()
head = src.split("P = {p['name']")[0]
tail = src[src.index('# ---------- DEFENSE v2'):]
tail = re.sub(r"^print\(.*\n", "", tail, flags=re.M)
tail = re.sub(r"^for name, L in LINEUPS.*\n(^[ \t].*\n)*", "", tail, flags=re.M)
exec(head)
exec(tail)

players = {p['name']: p for p in json.load(io.open(os.path.join(_here, '..', 'src', 'data', 'players_stats.json'), encoding='utf-8'))}
pairs = json.load(sys.stdin)
out = []
for a_names, b_names in pairs:
    A = [players[n] for n in a_names]
    B = [players[n] for n in b_names]
    off_a, _ = team_offense(A)
    drtg_a, st_a = defense_vs(A, B)
    out.append(dict(off=off_a, drtg=drtg_a, steals=st_a, net=score_vs(A, B), margin=matchup_margin(A, B)))
print(json.dumps(out))
