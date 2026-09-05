"""game7 team offense formula: usage reconciliation + skill curves + creation amplification.
All tunables in KNOBS. Players come from players_stats.json (needs usg_raw, ts_raw in attrs)."""
import json

KNOBS = dict(
    TEAM_USG      = 100.0,  # possessions must sum
    SLOPE_UP_MAX  = 0.9,    # % TS lost per usage pt gained, for a zero-creation player
    SLOPE_UP_MIN  = 0.25,   # same, for a perfect creator
    SLOPE_DOWN    = 0.55,   # % TS gained per usage pt shed... but only for efficient players (see gate)
    AMP_MAX       = 0.26,   # recal_140: 0.22 -> 0.26, now applied to each man's RECEIVED feed
    FEED_REF      = 0.5502, # recal_140: re-derived pool mean of the usage-weighted RECEIVED feed
    CREATE_SHARE  = 0.20,   # recal_140: the share of a man's shot quality set by the best creator
                            # BESIDE him rather than by himself — the pass-through. See the block below.
    CLOG_FREE     = 0.71,   # recal_110: a man who creates at this level makes his own space
    FIT_WIDEN     = 2.7,    # recal_64: the fit gap (interactions vs repriced-only) widened
    FIT_CAP       = 4.0,    # ...and capped: perfect fit +4, friction -4   # max TS multiplier bonus for low-usage players fed by elite creation
    FLOOR_USG     = 10.0,   # nobody can be squeezed below this share
    # recal_119 — POSSESSION LOSS. TOVhat = TOV_INT - TOV_SLOPE*wball, the OLS of every fieldable
    # five's real team TOV% on its usage-weighted ball security (1,255 fives, pooled r -0.500,
    # within-season rho -0.718). TOV_REF is the league's own mean, so the channel redistributes
    # around it exactly as FEED_REF does for creation.
    TOV_INT       = 18.10,  # % turnovers at ball security 0
    TOV_SLOPE     = 0.0744, # % turnovers shed per point of usage-weighted ball security
    TOV_REF       = 13.78,  # the league's own mean TOV% over all 1,255 fives — the pivot
    TOV_SIZE      = 0.45,   # HOW MUCH of the fitted differential is priced — ANCHOR-BOUND, not fit-chosen
    TOV_LO        = 9.0,    # rails, just outside the observed league range (9.9 .. 18.7)
    TOV_HI        = 19.0,
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
    # CREATION AMPLIFICATION — recal_110, his ruling: "there is more work to do" (on the Bulls '96
    # reading 8th of 29 on offence while the real 1996 board has them 1st) and "How is this team 47
    # OFF with 2 all time great players" (Lakers '00). Three things were wrong with this one line.
    #
    #   (1) IT WAS THROTTLED BY max(0, 1 - u2/30), so a five's creation was credited only to its
    #       LOW-usage men. That is backwards: a great table-setter's passing raises the quality of
    #       every shot on the floor, and most of a team's shots are taken by its high-usage men.
    #       The Bulls '96 feed is 0.640 against Seattle '96's 0.517 — the widest gap on that board —
    #       and Jordan at 28.7 usage was allowed 4% of it.
    #   (2) IT WAS IN THE WRONG PLACE. OFF_N (below) is built from e2 and nothing else, and e3/e4
    #       reach OFF only through `fit`, which is clamped to +-4. Shot quality created by the five's
    #       passers is part of the BASELINE, not a +-4 fit bonus, so e3 is what OFF_N now reads.
    #       Measured on all 1,255 fieldable team-seasons, that one move is most of the round.
    #   (3) 0.06 WAS TOO SMALL to separate a creator-led five from five average men, and as a bare
    #       multiplier it INFLATED rather than redistributed: at (1 + AMP*feed) the fives with the
    #       most offence and the most creation gained the most absolute points, the Warriors '17
    #       summit ran away, and the Bulls rose from 8th to 5th of 1996 while their DIAL FELL 68 ->
    #       66. Centring on the league's own mean feed (FEED_REF, the mean over all 1,255 fieldable
    #       fives) holds the level and the spread and lets only the differential land. 0.22 was
    #       chosen on the fit, not on the two named cases: the within-season Spearman of offRaw
    #       against real ORtg over 47 seasons goes 0.726 -> 0.762, the largest OFF fit gain in the
    #       ledger. It is still rising at 0.28 (+0.004); 0.22 is where the named cases land and the
    #       knob stays a ~3% TS swing across the league's whole feed range.
    #
    # recal_140 — THE FEED IS RECEIVED, NOT AVERAGED. His ruling: "Suns 05 agree" (the '05 Suns,
    # real ORtg 114.5 and 1st of 30, reading team OFF 65). recal_110 left the amplification as ONE
    # number for the whole five: the usage-weighted MEAN creation. That aggregate is diluted by the
    # men a creator sets UP — Nash '05 creates at .827 on 20.9 usage while Stoudemire finishes at
    # .328 on 27.6, so the five's feed came out .510, BELOW the league mean, and the term charged
    # the best passing offence of 2005 a small penalty for having a finisher. A finisher's shots are
    # the creator's shots; his shot quality is not his own passing rate.
    #
    # So the feed is now a PROPERTY OF THE SHOOTER, not of the five: each man is amplified by
    #     recv_i = (1 - CREATE_SHARE)*c_i + CREATE_SHARE*max_{j != i} c_j
    # — part his own creation, part the best creation available BESIDE him. FEED_REF is re-derived
    # as the pool mean of the usage-weighted recv over all 1,255 fieldable fives, so the term still
    # redistributes around the league and the mean multiplier is 1.0000 by construction.
    #
    # WHAT WAS MEASURED, AND WHAT WAS REFUTED. The ruling's stronger reading — "let the TOP creator
    # anchor the feed" — is refuted by the data twice over. (a) On the amplification term's own
    # truth column (bref ts_percent minus the five's usage-weighted ts_raw, season-centred over
    # 1,255 fives) the shipped feed reads r +0.086 and the TOP creator's rate reads r -0.046: the
    # five's mean carries the signal, the maximum carries none. (b) On the within-season residual of
    # offRaw against real ORtg the top creator reads +0.023 — the engine already, if anything,
    # OVER-pays a lone great creator. Sharpening the feed toward the maximum (weights c^G u2,
    # G = 1..12) costs fit at every G: 0.7764 -> 0.7585 at G=2, 0.7529 at G=8. A small pass-through
    # is what the fit will carry, and CREATE_SHARE = 0.20 is inside the flat top of that curve.
    #
    # 0.26 replaces 0.22 because the predictor changed; both were chosen the same way, on the
    # within-season Spearman of offRaw against real ORtg over the 47 seasons: 0.7764 -> 0.7782.
    # Everything larger breaks a pin — see data/rounds/140.json for the frontier and the decline.
    n = len(A)
    recv = [(1 - KNOBS['CREATE_SHARE'])*ci
            + KNOBS['CREATE_SHARE']*max([c[j] for j in range(n) if j != i] or [0.0])
            for i, ci in enumerate(c)]
    e3 = [e2i * (1 + KNOBS['AMP_MAX']*(ri - KNOBS['FEED_REF'])) for e2i, ri in zip(e2, recv)]
    # ---- Tomer's offense interactions ----
    outs = [a['3pt'] for a in A]
    e4 = []
    for i, (a, u2i, ei, ci) in enumerate(zip(A, u2, e3, c)):
        x = ei
        # (1) usage is bad at BOTH extremes: squeezed players can't express skill; overloaded ones degrade
        if u2i < 13: x *= 1 - 0.010*(13 - u2i)
        if u2i > 32: x *= 1 - 0.006*(u2i - 32)
        # (2) paint logic — paint-DEPENDENT means diet, not rating: no outside game
        if a['3pt'] < 40 and a['mid'] < 45:
            spc = sum(max(0, outs[j]-55) for j in range(5) if j != i) / (4*44)     # teammates' spacing 0..1
            # (2a) low spacing clogs the paint — but recal_110: only for a man who NEEDS the space.
            # A paint diet is not the same as a paint dependency. Shaquille O'Neal '00 was taking the
            # full -7% for Harper's and Horry's shooting while creating his own shot at 31.5 usage,
            # and the Lakers' raw fit was -8.07 against a -4 clamp. Scaled by how much of his own
            # advantage the man makes: at CLOG_FREE creation the penalty is gone entirely.
            free = max(0.0, 1.0 - ci/KNOBS['CLOG_FREE'])
            x *= 1 - 0.07*free*(1 - min(1.0, spc/0.55))
            if a['usg_raw'] < 20:   # (2b-i) finisher: needs a creator who shoots (pull-up gravity opens the roll)
                best_feed = max(creation(A[j]) * outs[j]/99 for j in range(5) if j != i)
                x *= 1 + 0.06*best_feed
            elif a['usg_raw'] >= 24:  # (2b-ii) hub: kicks out -> benefits from shooters
                x *= 1 + 0.05*min(1.0, spc/0.55)
        x = ei * min(1.12, max(0.90, x/ei))   # cap total interaction stack per player
        e4.append(x)
    OFF_N = sum(u2i*e3i for u2i, e3i in zip(u2, e3)) * 2   # repriced + created; no interaction channels
    OFF_F = sum(u2i*e4i for u2i, e4i in zip(u2, e4)) * 2
    fit = min(KNOBS['FIT_CAP'], max(-KNOBS['FIT_CAP'], KNOBS['FIT_WIDEN']*(OFF_F - OFF_N)))
    OFF = OFF_N + fit
    # (3) fouldraw x FT: manufactured points (matchup-discipline interaction reserved for the matchup layer)
    OFF += sum(u2i * (a['fouldraw']/99) * (a['ft']/100) for u2i, a in zip(u2, A)) * 0.06
    # (4) POSSESSION LOSS — recal_119, his ruling: "For the scout, I agree with 3,4,5,6,7" (item 7:
    # "Boston Celtics '24 (best five) team OFF 55 -> near 72"). THE CHANNEL DID NOT EXIST. Everything
    # above prices what a five does WITH a possession — usage reconciliation, repriced TS, creation,
    # the interactions, the free throws — and nothing priced whether the five KEEPS the possession.
    # A trip that ends in a turnover scores zero no matter how efficient the shooters are, and real
    # offensive ratings know it: across all 1,255 fieldable fives real ORtg correlates +0.548 with
    # -TOV% while offRaw correlated only +0.256, and the rank residual ran -0.40 with TOV%. The
    # Celtics '24 are the case that showed it — real ORtg 123.2 (1st of 30), real TS 1st, TOV% 10.8
    # (2nd), MOV +11.3 (1st) — and the engine read them 12th of the 26 fieldable 2024 fives with a
    # usage-weighted TS of .6077 that is exactly right. What was missing was the possessions.
    #
    # THE FORM IS PHYSICAL, not a bonus: ORtg = (points per scoring chance) x (chances kept), so the
    # whole of OFF is multiplied by the kept share (1 - tov) normalised at the league's own mean, the
    # same shape recal_70 gave the glass. TOVhat comes from the CARDS — the five's usage-weighted
    # ball security, which is the aggregate that carries the signal (within-season rho +0.718 with
    # -TOV%, against +0.666 for the plain mean, +0.550 for the top two handlers and +0.278 for the
    # weakest link; playmaking volume adds nothing, residual r +0.03). Fitted by OLS over all 1,255.
    #
    # TOV_SIZE IS AN ANCHOR BOUND, AND THE ROUND SAYS SO. On fit alone the term wants to be ~2x the
    # fitted slope (within-season Spearman of offRaw vs real ORtg peaks at 0.799 there, from 0.761);
    # at 1.0x it is 0.789. It ships at 0.45 because the pins bind first: past ~0.54 the Rockets '18
    # pass the Warriors '17 on the adjusted index and recal_71's named OFF summit stops being the
    # summit, and past ~0.69 the Bulls '96 leave recal_105's 68+-3. At 0.45 the fit is 0.777 and the
    # Celtics '24 read 56, 9th of 26 — the round therefore DECLINES the 72 (see data/rounds/119.json
    # for the full frontier; no size of this term reaches it, 65 at 3x with six pins broken).
    # Mirrors offense.ts exactly (the parity test gates it).
    wball = sum(u2i * a['ballsec'] for u2i, a in zip(u2, A)) / KNOBS['TEAM_USG']
    tovhat = KNOBS['TOV_INT'] - KNOBS['TOV_SLOPE']*wball
    tov = min(KNOBS['TOV_HI'], max(KNOBS['TOV_LO'],
              KNOBS['TOV_REF'] + KNOBS['TOV_SIZE']*(tovhat - KNOBS['TOV_REF'])))
    OFF *= (1 - tov/100.0) / (1 - KNOBS['TOV_REF']/100.0)
    # (5) ORB feeds on misses — recal_70: second chances are extra possessions; their VALUE is the
    # team's own conversion (the multiplication by OFF supplies it), their VOLUME the team's true
    # miss share. The old 1 + (0.60-wTS)/0.08, clamped 0.5..1.5, put a 3x swing on an 8-TS-pt window
    # (ordinary teams sat ON the rails); the physical term is the miss-share ratio, anchored at the
    # same 0.60, rails 0.8..1.2. Mirrors offense.ts exactly (the parity test gates it).
    wTS = sum(u2i*e4i for u2i, e4i in zip(u2, e4)) / KNOBS['TEAM_USG']
    miss_factor = min(1.2, max(0.8, (1.0 - wTS) / (1.0 - 0.60)))
    # recal_74: the absolute scale halves (0.0012 -> 0.0006) — real second-chance scoring separates
    # the best and worst crash teams by ~6 pts/100; this channel spread ~12-13. Mirrors offense.ts.
    OFF *= 1 + 0.0006 * sum(max(0, a['orb']-50) for a in A) * miss_factor
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
    # ANCHOR_CAP (37.5) is GONE — recal_94 removed the `cover` refund it sized. See defense_vs.
    ONBALL_SPLIT=0.6,   # steals: 60% on-ball (matchup-driven), 40% team/passing-lane
    HUNT_SCALE=0.10,    # DRtg pts per unit of hunted-man exposure
    DRTG_COEF=0.181,     # calibrated to his 60/40 offense/defense ruling (see calibration below)
    # recal_122 — the rim anchor's CAP becomes a KNEE. recal_94 capped anchor_raw at 99 (it ran to
    # 131 and paid a second big twice off the top of a 1-99 scale) and the cap was right, but it is
    # a DEAD CEILING: 626 of the 1,255 fieldable fives sit at exactly 99, so half the board has the
    # same rim reading and a five's best rim protector earns nothing. Unchanged below the knee;
    # above it a point of raw anchor is still worth half a point.
    ANCHOR_KNEE=99.0,
    ANCHOR_SOFT=0.5,
    # recal_133 — THE SECOND RIM PROTECTOR'S SHARE, and the first time this constant was measured
    # against the outcome it is supposed to produce. His ruling: "I agree with Philadelphia 76ers '85
    # being lower, but not 55. They have 5 good defenders, with 2 great. This is for sure 90+."
    # anchor_raw = rimprot1 + ANCHOR_2ND * rimprot2^2/99, and 0.35 was inherited from DKNOBS in the
    # very first defence build; nothing ever tested it. bref carries the channel's own truth column,
    # opp_e_fg_percent — the anchor exists to hold the opponent's shooting down — and the
    # within-season Spearman of anchor_raw against it over the 1,255 fieldable team-seasons peaks
    # flat across 0.15-0.20 (+0.5289 / +0.5275) and falls away on both sides: 0.10 +0.5228,
    # 0.25 +0.5240, 0.35 +0.5180 (shipped), 0.45 +0.5087, 0.60 +0.4871, 0.00 +0.5086. Two bigs cannot
    # both protect the same rim on the same possession; the redundancy discount was too generous by
    # about half. 0.20 is the conservative end of the plateau, and it is the only value on it that
    # holds the Warriors '17 anchor (recal_122, at its floor). Whole-dial fit rises with it:
    # within-season DEF rho +0.7764 -> +0.7781.
    ANCHOR_2ND=0.20,
    # The two recal_122 changes read the 1,255-five pool 0.195 DRtg points better, and the DEF gauge
    # block in src/engine/gauges.ts is FROZEN (recal_108: do not re-derive it). This constant holds
    # the pool's mean drtgRef exactly where recal_101 froze the gauge on it, so the round re-shapes
    # the board without lifting it. Without it every dial rises ~4 points and the summit crowds.
    # RE-DERIVED by recal_133 (1.0773 -> 0.4523) on the same rule: the pool's mean drtgRef is held
    # at 110.047736 to six places, because a smaller second-anchor credit lowers the whole board.
    DIDX_HOLD=0.4523,
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
    anchor_raw = rp[0][0] + MKNOBS['ANCHOR_2ND']*rp[1][0]*(rp[1][0]/99)   # recal_133: 0.35 -> 0.20
    min_opp_out = min(b['3pt'] for b in B)
    hide = 1.0 if min_opp_out < MKNOBS['HIDE_OUT'] else max(0.15, 1 - (min_opp_out - MKNOBS['HIDE_OUT'])/50)
    anchor = anchor_raw * hide
    # recal_122: the cap is a KNEE, not a ceiling — see MKNOBS ANCHOR_KNEE / ANCHOR_SOFT.
    anc = (anchor if anchor <= MKNOBS['ANCHOR_KNEE']
           else MKNOBS['ANCHOR_KNEE'] + (anchor - MKNOBS['ANCHOR_KNEE'])*MKNOBS['ANCHOR_SOFT'])
    # recal_94: PROTECTION (`cover`) IS GONE. It refunded the perdef deficit of the four non-anchor
    # defenders whenever the five had a rim anchor — so a bad perimeter five with a big read as a
    # good perimeter five. Measured on the 1,255 fieldable team-seasons, removing it alone took the
    # within-season DEF fit from rho +0.587 to +0.654. The comment it replaced claimed the term was
    # gated by paint-hunting, but min(1, paint_orient*2) is 1.00 against the reference five and
    # against every real offense in the wheel, so it never gated anything.
    # recal_122: THE FIVE'S PERDEF IS WEIGHTED BY THE LOAD EACH MAN DEFENDS, not averaged flat.
    # His ruling: "2 Elite defenders, 3 decent. how 72 def?" — the flat mean is why two elite men are
    # averaged away by three ordinary ones. The weights are not fitted: they are the OPPONENT'S OWN
    # usage shares, assigned assortatively (our best defender takes their biggest load), which
    # against REF_FIVE is .24/.22/.20/.18/.16. Defence is a property of the pairing, so the profile
    # sharpens by itself against a five that runs everything through one man.
    pd_desc = sorted((a['perdef'] for a in A), reverse=True)
    load = sorted(b_usg, reverse=True)
    tot_load = sum(b_usg) or 1.0
    eff_di = sum(p*(u/tot_load) for p, u in zip(pd_desc, load))
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
    # TEAM DEFENCE IS THE FIVE'S PERDEF AGAIN (recal_94, his ruling: "Philly 2026 def too high, I
    # dont understand the system it needs a full reset. OFF DEF feels off for too many teams" —
    # and, on the diagnosis, "Run it").
    #
    # MEASURED, not guessed. Truth is data/bref/Team Summaries.csv (o_rtg / d_rtg), fit is the
    # Spearman of the dial against real DRtg WITHIN each season, averaged over the 47 seasons of
    # the 1,255 fieldable team-seasons on the wheel. The shipped formula scored DEF rho +0.587
    # while the bare sum of the five's perdef scored +0.763 — every term stacked on top of perdef
    # was subtracting signal. Three of them are the reason:
    #
    #   1. THE ANCHOR WAS UNCAPPED. team_defense (the standalone lineup path) has always written
    #      min(99, anchor); this line did not, and anchor_raw = rimprot1 + 0.35*rimprot2^2/99 runs
    #      past 99 on 902 of the 1,255 fives (max 131.3, Bucks '21). Two rim protectors paid twice,
    #      off the top of a 1-99 scale. Capped here exactly as team_defense caps it.
    #   2. `cover` — see above, removed.
    #   3. the discipline penalty was the LARGEST variance channel of drtg_ref (sd 0.588 against a
    #      5.84-point all-time range, i.e. up to ~73 dial points) and it pointed the WRONG WAY:
    #      mean discipline of the five correlates +0.075 (Spearman) with BAD real defence. Fouling
    #      is how good defences play. Removed from the matchup path. DKNOBS['DISC_FREEPTS'], the
    #      standalone team_defense version, is untouched — it is a different layer.
    #
    # WEIGHTS. With the anchor capped and cover gone, the anchor's remaining weight still overpaid:
    # 0.26 -> 0.13, the 0.13 moved onto perdef (0.42 -> 0.55) so the didx level is held. Steals
    # 0.20 -> 0.12 on the same measurement (+0.004; the term is real but small, and its transition
    # value is priced separately in score_vs via the 0.024 coefficient).
    #
    # WHAT IT COST. Nothing on offense — team_offense is untouched and OFF rho is +0.712 before and
    # after (all 1,255 offRaw readings bit-identical). DEF rho +0.588 -> +0.763 overall; per era 80s
    # .536->.777, 90s .599->.799, 00s .597->.791, 10s .641->.730, 20s .557->.697. Philadelphia '26
    # (real DRtg 14th of the 24 fieldable 2026 teams) goes from DEF 80 / 1st to DEF 50 / 9th. DEF_WORST/DEF_MID/DEF_TOP in
    # src/engine/gauges.ts were re-frozen from the wheel sweep in the same commit, per recal_71.
    #
    # recal_122 (his ruling: "2 Elite defenders, 3 decent. how 72 def?"). TWO CHANGES, both measured
    # on the same 47-season within-season Spearman this block is built on, and both level-held:
    #   1. eff_di is USAGE-WEIGHTED (see above): the five's perdef read through the loads its men
    #      actually defend rather than a flat mean.
    #   2. min(99, anchor) becomes a KNEE (MKNOBS ANCHOR_KNEE/ANCHOR_SOFT): the cap was tying 626
    #      of the 1,255 fives at exactly 99, so the five's best rim protector was worth nothing.
    #      Beside the five's mean perdef, a season-z regression over the 1,255 pays the uncapped
    #      best rim protector +0.155 and the capped anchor only +0.076 — the ceiling was eating a
    #      live channel, and un-tying it is where this round's fit comes from.
    # FIT: within-season rho +0.7742 -> +0.7767 (80s .739, 90s .703, 00s .719, 10s .674, 20s .601).
    # WHAT WAS DECLINED, and why it is written down here: a genuinely TOP-HEAVY perdef aggregation
    # (a top-2 premium, or any tilt past the usage profile) is what his sentence literally asks for
    # and the 47 seasons refuse it. Entered as five order statistics, the five's BEST defender is
    # the LEAST predictive of them (+0.076 against +0.19..+0.23 for the other four), and a top-2
    # premium entered beside the mean carries a NEGATIVE partial (-0.27 all-time, -0.23 pre-2014,
    # -0.43 in the tracking era). Every tilt past .24/.22/.20/.18/.16 costs fit monotonically.
    didx = (0.55*eff_di + 0.13*anc*0.9 + 0.12*min(99, steals)*0.9 + 0.12*max(0, 60 + glass/4)
            - MKNOBS['DIDX_HOLD'])
    drtg = 110 - MKNOBS['DRTG_COEF']*(didx - 55) + hunt_pen   # rebased: coef scales DIFFERENCES
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
# recal_94: _REF_DRTG was 113.1 — recal_60's PRE-calibration value, left behind when that round moved
# the port's REF_DRTG to 108.85 and never mirrored here. The two dials had been 4.25 points apart for
# 34 rounds (parity_check.py compares off/drtg/steals/net/margin, never ratings_100, so nothing
# printed). Both sides now carry 108.96, re-derived by recal_60's own rule — the OFF and DEF display
# means match over recal_60's own 300-five sample (scripts/diag-team/ref94d.ts).
_REF_OFF, _REF_DRTG = 124.03, 109.83   # recal_74: _REF_OFF re-derived (campaign median) after the ORB-scale halving
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
