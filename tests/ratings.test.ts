import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { matchupMargin, matchupSwing, ratings100 } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Opponent } from '../src/engine/types'

const by = new Map(PLAYERS.map((p) => [p.name, p]))
const five = (...n: string[]) => n.map((x) => by.get(x)!)
const opp = OPP as Opponent[]

describe('team ratings 0-100 and matchup swing', () => {
  it('OFF/DEF never depend on the opponent; only the matchup swing does', () => {
    const mine = opp[10].players
    const r = ratings100(mine)
    for (let k = 0; k < opp.length; k++) expect(ratings100(mine)).toEqual(r)
    const swings = new Set(opp.map((o) => matchupSwing(mine, o.players).toFixed(3)))
    expect(swings.size).toBeGreaterThan(5)
  })

  it('the swing is antisymmetric and pure display: the margin the resolver uses is untouched', () => {
    const A = opp[3].players
    const B = opp[27].players
    expect(matchupSwing(A, B)).toBeCloseTo(-matchupSwing(B, A), 9)
    const before = matchupMargin(A, B)
    ratings100(A)
    matchupSwing(A, B)
    expect(matchupMargin(A, B)).toBe(before)
  })

  it('calibration reference points land roughly where the spec says', () => {
    const goat = ratings100(five("Michael Jordan '88", "LeBron James '09", "Stephen Curry '16", "Shaquille O'Neal '00", "Giannis Antetokounmpo '20"))
    const wall = ratings100(five("Chris Paul '08", "Tony Allen '12", "Kawhi Leonard '17", "Draymond Green '16", "Rudy Gobert '19"))
    const chuck = ratings100(five("Allen Iverson '01", "Russell Westbrook '17", "DeMar DeRozan '21", "Carmelo Anthony '14", "Trae Young '22"))
    console.log(`  GOAT5 OFF ${goat.off} DEF ${goat.def} | wall OFF ${wall.off} DEF ${wall.def} | chuck OFF ${chuck.off} DEF ${chuck.def}`)
    expect(goat.off).toBeGreaterThan(wall.off)
    expect(wall.def).toBeGreaterThan(chuck.def)
    expect(goat.off).toBeGreaterThan(chuck.off)
    for (const r of [goat, wall, chuck]) {
      expect(r.off).toBeGreaterThanOrEqual(0)
      expect(r.off).toBeLessThanOrEqual(100)
      expect(r.def).toBeGreaterThanOrEqual(0)
      expect(r.def).toBeLessThanOrEqual(100)
    }
  })
})
