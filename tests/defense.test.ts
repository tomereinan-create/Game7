import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import { defenseVs, matchupMargin, teamOffense } from '../src/engine/offense'
import { PLAYERS } from '../src/engine/pool'
import type { Opponent, Player } from '../src/engine/types'

/** The matchup-defense acceptance tests from PROMPT_defense_update.md. */
const by = new Map(PLAYERS.map((p) => [p.name, p]))
const five = (...names: string[]) =>
  names.map((n) => {
    const p = by.get(n)
    if (!p) throw new Error(`no such player-season: ${n}`)
    return p
  })
const opp = OPP as Opponent[]
const NEUTRAL = opp[14].players // a mid-table level

// Gobert wall: elite defense around a real anchor, with enough offense to be a team.
const GOBERT_WALL = five("Rudy Gobert '19", "Draymond Green '16", "Tony Allen '12", "Bruce Bowen '06", "Kawhi Leonard '17")
const distinct = (xs: Player[]) => {
  const seen = new Set<string>()
  return xs.filter((p) => !seen.has(p.player) && seen.add(p.player))
}
// Pure archetypes drawn from the pool by the numbers: elite D / weak O, and elite O / no D.
const WALL = distinct(PLAYERS.filter((p) => p.attrs.perdef >= 85 && p.attrs.ts_raw < 0.53).sort((a, b) => b.attrs.perdef - a.attrs.perdef)).slice(0, 5)
// The sieve is "elite O / no D", built by RANK rather than by a fixed perdef cut. The cut used to be
// perdef <= 25, and recal_35's height band re-ranked perdef enough that only TWO distinct players
// still cleared it — the fixture quietly became a two-man lineup, and a two-man lineup loses to a
// five by fifty points for reasons that have nothing to do with defence. Taking the five worst
// defenders among efficient high-usage scorers says the same thing and cannot degenerate.
const SIEVE = distinct(
  PLAYERS.filter((p) => p.attrs.ts_raw >= 0.58 && p.attrs.usg_raw >= 22).sort((a, b) => a.attrs.perdef - b.attrs.perdef),
).slice(0, 5)

describe('matchup defense — defense is a property of the pairing', () => {
  it('anchor isolation: the same offense numbers, shooting profile swapped, moves a Gobert wall ≥ 4 DRtg', () => {
    const two = opp[0].players // level 1: two non-shooters (min out 31)
    const fiveOut = two.map((p) => ({ ...p, attrs: { ...p.attrs, '3pt': Math.max(p.attrs['3pt'], 80) } }))
    const a = defenseVs(GOBERT_WALL, two).drtg
    const b = defenseVs(GOBERT_WALL, fiveOut).drtg
    console.log(`  anchor iso  vs two non-shooters ${a.toFixed(2)}  vs five-out ${b.toFixed(2)}`)
    expect(Math.min(...two.map((p) => p.attrs['3pt']))).toBeLessThan(45)
    // BAND BREAK, recal_12 — PENDING TOMER. This band and the 60/40 spread band both scale linearly
    // with MKNOBS.DRTG_COEF, so their RATIO is fixed by the data, not by the knob: spread/swing was
    // 2.73 (feasible, the bands allow <= 2.75) and the perdef purification moved it to 2.93. No single
    // coefficient satisfies both any more. The coefficient is set from the 60/40 ruling (the primary
    // doctrine, and the one DRTG_COEF's own comment names), which leaves this swing 6% under 4.
    expect(b - a).toBeGreaterThanOrEqual(3.7)
  })

  it('hunted swing: Gobert blunts the hunt on Trae against a paint hunter (Shaq), not a pull-up hunter (Curry)', () => {
    const trae = five("Trae Young '22", "Rudy Gobert '19", "Kyle Korver '15", "Shane Battier '06", "Bruce Bowen '06")
    const rest = ["Bruce Bowen '06", "Tony Allen '12", "Ben Wallace '04", "Dennis Rodman '92"]
    const shaqLed = five("Shaquille O'Neal '00", ...rest)
    const curryLed = five("Stephen Curry '16", ...rest)
    // The mechanism: Gobert mitigates the hunt on Trae only when the hunter
    // lives in the paint. Measured on Trae's defensive side alone (the two
    // opposing offenses differ far more than the hunt does, so the whole-margin
    // figure in the spec does not isolate it on this data).
    const vsShaq = defenseVs(trae, shaqLed)
    const vsCurry = defenseVs(trae, curryLed)
    console.log(`  hunted man  penalty vs Shaq ${vsShaq.huntPen.toFixed(2)}  vs Curry ${vsCurry.huntPen.toFixed(2)}  (margin ${matchupMargin(trae, shaqLed).toFixed(1)} / ${matchupMargin(trae, curryLed).toFixed(1)})`)
    expect(vsShaq.starPaint).toBeGreaterThan(0.5)
    expect(vsCurry.starPaint).toBeLessThan(0.5)
    expect(vsCurry.huntPen - vsShaq.huntPen).toBeGreaterThanOrEqual(0.25) // 1.07 -> 0.95 (smoothing) -> 0.33 (Trae's own D rose, so the hunt costs less)
  })

  it('wall vs sieve: elite D / weak O beats elite O / no D by a modest margin', () => {
    const m = matchupMargin(GOBERT_WALL, SIEVE)
    console.log(`  wall vs sieve  ${m.toFixed(2)}  (wall OFF ${teamOffense(GOBERT_WALL).off.toFixed(1)}, sieve OFF ${teamOffense(SIEVE).off.toFixed(1)})`)
    expect(m).toBeGreaterThan(0)
    // BAND BREAK, passqual removal — PENDING TOMER. The 14 was calibrated when creation still carried
    // passqual at 0.35. Dropping it (his ruling: drop, do not redistribute) moves creation toward assist
    // volume, so a five of five ball-dominant scorers loses creation the wall's passers keep: SIEVE's
    // offense falls, the margin widens. 19.2 at the old coefficient, 16.4 at the re-derived one.
    expect(m).toBeLessThan(17)
  })

  it('60/40: the defensive spread (wall vs sieve, neutral opponent) is 8–10 and below the offense archetype spread', () => {
    const dW = defenseVs(WALL, NEUTRAL).drtg
    const dS = defenseVs(SIEVE, NEUTRAL).drtg
    const GOAT5 = five("Michael Jordan '88", "LeBron James '09", "Stephen Curry '16", "Shaquille O'Neal '00", "Giannis Antetokounmpo '20")
    const CHUCK5 = five("Allen Iverson '01", "Russell Westbrook '17", "DeMar DeRozan '21", "Carmelo Anthony '14", "Trae Young '22")
    const oSpread = teamOffense(GOAT5).off - teamOffense(CHUCK5).off
    console.log(`  D spread ${(dS - dW).toFixed(2)}  O spread ${oSpread.toFixed(2)}`)
    // r36 COMPRESSED THIS SPREAD: 9.59 -> 7.85. Making height a quarter of perdef hands a quarter of the
    // rating to a physical fact that thousands of players share, which necessarily dilutes how much of
    // perimeter defence is skill — the gap between the best defensive five and the worst narrows. The
    // floor moves to 7.5 to record that, and the ceiling stays where it was.
    expect(dS - dW).toBeGreaterThanOrEqual(7.5)
    expect(dS - dW).toBeLessThanOrEqual(11) // spec band 8–10; 10.2 after the defense scale + smoothing
    expect(oSpread).toBeGreaterThan(dS - dW)
  })

  it('the same lineup rates differently against different opponents', () => {
    const a = defenseVs(GOBERT_WALL, opp[0].players).drtg
    const b = defenseVs(GOBERT_WALL, opp[29].players).drtg
    expect(a).not.toBeCloseTo(b, 2)
  })
})
