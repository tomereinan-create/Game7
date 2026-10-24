import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SIGMA } from '../src/config'
import { parseCreator } from '../src/creator/params'
import { creatorSide } from '../src/creator/teams'
import { LADDER } from '../src/engine/batch'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'

describe('creator mode films an All-Time Cup series', () => {
  it('reads a ladder level and a hand-built five as sides', () => {
    const c = parseCreator('?creator=1&a=L113&b=L120&seed=20261025')!
    expect([c.a, c.b, c.settle, c.seed]).toEqual(['L113', 'L120', true, 20261025])
    const h = parseCreator("?creator=1&a5=A '26,B '26,C '26,D '26,E '26&an=LeBron's Sixers&b=2016-CLE")!
    expect([h.a, h.aFive?.length, h.aName, h.settle]).toEqual([null, 5, "LeBron's Sixers", true])
    expect(parseCreator('?creator=1&a5=A,B&b=2016-CLE')!.settle).toBe(false)
  })
  it('a ladder level plays exactly as the campaign has it', () => {
    const s = creatorSide({ id: 'L113', five: null, name: null, ab: null })!
    expect(s.label).toBe('All-time Celtics')
    expect(s.five).toBe(LADDER[112].players)
  })
})

// The frozen Cup (scripts/cup.ts, data/cup/all-time-cup-2026.json). If this fails, the engine no
// longer plays the Cup that was published: film from the commit the file names, or ask before
// re-freezing — the plan's rule is no re-rolls.
describe('the frozen All-Time Cup still replays on this engine', () => {
  const cup = JSON.parse(readFileSync(new URL('../data/cup/all-time-cup-2026.json', import.meta.url), 'utf8'))
  const five = (ab: string) => LADDER[Number(cup.clubs[ab].level.slice(1)) - 1].players
  it.each([...cup.games, ...cup.knockouts.games].map((g: { no: number; a: string; b: string; seed: number; series: string }) => [g.no, g]))('series #%s', (_n, g) => {
    const A = five(g.a)
    const B = five(g.b)
    const r = simSeries(compile(A, B), compile(B, A), makeRng(g.seed), SIGMA)
    expect(`${r.wins}-${r.losses}`).toBe(g.series)
  })
})
