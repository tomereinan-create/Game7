import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import STATS from '../src/data/stats.json'
import { ROUNDS, SIGMA } from '../src/config'
import { seriesBox } from '../src/engine/boxstats'
import { canBetter, compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { buildTicker } from '../src/engine/ticker'
import type { Opponent, Player, SeriesResult, StatLine } from '../src/engine/types'
import { Series } from '../src/ui/Series'

const LINES = STATS as Record<string, StatLine | null>

/**
 * HIS RULING: "The bid mode should be treated the same as the campaigns.. Full box scores and a
 * simulation of G7". The 1v1 Bid and the hot seat used to end on a bare G1..G7 list; they now
 * mount the campaign's own <Series>. This pins both sides of that: a bid-mode series really
 * carries the campaign's box-score furniture and its Game 7 tape, and the campaign's own screen
 * is untouched by the optional props that let the bid in.
 */

const L = STATS as Record<string, StatLine | null>
const opponents = OPP as Opponent[]

// Two fives the resolver rates dead even (|mean margin| < 0.01), so both a six- and a
// seven-game series exist at a low seed — the two shapes the screen has.
const A: Player[] = opponents[5].players
const B: Player[] = opponents[16].players

/** The first seed whose series runs exactly `n` games. */
function seriesOfLength(us: Player[], them: Player[], n: number): { r: SeriesResult; seed: number } {
  for (let seed = 1; seed < 5000; seed++) {
    const r = simSeries(compile(us), compile(them), makeRng(seed), SIGMA)
    if (r.games.length === n) return { r, seed }
  }
  throw new Error(`no ${n}-game series in 5000 seeds`)
}

/** The bid mode's result screen: P1 in one chair, The Machine in the other. */
const bid = (games = 6) => {
  const { r, seed } = seriesOfLength(A, B, games)
  return renderToStaticMarkup(
    createElement(Series, {
      // the settled screen, with no timers to run: these cases pin what a FINISHED series docks
      // and prints. The landing itself (his ruling, 2026-09-29) is pinned separately below.
      reveal: false,
      opponent: { round: 1, team: 'The Machine', ab: 'MACHINE', players: B, positions: [] },
      five: A,
      mine: compile(A, B),
      theirs: compile(B, A),
      teamName: 'Player 1',
      teamAb: 'P1',
      result: r,
      seed,
      exhibition: true,
      kicker: '1v1 Bid',
      advanceLabel: 'Rematch',
      onHome: () => {},
      onAdvance: () => {},
    }),
  )
}

/** The campaign's own result screen: none of the new props passed. */
const OPP4 = opponents[3]
const campaign = (games = 6) => {
  const { r, seed } = seriesOfLength(A, OPP4.players, games)
  return renderToStaticMarkup(
    createElement(Series, {
      // the settled screen, with no timers to run: these cases pin what a FINISHED series docks
      // and prints. The landing itself (his ruling, 2026-09-29) is pinned separately below.
      reveal: false,
      opponent: OPP4,
      five: A,
      mine: compile(A, OPP4.players),
      theirs: compile(OPP4.players, A),
      teamName: 'Los Angeles Lakers',
      result: r,
      seed,
      onAdvance: () => {},
    }),
  )
}

/**
 * The campaign's result screen with the two new doors on it. HIS RULING: "Add a rematch button,
 * and advance(If you win your latest stage(not if you go back to a stage you already won))." The
 * screen is handed the doors; the CONDITION is decided by `advanceTo` and pinned in campaign.test.
 */
const dock = (opts: { won: boolean; next?: boolean; round?: number }) => {
  const opp = { ...opponents[3], round: opts.round ?? 12 }
  const { r, seed } = firstResult(A, opp.players, opts.won)
  return renderToStaticMarkup(
    createElement(Series, {
      // the settled screen, with no timers to run: these cases pin what a FINISHED series docks
      // and prints. The landing itself (his ruling, 2026-09-29) is pinned separately below.
      reveal: false,
      opponent: opp,
      five: A,
      mine: compile(A, opp.players),
      theirs: compile(opp.players, A),
      teamName: 'Los Angeles Lakers',
      result: r,
      seed,
      onAdvance: () => {},
      onRematch: () => {},
      onNext: opts.next ? () => {} : undefined,
    }),
  )
}
/** The campaign's result screen the instant it opens, with the reveal ON and no timer yet run. */
const landing = (games = 5) => {
  const { r, seed } = seriesOfLength(A, OPP4.players, games)
  return renderToStaticMarkup(
    createElement(Series, {
      opponent: OPP4,
      five: A,
      mine: compile(A, OPP4.players),
      theirs: compile(OPP4.players, A),
      teamName: 'Los Angeles Lakers',
      result: r,
      seed,
      onAdvance: () => {},
    }),
  )
}

/** The first six-game series with the outcome we want, so the screen renders settled. */
function firstResult(us: Player[], them: Player[], won: boolean): { r: SeriesResult; seed: number } {
  for (let seed = 1; seed < 5000; seed++) {
    const r = simSeries(compile(us, them), compile(them, us), makeRng(seed), SIGMA)
    if (r.games.length === 6 && r.won === won) return { r, seed }
  }
  throw new Error('no such series in 5000 seeds')
}

describe('the two doors off a settled series', () => {
  it('a frontier win docks three: back, rematch, and the next level in gold', () => {
    const html = dock({ won: true, next: true })
    expect(html).toContain('dock-inner stack')
    expect(html).toContain('>Next level<')
    expect(html).toContain('>Rematch<')
    expect(html).toContain('Back to the map')
    // the way on is the only un-ghosted door, and it stands alone across the foot
    expect(html).toContain('<button class="btn">Next level</button>')
    expect(html.match(/class="btn ghost"/g)?.length).toBe(2)
  })

  it('a replay of a cleared level docks two, and no way on', () => {
    const html = dock({ won: true })
    expect(html).toContain('dock-inner two')
    expect(html).not.toContain('Next level')
    expect(html).toContain('>Rematch<')
    expect(html).toContain('Back to the map')
  })

  it('a loss docks two and never a way on; the rematch is the lit one', () => {
    const html = dock({ won: false })
    expect(html).toContain('dock-inner two')
    expect(html).not.toContain('Next level')
    // his word for leaving goes ghost, the rematch takes the gold — after a loss it is the door wanted
    expect(html.indexOf('Back to the map')).toBeLessThan(html.indexOf('>Rematch<'))
    expect(html).toContain('<button class="btn ghost">Back to the map</button>')
    expect(html).toContain('<button class="btn">Rematch</button>')
  })

  it('level 150 keeps his word and is offered nothing above it', () => {
    const html = dock({ won: true, round: ROUNDS })
    expect(html).toContain('Claim the title')
    expect(html).not.toContain('Next level')
    expect(html).toContain('>Rematch<')
  })

  it('the dock never grows a third row: at most two, and every door a full-height button', () => {
    for (const html of [dock({ won: true, next: true }), dock({ won: true }), dock({ won: false })]) {
      expect(html.match(/class="dock-row"/g)?.length ?? 0).toBeLessThanOrEqual(1)
      expect(html.match(/class="btn[^"]*"/g)!.length).toBeLessThanOrEqual(3)
    }
  })
})

describe('the bid mode gets the campaign treatment', () => {
  it('renders the campaign box-score furniture, not a bare game list', () => {
    const html = bid()
    for (const card of ['Series · best of seven', 'Where it was won', 'The night belonged to', 'Full box scores →', 'Full analysis →']) {
      expect(html).toContain(card)
    }
    // the filmstrip: one chip per game played, the campaign's own
    expect(html.match(/class="gt /g)?.length).toBe(6)
    // and a real player box line on the night card, not just a score
    expect(html).toMatch(/PTS · \d+\.\d% FG · \d+\.\d REB/)
    // none of the old bare screen's copy survives
    expect(html).not.toContain('It went the distance.')
    expect(html).not.toContain('takes the series.')
  })

  it("carries the chairs' own names onto the scorebug", () => {
    const html = bid()
    expect(html).toContain('>P1<') // our side, not "1" off the end of "Player 1"
    expect(html).toContain('>MACHINE<')
    expect(html).toContain('Player 1 · The Machine') // the full names still head the screen
    expect(html).toContain('1v1 Bid') // the topbar kicker, in place of the level line
    expect(html).not.toContain('Level ')
  })

  it('keeps HOME / REMATCH where it was', () => {
    const html = bid()
    expect(html).toContain('dock-inner two')
    expect(html).toContain('>Home<')
    expect(html).toContain('>Rematch<')
    expect(html).not.toContain('Back to the map')
    expect(html).not.toContain('Back to the board')
  })

  it('plays Game 7 on the ticker before the result is revealed', () => {
    const html = bid(7)
    expect(html).toContain('GAME 7')
    expect(html).toContain('● LIVE')
    expect(html).toContain('Series 3–3')
    expect(html).toContain('Skip to result')
    // the verdict and the box are withheld while the tape runs
    expect(html).not.toContain('Series · best of seven')
    expect(html).not.toContain('Where it was won')
    expect(html).not.toContain('>Rematch<')
  })

  it('lands the Game 7 tape exactly on the score the resolver decided', () => {
    const { r, seed } = seriesOfLength(A, B, 7)
    const tape = buildTicker(r.games[6].margin, A, B, makeRng(seed ^ 0x5bf03635), LINES)
    const last = tape.ticks[tape.ticks.length - 1]
    expect(last.us).toBe(tape.us)
    expect(last.them).toBe(tape.them)
    expect(tape.us > tape.them).toBe(r.games[6].won)
  })

  it('produces a balanced box for every game of a bid series', () => {
    const { r, seed } = seriesOfLength(A, B, 7)
    const tape = buildTicker(r.games[6].margin, A, B, makeRng(seed ^ 0x5bf03635), LINES)
    const scores = r.games.map((g, i) => (i === 6 ? { us: tape.us, them: tape.them } : { us: g.us, them: g.them }))
    const box = seriesBox(A, B, L, r.games, scores, makeRng(seed ^ 0x2545f491))
    expect(box.games).toBe(7)
    expect(box.usLines).toHaveLength(5)
    expect(box.themLines).toHaveLength(5)
    for (const [team, lines] of [
      [box.us, box.usLines],
      [box.them, box.themLines],
    ] as const) {
      // the ledger law: PTS == 2x2PM + 3x3PM + FTM, and every column sums to the team line
      expect(team.pts).toBeCloseTo(2 * (team.fgm - team.tpm) + 3 * team.tpm + team.ftm, 6)
      for (const k of ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov'] as const) {
        expect(lines.reduce((a, l) => a + l[k], 0)).toBeCloseTo(team[k], 6)
      }
    }
  })
})

describe('the campaign series screen is unchanged', () => {
  it('still names the level, docks one button, and shows no Home', () => {
    const html = campaign()
    expect(html).toContain(`Level <b>${OPP4.round}</b> of ${ROUNDS}`)
    expect(html).toContain('<div class="dock-inner">')
    expect(html).not.toContain('dock-inner two')
    expect(html).not.toContain('>Home<')
    expect(html).not.toContain('>Rematch<')
    expect(html).toContain('Back to the map')
    expect(html).not.toContain('1v1 Bid')
  })

  /**
   * E3b: it still abbreviates our side off the name when no `teamAb` is given — but off the CITY
   * now, not the last word. LAKERS was the nickname, and the fallback that produced it put SEVENS
   * on the bug for every franchise he ever names, and the same three letters on every team named
   * in the same city. `teamCode` reads the city: LAL. The opponent's written `ab` still wins.
   */
  it('still abbreviates our side off the team name when none is given — as the city', () => {
    const html = campaign()
    expect(html).toContain('>LAL<')
    expect(html).not.toContain('>LAKERS<')
    expect(html).toContain(`>${OPP4.ab}<`)
  })

  it('still carries the same result cards, and its stars', () => {
    const html = campaign()
    for (const card of ['Series · best of seven', 'Where it was won', 'The night belonged to', 'Full box scores →', 'Full analysis →']) {
      expect(html).toContain(card)
    }
    // a won campaign series still banks stars; the exhibition/bid path never shows them
    const { r } = seriesOfLength(A, OPP4.players, 6)
    expect(html.includes('class="stars"')).toBe(r.won)
    expect(bid()).not.toContain('class="stars"')
  })

  it('still opens Game 7 on the scorebug', () => {
    const html = campaign(7)
    expect(html).toContain('GAME 7')
    expect(html).toContain('● LIVE')
    expect(html).toContain('Skip to result')
    expect(html).toContain('<div class="dock-inner">')
  })
})

/**
 * HIS RULINGS, 2026-09-29:
 *   "Simming a series, should be 1 game by 1, not all immidiately."
 *   "After simming, make every game pressable, to see what happnenned in that game(Box score
 *    wise)."
 *
 * The engine resolves a series in one call and always will; what these pin is that the SCREEN no
 * longer hands him the finished thing. Nothing here touches a number: the same series, printed in
 * the order it was played, and every night in it kept rather than averaged away.
 */
describe('a series lands one game at a time', () => {
  it('opens with an empty strip, a 0-0 score and nothing that pronounces on the series', () => {
    const html = landing(5)
    // five chips, all of them waiting
    expect(html.split('class="gt pending"').length - 1).toBe(5)
    // "Game 1", never "Game 1 of 5" — his ruling, 2026-09-29: the LENGTH of a series is its
    // result, so a caption counting towards a total hands him the ending before a chip lands
    expect(html).toContain('Game 1')
    expect(html).not.toContain('Game 1 of')
    expect(html).toContain('<span class="u">0</span>')
    expect(html).toContain('<span class="t">0</span>')
    // and none of the things that only a decided series may say
    for (const settledOnly of ['Where it was won', 'The night belonged to', 'class="stars"']) {
      expect(html).not.toContain(settledOnly)
    }
    // the only door offered is the one out of the wait
    expect(html).toContain('Skip to result')
    expect(html).not.toContain('Back to the map')
  })

  it('settles into exactly the screen it settled into before', () => {
    const html = campaign(5)
    expect(html).not.toContain('class="gt pending"')
    expect(html).toContain('Where it was won')
    expect(html).toContain('Back to the map')
  })

  it('makes every landed game a door into that night', () => {
    const { r } = seriesOfLength(A, OPP4.players, 5)
    const html = campaign(5)
    // one button per game, each naming its own night for a screen reader
    for (let k = 0; k < r.games.length; k++) {
      expect(html).toContain(`Game ${k + 1}, `)
    }
    expect(html.split('aria-label="Game ').length - 1).toBe(r.games.length)
  })

  /**
   * HIS RULING, 2026-09-29: "If the series got to 7, show the 7 animation after loading the 6
   * games, then the animation. Currently, the game 7 animation is happenning and then I get games
   * 1-6 (Which will always end 3-3)."
   *
   * The tape was built to open this screen, because before the landing existed there was nothing
   * for it to follow. Now it goes third: six chips, the decider on the tape, the seventh chip.
   */
  it('holds the Game 7 tape until the first six have landed', () => {
    const { r, seed } = seriesOfLength(A, OPP4.players, 7)
    const html = renderToStaticMarkup(
      createElement(Series, {
        opponent: OPP4,
        five: A,
        mine: compile(A, OPP4.players),
        theirs: compile(OPP4.players, A),
        teamName: 'Los Angeles Lakers',
        result: r,
        seed,
        onAdvance: () => {},
      }),
    )
    // the strip is up and waiting; the scorebug is not
    expect(html.split('class="gt pending"').length - 1).toBe(7)
    expect(html).not.toContain('● LIVE')
    expect(html).not.toContain('>GAME 7<')
    // and the landing is the only thing offering a way out of itself
    expect(html).toContain('Skip to result')
  })

  it('still opens straight onto the tape when the landing is off', () => {
    // which is what a reduced-motion machine gets, and what the settled-screen cases render
    expect(campaign(7)).toContain('● LIVE')
  })

  /**
   * HIS RULING, 2026-09-29: "In campaign, dont offer me rematch when I sweep." A rematch exists to
   * BETTER a night, and a sweep is already worth the most a level can pay. What must NOT happen is
   * the one the dock's shapes made easy: the three-door case asks for a rematch AND a next level,
   * so taking the rematch away used to take the way on with it.
   */
  it('docks no rematch after a sweep, and still docks the way on', () => {
    for (let seed = 1; seed < 5000; seed++) {
      const r = simSeries(compile(A, OPP4.players), compile(OPP4.players, A), makeRng(seed), SIGMA)
      if (!(r.won && r.losses === 0)) continue
      expect(canBetter(r)).toBe(false)
      const html = renderToStaticMarkup(
        createElement(Series, {
          reveal: false,
          opponent: { ...opponents[3], round: 12 },
          five: A,
          mine: compile(A, OPP4.players),
          theirs: compile(OPP4.players, A),
          teamName: 'Los Angeles Lakers',
          result: r,
          seed,
          onAdvance: () => {},
          // App withholds it for a swept level; this pins what the dock does when it is withheld
          onNext: () => {},
        }),
      )
      expect(html).not.toContain('>Rematch<')
      expect(html).toContain('Next level')
      expect(html).toContain('Back to the map')
      return
    }
    throw new Error('no sweep in 5000 seeds')
  })

  it('still offers the rematch when the night could have been better', () => {
    const { r } = firstResult(A, OPP4.players, true)
    expect(r.losses).toBeGreaterThan(0)
    expect(canBetter(r)).toBe(true)
    expect(dock({ won: true, next: true })).toContain('>Rematch<')
  })

  it('keeps every night, and the nights add up to the averages beside them', () => {
    const { r, seed } = seriesOfLength(A, OPP4.players, 5)
    const scores = r.games.map((g) => ({ us: g.us, them: g.them }))
    const box = seriesBox(A, OPP4.players, L, r.games, scores, makeRng(seed ^ 0x2545f491))
    expect(box.perGame).toHaveLength(r.games.length)
    box.perGame.forEach((g, i) => {
      // a night's five men score that night's points, exactly
      expect(g.usLines.reduce((a, l) => a + l.pts, 0)).toBe(scores[i].us)
      expect(g.themLines.reduce((a, l) => a + l.pts, 0)).toBe(scores[i].them)
    })
    // and the series line printed beside them is the mean of those nights
    const mean = box.perGame.reduce((a, g) => a + g.us.pts, 0) / box.perGame.length
    expect(box.us.pts).toBeCloseTo(mean, 6)
  })
})
