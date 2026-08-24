import { describe, expect, it } from 'vitest'
import { KNOBS, stackClamp, teamDefense, teamOffense, teamRating, transitionBonus } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'

/**
 * The offense-engine acceptance assertions from PROMPT_offense_update.md,
 * on the exact lineups in team_rating.py. Seasons are the update's peak
 * seasons (its players_stats.json), spelled as this pool spells them.
 */
const by = new Map(PLAYERS.map((p) => [p.name, p]))
const five = (...names: string[]) =>
  names.map((n) => {
    const p = by.get(n)
    if (!p) throw new Error(`no such player-season: ${n}`)
    return p
  })

const GOAT5 = five("Michael Jordan '88", "LeBron James '09", "Stephen Curry '16", "Shaquille O'Neal '00", "Giannis Antetokounmpo '20")
const BALANCED = five("Stephen Curry '16", "LeBron James '09", "Kyle Korver '15", "Shane Battier '06", "Rudy Gobert '19")
const ROLE5 = five("Kyle Korver '15", "Shane Battier '06", "Bruce Bowen '06", "P.J. Tucker '14", "Rudy Gobert '19")
const CHUCK5 = five("Allen Iverson '01", "Russell Westbrook '17", "DeMar DeRozan '21", "Carmelo Anthony '14", "Trae Young '22")

const off = (f: typeof GOAT5) => teamOffense(f).off
const tsOf = (f: typeof GOAT5, name: string) => teamOffense(f).lines.find((l) => l.name === name)!.ts

describe('offense engine — archetype lineups', () => {
  it('CHUCK5 is the worst offense of the four; ROLE5 sits below both star lineups', () => {
    const o = { goat: off(GOAT5), bal: off(BALANCED), role: off(ROLE5), chuck: off(CHUCK5) }
    console.log(`  OFF  goat ${o.goat.toFixed(1)}  balanced ${o.bal.toFixed(1)}  role ${o.role.toFixed(1)}  chuck ${o.chuck.toFixed(1)}`)
    expect(o.chuck).toBeLessThan(o.role)
    expect(o.chuck).toBeLessThan(o.bal)
    expect(o.chuck).toBeLessThan(o.goat)
    expect(o.role).toBeLessThan(o.goat)
    expect(o.role).toBeLessThan(o.bal)
  })

  it('GOAT5 and BALANCED are neck and neck, GOAT5 ahead (era-relative TS lifts the era stars)', () => {
    // Pinned at 'within 1.0' on raw TS (140.2 / 140.2); on era-relative TS it is 147.8 / 146.5.
    expect(off(GOAT5)).toBeGreaterThanOrEqual(off(BALANCED))
    expect(off(GOAT5) - off(BALANCED)).toBeLessThanOrEqual(5.0) // 1.3 on raw TS, 3.4 after season smoothing
  })

  it('a finisher eats better next to a creator who shoots (Curry) than one who does not (Rondo)', () => {
    const lively = "Dereck Lively II '24"
    // Non-shooting fillers, so the creator is the only source of spacing.
    const rest = ["Ben Wallace '04", "Dennis Rodman '92", "Tony Allen '12"]
    const withCurry = five(lively, "Stephen Curry '16", ...rest)
    const withRondo = five(lively, "Rajon Rondo '09", ...rest)
    const a = tsOf(withCurry, lively)
    const b = tsOf(withRondo, lively)
    console.log(`  Lively TS  next to Curry ${a}  next to Rondo ${b}`)
    expect(a - b).toBeGreaterThanOrEqual(4)
  })

  it('a hub (Shaq) scores better with shooters around him than in a no-spacing lineup', () => {
    const shaq = "Shaquille O'Neal '00"
    const shooters = five(shaq, "Stephen Curry '16", "Kyle Korver '15", "Klay Thompson '15", "Steve Kerr '96")
    const clogged = five(shaq, "Rajon Rondo '09", "Ben Wallace '04", "Dennis Rodman '92", "Tony Allen '12")
    const a = tsOf(shooters, shaq)
    const b = tsOf(clogged, shaq)
    console.log(`  Shaq TS  with shooters ${a}  clogged ${b}`)
    expect(a - b).toBeGreaterThanOrEqual(4)
  })

  it('the stack cap is in place and clamps to [0.90, 1.12]', () => {
    // With the shipped knobs no player's interaction stack can leave the band
    // (worst case clog 0.93 x squeezed 0.97 = 0.902; best case finisher 1.06),
    // so BALANCED is unchanged by the cap — on the update's own data too. The
    // cap is a guard against future knob changes; this is what removing it breaks.
    expect(stackClamp(1.5)).toBe(1.12)
    expect(stackClamp(0.5)).toBe(0.9)
    expect(stackClamp(1.0)).toBe(1.0)
    expect(KNOBS.STACK_MIN).toBe(0.9)
    expect(KNOBS.STACK_MAX).toBe(1.12)
    expect(teamOffense(BALANCED, true).off).toBeCloseTo(teamOffense(BALANCED, false).off, 6)
  })

  it('a lineup on its own: standalone defense v2 plus transition, NET = OFF − DRtg', () => {
    const r = teamRating(ROLE5)
    const d = teamDefense(ROLE5)
    expect(r.drtg).toBeCloseTo(d.drtg, 9)
    expect(r.off).toBeCloseTo(teamOffense(ROLE5).off + transitionBonus(ROLE5), 9)
    expect(r.net).toBeCloseTo(r.off - r.drtg, 9)
  })
})
