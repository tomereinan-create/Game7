import { inAppBrowser, platform, standalone } from './share/inapp'

/**
 * ANALYTICS (P5, the launch gate) — cookieless by construction.
 *
 * The plan first asked for a persistent random ID kept in the save. That was corrected before it was
 * built: storing or reading ANY identifier on the device needs consent in the EU (ePrivacy Art. 5(3),
 * EDPB Guidelines 2/2023), and a persistent identifier is personal information under COPPA. So:
 *
 *   · PostHog in `cookieless_mode: 'always'` on the EU cloud — no cookies, no localStorage, no
 *     sessionStorage; PostHog derives a rotating anonymous hash on its own servers. (The mode must
 *     ALSO be switched on in the PostHog project's settings, or the events are dropped.)
 *   · `person_profiles: 'never'`, autocapture off, session replay off, no surveys, no flags, no
 *     extra scripts loaded from PostHog's CDN. `identify()` is never called.
 *   · The share loop is measured with `?s=<shareId>` on shared links (src/share/link.ts), logged as an
 *     event property on `open` — not with a device ID.
 *   · The save is never read for analytics.
 *   · Global Privacy Control, Do Not Track, and the off switch on the privacy page (one "off" flag in
 *     this browser, which is the user's own request) all mean nothing is sent.
 *
 * With no project key configured (VITE_POSTHOG_KEY), every call here is a no-op and posthog-js is
 * never even downloaded — it is a dynamic import.
 *
 * EVENTS: open (utm, ref, s), first_spin, draft_complete, series_complete, share_click, link_open,
 * install, error. Creator mode sends nothing: filming is not playing.
 */
export type Props = Record<string, string | number | boolean | null | undefined>

const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? ''
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'
/** The privacy page's off switch writes this; it is the only thing analytics ever stores. */
export const OPT_OUT_KEY = 'game7.analytics'

type PostHog = (typeof import('posthog-js'))['default']
let ph: PostHog | null = null
let queue: [string, Props][] | null = null
let off = !KEY

export function analyticsAllowed(): boolean {
  if (!KEY || typeof window === 'undefined') return false
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (nav.globalPrivacyControl === true || nav.doNotTrack === '1') return false
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === 'off') return false
  } catch {
    /* storage blocked: no flag to read, and nothing else depends on it */
  }
  return true
}

/** Where the visit came from, read once and taken off the address so a re-share starts clean. */
function arrival(): Props {
  const u = new URL(location.href)
  const p = u.searchParams
  const props: Props = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref', 's']) {
    const v = p.get(k)
    if (v) props[k] = v.slice(0, 64)
    p.delete(k)
  }
  if (p.has('c')) props.challenge = true
  if (u.href !== location.href) history.replaceState(history.state, '', u.href)
  return props
}

/**
 * Called once at boot. `creator` turns everything off for the page's life. Returns whether the
 * analytics will run, mostly for tests.
 */
export function initAnalytics(opts: { creator?: boolean } = {}): boolean {
  const from = typeof location === 'undefined' ? {} : arrival()
  if (opts.creator || !analyticsAllowed()) {
    off = true
    return false
  }
  queue = []
  const ctx: Props = {
    inapp: inAppBrowser() ?? 'none',
    platform: platform(),
    standalone: standalone(),
  }
  track('open', { ...from, ...ctx })
  if (from.s || from.challenge) track('link_open', { s: from.s, ref: from.ref, challenge: !!from.challenge })
  window.addEventListener('appinstalled', () => track('install', { platform: platform() }))
  let errors = 0
  window.addEventListener('error', (e) => {
    if (++errors > 3) return
    track('error', { message: String(e.message).slice(0, 200), source: String(e.filename ?? '').split('/').pop(), line: e.lineno, ...ctx })
  })
  import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        cookieless_mode: 'always',
        person_profiles: 'never',
        persistence: 'memory',
        disable_persistence: true,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        rageclick: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        capture_performance: false,
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
      })
      ph = posthog
      for (const [e, p] of queue ?? []) ph.capture(e, p)
      queue = null
    })
    .catch(() => {
      off = true
      queue = null
    })
  return true
}

export function track(event: string, props: Props = {}): void {
  if (off) return
  if (ph) ph.capture(event, props)
  else queue?.push([event, props])
}

const once = new Set<string>()
/** The first time this event happens in this visit (a page load), and never again until the next. */
export function trackOnce(event: string, props: Props = {}): void {
  if (once.has(event)) return
  once.add(event)
  track(event, props)
}
