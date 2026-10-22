import { DEFAULT_TACTICS } from '../src/engine/tactics'
import { describe, expect, it } from 'vitest'
import { ROUNDS } from '../src/config'
import SALARIES from '../src/data/salaries.json'
import { PLAYERS } from '../src/engine/pool'
import { buy, checkpointLevel, livesBought, subsPerRound, type Wallet } from '../src/engine/tree'
import { balance, earned } from '../src/engine/tree'
import { advanceTo, afterBuy, afterRespec, applyWear, respecKeeps, clearedCount, currentLevel, die, levelSeed, loadProgress, playable, saveProgress, settledProgress, totalStars, wornOut, type Progress } from '../src/state/campaign'

const prog = (stars: number[]): Progress => ({ coach: 'def', stars, seed: 12345, plays: 0, spent: 0, nodes: {}, roster: null, lives: 0, checkpoint: 0, deaths: 0, wear: {}, subsUsed: 0, tactics: DEFAULT_TACTICS, bench: null })
const zeros = () => Array.from({ length: ROUNDS }, () => 0)

describe('campaign map', () => {
  it('the next level is the first uncleared one; only cleared levels and the next are playable', () => {
    const s = zeros()
    s[0] = 3
    s[1] = 1
    const p = prog(s)
    expect(currentLevel(p)).toBe(3)
    expect(playable(p, 1)).toBe(true) // replay
    expect(playable(p, 3)).toBe(true) // up next
    expect(playable(p, 4)).toBe(false) // locked
    expect(totalStars(p)).toBe(4)
  })

  it('a finished campaign has no current level and a 90-star ceiling', () => {
    const p = prog(Array.from({ length: ROUNDS }, () => 3))
    expect(currentLevel(p)).toBeNull()
    expect(totalStars(p)).toBe(ROUNDS * 3)
  })

  it('replaying a level spins a different wheel each attempt but the same wheel for the same attempt', () => {
    const p = prog(zeros())
    expect(levelSeed(p, 5)).toBe(levelSeed({ ...p }, 5))
    expect(levelSeed(p, 5)).not.toBe(levelSeed({ ...p, plays: 1 }, 5))
    expect(levelSeed(p, 5)).not.toBe(levelSeed(p, 6))
  })
})

/**
 * HIS RULING, verbatim: "Add a rematch button, and advance(If you win your latest stage(not if you
 * go back to a stage you already won))."
 *
 * The rematch is unconditional — the result screen always offers the same level again — so the
 * rule that has to be defended here is the ADVANCE. `advanceTo` reads the save AS IT WAS BEFORE
 * the series settled, which is the only reading that can tell his latest stage from a replay:
 * settling writes the star, and after that a level just won is always the one below the frontier
 * and every night would look like the frontier.
 */
describe('the door onto the next level', () => {
  /** A save whose frontier — the first level with no stars — is `frontier`. */
  const at = (frontier: number) => {
    const s = zeros()
    for (let i = 0; i < frontier - 1; i++) s[i] = 3
    return prog(s)
  }

  it('winning his LATEST stage opens the next one', () => {
    const p = at(12)
    expect(currentLevel(p)).toBe(12)
    expect(advanceTo(p, 12, true)).toBe(13)
  })

  it('winning a stage he ALREADY WON opens nothing — "not if you go back to a stage you already won"', () => {
    const p = at(78)
    expect(advanceTo(p, 12, true)).toBeNull()
    expect(advanceTo(p, 1, true)).toBeNull()
    expect(advanceTo(p, 77, true)).toBeNull()
    // and the frontier still advances off the very same save
    expect(advanceTo(p, 78, true)).toBe(79)
  })

  it('a LOSS never advances, on the frontier or anywhere else', () => {
    const p = at(12)
    expect(advanceTo(p, 12, false)).toBeNull()
    expect(advanceTo(p, 3, false)).toBeNull()
  })

  it('the top of the ladder has nothing above it — level 150 keeps "Claim the title"', () => {
    const p = at(ROUNDS)
    expect(currentLevel(p)).toBe(ROUNDS)
    expect(advanceTo(p, ROUNDS, true)).toBeNull()
  })

  it('the level it names is playable the moment the win is banked', () => {
    const p = at(12)
    const next = advanceTo(p, 12, true)!
    // a won series is worth at least one star, so settling moves the frontier to exactly `next`
    const settled = { ...p, stars: p.stars.map((s, i) => (i === 11 ? Math.max(s, 1) : s)) }
    expect(currentLevel(settled)).toBe(next)
    expect(playable(settled, next)).toBe(true)
  })

  it('is blind to the mode: the campaign, the salary cap and the death match read the same rule', () => {
    // nothing in advanceTo touches lives, wear or a carried five — the three saves answer alike
    const base = at(30)
    for (const p of [base, { ...base, lives: 2 }, { ...base, roster: ['a', 'b', 'c', 'd', 'e'] }]) {
      expect(advanceTo(p, 30, true)).toBe(31)
      expect(advanceTo(p, 29, true)).toBeNull()
      expect(advanceTo(p, 30, false)).toBeNull()
    }
  })
})

/**
 * HIS RULING rebuilt the ladder above level 30 ("After you finish the 30 teams, you start going by
 * champions or other elite teams…"). A save in localStorage is sacred: his own run is on level 5,
 * and it must open on level 5 with its stars where it left them.
 */
describe('a saved run survives the new ladder', () => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  /** A save written by the OLD ladder: 120 levels, no `ladder` stamp. */
  const oldSave = (stars: number[], over: Record<string, unknown> = {}) =>
    store.set(
      'game7.campaign.v2',
      JSON.stringify({ coach: 'def', stars, seed: 7, plays: 4, spent: 0, nodes: {}, deaths: 0, ...over }),
    )

  it('his run — four levels cleared, on level 5 — opens exactly where it was', () => {
    const stars = Array.from({ length: 120 }, () => 0)
    stars[0] = 3
    stars[1] = 2
    stars[2] = 3
    stars[3] = 1
    oldSave(stars, { spent: 5, nodes: { scout_ratings: 3, fo_spin: 2 } })
    const p = loadProgress('campaign')
    expect(p.stars.slice(0, 4)).toEqual([3, 2, 3, 1])
    expect(currentLevel(p)).toBe(5)
    expect(totalStars(p)).toBe(9)
    expect(p.stars).toHaveLength(ROUNDS)
    expect(p.seed).toBe(7)
    expect(p.plays).toBe(4)
    // and the tree he bought is still bought, with the right balance left
    expect(p.nodes).toEqual({ scout_ratings: 3, fo_spin: 2 })
    expect(balance(p)).toBe(4)
  })

  it('stars won past level 30 on the old ladder become credit: the levels reopen, the stars stay spendable', () => {
    const stars = Array.from({ length: 120 }, (_, i) => (i < 45 ? 3 : 0))
    oldSave(stars, { spent: 3, nodes: { scout_ratings: 3 } })
    const p = loadProgress('campaign')
    // the first thirty are untouched; 31-45 are uncleared again
    expect(p.stars.slice(0, 30)).toEqual(Array.from({ length: 30 }, () => 3))
    expect(p.stars.slice(30).every((s) => s === 0)).toBe(true)
    expect(clearedCount(p)).toBe(30)
    expect(currentLevel(p)).toBe(31)
    // 15 levels x 3 stars were earned above the line and are carried, so nothing bought is lost
    expect(p.credit).toBe(45)
    expect(totalStars(p)).toBe(135)
    expect(earned(p)).toBe(135)
    expect(balance(p)).toBe(135 - 3) // `spent` is re-derived from the ranks actually held
  })

  it('a save already on the new ladder passes through untouched, twice', () => {
    const stars = Array.from({ length: ROUNDS }, (_, i) => (i < 40 ? 2 : 0))
    saveProgress('campaign', { ...loadProgress('campaign'), stars, credit: 0, spent: 0, nodes: {} })
    const once = loadProgress('campaign')
    expect(once.credit).toBe(0)
    expect(once.stars.slice(30, 40)).toEqual(Array.from({ length: 10 }, () => 2))
    saveProgress('campaign', once)
    const twice = loadProgress('campaign')
    expect(twice.stars).toEqual(once.stars)
    expect(twice.credit).toBe(0)
  })
})

describe('salary data', () => {
  const sal = SALARIES as Record<string, { sal: number; cap: number; pct: number }>
  it('covers most of the pool and every entry is a sane share of that season’s cap', () => {
    const names = new Set(PLAYERS.map((p) => p.name))
    const keys = Object.keys(sal)
    expect(keys.length / PLAYERS.length).toBeGreaterThan(0.8)
    for (const k of keys) {
      expect(names.has(k)).toBe(true)
      const s = sal[k]
      expect(s.sal).toBeGreaterThan(0)
      expect(s.cap).toBeGreaterThan(0)
      expect(Math.abs(s.pct - (100 * s.sal) / s.cap)).toBeLessThan(0.06)
      expect(s.pct).toBeLessThan(200) // Jordan '97 at 124% is the known ceiling
    }
  })
  it('seasons from 2000 on are nearly complete', () => {
    const modern = PLAYERS.filter((p) => p.peak_season >= 2000)
    const hit = modern.filter((p) => sal[p.name]).length
    expect(hit / modern.length).toBeGreaterThan(0.98)
  })
})

describe('death match — a run, not a map', () => {
  it('a loss spends a life if there is one, and otherwise resets the whole campaign', () => {
    const full = zeros().map(() => 3)
    // with a life in hand the run survives untouched
    const alive = die({ ...prog(full), lives: 2, roster: ['a', 'b', 'c', 'd', 'e'] })
    expect(alive.lives).toBe(1)
    expect(alive.roster).not.toBeNull()
    expect(alive.stars).toEqual(full)
    expect(alive.deaths).toBe(0)
    // out of lives: HIS RULING — everything resets. No stars, no tree, no five, no plan.
    const spent: Progress = {
      ...prog(full),
      lives: 0,
      checkpoint: 20,
      spent: 9,
      nodes: { coach_tactics: 3 },
      roster: ['a', 'b', 'c', 'd', 'e'],
      wear: { a: 12 },
      tactics: { ...DEFAULT_TACTICS, style: 'postup' },
    }
    const dead = die(spent)
    expect(dead.stars.every((s) => s === 0)).toBe(true) // no Saving point bought: nothing is spared
    expect(dead.nodes).toEqual({})
    expect(dead.spent).toBe(0)
    expect(dead.checkpoint).toBe(0)
    expect(dead.roster).toBeNull()
    expect(dead.wear).toEqual({})
    expect(dead.tactics).toEqual(DEFAULT_TACTICS)
    expect(dead.deaths).toBe(1)
    // who he is is not progress, so it survives
    expect(dead.coach).toBe(spent.coach)
    // the CLUB is no longer a ladder's to carry: it lives under its own key and outlives every run
    // by not being in the run at all (2026-09-11, "one team name, colors, for all modes").
    expect('team' in dead).toBe(false)
  })

  it('the Survival branch prices lives, checkpoints and substitutions', () => {
    let w: Wallet = { stars: Array.from({ length: ROUNDS }, () => 2), spent: 0, nodes: {} }
    expect(livesBought(w)).toBe(0)
    expect(checkpointLevel(w)).toBe(0)
    expect(subsPerRound(w)).toBe(1) // one change a round before any node
    w = buy(buy(w, 'surv_life')!, 'surv_life')!
    expect(livesBought(w)).toBe(2)
    w = buy(w, 'surv_save')!
    expect(checkpointLevel(w)).toBe(20)
    w = buy(w, 'surv_sub')!
    expect(subsPerRound(w)).toBe(2)
    expect(buy({ stars: [1], spent: 0, nodes: {} }, 'surv_save')).toBeNull() // chained behind Extra life
  })
})

describe('death match — wear', () => {
  const dur = () => 40
  it('a series costs every man who played it one point of durability per game', () => {
    const five = ['a', 'b', 'c', 'd', 'e']
    // a 4-2 series is six games, so six points off everyone
    const after = applyWear({}, five, 6, dur)
    expect(five.every((n) => after[n] === 34)).toBe(true)
    // a sweep costs four, and wear accumulates across rounds
    const after2 = applyWear(after, five, 4, dur)
    expect(after2.a).toBe(30)
  })

  it('at 7 or less a man is finished, and two of them buy two changes', () => {
    const five = ['a', 'b', 'c', 'd', 'e']
    expect(wornOut({ a: 8, b: 20 }, five, dur)).toEqual([])
    expect(wornOut({ a: 7 }, five, dur)).toEqual(['a'])
    expect(wornOut({ a: 7, b: 3 }, five, dur)).toEqual(['a', 'b'])
    // a man who has not played yet is judged on his card, not on nothing
    expect(wornOut({}, five, () => 5)).toEqual(five)
  })

  // His ruling: a new run starts on a blank plan. The old behaviour carried tempo,
  // style and the glass across the death, so a fresh campaign arrived with a
  // playstyle already lit that he had never chosen for it.
  it('a dead run resets the plan, not just the named men', () => {
    const played: Progress = {
      ...prog(zeros()),
      lives: 0,
      roster: ['a', 'b', 'c', 'd', 'e'],
      tactics: { ...DEFAULT_TACTICS, style: 'postup', tempo: 'fast', crashOff: true, scorer: 'a' },
    }
    expect(die(played).tactics).toEqual(DEFAULT_TACTICS)
    // a life spent is not a new run — the plan he is mid-way through survives
    expect(die({ ...played, lives: 1 }).tactics.style).toBe('postup')
  })

  it('a dead run forgets the wear along with the five', () => {
    const p = { ...prog(zeros()), roster: ['a'], wear: { a: 9 }, lives: 0 }
    expect(die(p).wear).toEqual({})
    // ...but a life spent keeps the run exactly as it was, wear included
    expect(die({ ...p, lives: 1 }).wear).toEqual({ a: 9 })
  })
})

/**
 * THE NIGHT IS BANKED AT THE SIM (the report: "Death Match permadeath can be skipped. Lose a series,
 * tap Home, and the loss never happens"). App writes `settledProgress` the moment a series is
 * simmed, before the result screen lands a game, so walking off that screen cannot undo it. These
 * pin what that one write carries.
 */
describe('a settled series', () => {
  const five = ['a', 'b', 'c', 'd', 'e']
  const dur = () => 80
  const night = (won: boolean, games: number) => ({ level: 1, won, stars: won ? 3 : 0, games, five, heal: 0, dur })

  it('a death-match loss with no life left ends the run in the same write', () => {
    const p: Progress = { ...prog(zeros().map((_, i) => (i < 4 ? 2 : 0))), roster: five, nodes: { coach_tactics: 2 }, spent: 4 }
    const s = settledProgress('death', p, night(false, 4))
    expect(s.deaths).toBe(1)
    expect(s.roster).toBeNull()
    expect(s.stars.every((x) => x === 0)).toBe(true)
    expect(s.nodes).toEqual({})
  })

  it('a death-match loss a life absorbs spends the life AND charges the wear', () => {
    const p: Progress = { ...prog(zeros()), roster: five, lives: 1, subsUsed: 1 }
    const s = settledProgress('death', p, night(false, 6))
    expect(s.lives).toBe(0)
    expect(s.roster).toEqual(five)
    expect(s.wear).toEqual(Object.fromEntries(five.map((n) => [n, 74])))
    expect(s.subsUsed).toBe(0)
    expect(s.plays).toBe(1)
  })

  it('a death-match win banks the stars, the record and the wear, and carries the five', () => {
    const s = settledProgress('death', { ...prog(zeros()), roster: null }, night(true, 5))
    expect(s.stars[0]).toBe(3)
    expect(s.record).toEqual({ w: 1, l: 0 })
    expect(s.roster).toEqual(five)
    expect(s.wear.a).toBe(75)
  })

  it('the bench heals, capped at his card', () => {
    const p: Progress = { ...prog(zeros()), roster: five, bench: 'f', wear: { f: 70 } }
    expect(settledProgress('death', p, { ...night(true, 4), heal: 5 }).wear.f).toBe(75)
    expect(settledProgress('death', p, { ...night(true, 4), heal: 50 }).wear.f).toBe(80)
  })

  it('the other modes bank the stars and the record, keep the better star, and charge no wear', () => {
    const p = prog(zeros().map((_, i) => (i === 0 ? 3 : 0)))
    const lost = settledProgress('campaign', p, night(false, 4))
    expect(lost.stars[0]).toBe(3)
    expect(lost.record).toEqual({ w: 0, l: 1 })
    expect(lost.plays).toBe(1)
    const won = settledProgress('salary', p, { ...night(true, 7), stars: 1 })
    expect(won.stars[0]).toBe(3)
    expect(won.wear).toEqual({})
  })

  it('every settle spends the attempt, so the draft wheel is a new one after it', () => {
    const p = prog(zeros())
    const s = settledProgress('death', { ...p, lives: 1, roster: five }, night(false, 4))
    expect(levelSeed(s, 1)).not.toBe(levelSeed(p, 1))
  })
})

/**
 * THE TWO SURVIVAL NODES THAT DID NOT WORK (2026-10-22): "Saving point does nothing" — a death went
 * to level 1 whatever was bought — and "Lives refill" — any purchase set the lives back to the
 * Extra life rank, so a life lost earlier came back with the next node.
 */
describe('death match — the Saving point and the lives', () => {
  const five = ['a', 'b', 'c', 'd', 'e']
  const upTo = (n: number) => zeros().map((_, i) => (i < n ? 2 : 0))

  it('a run that dies past its checkpoint restarts ON it, with the Saving point still bought', () => {
    // checkpoint 20, frontier at level 26
    const p: Progress = { ...prog(upTo(25)), roster: five, nodes: { surv_life: 1, surv_save: 1, coach_tactics: 2 }, spent: 4, checkpoint: 20, wear: { a: 30 }, record: { w: 25, l: 1 } }
    const d = die(p)
    expect(currentLevel(d)).toBe(20)
    expect(d.stars.slice(0, 19).every((s) => s === 2)).toBe(true)
    expect(d.stars.slice(19).every((s) => s === 0)).toBe(true)
    expect(d.nodes).toEqual({ surv_save: 1 })
    expect(d.spent).toBe(1)
    expect(d.checkpoint).toBe(20)
    expect(d.lives).toBe(0)
    expect(d.roster).toBeNull()
    expect(d.wear).toEqual({})
    expect(d.tactics).toEqual(DEFAULT_TACTICS)
    expect(d.deaths).toBe(1)
    expect(d.record).toEqual({ w: 25, l: 1 })
    // and the next death is caught at the same rung
    const again = die({ ...d, stars: upTo(30), roster: five })
    expect(currentLevel(again)).toBe(20)
  })

  it('the deeper ranks catch the run higher up', () => {
    const p: Progress = { ...prog(upTo(70)), nodes: { surv_life: 1, surv_save: 3 }, spent: 4 }
    expect(currentLevel(die(p))).toBe(60)
  })

  it('dying exactly on the checkpoint level restarts on it; dying below it is a full reset', () => {
    const on = die({ ...prog(upTo(19)), nodes: { surv_life: 1, surv_save: 1 }, spent: 2 })
    expect(currentLevel(on)).toBe(20)
    const below = die({ ...prog(upTo(14)), nodes: { surv_life: 1, surv_save: 1 }, spent: 2 })
    expect(currentLevel(below)).toBe(1)
    expect(below.nodes).toEqual({})
    expect(below.spent).toBe(0)
  })

  it('a life lost stays lost when another node is bought', () => {
    const start: Progress = { ...prog(upTo(10)), roster: five }
    const withLife = afterBuy(start, buy(start, 'surv_life')!)
    expect(withLife.lives).toBe(1)
    const lost = die(withLife)
    expect(lost.lives).toBe(0)
    // the bug: any purchase set lives back to the Extra life rank
    const bought = afterBuy(lost, buy(lost, 'surv_save')!)
    expect(bought.lives).toBe(0)
    expect(bought.checkpoint).toBe(20)
    // a second Extra life rank adds exactly one
    expect(afterBuy(bought, buy(bought, 'surv_life')!).lives).toBe(1)
  })

  it('a respec takes back the lives it refunds, so respec-and-rebuy cannot mint one', () => {
    const start: Progress = { ...prog(upTo(10)) }
    let p = afterBuy(start, buy(start, 'surv_life')!)
    p = afterBuy(p, buy(p, 'surv_save')!)
    const r = afterRespec(p)
    expect(r.lives).toBe(0)
    expect(r.checkpoint).toBe(0)
    expect(r.nodes).toEqual({})
    expect(afterBuy(r, buy(r, 'surv_life')!).lives).toBe(1)
  })

  it('a used life is not refundable: its rank stays bought and its star stays spent', () => {
    const start: Progress = { ...prog(upTo(10)), roster: five }
    let p = afterBuy(start, buy(start, 'surv_life')!)
    p = afterBuy(p, buy(p, 'surv_life')!)
    p = afterBuy(p, buy(p, 'surv_save')!)
    // two lives bought, one spent on a loss
    p = die(p)
    expect(p.lives).toBe(1)
    expect(respecKeeps(p)).toBe(1)
    const r = afterRespec(p)
    expect(r.nodes).toEqual({ surv_life: 1 })
    expect(r.spent).toBe(1)
    expect(r.lives).toBe(0)
    expect(r.checkpoint).toBe(0)
    // the kept rank still counts toward the three: two more lives at most, never a fourth
    let q = afterBuy(r, buy(r, 'surv_life')!)
    q = afterBuy(q, buy(q, 'surv_life')!)
    expect(q.lives).toBe(2)
    expect(buy(q, 'surv_life')).toBeNull()
  })
})
