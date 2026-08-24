import random, statistics
random.seed(7)

# ---- Player: talent + 4 axes ----
# axes: IN=inside scoring, OUT=outside scoring, ID=interior D, PD=perimeter D
def P(name, talent, IN, OUT, ID, PD):
    return dict(name=name, T=talent, IN=IN, OUT=OUT, ID=ID, PD=PD)

# ---- Lineup compiles to a shape ----
def compile_lineup(five):
    n = len(five)
    T   = sum(p['T'] for p in five)/n
    IN  = sum(p['IN'] for p in five)/n
    OUT = sum(p['OUT'] for p in five)/n
    ID  = sum(p['ID'] for p in five)/n
    PD  = sum(p['PD'] for p in five)/n
    return dict(T=T, IN=IN, OUT=OUT, ID=ID, PD=PD)

# ---- Resolver ----
# margin = A_TAL*(Ta-Tb) + B_FIT*(Ma-Mb) + noise
# M = where-you-score weighted attack vs the matching defense
A_TAL = 0.25      # points of margin per point of avg talent gap
B_FIT = 0.25      # points of margin per point of net matchup edge
SIGMA = 14.0      # game-to-game noise (slightly juiced vs real NBA)

def matchup_edge(off, deff):
    share_in = off['IN'] / (off['IN'] + off['OUT'])
    share_out = 1 - share_in
    return share_in*(off['IN'] - deff['ID']) + share_out*(off['OUT'] - deff['PD'])

def sim_game(a, b):
    m = A_TAL*(a['T']-b['T']) + B_FIT*(matchup_edge(a,b)-matchup_edge(b,a)) + random.gauss(0, SIGMA)
    return 1 if m > 0 else 0

def sim_series(a, b, wins_needed=4):
    wa = wb = 0
    while wa < wins_needed and wb < wins_needed:
        if sim_game(a, b): wa += 1
        else: wb += 1
    return 1 if wa == wins_needed else 0

def rate(a, b, n=20000):
    g = sum(sim_game(a,b) for _ in range(n))/n
    s = sum(sim_series(a,b) for _ in range(n))/n
    return g, s

# ---- Archetype pool (10 players) ----
# Superstars (T≈95), all want the ball inside/outside, mediocre collective shape
stars = [
    P('Star slasher A', 96, 92, 55, 55, 60),
    P('Star slasher B', 95, 90, 50, 50, 55),
    P('Star iso wing',  95, 85, 70, 45, 60),
    P('Star scorer G',  94, 75, 88, 30, 55),
    P('Star big',       95, 95, 25, 85, 40),
]
# Perfectly schemed role players (T≈78) built to counter the stars: pack the paint
wall = [
    P('Rim protector',  80, 70, 25, 96, 45),
    P('Paint bruiser',  78, 65, 20, 92, 50),
    P('3&D wing A',     78, 45, 78, 55, 85),
    P('3&D wing B',     77, 40, 75, 50, 88),
    P('Point of attack',77, 45, 70, 40, 92),
]
# Two equal-talent (T=85) teams with opposite shapes
shooters = [P(f'Shooter{i}', 85, 45, 92, 45, 60) for i in range(5)]
perim_lock = [P(f'Lockdown{i}', 85, 70, 55, 60, 92) for i in range(5)]
neutral85 = [P(f'Neutral85_{i}', 85, 70, 70, 70, 70) for i in range(5)]
neutral75 = [P(f'Neutral75_{i}', 75, 62, 62, 62, 62) for i in range(5)]

L = compile_lineup
tests = [
    ("Talent gap only: 85s vs 75s (neutral shapes)", L(neutral85), L(neutral75)),
    ("Counter within tier: perimeter-lock vs shooters (both T=85)", L(perim_lock), L(shooters)),
    ("Sum vs scheme: 5 superstars vs perfect counter role-team (95 vs 78)", L(stars), L(wall)),
    ("Sanity: mirror match (85 vs 85 neutral)", L(neutral85), L(neutral85)),
]
print(f"{'scenario':62s} {'game':>6s} {'bo7':>6s}")
for name, a, b in tests:
    g, s = rate(a, b)
    print(f"{name:62s} {g:6.1%} {s:6.1%}")
