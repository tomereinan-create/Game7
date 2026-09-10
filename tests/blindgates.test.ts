import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OPP from '../src/data/opponents.json'
import STATS from '../src/data/stats.json'
import { DRAFT_SIZE, ROUNDS, SIGMA } from '../src/config'
import { seriesBox } from '../src/engine/boxstats'
import { compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { DEFAULT_TACTICS, gateTactics } from '../src/engine/tactics'
import type { Opponent, Player, StatLine } from '../src/engine/types'
import type { Progress } from '../src/state/campaign'
import { seriesStats } from '../src/ui/Series'
import { Draft } from '../src/ui/Draft'
import { setUserMode } from '../src/state/viewmode'

/**
 * USER MODE PLAYS BLIND — his standing ruling, and the one every screen in this app is measured
 * against: no ratings, no verdict, no odds. Three holes were still open in it. They are different
 * kinds of hole, so they are pinned three different ways.
 */

const L = STATS as Record<string, StatLine | null>
const opponents = OPP as Opponent[]
const A: Player[] = opponents[5].players
const B: Player[] = opponents[16].players

describe('Full box scores stops at the box score', () => {
  const seed = 7
  const r = simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA)
  const scores = r.games.map((g) => ({ us: g.us, them: g.them }))
  const box = seriesBox(A, B, L, r.games, scores, makeRng(seed ^ 0x2545f491))
  const mine = compile(A, B)
  const theirs = compile(B, A)
  const labels = (user: boolean) => seriesStats(mine, theirs, r, null, box, user).map((row) => row.label)

  const RATING = ['Rating', 'Talent', 'Offense', 'Defense (pts allowed)', 'Net']
  const BOXSCORE = ['Series', 'Points per game', 'Field goals', 'FG%', 'Threes', '3P%', 'Rebounds', 'Assists', 'Steals', 'Blocks', 'Turnovers']

  it('scout mode still gets the whole table, ratings and all', () => {
    const rows = labels(false)
    for (const l of [...BOXSCORE, ...RATING]) expect(rows, l).toContain(l)
  })

  /**
   * THE HOLE: this table was rendered on `{done && boxOpen}` with no `!user` beside it, while the
   * Full analysis door one line above it was gated. So a user-mode reader who pressed "Full box
   * scores" got the engine's four figures printed for both teams at the foot of the table.
   */
  it('user mode keeps every real statistic and loses the four ratings', () => {
    const rows = labels(true)
    for (const l of BOXSCORE) expect(rows, l).toContain(l)
    for (const l of RATING) expect(rows, l).not.toContain(l)
  })

  it('and the two tables are otherwise the same table', () => {
    expect(labels(true)).toEqual(labels(false).filter((l) => !RATING.includes(l)))
  })
})

/**
 * A STYLE IS A RANK-2 CALL, so it is priced at rank 2 and nowhere else. `gateTactics` forces
 * `style: 'balanced'` below rank 2 — the Playbook sheet has no style control there and the sim
 * hears no style — but the draft's odds card printed "Style fits vs <them>: Motion 62 · Iso 48 …"
 * from rank 0 in the death match and rank 1 everywhere else, and then closed by naming the room to
 * go and call it in. A price on a decision he cannot make is the same defect as a rating he has
 * not bought.
 */
describe('the draft prices a style only where a style can be called', () => {
  const five = A.slice(0, DRAFT_SIZE)
  /** A save with nothing bought but the Playbook, at the rank under test. */
  const wallet = (playbook: number): Progress => ({
    coach: 'def',
    team: null,
    stars: Array.from({ length: ROUNDS }, () => 3),
    seed: 12345,
    plays: 0,
    spent: 0,
    nodes: playbook > 0 ? { coach_tactics: playbook } : {},
    roster: null,
    lives: 0,
    checkpoint: 0,
    deaths: 0,
    wear: {},
    subsUsed: 0,
    tactics: DEFAULT_TACTICS,
    bench: null,
    record: { w: 0, l: 0 },
  })
  const draft = (playbook: number) =>
    renderToStaticMarkup(
      createElement(Draft, {
        opponent: opponents[3],
        seed: 1,
        teamName: 'Salt Lake City Sevens',
        wallet: wallet(playbook),
        death: true,
        carry: five,
        tactics: DEFAULT_TACTICS,
        onTactics: () => {},
        onSim: () => {},
        onBack: () => {},
        onRoster: () => {},
      }),
    )

  it('rank 0 and rank 1 cannot set one, so the fits are not printed', () => {
    expect(gateTactics({ ...DEFAULT_TACTICS, style: 'motion' }, 0).style).toBe('balanced')
    expect(gateTactics({ ...DEFAULT_TACTICS, style: 'motion' }, 1).style).toBe('balanced')
    expect(draft(0)).not.toContain('Style fits vs')
    expect(draft(1)).not.toContain('Style fits vs')
  })

  it('rank 2 can, so they are', () => {
    expect(gateTactics({ ...DEFAULT_TACTICS, style: 'motion' }, 2).style).toBe('motion')
    expect(draft(2)).toContain('Style fits vs')
  })

  it('and user mode never sees them at any rank', () => {
    setUserMode(true)
    try {
      for (const rank of [0, 1, 2, 3]) expect(draft(rank), `rank ${rank}`).not.toContain('Style fits vs')
    } finally {
      setUserMode(false)
    }
  })
})
