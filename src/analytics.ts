/**
 * ANALYTICS — a stub until the PostHog wiring lands (P5). `track` is the one call every screen makes;
 * with no project key configured it does nothing at all.
 */
export type Props = Record<string, string | number | boolean | null | undefined>

export function track(event: string, props: Props = {}): void {
  void event
  void props
}
