"""recal_105 — where do the Bulls '96 actually sit on offence, engine vs truth?
His ruling: "Teams rating is still off. Bulls 96 only 75 OVR"."""
import io, json, os
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(io.open(os.path.join(HERE, 'joined.json'), encoding='utf8'))
BS = defaultdict(list)
for x in d:
    BS[x['y']].append(x)


def show(y, name):
    g = BS[y]
    me = [x for x in g if name in x['team']][0]
    ro = sorted(g, key=lambda z: -z['offRaw'])
    rt = sorted(g, key=lambda z: -z['truth']['ortg'])
    rd = sorted(g, key=lambda z: z['drtgRef'])
    mu = sum(z['offRaw'] for z in g)/len(g)
    sd = (sum((z['offRaw']-mu)**2 for z in g)/max(1, len(g)-1))**0.5
    print("%-26s %d  offRaw %.2f (season mu %.2f sd %.2f, z %+.2f)  ENGINE off rank %2d/%d | TRUTH ORtg %.1f rank %2d/%d | ENGINE def rank %2d | dial OFF %2d DEF %2d"
          % (me['team'], y, me['offRaw'], mu, sd, (me['offRaw']-mu)/sd,
             ro.index(me)+1, len(g), me['truth']['ortg'], rt.index(me)+1, len(g), rd.index(me)+1, me['off'], me['def']))


for y, n in ((1996, 'Bulls'), (1997, 'Bulls'), (1998, 'Bulls'), (2017, 'Warriors'), (2007, 'Suns'),
             (1987, 'Lakers'), (1986, 'Celtics'), (2014, 'Spurs'), (2005, 'Suns'), (2026, 'Thunder'),
             (2024, 'Celtics'), (2013, 'Heat')):
    show(y, n)

print()
print("=== 1996, every team: engine offRaw vs real ORtg ===")
g = sorted(BS[1996], key=lambda z: -z['offRaw'])
print('%-26s %9s %6s | %9s %6s | %8s' % ('team', 'offRaw', 'rank', 'realORtg', 'rank', 'dialOFF'))
rt = sorted(g, key=lambda z: -z['truth']['ortg'])
for i, x in enumerate(g):
    print('%-26s %9.2f %6d | %9.1f %6d | %8d' % (x['team'], x['offRaw'], i+1, x['truth']['ortg'], rt.index(x)+1, x['off']))
