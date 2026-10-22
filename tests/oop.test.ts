import { describe, expect, it } from 'vitest'
import { WHEEL } from '../src/data/wheel'
import { startingFive, teamFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { compile } from '../src/engine/resolver'
import { defenseVs, MKNOBS, ratings100, REF_FIVE, teamDefense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import { eligible, oneStepFrom, POSITIONS } from '../src/engine/positions'
import { bestStarters } from '../src/engine/starters'
import { LINES } from '../src/ui/Stat'
import type { Player } from '../src/engine/types'

/**
 * recal_232 — his rulings, 2026-10-22: "yes, go with rule C for the 44 teams, but have this player
 * penelised for playing oop" / "re-solve version, 0.13 penalty, build it".
 */
const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const rosterOf = (y: number, ab: string) => WHEEL.find((t) => t.y === y && t.ab === ab)!.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
const card = (p: Player) => BY.get(p.name)!
const names = (f: (Player | null)[]) => f.map((p) => (p ? p.name : null))

describe('recal_232: the team-season five re-solves a hole one step out of position', () => {
  it("Wizards '25: the strict walk has no PF; the re-solve stands Valančiūnas (C) at PF, marked", () => {
    const roster = rosterOf(2025, 'WAS')
    expect(startingFive(roster).five[3]).toBeNull()
    const { five, bench } = teamFive(roster)
    expect(names(five)).toEqual(["Jordan Poole '25", "Kyshawn George '25", "Justin Champagnie '25", "Jonas Valančiūnas '25", "Alex Sarr '25"])
    const jv = five[3]!
    expect(jv.oop).toBe('PF')
    expect(oneStepFrom(eligible(LINES[jv.name]?.pos), 'PF')).toBe('C')
    expect(five.filter((p) => p!.oop).length).toBe(1)
    // a COPY: the card in the pool is untouched, and the bench is cards
    expect(BY.get(jv.name)!.oop).toBeUndefined()
    expect(jv).not.toBe(BY.get(jv.name))
    expect(bench.every((p) => !p.oop && BY.get(p.name) === p)).toBe(true)
    expect(bench.length + 5).toBe(roster.length)
  })

  it('the penalty is exactly MKNOBS.OOP_DRTG = 0.13 per marked man on drtgRef, and 0 on offRaw', () => {
    expect(MKNOBS.OOP_DRTG).toBe(0.13)
    const five = teamFive(rosterOf(2025, 'WAS')).five as Player[]
    const pen = ratings100(five)
    const clean = ratings100(five.map(card))
    expect(pen.drtgRef - clean.drtgRef).toBeCloseTo(0.13, 12)
    expect(pen.offRaw).toBe(clean.offRaw)
    // the dial he sees moves with it: Wizards '25 DEF 41 -> 39 on the all-time scale, OFF untouched
    const gp = seasonGauges(five, 2025)
    const gc = seasonGauges(five.map(card), 2025)
    expect([gc.off, gc.def, gp.off, gp.def]).toEqual([29, 41, 29, 39])
    // every defence path reads the mark: the matchup engine, the standalone lineup, a simmed series
    const them = teamFive(rosterOf(2025, 'OKC')).five as Player[]
    expect(defenseVs(five, them).drtg - defenseVs(five.map(card), them).drtg).toBeCloseTo(0.13, 12)
    expect(defenseVs(five, them).oopPen).toBeCloseTo(0.13, 15)
    expect(teamDefense(five).drtg - teamDefense(five.map(card)).drtg).toBeCloseTo(0.13, 12)
    expect(compile(five, them).drtg - compile(five.map(card), them).drtg).toBeCloseTo(0.13, 12)
    expect(compile(five, them).off).toBe(compile(five.map(card), them).off)
    // ...and only OUR defence: the other five defending a marked five reads exactly as before
    expect(defenseVs(them, five).drtg).toBe(defenseVs(them, five.map(card)).drtg)
  })

  it("a two-man re-solve carries 0.26: Hawks '85 stand Wilkins (SF) at SG and Willis (PF) at SF", () => {
    const five = teamFive(rosterOf(1985, 'ATL')).five as Player[]
    expect(five.map((p) => p.oop ?? null)).toEqual([null, 'SG', 'SF', null, null])
    expect(five[1].name).toBe("Dominique Wilkins '85")
    expect(five[2].name).toBe("Kevin Willis '85")
    expect(ratings100(five).drtgRef - ratings100(five.map(card)).drtgRef).toBeCloseTo(0.26, 12)
    expect(ratings100(five).offRaw).toBe(ratings100(five.map(card)).offRaw)
    expect(defenseVs(five, REF_FIVE).oopPen).toBeCloseTo(0.26, 15)
  })

  it('a strict team is unchanged: same men, same slots, no mark, the same numbers', () => {
    for (const [y, ab] of [[1996, 'CHI'], [2017, 'GSW'], [2008, 'BOS']] as const) {
      const roster = rosterOf(y, ab)
      const s = startingFive(roster)
      const t = teamFive(roster)
      expect(names(t.five)).toEqual(names(s.five))
      expect(t.five.every((p, i) => p === s.five[i] && !p!.oop)).toBe(true)
      const a = ratings100(s.five as Player[])
      const b = ratings100(t.five as Player[])
      expect([b.offRaw, b.drtgRef]).toEqual([a.offRaw, a.drtgRef])
      expect(defenseVs(t.five as Player[], REF_FIVE).oopPen).toBe(0)
    }
  })

  it('over the whole wheel: 1,255 field strictly and are untouched, 44 re-solve with one or two stand-ins, 15 still need five', () => {
    let strict = 0
    let short = 0
    const k: number[] = []
    for (const t of WHEEL) {
      const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
      const s = startingFive(roster).five
      const r = teamFive(roster).five
      if (s.every(Boolean)) {
        strict++
        expect(names(r)).toEqual(names(s))
        expect(r.every((p) => !p!.oop)).toBe(true)
        continue
      }
      if (roster.length < 5) {
        short++
        expect(r.every(Boolean)).toBe(false)
        continue
      }
      // a re-solved club: a full five, and every marked man one step from a listed position
      expect(r.every(Boolean)).toBe(true)
      r.forEach((p, i) => {
        const listed = eligible(LINES[p!.name]?.pos)
        if (p!.oop) {
          expect(p!.oop).toBe(POSITIONS[i])
          expect(oneStepFrom(listed, POSITIONS[i])).not.toBeNull()
        } else expect(listed).toContain(POSITIONS[i])
      })
      k.push(r.filter((p) => p!.oop).length)
    }
    expect([strict, short, k.length]).toEqual([1255, 15, 44])
    expect([k.filter((x) => x === 1).length, k.filter((x) => x === 2).length]).toEqual([36, 8])
  }, 300_000)

  it("a 'best' load brings the re-solved five, marked (Custom, Versus and the batch read it)", () => {
    const five = bestStarters(2025, 'WAS')
    expect(five.length).toBe(5)
    expect(five.find((p) => p.oop)?.name).toBe("Jonas Valančiūnas '25")
  })
})
