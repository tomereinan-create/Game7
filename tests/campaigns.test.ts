import { describe, expect, it } from 'vitest'
import CAMPAIGNS from '../src/data/campaigns.json'
import { ROUNDS } from '../src/config'
import { LEVELS, ERAS } from '../src/App'
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
/** Where a five sits on the all-time dial — the number the tiers are ordered by. */
const net = (o: Opponent) => {
  const r = ratings100(o.players as Player[])
  return r.offRaw - r.drtgRef
}

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

  it('tier 1 is last season, worst record first — unchanged by the new ladder', () => {
    const t = tiers[0]
    const yr = Math.max(...t.levels.map((o) => o.season!))
    for (const o of t.levels) expect(o.season).toBe(yr)
    expect(t.levels.every((o, i) => i === 0 || pct(o.record!) >= pct(t.levels[i - 1].record!))).toBe(true)
  })

  it('tier 2 is every champion 1980–2025 plus the elite that never won, weakest net first', () => {
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
    expect(t.levels.every((o, i) => i === 0 || net(o) >= net(t.levels[i - 1]))).toBe(true)
    expect(t.levels[t.levels.length - 1].team).toBe('Golden State Warriors ’17'.replace('’', "'"))
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
    expect(t.levels.every((o, i) => i === 0 || net(o) >= net(t.levels[i - 1]))).toBe(true)
  })

  it('tier 4 is thirty distinct custom sides and ends on the All-Time First Team', () => {
    const t = tiers[3]
    expect(t.levels).toHaveLength(30)
    // no two sides field the same five — the reason the bench is longer than the tier
    const fives = t.levels.map((o) => o.players.map((p) => p.name).sort().join('|'))
    expect(new Set(fives).size).toBe(30)
    expect(t.levels[29].team).toBe('All-Time First Team')
    expect(t.levels[28].team).toBe('All-Time Second Team')
    // nothing on the ladder out-tops the summit
    const boss = net(t.levels[29])
    for (const o of t.levels) expect(net(o)).toBeLessThanOrEqual(boss)
    // the twenty-eight before the ending climb by net
    const body = t.levels.slice(0, 28)
    expect(body.every((o, i) => i === 0 || net(o) >= net(body[i - 1]))).toBe(true)
    for (const o of t.levels) expect(o.season).toBeUndefined()
  })
})
