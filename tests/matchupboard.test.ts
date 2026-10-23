import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CAMPAIGNS from '../src/data/campaigns.json'
import { defenseVs, naiveAssignment, solveBoard } from '../src/engine/offense'
import { night } from '../src/engine/odds'
import { PLAYERS } from '../src/engine/pool'
import { compile, meanMargin } from '../src/engine/resolver'
import { DEFAULT_TACTICS } from '../src/engine/tactics'
import type { NodeId } from '../src/engine/tree'
import type { Opponent, Player } from '../src/engine/types'
import { freshProgress, levelSeed, type Progress } from '../src/state/campaign'
import type { DraftState } from '../src/state/draftsave'
import { coachSays } from '../src/ui/coachSays'
import { Draft } from '../src/ui/Draft'
import { activeBoard, Matchups, moveDefender, sameBoard } from '../src/ui/Matchups'

/**
 * HIS REPORT, 2026-10-23: "The Matchup board can only make your defense worse, and the app gives
 * three different answers to who guards whom." Level 7, with Matchup coaching and the board owned:
 * the ticker said Hibbert on Flagg and Poole on Washington; the board said Hibbert on Marshall and
 * Poole on Flagg; the tip said "Poole has him" about Flagg; and swapping Cade and Poole on the board
 * reset all five matchups to the naive layout plus that swap.
 *
 * His fix: open the board on the assignment that is actually active, have the tips and the ticker
 * read that same assignment, and make a hand-set board that equals the optimal one cost nothing.
 */

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const DAL = (CAMPAIGNS as unknown as { levels: Opponent[] }[])[0].levels[6] // level 7: Dallas '26
const SLOTS = { PG: "Cade Cunningham '26", SG: "Jordan Poole '22", SF: "Russell Westbrook '17", PF: "Kevin Durant '14", C: "Roy Hibbert '12" }
const FIVE: Player[] = Object.values(SLOTS).map((n) => BY.get(n)!)
const THEM = DAL.players
const at = (who: string, list: Player[]) => list.findIndex((p) => p.name.includes(who))
const [CADE, POOLE, HIBBERT] = [at('Cunningham', FIVE), at('Poole', FIVE), at('Hibbert', FIVE)]
const [FLAGG, WASHINGTON, MARSHALL] = [at('Flagg', THEM), at('Washington', THEM), at('Marshall', THEM)]
const OWNED = { optimal: true, manual: true }

describe('his level 7: the naive board and the active board are not the same board', () => {
  it('is the board of his report — naive parks Hibbert on Marshall and Poole on Flagg, the solved board has Hibbert on Flagg and Poole on Washington', () => {
    expect(DAL.team).toBe('Dallas Mavericks')
    const naive = naiveAssignment(FIVE, THEM)
    const solved = solveBoard(FIVE, THEM)
    expect(naive[HIBBERT]).toBe(MARSHALL)
    expect(naive[POOLE]).toBe(FLAGG)
    expect(solved[HIBBERT]).toBe(FLAGG)
    expect(solved[POOLE]).toBe(WASHINGTON)
  })

  it('BEFORE: the board opened naive and one swap there threw the staff board away — 17 DRtg worse than leaving it alone', () => {
    const untouched = defenseVs(FIVE, THEM, 'optimal').drtg
    const oldTouch = moveDefender(naiveAssignment(FIVE, THEM), CADE, naiveAssignment(FIVE, THEM)[POOLE])
    expect(defenseVs(FIVE, THEM, oldTouch).drtg - untouched).toBeGreaterThan(15)
  })
})

describe('one board: the sheet, the ticker and the tips read the assignment being played', () => {
  const active = activeBoard(FIVE, THEM, { ...OWNED, board: null })

  it('untouched, the night plays optimal and the board it shows is the solved board', () => {
    expect(active.assignment).toBe('optimal')
    expect(active.map).toEqual(solveBoard(FIVE, THEM))
  })

  it('the coaching tip names the man the ticker has on their best scorer — Hibbert on Flagg, not Poole', () => {
    const tip = coachSays(FIVE, THEM, active.map)[1]
    expect(tip).toMatch(/^Flagg is their night\. Hibbert has him/)
    expect(tip).not.toContain('Poole has him')
  })

  /** The draft itself, opened on his five with the board owned: the ticker prints the active board. */
  const wallet = (nodes: Partial<Record<NodeId, number>>): Progress => ({ ...freshProgress(), seed: 4242, plays: 2, nodes })
  const resume = (board: number[] | null = null): DraftState => ({
    draws: 30,
    slots: SLOTS,
    landed: null,
    last: null,
    upcoming: null,
    after: null,
    reels: null,
    hold: null,
    used: {},
    dead: false,
    wide: 'team',
    board,
    boosts: [],
  })
  const draft = (nodes: Partial<Record<NodeId, number>>, board: number[] | null = null) => {
    const w = wallet(nodes)
    return renderToStaticMarkup(
      createElement(Draft, {
        opponent: DAL,
        seed: levelSeed(w, 7),
        teamName: 'Haifa Jets',
        wallet: w,
        tactics: DEFAULT_TACTICS,
        onTactics: () => {},
        onSim: () => {},
        onBack: () => {},
        onRoster: () => {},
        resume: resume(board),
      }),
    ).replace(/<!-- -->/g, '')
  }

  it('the ticker on the draft prints that same board', () => {
    const html = draft({ coach_optimal: 1, coach_manual: 1 })
    expect(html).toContain('5 OF 5')
    expect(html).toContain('◆ HIBBERT ON FLAGG')
    expect(html).toContain('◆ POOLE ON WASHINGTON')
    expect(html).not.toContain('◆ HIBBERT ON MARSHALL')
    // the staff bar does not call an untouched board "set"
    expect(html).toContain('Matchup board</button>')
  })

  it('the draft hands the sheet the active board and what the night plays off it — never the naive board', () => {
    const src = readFileSync('src/ui/Draft.tsx', 'utf8')
    const sheet = src.slice(src.indexOf('<Matchups'), src.indexOf('/>', src.indexOf('<Matchups')))
    expect(sheet).toContain('map={boardMap')
    expect(sheet).toContain('playing={assignment}')
    expect(sheet).not.toContain('board ?? naiveAssignment')
    // and a change that puts the staff board back keeps no board of his own (so a five that changes
    // later is guarded the way the staff guards it, not by the old five's solution)
    expect(sheet).toContain('onChange={(m) => setBoard(sameBoard(m, active.staff) ? null : m)}')
  })

  it('and the sheet, opened on it, scores it as the engine’s optimal — the same DRtg in both boxes', () => {
    const html = renderToStaticMarkup(
      createElement(Matchups, { mine: FIVE, theirs: THEM, map: active.map!, playing: active.assignment, onChange: () => {}, onBack: () => {} }),
    ).replace(/<!-- -->/g, '')
    const opt = defenseVs(FIVE, THEM, 'optimal').drtg.toFixed(1)
    expect(html).toContain(`<div class="map-total">${opt}<i> DRtg</i>`)
    expect(html).toContain(`<div class="map-total small">${opt}</div>`)
    // Flagg's row carries Hibbert, as the ticker does
    const row = html.slice(html.indexOf(`data-opp="${FLAGG}"`), html.indexOf('</div></div>', html.indexOf(`data-opp="${FLAGG}"`)) + 1)
    expect(row).toContain('<b>Roy Hibbert</b>')
  })

  it('a board of his own that differs is the one the ticker prints, and the staff bar says so', () => {
    const own = moveDefender(active.map!, CADE, active.map![POOLE])
    const html = draft({ coach_optimal: 1, coach_manual: 1 }, own)
    expect(html).toContain(`◆ CUNNINGHAM ON ${THEM[own[CADE]].player.split(' ').pop()!.toUpperCase()}`)
    expect(html).toContain('Matchup board · set</button>')
  })
})

describe('a change is made TO the active board, and putting it back costs nothing', () => {
  const staff = activeBoard(FIVE, THEM, { ...OWNED, board: null })
  const solved = staff.map!
  // his swap: Cade and Poole trade men
  const swapped = moveDefender(solved, CADE, solved[POOLE])

  it('one swap moves two men; the other three keep the matchups the staff gave them', () => {
    expect(swapped[CADE]).toBe(solved[POOLE])
    expect(swapped[POOLE]).toBe(solved[CADE])
    for (let i = 0; i < 5; i++) if (i !== CADE && i !== POOLE) expect(swapped[i], FIVE[i].name).toBe(solved[i])
    const played = activeBoard(FIVE, THEM, { ...OWNED, board: swapped })
    expect(played.assignment).toEqual(swapped)
    expect(played.map).toEqual(swapped)
    // and it costs only what that one swap concedes, not the naive board's twenty points
    const cost = defenseVs(FIVE, THEM, swapped).drtg - defenseVs(FIVE, THEM, 'optimal').drtg
    expect(cost).toBeGreaterThanOrEqual(0)
    expect(cost).toBeLessThan(defenseVs(FIVE, THEM, moveDefender(naiveAssignment(FIVE, THEM), CADE, naiveAssignment(FIVE, THEM)[POOLE])).drtg - defenseVs(FIVE, THEM, 'optimal').drtg)
  })

  it('swapped back, it IS the staff board: the night, the card and the sim value equal the untouched optimal exactly', () => {
    const back = moveDefender(swapped, CADE, swapped[POOLE])
    expect(sameBoard(back, solved)).toBe(true)
    const played = activeBoard(FIVE, THEM, { ...OWNED, board: back })
    expect(played.assignment).toBe('optimal')
    expect(played.map).toEqual(solved)
    expect(sameBoard(back, played.staff)).toBe(true) // what the draft keeps as no board at all
    expect(activeBoard(FIVE, THEM, { ...OWNED, board: swapped }).staff).toEqual(solved) // the staff board stands beside his own
    const a = night(FIVE, THEM, played.assignment, DEFAULT_TACTICS, 0, 0)
    const b = night(FIVE, THEM, 'optimal', DEFAULT_TACTICS, 0, 0)
    expect(meanMargin(a.mine, a.theirs)).toBe(meanMargin(b.mine, b.theirs))
    expect(a.sigma).toBe(b.sigma)
    expect(compile(FIVE, THEM, played.assignment)).toEqual(compile(FIVE, THEM, 'optimal'))
  })

  it('the Solve button fills the staff board, so solving costs nothing either', () => {
    expect(activeBoard(FIVE, THEM, { ...OWNED, board: solveBoard(FIVE, THEM) }).assignment).toBe('optimal')
  })

  it('without Matchup coaching the staff board is the naive one, and the word stays naive', () => {
    const naive = activeBoard(FIVE, THEM, { optimal: false, manual: false, board: null })
    expect(naive.assignment).toBe('naive')
    expect(naive.map).toEqual(naiveAssignment(FIVE, THEM))
  })

  it('a board that is not a board (a broken save) is not played; nor is a board without the node', () => {
    expect(activeBoard(FIVE, THEM, { ...OWNED, board: [0, 0, 1, 2, 3] }).assignment).toBe('optimal')
    expect(activeBoard(FIVE, THEM, { optimal: true, manual: false, board: swapped }).assignment).toBe('optimal')
  })

  it('there is no board to name until the five is five', () => {
    const part = activeBoard(FIVE.slice(0, 4), THEM, { ...OWNED, board: swapped })
    expect(part.map).toBeNull()
    expect(part.assignment).toBe('optimal')
  })
})
