import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { matchupMargin, scoreVs, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
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
})
