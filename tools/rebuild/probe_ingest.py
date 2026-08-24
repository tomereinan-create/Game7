"""MILESTONE 1: does a fresh loader reproduce the raw inputs the lost pipeline recorded?

The provenance sidecar stores, per card, the exact statistics each attribute was computed from. If a
rebuilt loader can reproduce those numbers for every card, the ingestion half of the file is correct
and only the formulas remain. This checks a sample across eras and positions.
"""
import csv, io, json, os
from collections import defaultdict

BREF = r'C:\Users\tomer\AppData\Local\Temp\claude\C--Users-tomer-Desktop\213b1108-7de9-4ece-b091-d21781a1f07f\scratchpad\bref'
GAME7 = r'C:\Users\tomer\Desktop\game7'
f = lambda x: None if x in ('', None, 'NA') else float(x)

def load(name):
    return list(csv.DictReader(io.open(os.path.join(BREF, name), encoding='utf-8')))

adv = load('Advanced.csv')
per100 = load('Per 100 Poss.csv')
career = load('Player Career Info.csv')
shoot = load('Player Shooting.csv')

# index by (player_id, season)
A = {(r['player_id'], r['season']): r for r in adv if r.get('tm') != 'TOT' or True}
P = {(r['player_id'], r['season']): r for r in per100}
S = {(r['player_id'], r['season']): r for r in shoot}

prov = json.load(io.open(os.path.join(GAME7, 'data', 'provenance.json'), encoding='utf-8'))
ps = json.load(io.open(os.path.join(GAME7, 'src', 'data', 'players_stats.json'), encoding='utf-8'))
BY = {p['name']: p for p in ps}

SAMPLE = ["Stephen Curry '16", "Shaquille O'Neal '00", "Michael Jordan '89", "Rudy Gobert '19",
          "Kareem Abdul-Jabbar '80", "Trae Young '22", "Dennis Rodman '92", "Victor Wembanyama '25"]

print(f"{'card':<26} {'usg':>6} {'tov':>6} {'ast':>6} {'ts':>7} {'mp':>7}   verdict")
ok = 0
for n in SAMPLE:
    card = BY.get(n)
    m = prov.get(n)
    if not card or not m:
        print(f'{n:<26} MISSING from the oracle')
        continue
    yr = str(card['peak_season'])
    # find this player's row for that season by name match (the pipeline keyed on player_id; we do not
    # know his id yet, so match on the bare name and the season)
    bare = n.rsplit(" '", 1)[0]
    rows = [r for r in adv if r['season'] == yr and r['player'] == bare]
    if not rows:
        print(f'{n:<26} no Advanced row for {yr}')
        continue
    r = max(rows, key=lambda x: float(x.get('mp') or 0))
    got = (f(r.get('usg_percent')), f(r.get('tov_percent')), f(r.get('ast_percent')), f(r.get('ts_percent')), f(r.get('mp')))
    want = (m['volume'][0], m['ballsec'][0], m['playvol'][0], m['efficiency'][0], m['durability'][0])
    match = all(g is not None and w is not None and abs(g - w) < 0.051 for g, w in zip(got, want))
    ok += match
    print(f'{n:<26} {got[0]:>6} {got[1]:>6} {got[2]:>6} {got[3]:>7} {got[4]:>7}   {"MATCH" if match else "want " + str(want)}')
print(f'\n{ok}/{len(SAMPLE)} cards reproduce their recorded inputs from the CSVs')
