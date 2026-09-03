"""recal_119 — add the round's two pins to data/anchors.json, programmatically (the file is
rebuilt by the integrator, so it is never hand-merged)."""
import io, json

p = 'data/anchors.json'
a = json.load(io.open(p, encoding='utf-8'))
P = {q['name'] for q in json.load(io.open('src/data/players_stats.json', encoding='utf-8'))}
kp = [n for n in P if n.startswith('Kristaps') and n.endswith("'24")]
assert len(kp) == 1, kp
FIVE = ["Derrick White '24", "Jaylen Brown '24", "Jayson Tatum '24", kp[0], "Al Horford '24"]
assert all(n in P for n in FIVE), FIVE
RULING = "For the scout, I agree with 3,4,5,6,7"
new = [
    {
        "kind": "team_rank", "season": 2024, "ab": "BOS", "scale": "team:off", "max_rank": 10,
        "round": 119, "ruling": RULING,
        "note": "THE ROUND'S OWN FINDING, pinned, because the DIAL it declined on is not pinnable. "
                "His item 7 asked for team OFF 55 -> near 72; recal_119 reached 56 and DECLINED the "
                "rest (data/rounds/119.json carries the full size frontier). What the round DID move "
                "is the rank the complaint was really about: the Celtics '24 read 12th of the 26 "
                "fieldable 2024 fives on offence against a real ORtg rank of 1st, and they read 9th "
                "now. The bound is 10 rather than 3 because 9th is where the possession-loss channel "
                "honestly puts them - the cards carry only ~45% of the turnover signal, measured "
                "against an oracle channel reading the real TOV%."
    },
    {
        "five": FIVE, "season": 2024, "scale": "team:defdial", "target": 65, "tol": 3,
        "round": 119, "ruling": RULING,
        "note": "THE OTHER HALF OF THE SUBJECT'S ROW, pinned so a later OFF round cannot pay for its "
                "offence out of the defence's pocket. recal_119 moved 0 of 1,255 DEF dials and "
                "drtgRef is bit-identical on all of them; this records that the Celtics '24 DEF dial "
                "read 65 before and after."
    },
]
a.extend(new)
json.dump(a, io.open(p, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
print('anchors now %d - fifth man %s' % (len(a), kp[0]))
