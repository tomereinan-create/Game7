"""recal_119 — did the ladder reorder? A team ruling must not silently reshuffle the eight campaign
rounds. Compares src/data/opponents.json before (git HEAD) and after."""
import io, json, subprocess

b = json.loads(subprocess.check_output(['git', 'show', 'HEAD:src/data/opponents.json']).decode('utf8'))
a = json.load(io.open('src/data/opponents.json', encoding='utf8'))
print('rounds: %d -> %d' % (len(b), len(a)))
print('  %-6s %-26s %-26s %s' % ('round', 'before', 'after', ''))
same = 0
for i in range(max(len(b), len(a))):
    x = b[i] if i < len(b) else {}
    y = a[i] if i < len(a) else {}
    ok = x.get('team') == y.get('team') and x.get('season') == y.get('season')
    same += ok
    print('  %-6s %-26s %-26s %s' % (x.get('round', i + 1),
                                     "%s '%02d" % (x.get('team', '-'), (x.get('season') or 0) % 100),
                                     "%s '%02d" % (y.get('team', '-'), (y.get('season') or 0) % 100),
                                     '' if ok else '  <- MOVED'))
print('  %d of %d rounds unchanged' % (same, max(len(b), len(a))))

cb = json.loads(subprocess.check_output(['git', 'show', 'HEAD:src/data/campaigns.json']).decode('utf8'))
ca = json.load(io.open('src/data/campaigns.json', encoding='utf8'))


def flat(c):
    out = []
    for t in (c['tiers'] if isinstance(c, dict) and 'tiers' in c else c):
        for lv in (t['levels'] if isinstance(t, dict) and 'levels' in t else []):
            out.append((t.get('key') or t.get('name'), lv.get('round'), lv.get('team') or lv.get('name')))
    return out


fb, fa = flat(cb), flat(ca)
print()
print('campaign ladder: %d -> %d levels' % (len(fb), len(fa)))
moved = [(x, y) for x, y in zip(fb, fa) if x[2] != y[2]]
print('  %d of %d levels changed opponent' % (len(moved), len(fa)))
for x, y in moved[:15]:
    print('    %-14s L%-4s %-26s -> %s' % (x[0], x[1], x[2], y[2]))
