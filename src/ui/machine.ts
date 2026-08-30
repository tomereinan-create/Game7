import { makeRng } from '../engine/rng'

/**
 * THE MACHINE'S BRAIN, pure and testable (his report: it paid $9 for a Conley
 * and waved LeBron through at $2). Dollars anchor to the CARD, not the pool:
 * absolute OVR tiers set the value, a star floor forbids waving a 90+ man
 * through while solvent, and pacing keeps the splurge for elites only. Its
 * market reads use distribution knowledge — the generator's tier composition —
 * never the actual queue order; peeking would be an oracle no human has.
 */

export const BUDGET = 20
export const SLOTS = 5

export type Skill = 'rookie' | 'pro' | 'shark'

export interface MachineCtx {
  seed: number
  /** Served-lot ordinal — the noise is deterministic per lot. */
  lot: number
  price: number
  skill: Skill
  /** The lot's OVR. */
  ovr: number
  /** The hard reserve ceiling for this lot: budget − $1 per future slot. */
  hard: number
  budget: number
  /** Men the Machine already holds. */
  bought: number
  /** Unfilled chairs across BOTH sides — the horizon of lots likely still to air. */
  chairsBoth: number
  /** Expected fillers for its scarcest fitting slot over that horizon (composition × horizon). */
  scarcest: number
  /** Share of 90+ men in the generator's front tier (composition, not order). */
  starDensity: number
}

/**
 * The tier table — what a card is worth before level color:
 *   OVR 95+  elite: 85% of the hard ceiling, walking to 100% at 99
 *   OVR 90-94      45% of spare +3%/point — up to ~57%
 *   OVR 85-89      $4-6
 *   OVR 80-84      $2-3
 *   OVR 75-79      $1
 *   below          $0 — pass
 */
export function tierValue(ovr: number, hard: number, spare: number): number {
  if (ovr >= 95) return Math.round(hard * (0.85 + 0.15 * Math.min(1, (ovr - 95) / 4)))
  if (ovr >= 90) return Math.round(spare * (0.45 + 0.03 * (ovr - 90)))
  if (ovr >= 85) return 4 + (ovr >= 87 ? 1 : 0) + (ovr >= 89 ? 1 : 0)
  if (ovr >= 80) return 2 + (ovr >= 82 ? 1 : 0)
  return ovr >= 75 ? 1 : 0
}

/** The Machine's private ceiling for the man on the block, in dollars. */
export function machineWants(c: MachineCtx): number {
  const spare = c.hard - 1
  const tier = tierValue(c.ovr, c.hard, spare)
  const rng = makeRng((c.seed ^ Math.imul(c.lot + 1, 0x9e3779b9)) >>> 0)
  let v = tier
  // fat wallet, many chairs: sub-star lots read a notch higher
  if (v > 0 && c.ovr < 90 && SLOTS - c.bought >= 3 && c.budget > BUDGET / 2) v += 1
  // patience (pro/shark): the block never stops serving, so a chair is worth more than a
  // sub-80 man — it holds out for 80+ and only the last chair takes a cheap filler
  if (c.skill !== 'rookie' && c.ovr < 80 && SLOTS - c.bought > 1) v = 0
  if (c.skill === 'rookie') {
    // sloppy on the new tiers: star haircut (the floor below still makes it contest),
    // the odd mid-lot crush, wide noise
    if (c.ovr >= 90) v = Math.round(v * 0.6)
    if (c.ovr >= 80 && c.ovr < 90 && rng.next() < 0.25) v += 3
    v += rng.int(7) - 3
  } else if (c.skill === 'shark') {
    if (c.scarcest < 2) v += 2 // the chair he fills is drying up
    if (SLOTS - c.bought === 1) v += 1 // last chair
    // star endgame from composition: expected 90+ arrivals over the ~3-lots-a-chair horizon
    // against the chairs it still owes
    if (c.ovr >= 90 && 3 * c.chairsBoth * c.starDensity < SLOTS - c.bought) v = Math.max(v, Math.round(c.hard * 0.8))
    if (v > 0) v += rng.int(2) // noise only nudges up — and never talks it into a $1 nobody
  } else {
    if (c.scarcest < 2) v += 1
    if (v > 0) v += rng.int(3) - 1 // a $0 tier stays a pass — noise colors value, it does not create it
  }
  // pacing: before its 3rd man no single non-elite lot may take past 45% of the
  // starting budget — the splurge is for elites only
  if (c.bought < 2 && c.ovr < 95) v = Math.min(v, Math.round(BUDGET * 0.45))
  // the star floor: while it has a legal slot and money over the reserve, a 90+ lot
  // is ALWAYS contested to at least min(40% of the hard ceiling, the tier value)
  if (c.ovr >= 90) v = Math.max(v, Math.min(Math.max(1, Math.round(c.hard * 0.4)), Math.max(1, tier)))
  return Math.max(0, Math.min(v, c.hard))
}

/** Raise or fold at the current price. Rookie's random folds spare 90+ lots — no star waved through. */
export function machineTakes(c: MachineCtx): boolean {
  const p = c.price + 1
  if (p > c.hard) return false
  let take = p <= machineWants(c)
  if (c.skill === 'rookie' && take && c.ovr < 90) {
    const r = makeRng((c.seed ^ Math.imul(c.lot + 1, 0x85ebca6b) ^ (c.price * 977)) >>> 0)
    if (c.price === 0 && r.next() < 0.2) take = false // sleeps on a $1 bargain
    else if (c.price >= 2 && r.next() < 0.15) take = false // folds a beat too early
  }
  return take
}
