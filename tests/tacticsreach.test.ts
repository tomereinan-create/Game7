import { describe, expect, it } from 'vitest'
import { ROUNDS } from '../src/config'
import { PLAYERS } from '../src/engine/pool'
import { applyMod, compile, meanMargin } from '../src/engine/resolver'
import { DEFAULT_TACTICS, gateTactics, reconcileTactics, tacticsMod, type Tactics } from '../src/engine/tactics'
import { buy, canBuy, NODES, playbookRank, type NodeId } from '../src/engine/tree'
import { callsPlan, MODES, planFor, type CampaignMode, type Progress } from '../src/state/campaign'

/**
 * THE PLAYBOOK REACHES EVERY CAMPAIGN — his report: "Tactics arent visable in boths
 * campaigns(Salary and normal)."
 *
 * The defect was two halves of the same accident. The Playbook node sits on the COACH branch, and
 * Tree.tsx offers Coach in every mode, so stars could be spent on it in the campaign and the
 * salary cap; but the plan was gated on `death` at App's sim and at the draft's odds, so what
 * those stars bought was nothing at all — no room to call a plan in and no effect if one had been
 * called. These tests are the rule that replaces that gate, and the gate it keeps.
 */
const five = (from: number) => PLAYERS.slice(from, from + 5)
const OURS = five(0)
const THEIRS = five(120)
const OTHER = five(240)

const wallet = (nodes: Partial<Record<NodeId, number>> = {}, tactics: Tactics = DEFAULT_TACTICS): Progress => ({
  coach: null,
  stars: Array.from({ length: ROUNDS }, () => 3),
  seed: 1,
  plays: 0,
  spent: 0,
  nodes,
  roster: null,
  lives: 0,
  checkpoint: 0,
  deaths: 0,
  wear: {},
  subsUsed: 0,
  tactics,
  bench: null,
  record: { w: 0, l: 0 },
})
/** The whole Coach branch, which is the only way to reach the Playbook at all. */
const COACH_TO_PLAYBOOK: NodeId[] = ['coach_optimal', 'coach_manual', 'coach_sigma']
const withPlaybook = (rank: number, tactics: Tactics = DEFAULT_TACTICS) =>
  wallet({ coach_optimal: 1, coach_manual: 1, coach_sigma: 1, ...(rank ? { coach_tactics: rank } : {}) }, tactics)

/** A plan with something called at every rank, so the gate can be read off the result. */
const FULL: Tactics = {
  ...DEFAULT_TACTICS,
  scorer: OURS[0].name,
  playmaker: OURS[1].name,
  tempo: 'fast',
  style: 'pnr',
  crashOff: true,
  crashDef: true,
  scheme: 'switch',
  hunt: true,
}
const names = (f: typeof OURS) => f.map((p) => p.name)

describe('the Playbook is bought in every campaign', () => {
  it('sits on the Coach branch, which no mode filters out', () => {
    expect(NODES.find((n) => n.id === 'coach_tactics')!.branch).toBe('Coach')
  })
  it('and every mode can buy all three of its ranks', () => {
    for (const mode of MODES) {
      let p = wallet()
      for (const id of [...COACH_TO_PLAYBOOK, 'coach_tactics', 'coach_tactics', 'coach_tactics'] as NodeId[]) {
        expect(canBuy(p, id), `${mode}: ${id}`).toBe(true)
        p = buy(p, id)!
      }
      expect(playbookRank(p), mode).toBe(3)
    }
  })
})

describe('so the plan reaches the night in all three modes', () => {
  it('a bought Playbook is heard in the campaign, the salary cap AND the death match', () => {
    for (const mode of MODES) {
      const p = withPlaybook(3, FULL)
      const plan = planFor(mode, p, names(OURS))
      expect(plan, mode).not.toBeNull()
      expect(plan!.style, mode).toBe('pnr')
      expect(plan!.scheme, mode).toBe('switch')
      expect(plan!.hunt, mode).toBe(true)
    }
  })

  it('and it is worth real points of spread on the margin, the same in each', () => {
    const worth: Record<string, number> = {}
    for (const mode of MODES) {
      const plan = planFor(mode, withPlaybook(3, FULL), names(OURS))!
      const base = compile(OURS, THEIRS)
      const theirs = compile(THEIRS, OURS)
      const withPlan = applyMod(base, tacticsMod(plan, OURS, THEIRS))
      worth[mode] = meanMargin(withPlan, theirs) - meanMargin(base, theirs)
      expect(Math.abs(worth[mode]), mode).toBeGreaterThan(0.1)
    }
    // one rule, one price: the mode decides whether there is a plan, never what it is worth
    expect(worth.campaign).toBeCloseTo(worth.salary, 10)
    expect(worth.campaign).toBeCloseTo(worth.death, 10)
  })

  it('and the draft prices exactly what the sim will hear — reconcile, then gate', () => {
    for (const mode of MODES) {
      const p = withPlaybook(2, FULL)
      // what Draft.tsx computes off its own picks…
      const onTheDraft = gateTactics(reconcileTactics(p.tactics, names(OURS)), playbookRank(p))
      // …and what App.tsx hands the resolver
      expect(planFor(mode, p, names(OURS)), mode).toEqual(onTheDraft)
    }
  })
})

describe('the gating that replaces the mode gate', () => {
  it('no Playbook, no plan in the campaign and the salary cap — a run that never bought it is untouched', () => {
    for (const mode of ['campaign', 'salary'] as CampaignMode[]) {
      expect(callsPlan(mode, withPlaybook(0, FULL)), mode).toBe(false)
      expect(planFor(mode, withPlaybook(0, FULL), names(OURS)), mode).toBeNull()
    }
  })

  it('but the DEATH MATCH still always has one, Playbook or not — its pace term is not re-tuned', () => {
    expect(callsPlan('death', withPlaybook(0, FULL))).toBe(true)
    const plan = planFor('death', withPlaybook(0, FULL), names(OURS))
    expect(plan).not.toBeNull()
    // rank 0 hands back the free defaults — no call, no price — which is what it always did
    expect(plan).toEqual(gateTactics(FULL, 0))
    expect(tacticsMod(plan!, OURS, THEIRS).bonus).toBe(0)
  })

  it('each rank opens its own calls, in every mode', () => {
    for (const mode of MODES) {
      const r1 = planFor(mode, withPlaybook(1, FULL), names(OURS))!
      expect(r1.scorer, mode).toBe(OURS[0].name)
      expect(r1.tempo, mode).toBe('fast')
      expect(r1.style, mode).toBe('balanced')
      expect(r1.scheme, mode).toBe('matchup')

      const r2 = planFor(mode, withPlaybook(2, FULL), names(OURS))!
      expect(r2.style, mode).toBe('pnr')
      expect(r2.crashOff, mode).toBe(true)
      expect(r2.scheme, mode).toBe('matchup')
      expect(r2.hunt, mode).toBe(false)

      const r3 = planFor(mode, withPlaybook(3, FULL), names(OURS))!
      expect(r3.scheme, mode).toBe('switch')
      expect(r3.hunt, mode).toBe(true)
    }
  })
})

describe('a five that changes every level', () => {
  /**
   * The campaign and the cap draft a fresh five each night. The plan persists as a PHILOSOPHY —
   * the tempo, the style, the scheme, the glass — and the NAMES are re-read against the men who
   * are actually on the floor, exactly as the death match already treats a plan across a death.
   */
  it('a plan naming men who are nowhere near tonight’s five cannot break the sim', () => {
    const p = withPlaybook(3, FULL)
    expect(names(OTHER).some((n) => names(OURS).includes(n))).toBe(false)
    const plan = planFor('campaign', p, names(OTHER))!
    expect(plan.scorer).toBeNull()
    expect(plan.playmaker).toBeNull()
    expect(plan.pnr).toBeNull()
    // and it still prices, on the engine's own pick, without throwing
    const bonus = tacticsMod(plan, OTHER, THEIRS).bonus
    expect(Number.isFinite(bonus)).toBe(true)
  })

  it('but the philosophy survives the change of five', () => {
    const plan = planFor('salary', withPlaybook(3, FULL), names(OTHER))!
    expect(plan.tempo).toBe('fast')
    expect(plan.style).toBe('pnr')
    expect(plan.scheme).toBe('switch')
    expect(plan.crashOff).toBe(true)
    expect(plan.hunt).toBe(true)
  })

  it('and no five at all — before a man is drafted — is still a legal read', () => {
    const plan = planFor('campaign', withPlaybook(3, FULL), null)!
    expect(plan.scorer).toBeNull()
    expect(plan.style).toBe('pnr')
  })

  it('reading the plan never writes to the save', () => {
    const p = withPlaybook(3, FULL)
    const before = JSON.stringify(p)
    planFor('campaign', p, names(OTHER))
    planFor('death', p, names(OURS))
    expect(JSON.stringify(p)).toBe(before)
  })
})
