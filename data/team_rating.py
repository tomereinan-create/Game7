"""game7 team offense formula: usage reconciliation + skill curves + creation amplification.
All tunables in KNOBS. Players come from players_stats.json (needs usg_raw, ts_raw in attrs)."""
import json

KNOBS = dict(
    TEAM_USG      = 100.0,  # possessions must sum
    SLOPE_UP_MAX  = 0.9,    # % TS lost per usage pt gained, for a zero-creation player
    SLOPE_UP_MIN  = 0.25,   # same, for a perfect creator
    SLOPE_DOWN    = 0.55,   # % TS gained per usage pt shed... but only for efficient players (see gate)
    AMP_MAX       = 0.06,
    FIT_WIDEN     = 2.7,    # recal_64: the fit gap (interactions vs repriced-only) widened
    FIT_CAP       = 4.0,    # ...and capped: perfect fit +4, friction -4   # max TS multiplier bonus for low-usage players fed by elite creation
    FLOOR_USG     = 10.0,   # nobody can be squeezed below this share
)

def creation(a):   # 0..1: can this player create offense?
    # passqual removed: its 0.35 is dropped and the survivors renormalised over 0.65, so creation
    # now reads volume and ball security only.
    return (0.45*a['playvol'] + 0.20*a['ballsec']) / (0.65*99)

def team_offense(five):
    A = [p['attrs'] for p in five]
    u = [a['usg_raw'] for a in A]
    e = [a.get('ts_rel', a['ts_raw']) for a in A]   # era-relative TS: efficiency vs your own league
    c = [creation(a) for a in A]
    delta = KNOBS['TEAM_USG'] - sum(u)
    # distribute delta: extra usage goes to creators (weighted by creation x natural usage);
    # shed usage comes off everyone above the floor, proportional to excess over league-avg 20
    if delta >= 0:
        w = [max(0.05, ci)*ui for ci, ui in zip(c, u)]
    else:
        w = [max(0.0, ui - 12.0) for ui in u]
    W = sum(w) or 1.0
    u2 = [max(KNOBS['FLOOR_USG'], ui + delta*wi/W) for ui, wi in zip(u, w)]
    # renormalize tiny floor violations
    s = sum(u2); u2 = [x*KNOBS['TEAM_USG']/s for x in u2]
    # reprice efficiency along each player's skill curve
    e2 = []
    for ui, u2i, ei, ci in zip(u, u2, e, c):
        d = u2i - ui
        if d >= 0:
            slope = KNOBS['SLOPE_UP_MAX'] - (KNOBS['SLOPE_UP_MAX']-KNOBS['SLOPE_UP_MIN'])*ci
            e2.append(ei * (1 - slope*d/100))
        else:
            # shedding usage helps only players whose problem was LOAD, not shot selection:
            # refund scales with baseline efficiency above league-mediocre TS .530
            gate = min(1.0, max(0.0, (ei - 0.545)/0.10))   # gate recentered for the era-relative scale
            e2.append(ei * (1 + KNOBS['SLOPE_DOWN']*gate*(-d)/100))
    # creation amplification: catch-and-shoot players eat better next to great table-setters
    feed = sum(ci*u2i for ci, u2i in zip(c, u2)) / KNOBS['TEAM_USG']   # usage-weighted team creation
    e3 = [e2i * (1 + KNOBS['AMP_MAX']*feed*max(0.0, 1 - u2i/30)) for e2i, u2i in zip(e2, u2)]
    # ---- Tomer's offense interactions ----
    outs = [a['3pt'] for a in A]
    e4 = []
    for i, (a, u2i, ei) in enumerate(zip(A, u2, e3)):
        x = ei
        # (1) usage is bad at BOTH extremes: squeezed players can't express skill; overloaded ones degrade
        if u2i < 13: x *= 1 - 0.010*(13 - u2i)
        if u2i > 32: x *= 1 - 0.006*(u2i - 32)
        # (2) paint logic — paint-DEPENDENT means diet, not rating: no outside game
        if a['3pt'] < 40 and a['mid'] < 45:
            spc = sum(max(0, outs[j]-55) for j in range(5) if j != i) / (4*44)     # teammates' spacing 0..1
            x *= 1 - 0.07*(1 - min(1.0, spc/0.55))                                  # (2a) low spacing clogs the paint
            if a['usg_raw'] < 20:   # (2b-i) finisher: needs a creator who shoots (pull-up gravity opens the roll)
                best_feed = max(creation(A[j]) * outs[j]/99 for j in range(5) if j != i)
                x *= 1 + 0.06*best_feed
            elif a['usg_raw'] >= 24:  # (2b-ii) hub: kicks out -> benefits from shooters
                x *= 1 + 0.05*min(1.0, spc/0.55)
        x = ei * min(1.12, max(0.90, x/ei))   # cap total interaction stack per player
        e4.append(x)
    OFF_N = sum(u2i*e2i for u2i, e2i in zip(u2, e2)) * 2   # repriced, no interaction channels
    OFF_F = sum(u2i*e4i for u2i, e4i in zip(u2, e4)) * 2
    fit = min(KNOBS['FIT_CAP'], max(-KNOBS['FIT_CAP'], KNOBS['FIT_WIDEN']*(OFF_F - OFF_N)))
    OFF = OFF_N + fit
    # (3) fouldraw x FT: manufactured points (matchup-discipline interaction reserved for the matchup layer)
    OFF += sum(u2i * (a['fouldraw']/99) * (a['ft']/100) for u2i, a in zip(u2, A)) * 0.06
    # (4) ORB feeds on misses: the lower the team's shooting, the more second chances the glass reclaims
    wTS = sum(u2i*e4i for u2i, e4i in zip(u2, e4)) / KNOBS['TEAM_USG']
    miss_factor = min(1.5, max(0.5, (0.60 - wTS)/0.08 + 1.0))
    OFF *= 1 + 0.0012 * sum(max(0, a['orb']-50) for a in A) * miss_factor
    return OFF, list(zip([p['name'] for p in five], [round(x,1) for x in u2], [round(100*x,1) for x in e4]))

P = {p['name']: p for p in json.load(open('players_stats.json'))}
def five(*names): return [P[n] for n in names]

LINEUPS = {
 'GOAT5  (5 all-time creators)':  five('Michael Jordan','LeBron James','Stephen Curry',"Shaquille O'Neal",'Giannis Antetokounmpo'),
 'BALANCED (2 stars + 3 elite role)': five('Stephen Curry','LeBron James','Kyle Korver','Shane Battier','Rudy Gobert'),
 'ROLE5  (5 elite role players)': five('Kyle Korver','Shane Battier','Bruce Bowen','P.J. Tucker','Rudy Gobert'),
 'CHUCK5 (5 high-usage low-eff)': five('Allen Iverson','Russell Westbrook','DeMar DeRozan','Carmelo Anthony','Trae Young'),
}
print(f"{'lineup':38s} {'TeamOFF':>8s}")
for name, L in LINEUPS.items():
    off, detail = team_offense(L)
    print(f"{name:38s} {off:8.1f}")
    for nm, uu, ee in detail: print(f"    {nm:24s} usg {uu:5.1f}  TS {ee:4.1f}")

# ---------- DEFENSE v2 + NET ----------
DKNOBS = dict(
    W_BASE=0.40, W_ANCHOR=0.25, W_PRESS=0.20, W_WEAK=0.15,
    ANCHOR_2ND=0.35,     # redundancy: second rim protector partial credit
    WEAK_MITIG=0.45,     # how much an elite anchor covers the weakest link
    PRESS_DISC_GATE=0.5, # pressure value floor without discipline (gambling tax)
    DRB_STOP=0.045,      # stop-completion: DRtg improvement per excess DRB pt
    DISC_FREEPTS=0.030,  # free points allowed per pt of indiscipline below 55
    TRANSITION=0.020,    # OFF pts per pt of perimdisrupt above 55 (steals score)
)
def team_defense(five):
    A = [p['attrs'] for p in five]
    di = [a['perdef'] for a in A]
    rp = sorted((a['rimprot'] for a in A), reverse=True)
    anchor = rp[0] + DKNOBS['ANCHOR_2ND']*rp[1]*(rp[1]/99)          # 2nd anchor: discounted, only if genuinely elite
    press  = sum(a['perimdisrupt']*(DKNOBS['PRESS_DISC_GATE'] + (1-DKNOBS['PRESS_DISC_GATE'])*a['discipline']/99) for a in A)/5
    weak   = min(di) * (1 + DKNOBS['WEAK_MITIG']*min(1.0, anchor/110))   # anchor lifts the hunted man's effective floor
    didx   = DKNOBS['W_BASE']*sum(di)/5 + DKNOBS['W_ANCHOR']*min(99, anchor)*0.9 + DKNOBS['W_PRESS']*press + DKNOBS['W_WEAK']*min(99, weak)
    drtg   = 118 - 0.14*didx
    drtg  -= DKNOBS['DRB_STOP']  * sum(max(0, a['drb']-50) for a in A)/5 * 1.0    # stops completed on the glass
    drtg  += DKNOBS['DISC_FREEPTS']*sum(max(0, 55-a['discipline']) for a in A)/5*3 # fouls = free points
    return didx, drtg

def transition_bonus(five):
    return DKNOBS['TRANSITION'] * sum(max(0, p['attrs']['perimdisrupt']-55) for p in five)

def team_net(five):
    off, _ = team_offense(five)
    off += transition_bonus(five)
    didx, drtg = team_defense(five)
    return off - drtg, off, didx, drtg

print(f"\n{'lineup':38s} {'OFF':>6s} {'Didx':>5s} {'DRtg':>6s} {'NET':>6s}")
for name, L in LINEUPS.items():
    net, off, didx, drtg = team_net(L)
    print(f"{name:38s} {off:6.1f} {didx:5.1f} {drtg:6.1f} {net:+6.1f}")

# ---------- MATCHUP DEFENSE: defense is a property of a PAIRING, not a lineup ----------
MKNOBS = dict(
    HIDE_OUT=45,        # opponent with out below this = credible hiding spot for the anchor
    ANCHOR_CAP=37.5,    # protection capacity: ~1.5 bad defenders' worth of perdef deficit
    ONBALL_SPLIT=0.6,   # steals: 60% on-ball (matchup-driven), 40% team/passing-lane
    HUNT_SCALE=0.10,    # DRtg pts per unit of hunted-man exposure
    DRTG_COEF=0.181,     # calibrated to his 60/40 offense/defense ruling (see calibration below)
)
# recal_60: EVERY PAIRING GENERATES EDGE — mirrors offense.ts pairingEdge/pairingTable/pairingTerm/bestBoard.
def pairing_edge(a, b, atk_usg):
    w_out = b['3pt'] / (b['3pt'] + b['rim'] + 1e-9)
    zone = w_out * (b['3pt'] - a['perdef']) + (1 - w_out) * (b['rim'] - a['rimprot'])
    size = max(-4.0, min(6.0, (b.get('height', 78) - a.get('height', 78)) * 0.6))   # the synthetic REF five carries no height
    return max(-6.0, min(6.0, (zone * 0.09 + size * 0.35) * min(1.5, atk_usg / 20.0)))

def pairing_table(A, B, b_usg):
    return [[pairing_edge(a, b, b_usg[j]) for j, b in enumerate(B)] for a in A]

def pairing_term(E, mp, b_usg):
    tot = sum(b_usg) or 1.0
    n = len(E)
    t = 0.0
    for i, j in enumerate(mp):
        col = sum(E[r][j] for r in range(n)) / n
        t += (b_usg[j] / tot) * (E[i][j] - col)
    return t

def best_board(E, b_usg):
    import itertools
    n = len(E)
    return min(itertools.permutations(range(n)), key=lambda mp: pairing_term(E, mp, b_usg))

PAIR_SCALE = 22.3   # sized with offense.ts so the full team lever spans ~+-3.5 margin

def defense_vs(us, them):
    """DRtg of US defending THEM (lower = better), plus our steal generation vs their handlers."""
    A = [p['attrs'] for p in us]; B = [p['attrs'] for p in them]
    b_usg = [b['usg_raw'] for b in B]
    star = max(range(5), key=lambda j: b_usg[j])
    paint_orient = sum(b['rim']*u for b, u in zip(B, b_usg)) / max(1, sum((b['rim']+b['3pt'])*u for b, u in zip(B, b_usg)))
    # ANCHOR: hidden on their least-shooting player (defense chooses matchups); degrades vs 5-out
    rp = sorted(((a['rimprot'], i) for i, a in enumerate(A)), reverse=True)
    anchor_raw = rp[0][0] + 0.35*rp[1][0]*(rp[1][0]/99)
    min_opp_out = min(b['3pt'] for b in B)
    hide = 1.0 if min_opp_out < MKNOBS['HIDE_OUT'] else max(0.15, 1 - (min_opp_out - MKNOBS['HIDE_OUT'])/50)
    anchor = anchor_raw * hide
    # PROTECTION: covers multiple holes up to capacity, but ONLY against paint-hunting offense
    others = [a['perdef'] for i, a in enumerate(A) if i != rp[0][1]]
    deficit = sum(max(0, 60-d) for d in others)
    cover = min(deficit, MKNOBS['ANCHOR_CAP']*(anchor/99)) * min(1.0, paint_orient*2)
    eff_di = (sum(a['perdef'] for a in A) + cover)/5
    # recal_60: the lone hunted-man term is generalized — every pairing generates edge, the board is
    # the best of all 120, and the penalty is RELATIVE TO PERFECT COACHING (the best board pays 0).
    E = pairing_table(A, B, b_usg)
    bb = best_board(E, b_usg)
    hunt_pen = PAIR_SCALE * (pairing_term(E, list(bb), b_usg) - pairing_term(E, list(bb), b_usg))
    # STEALS: on-ball vs their star handler (ballsec x usage), plus team pressure; no discipline gate
    top_pd = max(a['perimdisrupt'] for a in A)
    onball = top_pd * ((99-B[star]['ballsec'])/99) * (b_usg[star]/25)
    steals = MKNOBS['ONBALL_SPLIT']*onball + (1-MKNOBS['ONBALL_SPLIT'])*sum(a['perimdisrupt'] for a in A)/5
    # GLASS: our top-2 DRB (diminishing) vs their ORB crash (counts deeper vs crash teams)
    d = sorted((a['drb'] for a in A), reverse=True); o = sorted((b['orb'] for b in B), reverse=True)
    glass = (d[0] + 0.5*d[1] + 0.1*sum(d[2:])) - (o[0] + 0.5*o[1] + 0.25*sum(o[2:]))
    didx = 0.42*eff_di + 0.26*anchor*0.9 + 0.20*min(99, steals)*0.9 + 0.12*max(0, 60 + glass/4)
    drtg = 110 - MKNOBS['DRTG_COEF']*(didx - 55) + hunt_pen   # rebased: coef scales DIFFERENCES
    drtg += 0.030*sum(max(0, 55-a['discipline']) for a in A)/5*3
    return drtg, min(99, steals)

def score_vs(us, them):
    OFF, _ = team_offense(us)
    drtg, steals = defense_vs(us, them)
    return OFF + 0.024*steals - drtg

def matchup_margin(us, them):
    return score_vs(us, them) - score_vs(them, us)

# ---------- 0-100 TEAM RATINGS (opponent-independent) + MATCHUP SWING ----------
def _ref(name, **kw):
    base = dict(**{'3pt':55}, rim=50, mid=50, ft=76, fouldraw=50, orb=30, drb=45, playvol=45,
                ballsec=55, usage=50, efficiency=55, durability=60,
                rimprot=30, perimdisrupt=50, perdef=52, discipline=55,
                rim_mid_measured=True, usg_raw=20.0, ts_raw=0.570, ts_rel=0.570)
    base.update(kw); return dict(name=name, attrs=base)
# realistic league-average five: shapes exist, so anchors/hunts/steals register against it
REF_FIVE = [
    _ref('Avg PG', usg_raw=24.0, **{'3pt':62}, playvol=78, ballsec=62, perimdisrupt=58, drb=35),
    _ref('Avg SG', usg_raw=22.0, **{'3pt':60}, mid=55, perimdisrupt=55),
    _ref('Avg SF', usg_raw=20.0, **{'3pt':55}, mid=55, perdef=55, drb=50),
    _ref('Avg PF', usg_raw=18.0, **{'3pt':45}, rim=60, rimprot=52, drb=60, orb=50),
    _ref('Avg C',  usg_raw=16.0, **{'3pt':25}, rim=68, rimprot=68, drb=68, orb=62, ft=66, fouldraw=58),
]

# EMPIRICAL anchoring: 50 = the MEDIAN of plausible drafted fives (sampled from the pool),
# not the synthetic REF (which had no weak link -> whole population read as bad defense).
_REF_OFF, _REF_DRTG = 128.3, 113.1
RATING_SCALE = dict(K_OFF=3.0, K_DEF=8.0)

def ratings_100(five):
    """Opponent-independent OFF and DEF, 1-99. 50 = league-average five; GOAT-tier ~97."""
    off, _ = team_offense(five)
    drtg_ref, _ = defense_vs(five, REF_FIVE)
    off100 = round(max(1, min(99, 50 + (off - _REF_OFF) * RATING_SCALE['K_OFF'])))
    def100 = round(max(1, min(99, 50 + (_REF_DRTG - drtg_ref) * RATING_SCALE['K_DEF'])))
    return off100, def100

def matchup_swing(us, them):
    """How many pts/game THIS pairing shifts vs both teams' neutral baselines. Positive = the matchup favors US."""
    base = (score_vs(us, REF_FIVE) - score_vs(them, REF_FIVE))
    actual = matchup_margin(us, them)
    return actual - base
