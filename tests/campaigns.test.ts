import { describe, expect, it } from 'vitest'
import CAMPAIGNS from '../src/data/campaigns.json'
import PLAYERS from '../src/data/players_stats.json'
import WHEEL from '../src/data/teamseasons.json'
import { ROUNDS } from '../src/config'
import { LEVELS, ERAS } from '../src/App'
import { startingFive } from '../src/engine/bestfive'
import { seasonGauges } from '../src/engine/gauges'
import { ratings100 } from '../src/engine/offense'
import type { Opponent, Player } from '../src/engine/types'

interface Tier {
  id: string
  name: string
  years: [number, number]
  handicap: number
  levels: Opponent[]
}
const tiers = CAMPAIGNS as unknown as Tier[]
const pct = (r: string) => {
  const [w, l] = r.split('–').map(Number)
  return w / (w + l)
}
/** Where a five sits on the all-time dial — the number tier 4 is ordered by, and tier 2's tie-break. */
const net = (o: Opponent) => {
  const r = ratings100(o.players as Player[])
  return r.offRaw - r.drtgRef
}
/**
 * The Team DB's own OVR (TeamDb.tsx ovrOf): the mean of the era-relative OFF and DEF dials, read in
 * the five's own season. recal_142 makes it the key tier 2 climbs by.
 */
const dialOvr = (o: Opponent) => {
  const g = seasonGauges(o.players as Player[], o.season!)
  return Math.round((g.off + g.def) / 2)
}
/** The roster the Team DB feeds startingFive for a real team-season. */
const BY_NAME = new Map((PLAYERS as unknown as Player[]).map((p) => [p.name, p]))
const rosterOf = (o: Opponent) => {
  const t = (WHEEL as { y: number; ab: string; p: string[] }[]).find((x) => x.y === o.season && x.ab === o.ab)
  return (t?.p ?? []).map((n) => BY_NAME.get(n)).filter((p): p is Player => !!p)
}
/** The talent a side puts on the floor — the key tier 3 climbs by (recal_113). */
const sumOvr = (o: Opponent) => (o.players as Player[]).reduce((a, p) => a + p.ovr, 0)
/** The men on a level, by bare name. */
const menOf = (o: Opponent) => new Set((o.players as Player[]).map((p) => p.player))

/**
 * HIS RULING: "Lets change the campaign a little. After you finish the 30 teams, you start going by
 * champions or other elite teams until these are finished. Then you start playing vs all time
 * "Team". Like the all time Celtics(Best 5 players on a celtics). You climb the all time, Lal prob
 * the hardest, and then you start playing againt costum teams. All stars, all decade. etc"
 */
describe('one ladder of four tiers', () => {
  it('the four tiers make the whole campaign, and ROUNDS is counted off them', () => {
    expect(tiers.map((t) => t.id)).toEqual(['c2026', 'champs', 'alltime', 'customs'])
    expect(tiers.map((t) => t.levels.length)).toEqual([30, 60, 30, 30])
    expect(tiers.reduce((a, t) => a + t.levels.length, 0)).toBe(ROUNDS)
    expect(ROUNDS).toBe(150)
  })

  it('the handicap never falls as the ladder climbs, and tier 1 carries none', () => {
    expect(tiers[0].handicap).toBe(0) // tier 1 is the game as it always was
    for (let i = 1; i < tiers.length; i++) expect(tiers[i].handicap).toBeGreaterThanOrEqual(tiers[i - 1].handicap)
    expect(tiers[tiers.length - 1].handicap).toBeGreaterThan(0)
  })

  it('every level fields a legal, complete five', () => {
    for (const t of tiers) {
      for (const o of t.levels) {
        expect(o.players).toHaveLength(5)
        expect(o.positions).toEqual(['PG', 'SG', 'SF', 'PF', 'C'])
        expect(new Set(o.players.map((p) => p.player)).size).toBe(5) // one man, one card
        expect(o.record ?? o.tag).toBeTruthy() // the ticket stub always has a line
      }
    }
  })

  it('the levels number 1..150 with no gap and no overlap, and every tier band starts where the last ended', () => {
    expect(LEVELS.map((o) => o.round)).toEqual(Array.from({ length: ROUNDS }, (_, i) => i + 1))
    expect(ERAS.map((e) => e.first)).toEqual([1, 31, 91, 121])
    expect(ERAS.map((e) => e.name)).toEqual(['The League', 'The Champions', 'All-Time', 'The Customs'])
    for (const l of LEVELS) expect(l.era).toBeTruthy()
  })

  it('tier 1 is last season, worst REAL record first — its own key, not a reading off the engine', () => {
    const t = tiers[0]
    const yr = Math.max(...t.levels.map((o) => o.season!))
    for (const o of t.levels) expect(o.season).toBe(yr)
    expect(t.levels.every((o, i) => i === 0 || pct(o.record!) >= pct(t.levels[i - 1].record!))).toBe(true)
  })

  /**
   * recal_142, ORCHESTRATOR'S DEFAULT on his "Dont ask me about campaigns order, do whatever you
   * want there": a tier-1 or tier-2 level fields THE FIVE THE TEAM DB SHOWS — bestfive.ts's
   * startingFive() over the whole roster, the legal PG-to-C board that maximizes total OVR — instead
   * of the five highest-minute men. 58 of the 90 levels changed men: the Heat '06 opened the
   * Champions tier without Shaquille O'Neal, the Bulls '98 without Scottie Pippen.
   *
   * Seven rosters (six of last season's thirty and the Warriors '18) have a slot no rostered card is
   * listed at, so the strict board cannot be filled and the ladder relaxes positions one step, the
   * way it always has. Those are the only levels allowed to differ from startingFive.
   */
  it('tiers 1 and 2 field the Team DB five — startingFive over the whole roster', () => {
    let matched = 0
    let relaxed = 0
    for (const t of [tiers[0], tiers[1]]) {
      for (const o of t.levels) {
        const roster = rosterOf(o)
        expect(roster.length).toBeGreaterThanOrEqual(5)
        const sf = startingFive(roster).five.filter((p): p is Player => !!p)
        const shown = (o.players as Player[]).map((p) => p.name).sort().join('|')
        if (sf.length === 5) {
          expect(sf.map((p) => p.name).sort().join('|')).toBe(shown)
          // and the slot order too: the ladder lists the same board, PG to C
          expect(sf.map((p) => p.name)).toEqual((o.players as Player[]).map((p) => p.name))
          matched++
        } else {
          // the fit ladder took over; the five must still be five different men off that roster
          expect(new Set(o.players.map((p) => p.name)).size).toBe(5)
          for (const p of o.players) expect(roster.some((r) => r.name === p.name)).toBe(true)
          relaxed++
        }
      }
    }
    expect(matched + relaxed).toBe(90)
    expect(relaxed).toBe(7)
  })

  it('tier 2 is every champion 1980–2025 plus the elite that never won, weakest Team-DB OVR first', () => {
    const t = tiers[1]
    const champs = t.levels.filter((o) => o.champion)
    expect(champs).toHaveLength(46) // 1980 through 2025, one each
    expect(new Set(champs.map((o) => o.season)).size).toBe(46)
    // no team-season twice, and every one of them a real season with a record
    expect(new Set(t.levels.map((o) => `${o.season}|${o.ab}`)).size).toBe(t.levels.length)
    for (const o of t.levels) {
      expect(o.season!).toBeGreaterThanOrEqual(1980)
      expect(o.season!).toBeLessThanOrEqual(2025)
      expect(o.team).toMatch(/ '\d\d$/) // "Chicago Bulls '96", his naming
      expect(new Set(o.players.map((p) => p.peak_season)).size).toBe(1)
    }
    /**
     * recal_142: the tier climbs by the OVR the Team DB shows — the mean of the era-relative OFF
     * and DEF dials, read in the five's own season — ascending, with the raw net as the tie-break.
     * The raw net it used before passes through no era table at all: over the sixty levels
     * Spearman(level, offRaw) was .963 against .230 for (level, −drtgRef), so the "difficulty" climb
     * was an offence climb and the Bulls '98 (DEF 94) sat at level 2. On the dial the two channels
     * read .624 and .718, and the order tracks the seasons' own SRS better (.450 against .353).
     */
    expect(t.levels.every((o, i) => i === 0 || dialOvr(o) >= dialOvr(t.levels[i - 1]))).toBe(true)
    expect(
      t.levels.every((o, i) => i === 0 || dialOvr(o) > dialOvr(t.levels[i - 1]) || net(o) >= net(t.levels[i - 1])),
    ).toBe(true)
    expect(t.levels[t.levels.length - 1].team).toBe('Golden State Warriors ’16'.replace('’', "'"))
    expect(dialOvr(t.levels[59])).toBe(Math.max(...t.levels.map(dialOvr)))
  })

  it('tier 3 is one all-time five per franchise, thirty franchises, relocations merged', () => {
    const t = tiers[2]
    expect(t.levels).toHaveLength(30)
    expect(new Set(t.levels.map((o) => o.ab)).size).toBe(30)
    // the abbreviations that no longer field a team must not appear as a franchise of their own
    for (const gone of ['SEA', 'NJN', 'VAN', 'CHH', 'CHA', 'NOH', 'NOK', 'KCK', 'SDC', 'WSB']) {
      expect(t.levels.some((o) => o.ab === gone)).toBe(false)
    }
    for (const o of t.levels) {
      expect(o.team).toMatch(/^All-time /)
      expect(o.season).toBeUndefined()
      expect(o.tag).toBe('all-time')
    }
    /**
     * HIS RULING: "Lal prob the hardest". recal_113 orders this tier by the TALENT each franchise
     * puts on the floor — the same sum-OVR pickFive() maximised to build every side in it — with the
     * raw net as the tie-break. The raw net alone had the Lakers 29th of 30 behind a 76ers five
     * carrying 22 fewer points of OVR, because the usage reconciliation discounts a five of alphas.
     */
    expect(t.levels.every((o, i) => i === 0 || sumOvr(o) >= sumOvr(t.levels[i - 1]))).toBe(true)
    expect(t.levels[29].team).toBe('All-time Lakers')
    expect(sumOvr(t.levels[29])).toBe(Math.max(...t.levels.map(sumOvr)))
  })

  it('tier 4 is thirty distinct custom sides and ends on the All-Time First Team', () => {
    const t = tiers[3]
    expect(t.levels).toHaveLength(30)
    // no two sides field the same five — the reason the bench is longer than the tier
    const fives = t.levels.map((o) => o.players.map((p) => p.name).sort().join('|'))
    expect(new Set(fives).size).toBe(30)
    expect(t.levels[29].team).toBe('All-Time First Team')
    // nothing on the ladder out-tops the summit
    const boss = net(t.levels[29])
    for (const o of t.levels) expect(net(o)).toBeLessThanOrEqual(boss)
    /**
     * recal_113: difficulty climbs monotonically through the WHOLE tier, not just the 28 before a
     * pinned ending. The All-Time Second Team used to sit at level 29 whatever it read — a side
     * weaker than eighteen of the levels before it, second from the end. It now lands where its
     * strength puts it, and the First Team is last on the same measurement rather than by a pin.
     */
    expect(t.levels.every((o, i) => i === 0 || net(o) >= net(t.levels[i - 1]))).toBe(true)
    expect(t.levels.some((o) => o.team === 'All-Time Second Team')).toBe(true)
    for (const o of t.levels) expect(o.season).toBeUndefined()
  })

  /**
   * THE DISTINCTNESS RULE (recal_113): a Customs side is built only from men no earlier side has
   * taken, so no two levels of that tier share a single man. Before the round 46 men filled the
   * tier's 150 slots and 22 of the 30 sides shared three or more men with another side — "All-MVPs"
   * and "All-NBA First Team" were four-fifths the same side under two names.
   */
  it('no two Customs sides share a man, and the tier fields 150 different men', () => {
    const t = tiers[3]
    const men = t.levels.map(menOf)
    for (let i = 0; i < men.length; i++)
      for (let j = 0; j < i; j++)
        expect([...men[i]].filter((m) => men[j].has(m))).toEqual([])
    expect(new Set(t.levels.flatMap((o) => [...menOf(o)])).size).toBe(150)
  })
})
