import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import STATS from '../src/data/stats.json'
import { ROUNDS, SIGMA } from '../src/config'
import { seriesBox } from '../src/engine/boxstats'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { buildTicker } from '../src/engine/ticker'
import type { Opponent, Player, SeriesResult, StatLine } from '../src/engine/types'
import { Series } from '../src/ui/Series'

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
    const tape = buildTicker(r.games[6].margin, A, B, makeRng(seed ^ 0x5bf03635))
    const last = tape.ticks[tape.ticks.length - 1]
    expect(last.us).toBe(tape.us)
    expect(last.them).toBe(tape.them)
    expect(tape.us > tape.them).toBe(r.games[6].won)
  })

  it('produces a balanced box for every game of a bid series', () => {
    const { r, seed } = seriesOfLength(A, B, 7)
    const tape = buildTicker(r.games[6].margin, A, B, makeRng(seed ^ 0x5bf03635))
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

  it('still abbreviates our side off the team name when none is given', () => {
    const html = campaign()
    expect(html).toContain('>LAKERS<')
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
