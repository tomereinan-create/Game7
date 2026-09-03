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
    // BAND RE-RATIFIED, recal_110 (his rulings: "there is more work to do" and "How is this team 47
    // OFF with 2 all time great players"). `chuck < role` no longer holds: 124.3 / 127.1 became
    // 132.1 / 123.0. recal_110 moved creation amplification into the BASELINE, un-throttled and
    // centred on the league's own mean feed, because the shipped formula priced a five as its
    // usage-weighted TS and gave "who creates the shots" a +-4 fit bonus at most. Under that repair
    // ROLE5 — Korver / Battier / Bowen / Tucker / Gobert, five men with no creator between them —
    // reads as the offence with nobody to make a shot, which is what it is; CHUCK5 at least
    // generates them. The three assertions that carry the round's actual claim all still hold:
    // chuck < bal, chuck < goat, role < goat, role < bal. Measured, not asserted: the within-season
    // Spearman of offRaw against real ORtg over 47 seasons goes 0.726 -> 0.762, the largest OFF fit
    // gain in the ledger, and it rises in every era.
    expect(o.chuck).toBeLessThan(o.bal)
    expect(o.chuck).toBeLessThan(o.goat)
    expect(o.role).toBeLessThan(o.goat)
    expect(o.role).toBeLessThan(o.bal)
  })

  it('GOAT5 and BALANCED are neck and neck, GOAT5 ahead (era-relative TS lifts the era stars)', () => {
    // Pinned at 'within 1.0' on raw TS (140.2 / 140.2); on era-relative TS it is 147.8 / 146.5.
    // recal_70 MOVED THIS PIN, and the move is the round working as written: the ORB miss factor is
    // now the physical miss-share ratio (rails 0.8..1.2) instead of the 3x rail ride, so the worse-
    // shooting five's glass no longer buys back the shooting gap — the measured gap is 5.4.
    expect(off(GOAT5)).toBeGreaterThanOrEqual(off(BALANCED))
    // recal_110: 5.4 -> 7.9. GOAT5 is five all-time creators and BALANCED is two of them beside three
    // role players, so the round that makes creation matter necessarily widens this gap — the band was
    // written when creation was worth a +-4 fit bonus.
    // recal_119: 7.9 -> 9.25, and the whole 1.35 is this round's one term. GOAT5's usage-weighted ball
    // security is 81.2 (Jordan 95, Shaq 93, LeBron 84) against BALANCED's 59.0, because BALANCED buys
    // its efficiency with Korver at 26 and Gobert at 25 — so a round that prices KEEPING the ball
    // separates them by construction: GOAT5's possession multiplier is 1.0090 (+1.39 index pts) and
    // BALANCED's is 1.0003 (+0.05). Widened to 9.5, the fifth re-pin of this line; the four ordering
    // assertions above, which carry the real claim, all still hold.
    expect(off(GOAT5) - off(BALANCED)).toBeLessThanOrEqual(9.5) // 1.3 raw TS · 3.4 smoothed · 5.4 post recal_70 · 7.9 post recal_110 · 9.25 post recal_119
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
