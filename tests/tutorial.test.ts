import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetTutor, dismiss, replay, resetTutorial, teach, teachOnce, tutorState, wasTold } from '../src/state/tutorial'
import { isUserMode, isTutorial, setViewMode, viewMode } from '../src/state/viewmode'
import { NODE, NODES } from '../src/engine/tree'
import { ROUNDS } from '../src/config'
import { draftLesson, eraLesson, fullLesson, mapLesson, resultLesson, unlockLesson } from '../src/ui/lessons'
import { Coach } from '../src/ui/Coach'
import { FrontDoor } from '../src/ui/FrontDoor'
import { LEVELS, ERAS } from '../src/App'
import { MODES, resetProgress, type CampaignMode, type Progress } from '../src/state/campaign'

/**
 * HIS RULING, 2026-09-30: "Add tutorial mode, which will be the same as user mode, but
 * everything explain. Everytime you unlock a new feature its explained as well. preferably
 * dynamic explanation."
 */
describe('the view mode is three-way', () => {
  it('the tutorial is user mode with a coach: blind to ratings, and only it is the tutorial', () => {
    setViewMode('tutorial')
    expect(viewMode()).toBe('tutorial')
    expect(isUserMode()).toBe(true)
    expect(isTutorial()).toBe(true)
    setViewMode('user')
    expect(isUserMode()).toBe(true)
    expect(isTutorial()).toBe(false)
    setViewMode('scout')
    expect(isUserMode()).toBe(false)
    expect(isTutorial()).toBe(false)
  })

  it('the front door offers all three chips, and the lit one is the mode', () => {
    setViewMode('tutorial')
    const progress = Object.fromEntries(MODES.map((m) => [m, resetProgress(m)])) as Record<CampaignMode, Progress>
    const html = renderToStaticMarkup(createElement(FrontDoor, { user: true, progress, team: null, onPick: () => {} }))
    expect(html).toContain('>User<')
    expect(html).toContain('>Tutorial<')
    expect(html).toContain('>Scout<')
    expect(html).toMatch(/fd-mode on"[^>]*aria-pressed="true">Tutorial</)
    setViewMode('scout')
  })
})

describe('the coach remembers', () => {
  beforeEach(() => _resetTutor())
  const lesson = (id: string) => ({ id, kicker: 'Tutorial', title: id, steps: [{ body: ['one'] }] })

  it('a lesson is told once: queued, dismissed, and never queued again on its own', () => {
    teach(lesson('a'))
    expect(tutorState().queue.map((l) => l.id)).toEqual(['a'])
    teach(lesson('a'))
    expect(tutorState().queue).toHaveLength(1)
    dismiss()
    expect(tutorState().queue).toHaveLength(0)
    expect(wasTold('a')).toBe(true)
    teach(lesson('a'))
    expect(tutorState().queue).toHaveLength(0)
    teachOnce('a', () => lesson('a'))
    expect(tutorState().queue).toHaveLength(0)
  })

  it('lessons queue in the order they are given and replay as they were told', () => {
    teach(lesson('a'))
    teach(lesson('b'))
    expect(tutorState().queue.map((l) => l.id)).toEqual(['a', 'b'])
    dismiss()
    dismiss()
    expect(tutorState().order).toEqual(['a', 'b'])
    replay('a')
    expect(tutorState().queue.map((l) => l.id)).toEqual(['a'])
    dismiss()
    // a replay does not repeat it in the index
    expect(tutorState().order).toEqual(['a', 'b'])
  })

  it('an empty lesson is not a lesson, and Start over forgets everything', () => {
    teach({ id: 'x', kicker: '', title: '', steps: [] })
    expect(tutorState().queue).toHaveLength(0)
    teach(lesson('a'))
    dismiss()
    resetTutorial()
    expect(wasTold('a')).toBe(false)
    expect(tutorState().order).toEqual([])
  })
})

describe('the lessons are built off the state', () => {
  const opp = LEVELS[2]
  it('the draft lesson names tonight’s opponent and the level', () => {
    const l = draftLesson({ level: 3, opp, salary: false, death: false, carry: false, spins: 2, changeLeft: false, hasBoard: false, hasPlan: false, tips: false })
    const text = l.steps.flatMap((s) => [s.title ?? '', ...s.body]).join(' ')
    expect(l.id).toBe('draft.spin')
    expect(text).toContain('Level 3')
    expect(text).toContain(opp.team)
    expect(text).toContain('2 respins')
    // the first step lights the opponent's column and the last the dock button
    expect(l.steps[0].at).toBe('.col.a')
    expect(l.steps[l.steps.length - 1].at).toBe('.dock .btn')
  })

  it('a carried five is its own first lesson, without a wheel to explain', () => {
    const l = draftLesson({ level: 9, opp, salary: true, death: true, carry: true, spins: 0, changeLeft: true, hasBoard: true, hasPlan: true, tips: true })
    expect(l.id).toBe('draft.carry')
    const text = l.steps.flatMap((s) => s.body).join(' ')
    expect(text).not.toContain('Spin the wheel')
    expect(text).toContain('change left')
    expect(l.steps.some((s) => s.at === '.staffbar')).toBe(true)
  })

  it('the five-in lesson lists the five and only offers doors that are open', () => {
    const five = opp.players.map((p) => p.name)
    const l = fullLesson({ five, opp, hasBoard: false, hasPlan: false, tips: true })
    const text = l.steps.flatMap((s) => s.body).join(' ')
    for (const n of five) expect(text).toContain(n)
    expect(l.steps.some((s) => s.at === '.staffbar')).toBe(false)
    expect(l.steps.some((s) => s.at === '.tips-door')).toBe(true)
  })

  it('the result lesson counts the stars and the doors on the dock', () => {
    const win = resultLesson({ won: true, wins: 4, losses: 0, games: 4, stars: 3, next: true, rematch: false, death: false })
    expect(win.id).toBe('result.win')
    const wt = win.steps.flatMap((s) => [s.title ?? '', ...s.body]).join(' ')
    expect(wt).toContain('4–0')
    expect(wt).toContain('3 stars')
    expect(wt).toContain('sweep')
    expect(wt).toContain('Next level')
    expect(wt).not.toContain('Rematch')
    const loss = resultLesson({ won: false, wins: 2, losses: 4, games: 6, stars: 0, next: false, rematch: true, death: true })
    expect(loss.id).toBe('result.loss')
    const lt = loss.steps.flatMap((s) => [s.title ?? '', ...s.body]).join(' ')
    expect(lt).toContain('4–2')
    expect(lt).toContain('Rematch')
    expect(lt).toContain('life')
  })

  it('every rank of every node has an unlock lesson that says where it shows up', () => {
    for (const n of NODES)
      for (let r = 1; r <= n.ranks; r++) {
        const l = unlockLesson(n.id, r)
        expect(l.id).toBe(`unlock.${n.id}.${r}`)
        expect(l.title).toContain(n.name)
        expect(l.steps.length).toBeGreaterThanOrEqual(3)
        expect(l.steps[0].body.join(' ')).toContain(n.rankBlurbs[r - 1])
        expect(l.steps[1].body.join(' ').length).toBeGreaterThan(20)
        // the last step names the next rank, or says the node is maxed
        const last = l.steps[l.steps.length - 1].body.join(' ')
        expect(last).toContain(r < n.ranks ? n.rankBlurbs[r] : 'maxed')
      }
  })

  it('a node that buys numbers says the tutorial does not print them', () => {
    expect(unlockLesson('scout_ratings', 1).steps[1].body.join(' ')).toContain('Scout mode')
    expect(unlockLesson('coach_sigma', 1).steps[1].body.join(' ')).toContain('Scout mode')
    // and one that buys a door does not
    expect(unlockLesson('fo_spin', 1).steps[1].body.join(' ')).not.toContain('Scout mode')
    expect(NODE.fo_spin.ranks).toBe(3)
  })

  it('the map lesson lights tonight’s ticket and names the blocks; the era lesson carries the tier’s own line', () => {
    const prog = resetProgress('campaign')
    const l = mapLesson({ mode: 'campaign', level: 1, opp: LEVELS[0], eras: ERAS, bal: 0, lives: prog.lives })
    expect(l.steps[0].at).toBe('.node.now')
    expect(l.steps[0].title).toContain(LEVELS[0].team)
    const blocks = l.steps.find((s) => s.at === '.um-eras')!.body.join(' ')
    for (const e of ERAS) expect(blocks).toContain(e.name)
    expect(blocks).toContain(`${ROUNDS}`)
    const era = eraLesson(1, ERAS)
    expect(era.id).toBe('era.1')
    expect(era.title).toContain(ERAS[1].name)
    expect(era.steps[0].body.join(' ')).toContain(`levels ${ERAS[1].first}`)
  })
})

describe('the coach renders only in tutorial mode', () => {
  beforeEach(() => _resetTutor())
  it('nothing in user or scout mode; the ? and the lesson at the head of the queue in the tutorial', () => {
    teach({ id: 'a', kicker: 'Tutorial · Test', title: 'A lesson', steps: [{ body: ['First.'] }, { body: ['Second.'] }] })
    setViewMode('user')
    expect(renderToStaticMarkup(createElement(Coach))).toBe('')
    setViewMode('tutorial')
    const html = renderToStaticMarkup(createElement(Coach))
    expect(html).toContain('coach-fab')
    expect(html).toContain('A lesson')
    expect(html).toContain('First.')
    expect(html).not.toContain('Second.')
    expect(html).toContain('1 of 2')
    expect(html).toContain('Next →')
    setViewMode('scout')
  })
})
