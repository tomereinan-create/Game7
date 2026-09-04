import { bestBoard, naiveAssignment, pairingTable, pairingTerm, PAIR_SCALE } from './offense'
import { K_MATCH } from '../config'
import { PLAYERS } from './pool'
import { makeRng } from './rng'
import { compile, meanMargin } from './resolver'
import {
  aiTempo,
  DEFAULT_TACTICS,
  pace,
  playmakerPts,
  scorerPts,
  SCHEMES,
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
  // recal_125: the row prices the WHOLE plan the style implies, not the style term alone. For six
  // of the seven that is the same number stylePts returned — a default plan names no scorer and no
  // playmaker — but helio now overtakes both roles (his ruling: "Helio will overtake main playmaker
  // and scorrer, as helio becomes both"), so calling it carries two more taxed terms and the band
  // has to see them or it would be calibrating a price nobody pays.
  push('playstyle', {
    choices: (m) => STYLES.filter((x) => x.key !== 'balanced').map((x) => evFor({ ...DEFAULT_TACTICS, style: x.key as Style }, m.A, m.B)),
  })
  // recal_75: all five real schemes enter the law, not just the original two. A scheme that cannot
  // be made harness-legal does not ship — the band is judged over the whole set the panel offers.
  push('scheme', {
    choices: (m) => SCHEMES.filter((x) => x.key !== 'matchup').map((x) => evFor({ ...DEFAULT_TACTICS, scheme: x.key }, m.A, m.B)),
  })
  push('hunt', { choices: (m) => [evFor({ ...DEFAULT_TACTICS, hunt: true }, m.A, m.B)] })
  push('crash off glass', { choices: (m) => [evFor({ ...DEFAULT_TACTICS, crashOff: true }, m.A, m.B)] })
  push('crash def glass', { choices: (m) => [evFor({ ...DEFAULT_TACTICS, crashDef: true }, m.A, m.B)] })
  // ASSIGNMENT (recal_60): the default is the sane naive board; a random shuffle of it must read
  // negative and the oracle (the best of all 120) positive. The round's own acceptance for this
  // tactic is that pair of signs — the tax is structural (a bad board concedes real edges), so no
  // separate constant exists to tune.
  {
    let rSum = 0
    let oSum = 0
    for (const m of matchups) {
      const bUsg = m.B.map((p) => p.attrs.usg_raw)
      const E = pairingTable(m.A, m.B, bUsg)
      const nv = pairingTerm(E, naiveAssignment(m.A, m.B), bUsg)
      const shuffled = [0, 1, 2, 3, 4].sort(() => rng.next() - 0.5)
      rSum += K_MATCH * PAIR_SCALE * (nv - pairingTerm(E, shuffled, bUsg))
      oSum += K_MATCH * PAIR_SCALE * (nv - pairingTerm(E, bestBoard(E, bUsg), bUsg))
    }
    const random = rSum / matchups.length
    const oracle = oSum / matchups.length
    rows.push({ tactic: 'assignment', dflt: 0, random, oracle, pass: random < 0 && oracle >= 0.5 })
  }
  return rows
}

export const harnessTable = (rows: HarnessRow[]): string =>
  rows
    .map(
      (r) =>
        `${r.tactic.padEnd(16)} default 0.00  random ${r.random >= 0 ? '+' : ''}${r.random.toFixed(2)}  oracle +${r.oracle.toFixed(2)}  ${r.pass ? 'PASS' : 'FAIL'}`,
    )
    .join('\n')
