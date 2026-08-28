import { PLAYERS } from './pool'
import { makeRng } from './rng'
import { compile, meanMargin } from './resolver'
import {
  aiTempo,
  DEFAULT_TACTICS,
  pace,
  playmakerPts,
  scorerPts,
  stylePts,
  STYLES,
  tacticsParts,
  type Style,
  type Tactics,
} from './tactics'
import type { Player } from './types'

/**
 * THE ENFORCEMENT HARNESS (recal_59, permanent). The Deviation Tax Law says every tactic must be
 * calibrated so that on random matchups the ORACLE (best choice, default included) averages at
 * least +0.5 margin and a BLIND deviation averages -0.3 to -1.5. This runs the measurement: N
 * random matchups per tactic, three policies each. The test suite runs it on every change forever;
 * a tactic outside the band is mis-calibrated and the build should not ship until its tax is tuned.
 */
export interface HarnessRow {
  tactic: string
  dflt: number
  random: number
  oracle: number
  pass: boolean
}

const evFor = (t: Tactics, five: Player[], theirs: Player[]): number =>
  tacticsParts(t, five, theirs).reduce((a, x) => a + x.pts, 0)

export function runHarness(N = 200, seed = 20260828): HarnessRow[] {
  const rng = makeRng(seed)
  const pool = PLAYERS.filter((p) => p.ovr >= 55)
  const five = (): Player[] => {
    const out: Player[] = []
    const seen = new Set<string>()
    while (out.length < 5) {
      const p = pool[Math.floor(rng.next() * pool.length)]
      if (seen.has(p.player)) continue
      seen.add(p.player)
      out.push(p)
    }
    return out
  }
  const matchups = Array.from({ length: N }, () => ({ A: five(), B: five() }))

  const rows: HarnessRow[] = []
  const push = (tactic: string, evals: { choices: (m: { A: Player[]; B: Player[] }) => number[] }) => {
    let rSum = 0
    let oSum = 0
    for (const m of matchups) {
      const evs = evals.choices(m) // the DEVIATION choices only; default is always 0
      rSum += evs[Math.floor(rng.next() * evs.length)]
      oSum += Math.max(0, ...evs)
    }
    const random = rSum / matchups.length
    const oracle = oSum / matchups.length
    rows.push({ tactic, dflt: 0, random, oracle, pass: random >= -1.5 && random <= -0.3 && oracle >= 0.5 })
  }

  push('main scorer', { choices: (m) => m.A.map((p) => scorerPts(p.name, m.A, m.B)) })
  push('main playmaker', { choices: (m) => m.A.map((p) => playmakerPts(p.name, m.A, m.B)) })
  push('tempo', {
    choices: (m) => {
      const dog = meanMargin(compile(m.B, m.A), compile(m.A, m.B)) < 0
      return (['slow', 'fast'] as const).map((k) => pace(k, aiTempo(m.B, m.A, dog), m.A, m.B).margin)
    },
  })
  push('playstyle', {
    choices: (m) =>
      STYLES.filter((x) => x.key !== 'balanced').map((x) =>
        stylePts({ ...DEFAULT_TACTICS, style: x.key as Style }, m.A, m.B),
      ),
  })
  push('scheme', {
    choices: (m) => (['drop', 'switch'] as const).map((k) => evFor({ ...DEFAULT_TACTICS, scheme: k }, m.A, m.B)),
  })
  push('hunt', { choices: (m) => [evFor({ ...DEFAULT_TACTICS, hunt: true }, m.A, m.B)] })
  push('crash off glass', { choices: (m) => [evFor({ ...DEFAULT_TACTICS, crashOff: true }, m.A, m.B)] })
  push('crash def glass', { choices: (m) => [evFor({ ...DEFAULT_TACTICS, crashDef: true }, m.A, m.B)] })
  return rows
}

export const harnessTable = (rows: HarnessRow[]): string =>
  rows
    .map(
      (r) =>
        `${r.tactic.padEnd(16)} default 0.00  random ${r.random >= 0 ? '+' : ''}${r.random.toFixed(2)}  oracle +${r.oracle.toFixed(2)}  ${r.pass ? 'PASS' : 'FAIL'}`,
    )
    .join('\n')
