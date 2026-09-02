"""ANCHORS — the standing pins from Tomer's rulings, graded against the shipped cards.

A round is allowed to move the board. It is NOT allowed to move it silently past a number a
previous ruling settled. recal_90 re-derived OFF_TOP and Shaq '00 fell 99 -> 97 while four earlier
receipts still carried him at 99; nothing printed. This file is the thing that prints.

    python anchors.py [path/to/players_stats.json]     # default: players_stats.json beside this file

Exit code 1 if any anchor fails, so it can gate a regeneration. `data/compute_ovr.py` imports it and
prints the same report at the end of every run.

anchors.json is an array of pins. A VALUE pin:

    {"card": "Shaquille O'Neal '00", "scale": "off", "target": 97, "tol": 2,
     "round": 90, "ruling": "<verbatim ruling>", "note": "optional"}

  scale is one of  attr:<attrname>  (a card attribute, e.g. attr:rimprot)
                   off              (o_ovr)
                   def              (d_ovr)
                   ovr              (ovr)
                   team:off / team:def   (with a `five` array of five card names instead of `card`;
                                          read through data/team_rating.py's ratings_100)
  tol defaults to 2.  |current - target| <= tol is a PASS.

An ORDER pin — rank constraints were common in the receipts ("Shaq holds or rises, the rest come
down"), and they survive a rescale that a value pin cannot:

    {"kind": "order", "scale": "off", "above": "A", "below": "B", "round": N}

  meaning A must read >= B on that scale. For a team:* scale an order pin may name a DIFFERENT five
  on each side with `five_above` / `five_below` (recal_94); `five` alone still means both.

TEAM ANCHORS (recal_94 — "Philly 2026 def too high ... OFF DEF feels off for too many teams"):

    team:off / team:def          ratings_100's display ints (recal_60's layer)
    team:ovrdial                 the team screen's OVR: round((offdial + defdial) / 2), TeamDb.tsx ovrOf
    team:offdial / team:defdial  the 1-99 ALL-TIME dial the team screen shows — src/ui/TeamDb.tsx's
                                 gaugeOf through src/engine/gauges.ts. The frozen constants are READ
                                 OUT OF gauges.ts, never copied here, so the two cannot drift.
                                 recal_100: a team:defdial pin also takes a `season`, because the DEF
                                 dial now reads a five in its own season's league. Omit it and the
                                 five is read in today's, which is what a drafted five gets.

    {"kind": "team_rank", "season": 2026, "ab": "PHI", "scale": "team:def",
     "min_rank": 7, "round": 94, "ruling": "..."}

  A RANK pin: where a team-season sits among the fieldable fives OF ITS OWN SEASON, 1 = best. The
  five is picked exactly as src/engine/bestfive.ts picks it (max total OVR over legal PG..C boards)
  from src/data/teamseasons.json. `max_rank` = at least this good; `min_rank` = no better than this;
  both may be given. A rank pin survives a rescale that a value pin cannot, which is why his DEF
  rulings are seeded this way — the complaint was about ORDER, not about a dial number.

CARD LOOKUP: exact match on `name` first (names carry the year — season is the unit). A name with no
year resolves to the PEAK card: highest `talent`, then highest `ovr`. An unknown card is reported as
MISSING, never a crash.

anchors_superseded.json sits beside this file and is NOT graded. It holds the pins that were mined
from the receipts and no longer hold, each with the value it reads today, for Tomer to confirm or
drop. Moving one back into anchors.json is how a pin is reinstated.
"""
import io, json, os, re, sys

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ANCHORS = os.path.join(_HERE, 'anchors.json')

_SCALE_FIELD = {'off': 'o_ovr', 'def': 'd_ovr', 'ovr': 'ovr'}
_TEAM_NS = None


def _team_ns():
    """team_rating.py's functions only — its demo section at the bottom expects the peak-only file.
    Mirrors the load compute_ovr.py does, but into a private namespace and only if a team anchor
    actually needs it. team_rating.py itself is never modified or written to."""
    global _TEAM_NS
    if _TEAM_NS is None:
        src = io.open(os.path.join(_HERE, 'team_rating.py'), encoding='utf-8').read()
        head = src.split("P = {p['name']")[0]
        tail = src[src.index('# ---------- DEFENSE v2'):]
        tail = re.sub(r"^print\(.*\n", "", tail, flags=re.M)
        tail = re.sub(r"^for name, L in LINEUPS.*\n(^[ \t].*\n)*", "", tail, flags=re.M)
        ns = {'__name__': 'team_rating_anchors'}
        exec(compile(head, 'team_rating.py<head>', 'exec'), ns)
        exec(compile(tail, 'team_rating.py<tail>', 'exec'), ns)
        _TEAM_NS = ns
    return _TEAM_NS


def find_card(players, name, _cache={}):
    """Exact name match; a name with no year resolves to the peak card (talent, then ovr)."""
    key = id(players)
    idx = _cache.get(key)
    if idx is None:
        idx = {}
        for p in players:
            idx.setdefault(p['name'], p)
        _cache[key] = idx
    if name in idx:
        return idx[name]
    # no year on the name: take the peak season of that man
    same = [p for p in players if p.get('player') == name] or \
           [p for p in players if p['name'].startswith(name + " '")]
    if not same:
        return None
    return sorted(same, key=lambda p: (p.get('talent', 0), p.get('ovr', 0)))[-1]


_GAUGE = None


def _gauge_consts():
    """The frozen gauge anchors, READ OUT OF src/engine/gauges.ts rather than copied here.
    recal_94 added this on purpose: a fourth transcription of OFF_MIN/DEF_TOP is a fourth thing that
    can drift, and the whole point of an anchor file is that drift prints. If the regex ever stops
    matching, every gauge anchor reports MISSING — loudly — instead of grading against a stale number."""
    global _GAUGE
    if _GAUGE is None:
        path = os.path.join(_HERE, '..', 'src', 'engine', 'gauges.ts')
        src = io.open(path, encoding='utf-8').read()
        g = {}
        for k in ('OFF_MIN', 'OFF_MID', 'OFF_TOP', 'DEF_WORST', 'DEF_MID', 'DEF_TOP',
                  'DEF_LEVEL_REF', 'OFF_LEVEL_REF'):
            m = re.search(r'^const %s = ([0-9.]+)' % k, src, re.M)
            if not m:
                return None
            g[k] = float(m.group(1))
        # recal_100's era table, read from the same file for the same reason
        for k in ('DEF_LEVEL', 'OFF_LEVEL'):
            blk = re.search(r'^const %s: Record<number, number> = \{(.*?)^\}' % k, src, re.M | re.S)
            if not blk:
                return None
            g[k] = {int(y): float(v) for y, v in re.findall(r'(\d{4}):\s*([0-9.]+)', blk.group(1))}
            if len(g[k]) < 40:
                return None
        _GAUGE = g
    return _GAUGE


def _def_adj(drtg, season=None):
    """recal_100: drtgRef re-expressed in DEF_LEVEL_REF's league. Mirrors defAdj in gauges.ts —
    an unknown season falls back to today's, exactly as fieldGauges does."""
    g = _gauge_consts()
    lvl = g['DEF_LEVEL'].get(season) if season else None
    if lvl is None:
        lvl = g['DEF_LEVEL'][max(g['DEF_LEVEL'])]
    return drtg - lvl + g['DEF_LEVEL_REF']


def _off_adj(off, season=None):
    """recal_105: offRaw re-expressed in OFF_LEVEL_REF's league. Mirrors offAdj in gauges.ts."""
    g = _gauge_consts()
    lvl = g['OFF_LEVEL'].get(season) if season else None
    if lvl is None:
        lvl = g['OFF_LEVEL'][max(g['OFF_LEVEL'])]
    return off - lvl + g['OFF_LEVEL_REF']


def _scale71(v, mn, mid, top):
    """recal_71's two-slope map, mirroring scale71 in src/engine/gauges.ts exactly."""
    x = 1 + 49.0 * (v - mn) / (mid - mn) if v <= mid else 50 + 49.0 * (v - mid) / (top - mid)
    return int(round(max(1.0, min(99.0, x))))


def team_raw(five):
    """(offRaw, drtgRef) for a five, through team_rating.py — the same two numbers gauges.ts maps."""
    ns = _team_ns()
    off, _ = ns['team_offense'](five)
    drtg, _ = ns['defense_vs'](five, ns['REF_FIVE'])
    return off, drtg


def team_dials(five, season=None):
    """The 1-99 ALL-TIME dials the app's team screen shows (src/ui/TeamDb.tsx gaugeOf -> gauges.ts).
    recal_100/105: BOTH dials are read in the five's own season's league, so a team:offdial,
    team:defdial or team:ovrdial pin carries a `season`. Without one a five is read in today's,
    which is what a drafted five gets."""
    g = _gauge_consts()
    if g is None:
        return None
    off, drtg = team_raw(five)
    return (_scale71(_off_adj(off, season), g['OFF_MIN'], g['OFF_MID'], g['OFF_TOP']),
            _scale71(-_def_adj(drtg, season), -g['DEF_WORST'], -g['DEF_MID'], -g['DEF_TOP']))


# ---- the season board: every fieldable team-season's OVR-max legal five, as bestfive.ts picks it ----
_STATS = None
_WHEEL = None
_BOARDS = {}
_POSITIONS = ('PG', 'SG', 'SF', 'PF', 'C')


def _pos_of(name):
    """src/engine/positions.ts eligible(): every position bref ever listed; empty means anywhere."""
    global _STATS
    if _STATS is None:
        _STATS = json.load(io.open(os.path.join(_HERE, '..', 'src', 'data', 'stats.json'), encoding='utf-8'))
    line = _STATS.get(name) or {}
    out = [p for p in _POSITIONS if p in (line.get('pos') or [])]
    return out or list(_POSITIONS)


def starting_five(roster):
    """A 1:1 port of startingFive() in src/engine/bestfive.ts, for the SET it picks (team ratings are
    order-invariant, so the assist tie-break on slot order cannot move a number). Max total OVR over
    legal PG..C boards; among boards of equal total, the one that walk() reaches first — slot 0's
    lowest roster index, then slot 1's, and so on, with an empty slot ordered last."""
    n = len(roster)
    elig = [_pos_of(p['name']) for p in roster]
    NEG = float('-inf')
    # dp[i][mask] = best total using players i.. to fill exactly the slots in `mask`
    dp = [[NEG] * 32 for _ in range(n + 1)]
    dp[n][0] = 0.0
    for i in range(n - 1, -1, -1):
        for mask in range(32):
            best = dp[i + 1][mask]
            for s in range(5):
                if not (mask >> s) & 1 or _POSITIONS[s] not in elig[i]:
                    continue
                sub = dp[i + 1][mask ^ (1 << s)]
                if sub > NEG:
                    best = max(best, sub + roster[i].get('ovr', 0))
            dp[i][mask] = best
    target = max(dp[0])
    # reconstruct walk()'s first-found board: slot 0 first, candidates in roster order
    left = max((m for m in range(32) if dp[0][m] == target), key=lambda m: bin(m).count('1'))
    chosen, used, got = [], [False] * n, 0.0
    for s in range(5):
        if not (left >> s) & 1:
            continue
        for i in range(n):
            if used[i] or _POSITIONS[s] not in elig[i]:
                continue
            rest = left ^ (1 << s)
            # can the slots still open be filled to target by the players not yet used?
            if _fill(roster, elig, used, i, rest, target - got - roster[i].get('ovr', 0)):
                used[i] = True
                got += roster[i].get('ovr', 0)
                chosen.append(roster[i])
                left = rest
                break
    return chosen


def _fill(roster, elig, used, taken, mask, need):
    """Is `mask` fillable from the unused players (excluding `taken`) for exactly `need` more OVR?"""
    if mask == 0:
        return abs(need) < 1e-9
    free = [i for i in range(len(roster)) if not used[i] and i != taken]
    best = {0: 0.0}
    for i in free:
        nxt = dict(best)
        for m, v in best.items():
            for s in range(5):
                if (mask >> s) & 1 and not (m >> s) & 1 and _POSITIONS[s] in elig[i]:
                    mm = m | (1 << s)
                    if nxt.get(mm, float('-inf')) < v + roster[i].get('ovr', 0):
                        nxt[mm] = v + roster[i].get('ovr', 0)
        best = nxt
    return abs(best.get(mask, float('-inf')) - need) < 1e-9


def season_board(players, season):
    """[(ab, team, five)] for every team of `season` that can field a legal five, from the wheel."""
    global _WHEEL
    if season in _BOARDS:
        return _BOARDS[season]
    if _WHEEL is None:
        _WHEEL = json.load(io.open(os.path.join(_HERE, '..', 'src', 'data', 'teamseasons.json'), encoding='utf-8'))
    idx = {}
    for p in players:
        idx.setdefault(p['name'], p)
    out = []
    for t in _WHEEL:
        if t['y'] != season:
            continue
        roster = [idx[n] for n in t['p'] if n in idx]
        if len(roster) < 5:
            continue
        five = starting_five(roster)
        if len(five) != 5:
            continue
        off, drtg = team_raw(five)
        out.append(dict(ab=t['ab'], team=t['team'], five=five, off=off, drtg=drtg))
    _BOARDS[season] = out
    return out


def team_rank(players, a):
    """(rank, n) of one team-season on `scale` within its own season. 1 = best. Ties share the rank."""
    board = season_board(players, a['season'])
    me = [x for x in board if x['ab'] == a.get('ab') or x['team'] == a.get('team')]
    if not me or len(board) < 2:
        return None
    me = me[0]
    if a['scale'] in ('team:def', 'team:defdial'):
        better = sum(1 for x in board if x['drtg'] < me['drtg'])
    else:
        better = sum(1 for x in board if x['off'] > me['off'])
    return better + 1, len(board)


def read_scale(players, a):
    """The measured value an anchor is about, or None if it cannot be read."""
    scale = a['scale']
    if scale.startswith('team:'):
        five = [find_card(players, n) for n in a.get('five', [])]
        if len(five) != 5 or any(p is None for p in five):
            return None
        if scale in ('team:offdial', 'team:defdial', 'team:ovrdial'):
            d = team_dials(five, a.get('season'))
            if d is None:
                return None
            # recal_105: team:ovrdial is src/ui/TeamDb.tsx's ovrOf — the plain mean of the two dials,
            # which is the number his ruling ("Bulls 96 only 75 OVR") is actually about.
            return d[0] if scale == 'team:offdial' else d[1] if scale == 'team:defdial' else int(round((d[0] + d[1]) / 2.0))
        off100, def100 = _team_ns()['ratings_100'](five)
        return off100 if scale == 'team:off' else def100
    p = find_card(players, a['card'])
    if p is None:
        return None
    if scale.startswith('attr:'):
        return p['attrs'].get(scale[5:])
    if scale not in _SCALE_FIELD:
        return None
    return p.get(_SCALE_FIELD[scale])


def _label(a):
    if a.get('kind') == 'team_rank':
        return "%s '%02d %s rank" % (a.get('ab') or a.get('team'), a['season'] % 100,
                                     'DEF' if 'def' in a['scale'] else 'OFF')
    if a.get('kind') == 'order':
        return "%s >= %s" % (a['above'], a['below'])
    if a['scale'].startswith('team:'):
        five = a.get('five', [])
        return a.get('card') or ('five: ' + ', '.join(five[:2]) + ' ...')
    return a['card']


def grade(players, anchors_path=None):
    """Grade every anchor against `players` (the parsed players_stats.json list).
    Returns a list of result dicts: round, label, scale, target, current, error, ok, tol, verdict,
    ruling, note, kind."""
    path = anchors_path or DEFAULT_ANCHORS
    if not os.path.exists(path):
        return []
    anchors = json.load(io.open(path, encoding='utf-8'))
    out = []
    for a in anchors:
        kind = a.get('kind', 'value')
        r = dict(kind=kind, round=a.get('round'), scale=a['scale'], label=_label(a),
                 ruling=a.get('ruling', ''), note=a.get('note', ''),
                 tol=a.get('tol', 2), target=None, current=None, error=None, ok=False,
                 verdict='FAIL')
        if kind == 'team_rank':
            # recal_94: a RANK pin. The dial is a scale that a later round can legitimately re-freeze;
            # where a team-season SITS INSIDE ITS OWN SEASON is the thing his ruling was actually
            # about, and it survives any rescale. max_rank = "at least this good", min_rank = "no
            # better than this" (that is the shape of "Philly 2026 def too high").
            got = None
            try:
                got = team_rank(players, a)
            except Exception:
                got = None
            if got is None:
                r['verdict'] = 'MISSING'
            else:
                rk, n = got
                lo, hi = a.get('max_rank'), a.get('min_rank')
                r['target'] = ('<=%s' % lo) if hi is None else (('>=%s' % hi) if lo is None else '%s-%s' % (hi, lo))
                r['current'] = '%d/%d' % (rk, n)
                r['error'] = (rk - lo) if (lo is not None and rk > lo) else ((rk - hi) if (hi is not None and rk < hi) else 0)
                r['ok'] = (lo is None or rk <= lo) and (hi is None or rk >= hi)
                r['verdict'] = 'PASS' if r['ok'] else 'FAIL'
        elif kind == 'order':
            hi = read_scale(players, dict(scale=a['scale'], card=a['above'], five=a.get('five_above', a.get('five')),
                                          season=a.get('season_above', a.get('season'))))
            lo = read_scale(players, dict(scale=a['scale'], card=a['below'], five=a.get('five_below', a.get('five')),
                                          season=a.get('season_below', a.get('season'))))
            if hi is None or lo is None:
                r['verdict'] = 'MISSING'
            else:
                r['target'] = '>=0'
                r['current'] = '%s/%s' % (hi, lo)
                r['error'] = min(0, hi - lo)          # 0 when the order holds, negative by the gap
                r['ok'] = hi >= lo
                r['verdict'] = 'PASS' if r['ok'] else 'FAIL'
        else:
            cur = read_scale(players, a)
            r['target'] = a['target']
            if cur is None:
                r['verdict'] = 'MISSING'
            else:
                r['current'] = cur
                r['error'] = cur - a['target']
                r['ok'] = abs(r['error']) <= r['tol']
                r['verdict'] = 'PASS' if r['ok'] else 'FAIL'
        out.append(r)
    return out


def report(results):
    """The table plus the summary line, as one string."""
    if not results:
        return 'ANCHORS: no anchors.json found (nothing to grade)'
    L = []
    L.append('ANCHORS — %d pins from the receipts, graded against the shipped cards' % len(results))
    L.append('  %-5s  %-44s %-14s %6s %8s %6s  %s' %
             ('round', 'card', 'scale', 'target', 'current', 'error', 'verdict'))
    for r in sorted(results, key=lambda x: (-(x['round'] or 0), x['label'])):
        err = '' if r['error'] is None else ('%+d' % r['error'])
        L.append('  %-5s  %-44s %-14s %6s %8s %6s  %s%s' % (
            r['round'], r['label'][:44], r['scale'],
            '-' if r['target'] is None else r['target'],
            '-' if r['current'] is None else r['current'],
            err, r['verdict'],
            '' if r['ok'] else ('   <- ' + (r['ruling'] or r['note'] or ''))[:96]))
    errs = [abs(r['error']) for r in results if r['error'] is not None]
    bad = [r for r in results if not r['ok']]
    mean = (sum(errs) / len(errs)) if errs else 0.0
    worst = sorted((r for r in results if r['error'] is not None),
                   key=lambda r: -abs(r['error']))[:3]
    L.append('  %d anchors, %d failing, mean |error| %.2f — worst 3: %s' % (
        len(results), len(bad), mean,
        ' · '.join('%s %s %s (%+d)' % (r['label'], r['scale'], r['current'], r['error'])
                   for r in worst) or 'none'))
    if bad:
        L.append('  FAILING: ' + ' · '.join('r%s %s %s' % (r['round'], r['label'], r['scale'])
                                            for r in bad))
    return '\n'.join(L)


def main(argv):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    path = argv[1] if len(argv) > 1 else os.path.join(_HERE, 'players_stats.json')
    players = json.load(io.open(path, encoding='utf-8'))
    results = grade(players)
    print(report(results))
    return 1 if any(not r['ok'] for r in results) else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
