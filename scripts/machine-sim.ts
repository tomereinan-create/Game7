/**
 * MACHINE VERIFICATION: simulates full 1v1 Bid auctions with the
 * app's exact settlement rules — human plays greedy-stars, The Machine runs the
 * new machine.ts brain. Asserts rule 2 (no 90+ lot sold to the human under the
 * Machine's floor while it was solvent with a legal slot) and reports final-five
 * mean OVR gaps.
 */
import { PLAYERS } from '../src/engine/pool'
import { eligible, POSITIONS } from '../src/engine/positions'
import { makeRng } from '../src/engine/rng'
import type { Player } from '../src/engine/types'
import { LINES } from '../src/ui/Stat'
import { BUDGET, machineTakes, SLOTS, tierValue, type MachineCtx, type Skill } from '../src/ui/machine'

const canSlot = (p: Player, j: number) => eligible(LINES[p.name]?.pos).includes(POSITIONS[j])

function auctionQueue(seed: number): Player[] {
  const rng = makeRng(seed)
  const seen = new Set<string>()
  const out: Player[] = []
  for (const min of [18, 15, 0]) {
    for (const p of rng.shuffle(PLAYERS.filter((x) => (LINES[x.name]?.ppg ?? 0) >= min))) {
      if (seen.has(p.player)) continue
      seen.add(p.player)
      out.push(p)
    }
  }
  return out
}

interface SideState {
  budget: number
  slots: (Player | null)[]
}

function run(seed: number, skill: Skill) {
  const queue = auctionQueue(seed)
  const tier1 = queue.filter((x) => (LINES[x.name]?.ppg ?? 0) >= 18)
  const compo = {
    pos: POSITIONS.map((_, j) => tier1.filter((x) => canSlot(x, j)).length / Math.max(1, tier1.length)),
    star: tier1.filter((x) => x.ovr >= 90).length / Math.max(1, tier1.length),
  }
  const S: [SideState, SideState] = [
    { budget: BUDGET, slots: Array(SLOTS).fill(null) },
    { budget: BUDGET, slots: Array(SLOTS).fill(null) },
  ]
  const countOf = (i: 0 | 1) => S[i].slots.filter(Boolean).length
  const full = (i: 0 | 1) => countOf(i) === SLOTS
  const ceiling = (i: 0 | 1) => S[i].budget - (SLOTS - 1 - countOf(i))
  const legalOpen = (i: 0 | 1, p: Player) => POSITIONS.map((_, j) => j).filter((j) => !S[i].slots[j] && canSlot(p, j))

  // greedy-stars human: full reserve ceiling on 90+, $6 on 85-89, $2 on 80-84, refuses the rest
  const humanCeil = (p: Player) => {
    const hard = ceiling(0)
    return Math.min(hard, p.ovr >= 90 ? hard : p.ovr >= 85 ? 6 : p.ovr >= 80 ? 2 : 0)
  }

  let violations = 0
  let lot = 0
  let served = 0
  const sold: string[] = []
  while (!(full(0) && full(1)) && lot < queue.length) {
    // the server: next man somebody can slot
    while (lot < queue.length && !legalOpen(0, queue[lot]).length && !legalOpen(1, queue[lot]).length) lot++
    const man = queue[lot]
    if (!man) break
    served++
    let price = 0
    let top: 0 | 1 | null = null
    const passed: [boolean, boolean] = [false, false]
    const outFor = (i: 0 | 1) => passed[i] || full(i) || !legalOpen(i, man).length

    const mCtx = (): MachineCtx => {
      const fit = legalOpen(1, man)
      const chairsBoth = 2 * SLOTS - countOf(0) - countOf(1)
      return {
        seed,
        lot,
        price,
        skill,
        ovr: man.ovr,
        hard: ceiling(1),
        budget: S[1].budget,
        bought: countOf(1),
        chairsBoth,
        scarcest: fit.length ? Math.min(...fit.map((j) => 3 * chairsBoth * compo.pos[j])) : 99,
        starDensity: compo.star,
      }
    }
    // machine floor at lot open, for the rule-2 assertion: min(40% of hard, tier value)
    const mSolvent = !outFor(1) && ceiling(1) >= 1
    const mFloor =
      mSolvent && man.ovr >= 90
        ? Math.min(Math.max(1, Math.round(ceiling(1) * 0.4)), Math.max(1, tierValue(man.ovr, ceiling(1), ceiling(1) - 1)))
        : 0

    const sell = (i: 0 | 1, p: number) => {
      const opts = legalOpen(i, man)
      const j = i === 1 ? opts.reduce((b, x) => (compo.pos[x] < compo.pos[b] ? x : b), opts[0]) : opts[0]
      S[i].budget -= p
      S[i].slots[j] = man
      sold.push(`${i === 0 ? 'P1' : 'MC'} $${p} ${man.ovr} ${man.name}`)
      if (i === 0 && man.ovr >= 90 && p < mFloor) violations++
      lot++
    }

    // the app's turn flow: machine acts whenever top !== 1 and it is live; human answers when machine holds top
    let guard = 0
    let resolved = false
    while (!resolved && guard++ < 200) {
      if (outFor(0) && outFor(1) && top === null) {
        lot++ // discard
        resolved = true
      } else if (top !== 1 && !outFor(1)) {
        // machine's move (lot open or human holds top)
        const p = price + 1
        if (machineTakes(mCtx()) && p <= ceiling(1)) {
          if (outFor(0) || p + 1 > ceiling(0)) {
            sell(1, p)
            resolved = true
          } else {
            price = p
            top = 1
          }
        } else if (top === 0) {
          sell(0, Math.max(1, price))
          resolved = true
        } else if (outFor(0)) {
          lot++ // both out, no bid — discard
          resolved = true
        } else passed[1] = true
      } else if (!outFor(0)) {
        // human's move
        const p = price + 1
        if (p <= humanCeil(man) && p <= ceiling(0)) {
          if (outFor(1) || p + 1 > ceiling(1)) {
            sell(0, p)
            resolved = true
          } else {
            price = p
            top = 0
          }
        } else if (top === 1) {
          sell(1, Math.max(1, price))
          resolved = true
        } else if (outFor(1)) {
          lot++
          resolved = true
        } else passed[0] = true
      } else if (top !== null) {
        sell(top, Math.max(1, price))
        resolved = true
      } else {
        lot++
        resolved = true
      }
    }
  }
  const mean = (i: 0 | 1) => S[i].slots.filter((p): p is Player => !!p).reduce((a, p) => a + p.ovr, 0) / Math.max(1, countOf(i))
  return { seed, served, violations, p1: mean(0), mc: mean(1), spent: [BUDGET - S[0].budget, BUDGET - S[1].budget], sold }
}

let totalViol = 0
const gaps: number[] = []
for (const seed of [11, 42, 137, 1996, 2014, 31337, 777, 90210, 555, 12345]) {
  const r = run(seed, 'shark')
  totalViol += r.violations
  gaps.push(r.p1 - r.mc)
  console.log(
    `seed ${String(r.seed).padStart(5)} · lots ${String(r.served).padStart(3)} · P1 ${r.p1.toFixed(1)} ($${r.spent[0]}) vs MC ${r.mc.toFixed(1)} ($${r.spent[1]}) · gap ${(r.p1 - r.mc).toFixed(1)} · rule2 violations ${r.violations}`,
  )
}
console.log(`\nSHARK over 10 seeds: rule-2 violations ${totalViol}, mean gap ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2)}, worst gap ${Math.max(...gaps).toFixed(1)}`)

// one detailed tape for the eyeball
const tape = run(1996, 'shark')
console.log('\nseed 1996 tape:')
for (const line of tape.sold) console.log('  ' + line)
