import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { matchupMargin, scoreVs, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import { seatOutOfPosition, type Pos } from '../src/engine/positions'
import type { Player } from '../src/engine/types'

/**
 * PARITY (audit ruling 4). The team offense/defense/matchup engine exists twice:
 * `data/team_rating.py` is the design side's reference, `src/engine/offense.ts` is what
 * the game runs. Nothing else keeps them honest, so 50 deterministic lineup pairs go
 * through both and every figure must agree within 0.5 points. A failure blocks the change.
 */
const rnd = (() => {
  let s = 20260823
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 0x100000000)
})()
const pick = (): Player[] => {
  const five: Player[] = []
  const seen = new Set<string>()
  while (five.length < 5) {
    const p = PLAYERS[Math.floor(rnd() * PLAYERS.length)]
    if (seen.has(p.player)) continue
    seen.add(p.player)
    five.push(p)
  }
  return five
}
const PAIRS = Array.from({ length: 50 }, () => [pick(), pick()] as const)

describe('py/ts engine parity', () => {
  it('50 random lineup pairs agree between team_rating.py and offense.ts within 0.5 pts', () => {
    const payload = JSON.stringify(PAIRS.map(([a, b]) => [a.map((p) => p.name), b.map((p) => p.name)]))
    let raw: string
    try {
      raw = execFileSync('python', ['data/parity_check.py'], { input: payload, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    } catch (e) {
      // No Python on this machine: the parity claim cannot be checked, so say so loudly rather than passing quietly.
      throw new Error(`parity harness could not run (python missing or failed): ${(e as Error).message}`)
    }
    const py = JSON.parse(raw) as { off: number; drtg: number; steals: number; net: number; margin: number }[]
    expect(py).toHaveLength(PAIRS.length)
    let worst = 0
    PAIRS.forEach(([a, b], i) => {
      const sv = scoreVs(a, b)
      // like for like: `off` is raw team offense on both sides (scoreVs folds transition points into its own),
      // `net` is score_vs, `margin` is matchup_margin.
      const ts = { off: teamOffense(a).off, drtg: sv.drtg, steals: sv.d.steals, net: sv.net, margin: matchupMargin(a, b) }
      const d = (x: number, y: number) => Math.abs(x - y)
      worst = Math.max(worst, d(ts.off, py[i].off), d(ts.drtg, py[i].drtg), d(ts.net, py[i].net), d(ts.margin, py[i].margin))
      expect(d(ts.off, py[i].off), `OFF, pair ${i}`).toBeLessThanOrEqual(0.5)
      expect(d(ts.drtg, py[i].drtg), `DRtg, pair ${i}`).toBeLessThanOrEqual(0.5)
      expect(d(ts.steals, py[i].steals), `steals, pair ${i}`).toBeLessThanOrEqual(0.5)
      expect(d(ts.net, py[i].net), `NET, pair ${i}`).toBeLessThanOrEqual(0.5)
      expect(d(ts.margin, py[i].margin), `matchup margin, pair ${i}`).toBeLessThanOrEqual(0.5)
    })
    console.log(`  50 pairs, worst disagreement ${worst.toFixed(4)} pts`)
  })

  /**
   * recal_232 — his rulings: "yes, go with rule C for the 44 teams, but have this player penelised for
   * playing oop" / "re-solve version, 0.13 penalty, build it". The mark has to cross the language
   * boundary too: "Name@PF" is that card seated out of position at PF, read by parity_check.py (a
   * dict copy carrying 'oop') and here (positions.ts seatOutOfPosition) alike. TIGHT, not +-0.5: the
   * two engines agree to ~1e-13 on these fives, so 1e-9 holds them to the same arithmetic, and the
   * mark must cost exactly OOP_DRTG on both sides — on the marked five's defence and nowhere else.
   */
  it("recal_232: Wizards '25 with Valančiūnas marked at PF agree to 1e-9, and the mark costs exactly 0.13 on both", () => {
    const WAS = ["Jordan Poole '25", "Kyshawn George '25", "Justin Champagnie '25", "Jonas Valančiūnas '25@PF", "Alex Sarr '25"]
    const WAS0 = WAS.map((n) => n.replace(/@\w+$/, ''))
    const OKC = ["Shai Gilgeous-Alexander '25", "Isaiah Joe '25", "Luguentz Dort '25", "Jalen Williams '25", "Isaiah Hartenstein '25"]
    const by = new Map(PLAYERS.map((p) => [p.name, p]))
    const card = (n: string): Player => {
      const m = /^(.*)@(PG|SG|SF|PF|C)$/.exec(n)
      return m ? seatOutOfPosition(by.get(m[1])!, m[2] as Pos) : by.get(n)!
    }
    const pairs = [[WAS, OKC], [WAS0, OKC], [OKC, WAS], [OKC, WAS0]]
    const raw = execFileSync('python', ['data/parity_check.py'], { input: JSON.stringify(pairs), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    const py = JSON.parse(raw) as { off: number; drtg: number; steals: number; net: number; margin: number }[]
    const ts = pairs.map(([a, b]) => {
      const A = a.map(card)
      const B = b.map(card)
      const sv = scoreVs(A, B)
      return { off: teamOffense(A).off, drtg: sv.drtg, steals: sv.d.steals, net: sv.net, margin: matchupMargin(A, B) }
    })
    ts.forEach((t, i) => {
      for (const k of ['off', 'drtg', 'steals', 'net', 'margin'] as const) expect(Math.abs(t[k] - py[i][k]), `${k}, pair ${i}`).toBeLessThan(1e-9)
    })
    for (const side of [py, ts]) {
      expect(side[0].drtg - side[1].drtg).toBeCloseTo(0.13, 12) // the marked five defends 0.13 worse
      expect(side[0].off).toBe(side[1].off) // offence unpenalised
      expect(side[0].margin - side[1].margin).toBeCloseTo(-0.13, 12)
      expect(side[2].drtg).toBe(side[3].drtg) // the other five defending a marked five: untouched
    }
  })
})
