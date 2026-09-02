/** DIAGNOSIS sweep: every wheel team-season, gauge OFF/DEF exactly as TeamDb shows, plus internals. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WHEEL } from '../../src/data/wheel'
import { PLAYERS } from '../../src/engine/pool'
import { startingFive } from '../../src/engine/bestfive'
import { seasonGauges } from '../../src/engine/gauges'
import { ratings100, defenseVs, teamOffense, REF_FIVE } from '../../src/engine/offense'
import type { Player } from '../../src/engine/types'

const BY_NAME = new Map(PLAYERS.map((p) => [p.name, p]))
const here = dirname(fileURLToPath(import.meta.url))

const rows: any[] = []
let unfieldable = 0
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)
  const sf = startingFive(roster)
  const five = sf.five.filter((p): p is Player => !!p)
  if (five.length !== 5) { unfieldable++; continue }
  const g = seasonGauges(five, t.y)
  const r = ratings100(five)
  const d = defenseVs(five, REF_FIVE)
  const o = teamOffense(five)
  rows.push({
    y: t.y, team: t.team, ab: t.ab, rec: t.rec,
    off: g.off, def: g.def, offRaw: g.offRaw, drtgRef: g.drtgRef,
    off100: r.off, def100: r.def,
    five: five.map((p) => ({
      name: p.name, ovr: p.ovr, o_ovr: p.o_ovr, d_ovr: p.d_ovr,
      perdef: p.attrs.perdef, rimprot: p.attrs.rimprot, perimdisrupt: p.attrs.perimdisrupt,
      drb: p.attrs.drb, orb: p.attrs.orb, discipline: p.attrs.discipline, height: p.attrs.height,
      usg: p.attrs.usg_raw, ts_rel: p.attrs.ts_rel ?? p.attrs.ts_raw, three: p.attrs['3pt'], rim: p.attrs.rim,
    })),
    bench: sf.bench.map((p) => ({ name: p.name, ovr: p.ovr, d_ovr: p.d_ovr, perdef: p.attrs.perdef, rimprot: p.attrs.rimprot })),
    dec: {
      didx: d.didx, effDi: d.effDi, anchor: d.anchor, anchorIdx: d.anchorIdx, cover: 0,
      steals: d.steals, onball: d.onball, team: d.team, glass: d.glass, discPts: 0,
      huntPen: d.huntPen, hide: d.hide, minOppOut: d.minOppOut, paintOrient: d.paintOrient,
      cDi: 0.55 * d.effDi, cAnchor: 0.13 * Math.min(99, d.anchor) * 0.9,
      cSteal: 0.12 * Math.min(99, d.steals) * 0.9, cGlass: 0.12 * Math.max(0, 60 + d.glass / 4),
      sumPerdef: five.reduce((s, p) => s + p.attrs.perdef, 0),
      deficit: five.reduce((s, p, i) => (i === d.anchorIdx ? s : s + Math.max(0, 60 - p.attrs.perdef)), 0),
    },
    offdec: { base: o.base, ftPts: o.ftPts, orbMult: o.orbMult },
  })
}
mkdirSync(here, { recursive: true })
writeFileSync(join(here, 'sweep.json'), JSON.stringify({ n: rows.length, unfieldable, rows }, null, 0))
console.log('fielded', rows.length, 'unfieldable', unfieldable, 'of', WHEEL.length)
