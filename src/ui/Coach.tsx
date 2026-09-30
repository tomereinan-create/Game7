import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { dismiss, openIndex, replay, resetTutorial, useTutor, type Lesson } from '../state/tutorial'
import { setViewMode, useTutorial } from '../state/viewmode'

/**
 * THE COACH — the tutorial's one piece of furniture, on every screen (his ruling, 2026-09-30:
 * "Add tutorial mode ... everything explain ... preferably dynamic explanation. It can be a video
 * or anything else").
 *
 * NOT A VIDEO, AND ON PURPOSE. A recording explains a screen as it was on the day it was cut; the
 * lessons here are built off the state in front of him (src/ui/lessons.ts) and each step LIGHTS
 * THE REAL CONTROL — a hole is cut in the veil around the wheel card, the staff door, tonight's
 * ticket — so the explanation is always of the screen he is on, with his opponent's name in it.
 * The spot follows the element: it is re-measured while the card is up, because rosters scroll
 * and reels land under it.
 *
 * Three things render here and nothing else:
 *   1. THE LESSON at the head of the queue, one step at a time. Next / Got it walks on, Skip
 *      closes the lesson; both mark it told. Enter and Escape do the same on a keyboard.
 *   2. THE ? BUTTON, pinned at the foot of every screen in tutorial mode — the only door back to a
 *      lesson already told.
 *   3. THE ? SHEET: every lesson told so far, in the order it was told, each replayable, and two
 *      switches — start the tutorial over, or leave it for user mode.
 *
 * The card is placed off the spot: under it when there is room, over it when there is not, and
 * on a phone it sits at the foot of the screen whatever the spot is doing. A step whose selector
 * finds nothing (the control is on another screen, or scrolled out of a measured box) shows the
 * card alone, centred, rather than lighting the wrong thing.
 */

interface Box {
  left: number
  top: number
  width: number
  height: number
}
const PAD = 8
const GAP = 14

function measure(sel: string | undefined): Box | null {
  if (!sel || typeof document === 'undefined') return null
  let el: Element | null = null
  try {
    el = document.querySelector(sel)
  } catch {
    return null
  }
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

export function Coach() {
  const tutorial = useTutorial()
  const { queue, told, order, index } = useTutor()
  const lesson: Lesson | null = tutorial ? (queue[0] ?? null) : null
  const [step, setStep] = useState(0)
  /**
   * WHERE THE SPOT AND THE CARD STAND, as one value, replaced only when a number changes: the
   * measuring loop below runs every frame, and a fresh object every frame would be a render every
   * frame for nothing.
   */
  const [lay, setLay] = useState<{ box: Box | null; place: 'free' | 'below' | 'above' | 'foot'; card: CSSProperties }>({ box: null, place: 'free', card: {} })
  const { box, place, card } = lay
  const cardRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string>('')

  // a new lesson starts at its first step
  useEffect(() => setStep(0), [lesson?.id])

  const s = lesson?.steps[Math.min(step, (lesson?.steps.length ?? 1) - 1)] ?? null
  const last = !!lesson && step >= lesson.steps.length - 1

  /**
   * FOLLOW THE ELEMENT. Measured on every frame the card is up rather than once: the wheel's
   * reels fold, a roster scrolls, the window turns, and a spot cut where the element WAS is worse
   * than no spot. Cheap — one querySelector and two rects — and it stops the moment the card goes.
   */
  useEffect(() => {
    if (!lesson || !s) {
      setLay((l) => (l.box === null && l.place === 'free' ? l : { box: null, place: 'free', card: {} }))
      return
    }
    const key = `${lesson.id}:${step}`
    let raf = 0
    const same = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)
    const tick = () => {
      const b = measure(s.at)
      if (b && scrolledFor.current !== key) {
        scrolledFor.current = key
        try {
          document.querySelector(s.at!)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
        } catch {
          /* an element that cannot scroll is still lit where it is */
        }
      }
      // where the card goes, off the spot and the card's own size
      const W = window.innerWidth
      const H = window.innerHeight
      const c = cardRef.current?.getBoundingClientRect()
      const cw = c?.width ?? 0
      const ch = c?.height ?? 0
      let place: 'free' | 'below' | 'above' | 'foot'
      let card: CSSProperties = {}
      if (!b || W < 640) place = b ? 'foot' : 'free'
      else {
        const below = b.top + b.height + GAP + ch <= H - 12
        const above = b.top - GAP - ch >= 12
        const left = Math.round(Math.max(12, Math.min(W - cw - 12, b.left + b.width / 2 - cw / 2)))
        if (below) {
          place = 'below'
          card = { left, top: Math.round(b.top + b.height + GAP) }
        } else if (above) {
          place = 'above'
          card = { left, top: Math.round(b.top - GAP - ch) }
        } else {
          // the spot fills the screen: stand beside it, or over its foot as a last resort
          const right = b.left + b.width + GAP + cw <= W - 12
          place = 'below'
          card = right ? { left: Math.round(b.left + b.width + GAP), top: Math.round(Math.max(12, Math.min(H - ch - 12, b.top))) } : { left, top: Math.round(Math.max(12, H - ch - 12)) }
        }
      }
      setLay((l) => (same(l.box, b) && l.place === place && l.card.left === card.left && l.card.top === card.top ? l : { box: b, place, card }))
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [lesson, s, step])

  const next = () => {
    if (!lesson) return
    if (last) dismiss()
    else setStep((n) => n + 1)
  }
  const skip = () => dismiss()

  useEffect(() => {
    if (!lesson) return
    const key = (e: KeyboardEvent) => {
      // Enter on one of the card's own buttons is that button's click already; a second step here
      // would walk two at once
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('.coach-card')) return
      if (e.key === 'Escape') skip()
      else if (e.key === 'Enter' || e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') setStep((n) => Math.max(0, n - 1))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, last])

  if (!tutorial) return null

  return (
    <>
      {lesson && s ? (
        <div className={`coach-veil ${box ? 'lit' : ''}`} role="dialog" aria-modal="true" aria-label={lesson.title}>
          {box ? <div className="coach-spot" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} aria-hidden /> : null}
          <div ref={cardRef} className={`coach-card ${place}`} style={card} onClick={(e) => e.stopPropagation()}>
            <span className="coach-kick">
              {lesson.kicker}
              {lesson.steps.length > 1 ? ` · ${step + 1} of ${lesson.steps.length}` : ''}
            </span>
            <h2>{s.title ?? lesson.title}</h2>
            {s.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <div className="coach-foot">
              {lesson.steps.length > 1 ? (
                <span className="coach-dots" aria-hidden>
                  {lesson.steps.map((_, i) => (
                    <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />
                  ))}
                </span>
              ) : (
                <span />
              )}
              <span className="coach-btns">
                {!last ? (
                  <button className="btn ghost" onClick={skip}>
                    Skip
                  </button>
                ) : null}
                <button className="btn" onClick={next}>
                  {last ? 'Got it' : 'Next →'}
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <button className="coach-fab" onClick={() => openIndex(true)} aria-label="Tutorial — every lesson so far" title="Tutorial lessons">
        ?
      </button>

      {index ? (
        <div className="ask-veil" onClick={() => openIndex(false)}>
          <div className="coach-card index" role="dialog" aria-modal="true" aria-label="Tutorial lessons" onClick={(e) => e.stopPropagation()}>
            <span className="coach-kick">Tutorial</span>
            <h2>{order.length ? 'Every lesson so far' : 'No lessons yet'}</h2>
            {order.length ? (
              <p>Tap one to read it again, as it was told.</p>
            ) : (
              <p>The coach steps in the first time you reach a screen, buy a rank in the staff tree, climb into a new block or win a trophy.</p>
            )}
            <div className="coach-list">
              {order.map((id) => {
                const l = told[id]
                if (!l) return null
                return (
                  <button key={id} className="coach-row" onClick={() => replay(id)}>
                    <i>{l.kicker}</i>
                    <b>{l.title}</b>
                  </button>
                )
              })}
            </div>
            <div className="coach-foot">
              <span className="coach-btns wrap">
                <button className="btn ghost" onClick={() => { resetTutorial(); openIndex(false) }}>
                  Start over
                </button>
                <button className="btn ghost" onClick={() => { openIndex(false); setViewMode('user') }}>
                  Leave for User mode
                </button>
                <button className="btn" onClick={() => openIndex(false)}>
                  Close
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
