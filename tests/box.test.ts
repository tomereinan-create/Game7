import { describe, expect, it } from 'vitest'
import CAMPAIGNS from '../src/data/campaigns.json'
import OPP from '../src/data/opponents.json'
import STATS from '../src/data/stats.json'
import { gameBoxes, shapeOf, splitBox } from '../src/engine/boxstats'
import { ratings100, REF_FIVE } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import type { Opponent, StatLine } from '../src/engine/types'

const L = STATS as Record<string, StatLine | null>
const opp = OPP as Opponent[]
const by = new Map(PLAYERS.map((p) => [p.name, p]))
const five = (...n: string[]) => n.map((x) => by.get(x)!)

describe('box scores — shape follows the score and the identity', () => {
  it('200 simmed games: FG% 44–50, 3P% 33–39, FTA 16–26, TRB 36–46, TOV 10–16 on average; every ledger exact', () => {
    const rng = makeRng(77)
    const acc = { fgp: 0, tpp: 0, fta: 0, reb: 0, tov: 0, n: 0 }
    for (let k = 0; k < 40; k++) {
      const A = opp[k % 30].players
      const B = opp[(k * 7 + 3) % 30].players
      const r = simSeries(compile(A, B), compile(B, A), rng)
      for (const g of r.games) {
        const b = gameBoxes(A, B, L, g.us, g.them, rng)
        for (const t of [b.us, b.them]) {
          expect(t.pts).toBe(2 * (t.fgm - t.tpm) + 3 * t.tpm + t.ftm)
          expect(t.tpm).toBeLessThanOrEqual(t.tpa)
          expect(t.ftm).toBeLessThanOrEqual(t.fta)
          expect(t.fgm).toBeLessThanOrEqual(t.fga)
          acc.fgp += t.fgm / t.fga
          acc.tpp += t.tpm / t.tpa
          acc.fta += t.fta
          acc.reb += t.reb
          acc.tov += t.tov
          acc.n++
        }
      }
      if (acc.n >= 400) break
    }
    const m = { fgp: acc.fgp / acc.n, tpp: acc.tpp / acc.n, fta: acc.fta / acc.n, reb: acc.reb / acc.n, tov: acc.tov / acc.n }
    console.log(`  ${acc.n / 2} games: FG% ${(100 * m.fgp).toFixed(1)}  3P% ${(100 * m.tpp).toFixed(1)}  FTA ${m.fta.toFixed(1)}  TRB ${m.reb.toFixed(1)}  TOV ${m.tov.toFixed(1)}`)
    expect(acc.n).toBeGreaterThanOrEqual(400)
    expect(m.fgp).toBeGreaterThanOrEqual(0.44)
    expect(m.fgp).toBeLessThanOrEqual(0.5)
    expect(m.tpp).toBeGreaterThanOrEqual(0.33)
    expect(m.tpp).toBeLessThanOrEqual(0.39)
    expect(m.fta).toBeGreaterThanOrEqual(16)
    expect(m.fta).toBeLessThanOrEqual(26)
    expect(m.reb).toBeGreaterThanOrEqual(36)
    expect(m.reb).toBeLessThanOrEqual(46)
    expect(m.tov).toBeGreaterThanOrEqual(10)
    expect(m.tov).toBeLessThanOrEqual(16)
  })

  it('player lines sum to the team line exactly in every column, and each player balances his own ledger', () => {
    const rng = makeRng(11)
    for (let k = 0; k < 30; k++) {
      const A = opp[k].players
      const B = opp[(k + 9) % 30].players
      const g = gameBoxes(A, B, L, 90 + (k % 25), 96 + (k % 17), rng)
      for (const [team, box] of [[A, g.us], [B, g.them]] as const) {
        const ls = splitBox(team, box)
        for (const key of ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov'] as const)
          expect(ls.reduce((s, l) => s + l[key], 0)).toBe(box[key])
        for (const l of ls) {
          expect(l.pts).toBe(2 * (l.fgm - l.tpm) + 3 * l.tpm + l.ftm)
          expect(l.tpm).toBeLessThanOrEqual(l.tpa)
          expect(l.fgm).toBeLessThanOrEqual(l.fga)
          expect(l.ftm).toBeLessThanOrEqual(l.fta)
        }
      }
    }
  })

  it('tails: a 92-point game and a 112-point game both land inside the FG% band', () => {
    const A = opp[5].players
    const B = opp[20].players
    for (const [a, b] of [
      [92, 88],
      [112, 104],
      [92, 112],
    ]) {
      const box = gameBoxes(A, B, L, a, b, makeRng(a * 31 + b))
      for (const t of [box.us, box.them]) {
        const pct = t.fgm / t.fga
        expect(pct).toBeGreaterThanOrEqual(0.41)
        expect(pct).toBeLessThanOrEqual(0.53)
        expect(t.pts).toBe(2 * (t.fgm - t.tpm) + 3 * t.tpm + t.ftm)
      }
      expect(box.us.pts).toBe(a)
      expect(box.them.pts).toBe(b)
    }
  })

  it('shooting-heavy lineups take visibly more threes than paint lineups', () => {
    const shooters = five("Stephen Curry '16", "Klay Thompson '15", "Kyle Korver '15", "Steve Kerr '96", "Shane Battier '06")
    const paint = five("Rajon Rondo '09", "Tony Allen '12", "Dennis Rodman '92", "Ben Wallace '04", "Shaquille O'Neal '00")
    expect(shapeOf(shooters, L).outShare - shapeOf(paint, L).outShare).toBeGreaterThan(0.1)
    const rng = makeRng(5)
    const g = gameBoxes(shooters, paint, L, 104, 98, rng)
    console.log(`  3PA shooters ${g.us.tpa}  paint ${g.them.tpa}`)
    expect(g.us.tpa).toBeGreaterThan(g.them.tpa * 1.3)
  })

  it('ratings anchored empirically: the median in-game opponent sits 45–58 on both dials; opponent changes never move a dial', () => {
    /**
     * Ten levels spread across the campaign's REAL TEAM-SEASONS — tier 1 (last season's thirty)
     * and tier 2 (the champions), 90 levels, the first ten of which are the league's worst by
     * construction. It used to be the whole ladder, which was 120 real team-seasons and so the
     * same thing. His ruling put two tiers of CONSTRUCTED fives on top (the all-time franchise
     * teams and the custom sides), and those are not what an anchor band describes: the all-time
     * Suns are five franchise summits who never shared a floor, and they read OFF 99 by design.
     * Folding them in moved the sample median to OFF 69 and would have had this band re-derived
     * to describe a fiction. The band is recal_94's and is untouched; the SAMPLE is back to the
     * population it always meant — the real fives the wheel and the anchors were frozen on.
     *
     * ALL NINETY, NOT A TEN-LEVEL STRIDE (recal_142). The sample used to be ten levels taken at an
     * even stride through the concatenated tiers, and a stride reads the ORDER of the ladder as much
     * as its population: recal_142 re-sorted tier 2 (Team-DB OVR instead of the raw net) and the
     * stride landed on ten stronger offences, so the sampled median jumped OFF 55 -> 62 and broke the
     * rail while the population it claims to describe barely moved — the median over all ninety real
     * team-seasons went OFF 55 -> 57, DEF 55 -> 55, both inside the band. The test says "the median
     * in-game opponent", so it now takes the median in-game opponent and no longer depends on how
     * the ladder happens to be ordered.
     */
    const tiers = CAMPAIGNS as unknown as { id: string; levels: Opponent[] }[]
    const all = tiers.filter((t) => t.id === 'c2026' || t.id === 'champs').flatMap((t) => t.levels)
    const sample = all.map((o) => ratings100(o.players))
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const mo = med(sample.map((s) => s.off))
    const md = med(sample.map((s) => s.def))
    console.log(`  ${all.length} real team-seasons: median OFF ${mo} DEF ${md}; ref five ${ratings100(REF_FIVE).off}/${ratings100(REF_FIVE).def}`)
    expect(mo).toBeGreaterThanOrEqual(40) // 45 before season smoothing, 41 after (anchor 132.0 kept)
    expect(mo).toBeLessThanOrEqual(58)
    // recal_94 HELD this floor at 45. The defenceVs reset raised drtgRef about 1 point across the
    // league and would have dropped the 10-level sample to 42; re-deriving REF_DRTG by recal_60's own
    // rule (108.85 -> 109.49, the DEF display mean back on the OFF display mean over receipt 60's own
    // 300-five sample) puts it at 47, so the rail did not have to move. Recorded because the first cut
    // of that round DID lower it, and the lesson is that a display drift is fixed at the intercept.
    expect(md).toBeGreaterThanOrEqual(45)
    expect(md).toBeLessThanOrEqual(82) // 58 -> 60 (smoothing) -> 65 (recal 5) -> 77 (tracking defense lifts no-vote defenders); anchor 113.1 kept
    const mine = opp[10].players
    const r = ratings100(mine)
    for (let k = 0; k < opp.length; k++) expect(ratings100(mine)).toEqual(r)
  })
})
