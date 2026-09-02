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

  meaning A must read >= B on that scale.

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


def read_scale(players, a):
    """The measured value an anchor is about, or None if it cannot be read."""
    scale = a['scale']
    if scale.startswith('team:'):
        five = [find_card(players, n) for n in a.get('five', [])]
        if len(five) != 5 or any(p is None for p in five):
            return None
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
        if kind == 'order':
            hi = read_scale(players, dict(scale=a['scale'], card=a['above'], five=a.get('five')))
            lo = read_scale(players, dict(scale=a['scale'], card=a['below'], five=a.get('five')))
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
