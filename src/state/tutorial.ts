import { useEffect, useSyncExternalStore } from 'react'
import { useTutorial } from './viewmode'

/**
 * THE TUTORIAL'S MEMORY — his ruling, 2026-09-30: "Add tutorial mode, which will be the same as
 * user mode, but everything explain. Everytime you unlock a new feature its explained as well.
 * preferably dynamic explanation."
 *
 * A LESSON is a few steps, each a paragraph or two and, when the thing being explained is on the
 * screen, a CSS selector the coach lights up — the wheel, the staff door, the ticket that is
 * tonight's game. Lessons are BUILT, not written: every one is a function of the state it is
 * explaining (src/ui/lessons.ts), so the draft lesson names tonight's opponent and the unlock
 * lesson says what THAT rank of THAT node does in THIS mode. What is stored here is the copy as
 * it was told, so the ? button can bring it back word for word.
 *
 * ONCE. A lesson is told the first time its trigger is true and never again on its own; the
 * trigger is a screen state (five in, wheel landed, series settled) or an event (a rank bought,
 * a block reached, a trophy). `told` is the set of ids already given, saved with the browser, and
 * it is what "Restart the tutorial" clears. `queue` is what is waiting to be said now — a rank
 * bought three times in a row queues three lessons, and they are read one after another.
 *
 * Node has no localStorage (tests, receipts); the in-memory copy is the store there, the same
 * shape the achievements keep.
 */
export interface Step {
  /** A CSS selector for the thing this step is about. Absent, the card stands alone, centred. */
  at?: string
  /** Overrides the lesson's title for this step. */
  title?: string
  body: string[]
}
export interface Lesson {
  id: string
  /** The small line over the title: "Tutorial · The draft", "Unlocked · Front office". */
  kicker: string
  title: string
  steps: Step[]
}

interface Saved {
  /** Every lesson told, by id, as it was told. */
  told: Record<string, Lesson>
  /** The ids in the order they were first told — the ? sheet reads in this order. */
  order: string[]
}
interface State extends Saved {
  queue: Lesson[]
  /** The ? sheet is open. */
  index: boolean
}

const KEY = 'game7.tutorial.v1'
const fresh = (): State => ({ told: {}, order: [], queue: [], index: false })

let cur: State = (() => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh()
    const s = JSON.parse(raw) as Partial<Saved>
    return { ...fresh(), told: s.told ?? {}, order: (s.order ?? []).filter((id) => !!s.told?.[id]) }
  } catch {
    return fresh()
  }
})()
const subs = new Set<() => void>()
function set(next: State) {
  cur = next
  try {
    const saved: Saved = { told: next.told, order: next.order }
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    /* private mode: the session still remembers */
  }
  for (const f of subs) f()
}

export const tutorState = () => cur
export const wasTold = (id: string) => !!cur.told[id]

/**
 * Say this, now or after whatever is already waiting. A lesson already told stays told — this is
 * the once rule — and one already in the queue is not queued twice (StrictMode runs effects
 * twice; the draft renders many times between a spin and a landing).
 */
export function teach(lesson: Lesson, force = false) {
  if (!lesson.steps.length) return
  if (!force && cur.told[lesson.id]) return
  if (cur.queue.some((l) => l.id === lesson.id)) return
  set({ ...cur, queue: [...cur.queue, lesson] })
}
/** `teach`, with the building deferred until it is known to be needed. */
export function teachOnce(id: string, build: () => Lesson) {
  if (cur.told[id] || cur.queue.some((l) => l.id === id)) return
  teach(build())
}
/** The lesson at the head of the queue is done: it is told, and the next one is up. */
export function dismiss() {
  const [head, ...rest] = cur.queue
  if (!head) return
  const told = { ...cur.told, [head.id]: head }
  const order = cur.order.includes(head.id) ? cur.order : [...cur.order, head.id]
  set({ ...cur, told, order, queue: rest })
}
/** Read a lesson again, as it was told. */
export function replay(id: string) {
  const l = cur.told[id]
  if (!l) return
  set({ ...cur, index: false })
  teach(l, true)
}
export function openIndex(on: boolean) {
  if (cur.index !== on) set({ ...cur, index: on })
}
/** Forget every lesson: the tutorial starts over from the next screen. */
export function resetTutorial() {
  set({ ...fresh(), index: false })
}
/** Tests only. */
export function _resetTutor() {
  cur = fresh()
  for (const f of subs) f()
}

const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => subs.delete(cb)
}
export function useTutor(): State {
  return useSyncExternalStore(subscribe, () => cur, () => cur)
}

/**
 * THE HOOK A SCREEN USES. `when` is the state the lesson is about — the five is full, the wheel
 * has landed, the series has settled — and the first render in which it is true, in tutorial
 * mode, with the lesson not yet told, builds and queues it. `build` is read at that moment and
 * not before, so it can close over whatever the screen knows; it is deliberately not a
 * dependency, because the lesson is told once and its copy is what the screen said the first
 * time the state was true.
 */
export function useLesson(id: string, when: boolean, build: () => Lesson) {
  const tutorial = useTutorial()
  useEffect(() => {
    if (tutorial && when) teachOnce(id, build)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial, when, id])
}
