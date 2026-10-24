import type { PostHogConfig } from 'posthog-js'
import { inAppBrowser, platform, standalone } from './share/inapp'
import { SITE } from './site'

/**
 * ANALYTICS (P5, the launch gate) — cookieless by default, an anonymous ID only after a yes.
 *
 * The plan asked for "distinct_id = a random ID stored in the save, carried by the mover, save codes
 * and escape links", so that D1/D7 retention can be measured. Storing or reading ANY identifier on
 * the device for statistics needs consent in the EU and the UK (ePrivacy Art. 5(3), EDPB Guidelines
 * 2/2023), so the first launch shipped without one. HIS DECISION, 2026-10-24: "ID after a one-time
 * yes (Recommended)" — "One small prompt after the first series: 'Share anonymous stats to help
 * improve the game?' Yes stores a random ID in the save (it travels with save codes and the mover).
 * No, or ignoring it, stays cookieless as today. Compliant everywhere; retention only counts people
 * who said yes." So there are two ways to run, and the visitor picks:
 *
 *   · BY DEFAULT, COOKIELESS. PostHog in `cookieless_mode: 'always'` on the EU cloud — no cookies, no
 *     localStorage, no sessionStorage; PostHog derives an anonymous hash on its own servers that
 *     rotates daily, which is why it cannot tell a returning player. (The mode must ALSO be switched
 *     on in the PostHog project's settings, or these events are dropped.)
 *   · AFTER A YES, THE GAME'S OWN ID. `game7.aid`, a random UUID made the moment he taps Yes, kept in
 *     localStorage beside `game7.statsConsent = 'yes'`. Both are ordinary save keys, so a save code,
 *     an escape link and the mover carry them (state/savecode.ts). PostHog is started with the ID as
 *     the distinct id (`bootstrap.distinctID`) and still keeps nothing itself: memory persistence,
 *     no cookies. With `person_profiles: 'never'` no profile is built; PostHog files each event under
 *     a person UUID it computes from the distinct id, so one ID counts as one player in retention.
 *   · THE ASK (src/ui/StatsAsk.tsx) goes up once, on the result screen of the first series, and only
 *     where these analytics would actually run (`shouldAskStats`). From the moment it shows, the
 *     stored answer is "no" until Yes is tapped — ignoring it is a no, and it never comes back.
 *   · A YES TAKES EFFECT AT ONCE: a second PostHog instance is started with the ID and every event
 *     from then on goes to it (`stats_consent` first, which is day 0 for a retention cohort). The
 *     events before the yes stay cookieless — except in the moment PostHog is still loading at boot,
 *     when the few queued events go out with the ID (a save imported from a link lands then). A no
 *     changes nothing: no ID, cookieless as before.
 *   · `identify()` is never called. Autocapture, replay, surveys, flags and PostHog's extra scripts
 *     stay off in both ways. The save itself is never read for analytics, only these two keys.
 *   · The share loop is still measured with `?s=<shareId>` on shared links (src/share/link.ts),
 *     logged as an event property on `open`.
 *   · Global Privacy Control and Do Not Track mean nothing is sent, the ask never shows and no ID is
 *     made. The privacy page's off switch (`game7.analytics`, kept in this browser alone) means the
 *     same, and it deletes the ID and turns a yes into a no (here at boot too, for a save imported
 *     into a browser that had switched off).
 *
 * With no project key configured (VITE_POSTHOG_KEY), every call here is a no-op, the ask never
 * shows, and posthog-js is never even downloaded — it is a dynamic import.
 *
 * EVENTS: open (utm, ref, s), first_spin, draft_complete, series_complete, share_click, link_open,
 * install, error, stats_consent (answer). Creator mode sends nothing and never asks: filming is not
 * playing.
 */
export type Props = Record<string, string | number | boolean | null | undefined>

const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? ''
/** Cloudflare Web Analytics, loaded by the game itself behind the same switches (see `loadBeacon`). */
const CF = (import.meta.env.VITE_CF_BEACON as string | undefined) || SITE.cfBeacon
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'
/** The privacy page's off switch writes this. It stays with this browser: a save code never carries it. */
export const OPT_OUT_KEY = 'game7.analytics'
/** The answer to the one-time ask: 'yes' or 'no'. Travels with the save. */
export const CONSENT_KEY = 'game7.statsConsent'
/** The anonymous ID, made only on a yes. Travels with the save; a no or the off switch deletes it. */
export const AID_KEY = 'game7.aid'

type PostHog = (typeof import('posthog-js'))['default']
/** The instance events go to: the cookieless one, or the one carrying the ID. */
let ph: PostHog | null = null
/** The loaded library, kept to start the ID's instance when a yes comes mid-visit. */
let lib: PostHog | null = null
let queue: [string, Props][] | null = null
let off = !KEY
/** initAnalytics ran and PostHog will run this visit (a key, not creator mode, allowed). */
let started = false
/** The ID the running instance carries, or null while cookieless. */
let usingId: string | null = null

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
/** Writes and reads back: false where storage is blocked or full, so nothing half-stored is relied on. */
const write = (k: string, v: string): boolean => {
  try {
    localStorage.setItem(k, v)
    return localStorage.getItem(k) === v
  } catch {
    return false
  }
}
const drop = (k: string) => {
  try {
    localStorage.removeItem(k)
  } catch {
    /* storage blocked: there is nothing stored to remove */
  }
}

export function analyticsAllowed(): boolean {
  return !!KEY && privacyAllows()
}

/** The visitor's own say: Global Privacy Control, Do Not Track, and the privacy page's off switch. */
export function privacyAllows(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (nav.globalPrivacyControl === true || nav.doNotTrack === '1') return false
  return read(OPT_OUT_KEY) !== 'off'
}

export type StatsConsent = 'yes' | 'no' | null

/** The stored answer to the ask, or null when it has never been shown. */
export function statsConsent(): StatsConsent {
  const v = read(CONSENT_KEY)
  return v === 'yes' || v === 'no' ? v : null
}

const AID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The ID events may carry: a stored yes, a well-formed ID, and the visitor's settings allowing it. */
export function anonId(): string | null {
  if (!privacyAllows() || statsConsent() !== 'yes') return null
  const id = read(AID_KEY)
  return id && AID_FORMAT.test(id) ? id.toLowerCase() : null
}

/** A random version-4 UUID. `randomUUID` needs a secure context; `getRandomValues` does not. */
export function newAid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * THE TWO KEYS KEPT HONEST AT BOOT. The off switch is this browser's standing no: an ID that arrived
 * with an imported save is deleted and its yes becomes a no, exactly what the switch itself does on
 * the privacy page. And an ID only ever lives beside a yes. GPC and Do Not Track touch nothing here:
 * they stop the ID being read or sent (`anonId`), and the save keeps the answer it was given.
 */
function tidy() {
  if (read(OPT_OUT_KEY) === 'off') {
    if (read(AID_KEY) !== null) drop(AID_KEY)
    if (statsConsent() === 'yes') write(CONSENT_KEY, 'no')
  } else if (read(AID_KEY) !== null && statsConsent() !== 'yes') drop(AID_KEY)
}

/** Whether the one-time ask should go up now: PostHog runs this visit and no answer is stored. */
export function shouldAskStats(): boolean {
  return started && !off && privacyAllows() && statsConsent() === null
}

/** The ask is on the screen: shown once, so until Yes is tapped the stored answer is "no". */
export function markStatsAsked(): void {
  if (statsConsent() === null) write(CONSENT_KEY, 'no')
}

/**
 * HIS ANSWER. Yes makes the ID, stores it beside the yes, and switches this visit over to it at once
 * (see `carryId`) — only where PostHog runs this visit, so no ID is ever made in creator mode, under
 * GPC / Do Not Track / the off switch, or without a key. No — and the ask's own dismissal — stores
 * the no and deletes any ID. Where the ID cannot be stored (storage blocked or full) nothing is
 * switched: an ID that would not survive the page is no use for counting returns.
 */
export function answerStats(yes: boolean): void {
  if (yes && started && !off && privacyAllows()) {
    const id = newAid()
    if (write(AID_KEY, id) && write(CONSENT_KEY, 'yes')) {
      carryId(id)
      track('stats_consent', { answer: 'yes' })
      return
    }
    drop(AID_KEY)
  }
  write(CONSENT_KEY, 'no')
  drop(AID_KEY)
  track('stats_consent', { answer: 'no' })
}

/**
 * Everything both ways share. Nothing is persisted by PostHog in either: memory only, persistence
 * off, no cookies. The cookieless way adds `cookieless_mode`; the ID way hands PostHog the ID as the
 * distinct id, an anonymous one (`isIdentifiedID: false`), and leaves cookieless mode off — the ID
 * is ours, and PostHog stores nothing to keep it.
 */
function settings(id: string | null): Partial<PostHogConfig> {
  const base: Partial<PostHogConfig> = {
    api_host: HOST,
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
  }
  return id ? { ...base, bootstrap: { distinctID: id, isIdentifiedID: false } } : { ...base, cookieless_mode: 'always' }
}

/**
 * A YES MID-VISIT. PostHog cannot be started twice, and its cookieless instance cannot take on an ID,
 * so the ID gets an instance of its own and every event from here goes there. If the library is
 * still loading, there is nothing to switch: the loader reads the ID when it lands.
 */
function carryId(id: string) {
  if (off || usingId === id) return
  if (!lib) return
  ph = lib.init(KEY, settings(id), 'g7aid') ?? ph
  usingId = id
}

/**
 * Where the visit came from, read once — and taken off the address so a re-share starts clean, but
 * only once the page-view counter has read it too (the live check, 2026-10-22: the beacon reads the
 * address when it reports, and it was reporting a clean one, so no short link was ever attributed).
 */
function arrival(): Props {
  const u = new URL(location.href)
  const p = u.searchParams
  const props: Props = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref', 's']) {
    const v = p.get(k)
    if (v) props[k] = v.slice(0, 64)
    p.delete(k)
  }
  if (p.has('c') || /(?:^#|&)c=/.test(u.hash)) props.challenge = true
  if (u.href !== location.href) {
    const clean = () => {
      // only if nothing has moved the address since (a challenge closing, an import being read)
      const now = new URL(location.href)
      if (now.pathname === u.pathname && now.hash === u.hash) history.replaceState(history.state, '', u.href)
    }
    if (typeof window !== 'undefined' && CF && privacyAllows()) setTimeout(clean, 6000)
    else clean()
  }
  return props
}

/**
 * CLOUDFLARE WEB ANALYTICS, LOADED BY THE GAME (the live check, 2026-10-22: the beacon was injected
 * at the edge, so it counted visitors who had switched analytics off, sent GPC or Do Not Track, and
 * every creator-mode film — twice). Loaded here it obeys the same switches as everything else. If
 * the edge still injects its own copy (the dashboard setting is his to turn off), that one is left
 * to do the counting rather than counting twice.
 */
function loadBeacon() {
  if (!CF || typeof document === 'undefined') return
  // a development server or the local build is not a visit to count
  if (import.meta.env.DEV || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return
  if (document.querySelector('script[src*="cloudflareinsights.com/beacon"]')) return
  const s = document.createElement('script')
  s.defer = true
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: CF, spa: true }))
  document.head.appendChild(s)
}

/**
 * Called once at boot. `creator` turns everything off for the page's life. Returns whether the
 * analytics will run, mostly for tests.
 */
export function initAnalytics(opts: { creator?: boolean } = {}): boolean {
  const from = typeof location === 'undefined' ? {} : arrival()
  if (opts.creator) {
    off = true
    return false
  }
  if (typeof window !== 'undefined') tidy()
  if (!privacyAllows()) {
    off = true
    return false
  }
  loadBeacon()
  if (!KEY) {
    off = true
    return false
  }
  queue = []
  started = true
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
  /* THE PRIVACY PAGE IN ANOTHER TAB. Its off switch, or its "remove the ID", takes effect here at
     once rather than at the next load: this visit stops sending. */
  window.addEventListener('storage', (e) => {
    if (e.key === null || (e.key === OPT_OUT_KEY && e.newValue === 'off') || (e.key === AID_KEY && usingId && e.newValue !== usingId)) {
      off = true
      queue = null
    }
  })
  import('posthog-js')
    .then(({ default: posthog }) => {
      if (off) return
      lib = posthog
      // a yes given while the library loaded is read here, so there is only ever one instance
      const id = anonId()
      posthog.init(KEY, settings(id))
      ph = posthog
      usingId = id
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
