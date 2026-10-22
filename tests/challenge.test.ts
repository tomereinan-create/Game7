import { describe, expect, it } from 'vitest'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { realStarters } from '../src/engine/starters'
import { challengeFromUrl, challengeOf, decodeChallenge, encodeChallenge, unpackLineup } from '../src/share/challenge'

describe('a challenge link replays the series it was shared from', () => {
  const A = realStarters(1996, 'CHI')
  const B = realStarters(2017, 'GSW', new Set(A.map((p) => p.player)))
  const mine = compile(A, B)
  const theirs = compile(B, A)
  const seed = 2969
  const result = simSeries(mine, theirs, makeRng(seed), 10)
  const c = challengeOf({ teamName: "'96 Chicago Bulls", teamAb: 'CHI', five: A, opponent: { team: 'Golden State Warriors', ab: 'GSW', season: 2017, players: B }, mine, theirs, sigma: 10, seed, result })!

  it('round-trips through the link and stays a short, URL-safe code', () => {
    const code = encodeChallenge(c)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(code.length).toBeLessThan(1200)
    expect(decodeChallenge(code)).toEqual(c)
    expect(challengeFromUrl(`https://x.test/?s=abc&ref=x#c=${code}`)).toEqual(c)
  })

  it('the replay is game for game the series that was shared', () => {
    const r = simSeries(unpackLineup(c.m), unpackLineup(c.t), makeRng(c.s), c.g, c.w)
    expect(r.games.map((g) => [g.us, g.them, g.won])).toEqual(result.games.map((g) => [g.us, g.them, g.won]))
    expect(`${r.wins}-${r.losses}`).toBe(c.r)
  })

  it('rejects a damaged code rather than playing nonsense', () => {
    expect(decodeChallenge('not-a-code')).toBeNull()
    expect(decodeChallenge(encodeChallenge({ ...c, a: { ...c.a, p: c.a.p.slice(0, 4) } }))).toBeNull()
  })

  // the live check, 2026-10-22: g=1e308 froze the tab, g=1000 played Game 7 at 12–354
  it('rejects numbers no real night can have', () => {
    const bad = (x: object) => decodeChallenge(encodeChallenge({ ...c, ...x } as typeof c))
    expect(bad({ g: 1e308 })).toBeNull()
    expect(bad({ g: 1000 })).toBeNull()
    expect(bad({ g: 0.001 })).toBeNull()
    expect(bad({ m: Array(9).fill(1e308) })).toBeNull()
    expect(bad({ m: [...c.m.slice(0, 8), 'x'] })).toBeNull()
    // within each value's range, but a 100-point spread
    expect(bad({ m: c.m.map((x, i) => (i === 8 ? 100 : x)) })).toBeNull()
    expect(bad({ s: 1.5 })).toBeNull()
    expect(bad({ s: 2 ** 33 })).toBeNull()
    expect(bad({ w: 2.5 })).toBeNull()
    expect(bad({ a: { ...c.a, n: 'x'.repeat(500) } })).toBeNull()
    // and every real night still passes: a plan's quick pace, the death match's slow one
    expect(bad({ g: 9.4 })).not.toBeNull()
    expect(bad({ g: 10.8 })).not.toBeNull()
  })
})

describe("'Your turn' seats the challenge's opponent at real positions", () => {
  it('a five sent in tap order is seated PG to C', async () => {
    const { seatFive } = await import('../src/ui/ChallengeView')
    const B = realStarters(2017, 'GSW')
    const seated = seatFive([...B].reverse())
    expect(seated.positions).toEqual(['PG', 'SG', 'SF', 'PF', 'C'])
    expect(seated.players.map((p) => p.name).sort()).toEqual(B.map((p) => p.name).sort())
    const { eligible, POSITIONS } = await import('../src/engine/positions')
    const { LINES } = await import('../src/ui/Stat')
    seated.players.forEach((p, i) => expect(eligible(LINES[p.name]?.pos)).toContain(POSITIONS[i]))
  })
})
