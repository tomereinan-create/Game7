import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetTutor, dismiss, replay, resetTutorial, teach, teachOnce, tutorialLock, TUTORIAL_GATE, tutorState, wasTold } from '../src/state/tutorial'
import { isUserMode, isTutorial, setViewMode, viewMode } from '../src/state/viewmode'
import { NODE, NODES } from '../src/engine/tree'
import { draftLesson, eraLesson, mapDoorLesson, mapLesson, spendLesson, staffLesson, teamLesson, unlockLesson } from '../src/ui/lessons'
import { Series } from '../src/ui/Series'
import { Coach } from '../src/ui/Coach'
import { FrontDoor } from '../src/ui/FrontDoor'
import { LEVELS, ERAS } from '../src/App'
import { MODES, resetProgress, saveKey, teamKey, type CampaignMode, type Progress } from '../src/state/campaign'
import { doorLesson } from '../src/ui/lessons'

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

describe('the tutorial plays on its own slot', () => {
  it('its ladders and its club are saved under their own keys, and only in tutorial mode', () => {
    setViewMode('tutorial')
    for (const m of MODES) expect(saveKey(m)).toBe(`game7.tut.${m}.v2`)
    expect(teamKey()).toBe('game7.tut.team.v1')
    setViewMode('user')
    for (const m of MODES) expect(saveKey(m)).toBe(`game7.${m}.v2`)
    expect(teamKey()).toBe('game7.team.v1')
    setViewMode('scout')
    expect(saveKey('campaign')).toBe('game7.campaign.v2')
  })

  it('the door lesson is a welcome, the six marks and where to start — nothing else', () => {
    const l = doorLesson({ team: null, cur: 1, cleared: 0, stars: 0 })
    expect(l.steps).toHaveLength(3)
    expect(l.steps[0].at).toBeUndefined()
    expect(l.steps[1].at).toBe('.fd-court')
    expect(l.steps[2].at).toBe('.fd-cta')
    const text = l.steps.flatMap((s) => s.body).join(' ')
    expect(text).not.toContain('Rafters')
    expect(text).not.toContain('record book')
    expect(text).toContain('own ladder')
  })
})

describe('the tutorial\u2019s ladder gate', () => {
  const all = (campaign: number, salary: number) => {
    const p = Object.fromEntries(MODES.map((m) => [m, resetProgress(m)])) as Record<CampaignMode, Progress>
    p.campaign = { ...p.campaign, stars: p.campaign.stars.map((_, i) => (i < campaign ? 1 : 0)) }
    p.salary = { ...p.salary, stars: p.salary.stars.map((_, i) => (i < salary ? 1 : 0)) }
    return p
  }
  it('the Salary cap waits for 30 stars on the Campaign, the Death match for 30 on the Salary cap', () => {
    expect(TUTORIAL_GATE).toBe(30)
    expect(tutorialLock('campaign', all(0, 0))).toBeNull()
    expect(tutorialLock('salary', all(29, 0))).toEqual({ needs: 'campaign', have: 29, stars: 30 })
    expect(tutorialLock('salary', all(30, 0))).toBeNull()
    expect(tutorialLock('death', all(150, 29))).toEqual({ needs: 'salary', have: 29, stars: 30 })
    expect(tutorialLock('death', all(150, 30))).toBeNull()
  })
  it('the door draws the lock in tutorial mode only, and greys the button', () => {
    setViewMode('tutorial')
    const html = renderToStaticMarkup(createElement(FrontDoor, { user: true, progress: all(3, 0), team: null, onPick: () => {} }))
    expect((html.match(/fd-mark locked/g) ?? []).length).toBe(2)
    expect(html).toContain('class="fd-lock"')
    expect(html).toContain('Salary cap, locked')
    setViewMode('user')
    const open = renderToStaticMarkup(createElement(FrontDoor, { user: true, progress: all(3, 0), team: null, onPick: () => {} }))
    expect(open).not.toContain('fd-mark locked')
    expect(open).not.toContain('fd-lock')
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

  it('an empty lesson is not a lesson, and Reset tutorial forgets everything and re-arms the screen', () => {
    teach({ id: 'x', kicker: '', title: '', steps: [] })
    expect(tutorState().queue).toHaveLength(0)
    teach(lesson('a'))
    dismiss()
    const before = tutorState().epoch
    resetTutorial()
    expect(wasTold('a')).toBe(false)
    expect(tutorState().order).toEqual([])
    expect(tutorState().queue).toEqual([])
    expect(tutorState().index).toBe(false)
    // and the epoch moves, which is what re-arms every screen's hook so the current one is told again
    expect(tutorState().epoch).toBe(before + 1)
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

  it('a win points at the door back to the map, where the stars are spent; a loss says nothing', () => {
    const l = mapDoorLesson(3)
    expect(l.id).toBe('result.map')
    expect(l.steps).toHaveLength(1)
    expect(l.steps[0].at).toBe('.dock [data-door="map"]')
    expect(l.steps[0].body.join(' ')).toContain('3 stars')
    const html = renderToStaticMarkup(
      createElement(Series, {
        opponent: LEVELS[0],
        five: LEVELS[1].players,
        mine: { players: LEVELS[1].players } as never,
        theirs: { players: LEVELS[0].players } as never,
        teamName: 'Test',
        result: { won: true, wins: 4, losses: 0, games: [] } as never,
        seed: 1,
        assignment: 'naive',
        onAdvance: () => {},
      } as never),
    )
    expect(html).toContain('data-door="map"')
  })

  it('the staff lesson is the balance and the branches, nothing more', () => {
    const l = staffLesson({ bal: 2, earned: 2, branches: ['Scout', 'Front office', 'Coach'] })
    expect(l.steps).toHaveLength(2)
    expect(l.steps[0].at).toBe('.map-total')
    expect(l.steps[1].at).toBe('.treesvg')
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

  it('the map lesson lights tonight’s ticket and stops there; the era lesson carries the tier’s own line', () => {
    const prog = resetProgress('campaign')
    const l = mapLesson({ mode: 'campaign', level: 1, opp: LEVELS[0], eras: ERAS, bal: 0, lives: prog.lives })
    expect(l.steps[0].at).toBe('.node.now')
    expect(l.steps[0].title).toContain(LEVELS[0].team)
    // his ruling: no Stars step, no Four blocks step, and Staff waits for the first win
    expect(l.steps).toHaveLength(2)
    expect(l.steps.some((s) => s.at === '.um-eras' || s.at === '.um-staff')).toBe(false)
    expect(spendLesson(2).steps[0].at).toBe('.um-staff')
    expect(spendLesson(2).steps[0].body.join(' ')).toContain('2 stars to spend')
    expect(teamLesson(false).steps).toHaveLength(1)
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
