"""recal_85 - what sits between the OVR blend and the printed number, and what his ruling leaves.

His ruling ("Kill breadth and the tax") makes the r83 blend the whole of OVR, so a card can never
print above its higher end nor below its lower one. This probe prints the full chain, applies the
removal, and answers the one question that needs a further ruling: does the TOP-BAND RESCALE
reintroduce the violation by itself?

Run:  python scripts/ovrchain85.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNEE, OVR_TOP = 93.0, 97.10


def blend(o, d):
    return max(0.4 * o + 0.6 * d, 0.70 * o + 0.30 * d)


def tax(a):
    return min(5.0, 0.06 * max(0, a['volume'] - 72) * max(0, 58 - a['efficiency']))


def breadth(a, raw):
    g = [max(a['3pt'], a['rim'], a['mid']), a['playvol'], max(a['perdef'], a['rimprot']),
         max(a['orb'], a['drb']), a['ballsec'], a['discipline'], a['fouldraw']]
    s = sum(1 for x in g if x >= 65)
    b = 4.0 if s >= 6 else (2.0 if s >= 5 else 0.0)
    return b * max(0.0, min(1.0, (93 - raw) / 3))


def cap(p):
    return p['o_ovr'] + 40 if p['big'] else max(p['o_ovr'] + 10, 0.80 * p['d_ovr'])


def band(r, top):
    return r if r <= KNEE else KNEE + (r - KNEE) * (99.0 - KNEE) / (top - KNEE)


def main():
    c = json.load(open(os.path.join(ROOT, 'src', 'data', 'players_stats.json'), encoding='utf-8'))
    print('THE CHAIN AS IT STANDS (v76), blend -> printed OVR:')
    print('  1. blend   max(0.4o + 0.6d, 0.70o + 0.30d)          [recal_83, his]')
    print('  2. tax     minus min(5, 0.06*(vol-72)*(58-eff))     [HIS RULING REMOVES THIS]')
    print('  3. breadth plus up to +4, faded to 0 at raw 93      [HIS RULING REMOVES THIS]')
    print('  4. cap     min(., o+10 or 0.8d; o+40 for bigs)      [kept]')
    print('  5. band    stretches everything above the 93 knee   [THE OPEN QUESTION]')
    print('  6. clamp   min(., 99)')
    print('  (marginal value left OVR at recal_37 and is not in this chain at all.)')

    def counts(f):
        ab = bl = 0
        for p in c:
            hi, lo = max(p['o_ovr'], p['d_ovr']), min(p['o_ovr'], p['d_ovr'])
            v = f(p)
            ab += v > hi
            bl += v < lo
        return ab, bl

    cur = counts(lambda p: p['ovr'])
    keep = counts(lambda p: int(min(99, cap(p), round(band(blend(p['o_ovr'], p['d_ovr']), OVR_TOP)))))
    drop = counts(lambda p: int(min(99, cap(p), round(blend(p['o_ovr'], p['d_ovr'])))))
    print(f'\n  NOW (v76)                     above-both {cur[0]:4d}   below-both {cur[1]:4d}')
    print(f'  after removal, BAND KEPT      above-both {keep[0]:4d}   below-both {keep[1]:4d}')
    print(f'  after removal, BAND REMOVED   above-both {drop[0]:4d}   below-both {drop[1]:4d}')

    print('\n  the cards the BAND alone pushes above both ends:')
    for p in c:
        hi = max(p['o_ovr'], p['d_ovr'])
        r = blend(p['o_ovr'], p['d_ovr'])
        v = int(min(99, cap(p), round(band(r, OVR_TOP))))
        if v > hi:
            print(f"    {p['name']:26s} O {p['o_ovr']:2d} D {p['d_ovr']:2d}  blend {r:5.2f} -> OVR {v}")

    raws = [blend(p['o_ovr'], p['d_ovr']) for p in c]
    print(f'\n  OVR_TOP by its own doctrine on the NEW input: max blend = {max(raws):.4f} -> {round(max(raws), 2)}')
    print('  (unchanged at 97.10: breadth fades to zero above the 93 knee, so the top card never had any)')


if __name__ == '__main__':
    main()
