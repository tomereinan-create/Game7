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
})
