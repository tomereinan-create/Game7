"""recal_119 — BEFORE vs AFTER for the ten teams and the whole board, both dials computed with the
gauge block each side actually ships (the before block is read out of git HEAD, the after block out
of the working tree), so no constant is transcribed by hand."""
import io, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib119 import B, BY, SEASONS, spear, s71  # noqa: E402


def consts(src):
    g = {}
    for k in ('OFF_MIN', 'OFF_MID', 'OFF_TOP', 'DEF_WORST', 'DEF_MID', 'DEF_TOP',
              'DEF_LEVEL_REF', 'OFF_LEVEL_REF'):
        g[k] = float(re.search(r'^const %s = ([0-9.]+)' % k, src, re.M).group(1))
    for k in ('DEF_LEVEL', 'OFF_LEVEL'):
        blk = re.search(r'^const %s: Record<number, number> = \{(.*?)^\}' % k, src, re.M | re.S)
        g[k] = {int(y): float(v) for y, v in re.findall(r'(\d{4}):\s*([0-9.]+)', blk.group(1))}
    return g


GA = consts(subprocess.check_output(['git', 'show', 'HEAD:src/engine/gauges.ts']).decode('utf8'))
GB = consts(io.open('src/engine/gauges.ts', encoding='utf8').read())
AFTER = {(x['y'], x['ab']): x for x in json.load(io.open('scripts/diag-team/tov119_after.json', encoding='utf8'))}


def dials(g, y, ab, off, drtg):
    o = s71(off - g['OFF_LEVEL'][y] + g['OFF_LEVEL_REF'], g['OFF_MIN'], g['OFF_MID'], g['OFF_TOP'])
    d = s71(-(drtg - g['DEF_LEVEL'][y] + g['DEF_LEVEL_REF']), -g['DEF_WORST'], -g['DEF_MID'], -g['DEF_TOP'])
    return o, d


def rk(key, y, ab, src):
    v = src[(y, ab)][key]
    return sum(1 for k in src if k[0] == y and src[k][key] > v) + 1


TEN = [(2024, 'BOS'), (2023, 'BOS'), (2025, 'BOS'), (2023, 'NYK'), (2005, 'SAC'), (2008, 'BOS'),
       (1996, 'CHI'), (2017, 'GSW'), (2000, 'LAL'), (2018, 'HOU'), (2024, 'DEN')]
BEF = {(x['y'], x['ab']): x for x in B}
print('%-9s %-22s %-14s %-14s %s' % ('', 'OFF', 'DEF', 'OVR', 'engine offRaw rank (real)'))
for y, ab in TEN:
    a, b = BEF[(y, ab)], AFTER[(y, ab)]
    oa, da = dials(GA, y, ab, a['offRaw'], a['drtgRef'])
    ob, db = dials(GB, y, ab, b['offRaw'], b['drtgRef'])
    tr = sum(1 for k in BEF if k[0] == y and BEF[k]['truth']['ortg'] > a['truth']['ortg']) + 1
    n = sum(1 for k in BEF if k[0] == y)
    print("%-9s %2d -> %-2d %12s %2d -> %-2d %5s %2d -> %-2d %3s   %2d -> %-2d of %d (real %2d)" %
          ("%s '%02d" % (ab, y % 100), oa, ob, '', da, db, '', int(round((oa + da) / 2.0)),
           int(round((ob + db) / 2.0)), '',
           rk('offRaw', y, ab, BEF), rk('offRaw', y, ab, AFTER), n, tr))

print()
print('=== FIT: within-season Spearman of offRaw vs real ORtg, per decade ===')


def fitper(src):
    return {y: spear([src[(y, x['ab'])]['offRaw'] for x in BY[y]], [x['truth']['ortg'] for x in BY[y]])
            for y in SEASONS}


fa, fb = fitper(BEF), fitper(AFTER)
print('  %-8s %8s %8s %8s' % ('era', 'before', 'after', 'delta'))
for dec in (1980, 1990, 2000, 2010, 2020):
    ys = [y for y in SEASONS if dec <= y < dec + 10]
    a = sum(fa[y] for y in ys) / len(ys)
    b = sum(fb[y] for y in ys) / len(ys)
    print('  %-8s %8.3f %8.3f %+8.3f' % ('%ds' % dec, a, b, b - a))
a = sum(fa.values()) / len(fa)
b = sum(fb.values()) / len(fb)
print('  %-8s %8.3f %8.3f %+8.3f' % ('ALL 47', a, b, b - a))
da = {y: spear([-BEF[(y, x['ab'])]['drtgRef'] for x in BY[y]], [-x['truth']['drtg'] for x in BY[y]]) for y in SEASONS}
db = {y: spear([-AFTER[(y, x['ab'])]['drtgRef'] for x in BY[y]], [-x['truth']['drtg'] for x in BY[y]]) for y in SEASONS}
print('  %-8s %8.3f %8.3f %+8.3f  (DEF, untouched)' %
      ('DEF', sum(da.values()) / len(da), sum(db.values()) / len(db),
       sum(db.values()) / len(db) - sum(da.values()) / len(da)))

print()
mo = sum(1 for k in BEF if dials(GA, k[0], k[1], BEF[k]['offRaw'], BEF[k]['drtgRef'])[0]
         != dials(GB, k[0], k[1], AFTER[k]['offRaw'], AFTER[k]['drtgRef'])[0])
md = sum(1 for k in BEF if dials(GA, k[0], k[1], BEF[k]['offRaw'], BEF[k]['drtgRef'])[1]
         != dials(GB, k[0], k[1], AFTER[k]['offRaw'], AFTER[k]['drtgRef'])[1])
dr = sum(1 for k in BEF if abs(BEF[k]['drtgRef'] - AFTER[k]['drtgRef']) > 1e-9)
orw = sum(1 for k in BEF if abs(BEF[k]['offRaw'] - AFTER[k]['offRaw']) > 1e-9)
diffs = [dials(GB, k[0], k[1], AFTER[k]['offRaw'], AFTER[k]['drtgRef'])[0]
         - dials(GA, k[0], k[1], BEF[k]['offRaw'], BEF[k]['drtgRef'])[0] for k in BEF]
print('MOVERS: offRaw moved on %d of %d - drtgRef on %d - OFF dial on %d (max %+d / %+d) - DEF dial on %d' %
      (orw, len(BEF), dr, mo, max(diffs), min(diffs), md))
