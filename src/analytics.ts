/**
 * ANALYTICS — a stub until the PostHog wiring lands (P5). `track` is the one call every screen makes;
 * with no project key configured it does nothing at all.
 */
export type Props = Record<string, string | number | boolean | null | undefined>

export function track(event: string, props: Props = {}): void {
  void event
  void props
}

const once = new Set<string>()
/** The first time this event happens in this visit (a page load), and never again until the next. */
export function trackOnce(event: string, props: Props = {}): void {
  if (once.has(event)) return
  once.add(event)
  track(event, props)
}
