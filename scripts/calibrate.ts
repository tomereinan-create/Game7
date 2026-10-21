/**
 * CALIBRATION — is the card honest? A card that reads 98% has to lose about 2% of its series over
 * ten thousand runs, or the number on the draft screen is a decoration.
 *
 *   npm run calibrate                  10,000 seeded series a matchup
 *   npm run calibrate -- --n 50000     tighter
 *
 * THE MATCHUPS. Level 1's opponent against every real starting five on the wheel, the way the
 * campaign plays level 1: compiled against each other, the five on the naive board (no Coach node
 * bought yet), sigma 10, best of seven. Their cards spread from about 14% to 99.8%; for each target
 * on the 50-99.5% range the three fives whose card sits nearest it are run, 10,000 series each on
 * seeds 1..n (engine/batch.ts), and the bucket compares the mean card with the mean result.
 *
 * TWO NIGHTS. (a) The plain campaign: no plan, which is every night until the Playbook node. (b) A
 * plan called — the Playbook node, and every death-match night: the plan's price and the PACE term
 * move the spread and the noise, so the card has to price the same paced night the sim plays. (b)
 * runs the nights where that is hardest: the surpluses are a wash, so the AI's tempo answer hangs on
 * whether it is the underdog (tactics.ts aiTempo).
 *
 * THE RULE: a bucket more than 2 points off is a bug in the CARD, never in the sim — find why and fix
 * odds.ts until the card prints what the sim does. One standard error is printed beside each gap so a
 * 0.3 can be read as the noise it is.
 */
import { batchLineups, LADDER } from '../src/engine/batch'
import { night, odds, type Night } from '../src/engine/odds'
import { usageSurplus } from '../src/engine/offense'
import { realStarters } from '../src/engine/starters'
import { DEFAULT_TACTICS, type Tactics } from '../src/engine/tactics'
import { WHEEL } from '../src/data/wheel'
import type { Player } from '../src/engine/types'

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const N = arg('n', 10000)
const SEED = arg('seed', 1)
const TARGETS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.97, 0.98, 0.99, 0.995]
const PER = 3

const L1 = LADDER[0]
const fives = WHEEL.map((t) => ({ k: `${t.y}-${t.ab}`, five: realStarters(t.y, t.ab) })).filter((x) => x.five.length === 5)

interface Pick {
  k: string
  /** What the draft card prints: odds() of the night (Draft.tsx). */
  card: number
  /** The night the sim plays (App.tsx) — the same `night` call since P8. */
  sim: Night
}
/** Level 1 against a five, naive board, no staff: both the card and the sim read odds.ts `night`. */
function pick(k: string, five: Player[], plan: Tactics | null): Pick {
  const nt = night(five, L1.players, 'naive', plan)
  return { k, card: odds(nt.mine, nt.theirs, nt.sigma).series, sim: nt }
}
function block(title: string, cands: Pick[]) {
  console.log(`\n${title}`)
  console.log(`  ${'card target'.padEnd(12)} ${'fives'.padEnd(44)} ${'card'.padStart(7)} ${'sim'.padStart(7)} ${'gap'.padStart(6)} ${'±1 se'.padStart(6)}`)
  let worst = 0
  for (const t of TARGETS) {
    const near = [...cands].sort((a, b) => Math.abs(a.card - t) - Math.abs(b.card - t)).slice(0, PER)
    let card = 0
    let won = 0
    for (const m of near) {
      card += m.card
      won += batchLineups(m.sim.mine, m.sim.theirs, { n: N, seed: SEED, sigma: m.sim.sigma, closest: 0 }).aWins
    }
    const pred = card / near.length
    const obs = won / (N * near.length)
    const gap = 100 * (obs - pred)
    const se = 100 * Math.sqrt((pred * (1 - pred)) / (N * near.length))
    worst = Math.max(worst, Math.abs(gap))
    // over 2 points is the rule; over 4 standard errors is a bias the sample can already see
    const flag = Math.abs(gap) > 2 ? '   OFF BY MORE THAN 2' : Math.abs(gap) > 4 * se ? '   BIASED (> 4 se)' : ''
    console.log(
      `  ${`${(100 * t).toFixed(1)}%`.padEnd(12)} ${near.map((m) => m.k).join(' ').padEnd(44)} ${`${(100 * pred).toFixed(2)}%`.padStart(7)} ${`${(100 * obs).toFixed(2)}%`.padStart(7)} ${`${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(2)}`.padStart(6)} ${se.toFixed(2).padStart(6)}${flag}`,
    )
  }
  return worst
}

console.log(`Level 1: ${L1.team} (${L1.players.map((p) => p.name).join(', ')}) · ${N.toLocaleString('en-US')} series a five, seeds ${SEED}..${SEED + N - 1}`)
const w1 = block(
  '(a) the plain campaign — no plan, naive board, sigma 10',
  fives.map((f) => pick(f.k, f.five, null)),
)
// (b) the default plan (normal tempo), on the nights where the AI's tempo answer hangs on the underdog flag
const wash = fives.filter((f) => Math.abs(usageSurplus(L1.players) - usageSurplus(f.five)) <= 2)
const w2 = block(
  '(b) a plan called (the default plan: normal tempo), surpluses a wash — the card vs the paced night the sim plays',
  wash.map((f) => pick(f.k, f.five, DEFAULT_TACTICS)),
)

console.log(`\nworst bucket: ${Math.max(w1, w2).toFixed(2)} points${Math.max(w1, w2) > 2 ? ' — THE CARD IS OFF: fix odds.ts, not the sim' : ' — within 2'}`)
