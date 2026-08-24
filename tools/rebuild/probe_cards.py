"""MILESTONE 2: reproduce the exact set of 10,000 cards.

The card set is decided by three rules — which seasons count, which rows count, and how a traded
season is folded together. Getting the SET right before any formula is written means every later
comparison is card-for-card against the oracle.
"""
import csv, io, json, os
from collections import defaultdict

BREF = r'C:\Users\tomer\AppData\Local\Temp\claude\C--Users-tomer-Desktop\213b1108-7de9-4ece-b091-d21781a1f07f\scratchpad\bref'
GAME7 = r'C:\Users\tomer\Desktop\game7'
f = lambda x: None if x in ('', None, 'NA') else float(x)
adv = list(csv.DictReader(io.open(os.path.join(BREF, 'Advanced.csv'), encoding='utf-8')))

ps = json.load(io.open(os.path.join(GAME7, 'src', 'data', 'players_stats.json'), encoding='utf-8'))
want = {p['name'] for p in ps}
print(f'oracle: {len(want):,} cards')

def card_name(player, season):
    return f"{player} '{str(season)[-2:]}"

for floor in (1000, 1200, 1500):
    for mode in ('tot-first', 'sum-rows'):
        got = set()
        by = defaultdict(list)
        for r in adv:
            yr = int(r['season'])
            if yr < 1980:
                continue
            by[(r['player_id'], yr)].append(r)
        for (pid, yr), rows in by.items():
            tot = next((x for x in rows if x.get('tm') in ('TOT', '2TM', '3TM', '4TM', '5TM')), None)
            row = tot if (mode == 'tot-first' and tot) else max(rows, key=lambda x: f(x.get('mp')) or 0)
            mp = f(row.get('mp')) or 0
            if mode == 'sum-rows' and not tot:
                mp = sum(f(x.get('mp')) or 0 for x in rows)
            if mp >= floor:
                got.add(card_name(row['player'], yr))
        hit = len(got & want)
        print(f'  floor {floor:>4} / {mode:<9}: {len(got):>6,} cards, {hit:>6,} match the oracle '
              f'({100*hit/len(want):.1f}% of it), {len(got - want):>5} extra, {len(want - got):>5} missing')
