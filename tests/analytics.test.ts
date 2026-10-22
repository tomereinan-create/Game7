import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * P5: analytics are cookieless by construction. With a key, PostHog is started in
 * cookieless_mode 'always' with nothing persisted, no person profiles, no autocapture and no
 * replay; the share id and ref are read off the address and taken off it; and nothing at all is
 * written to storage. Without a key nothing loads. Node has no browser, so the few globals the
 * module touches are stood in for here.
 */
const init = vi.fn()
const capture = vi.fn()
vi.mock('posthog-js', () => ({ default: { init, capture } }))

function browser(href: string, store: Map<string, string> = new Map()) {
  const replaced: string[] = []
  const g = globalThis as Record<string, unknown>
  g.window = { addEventListener: () => {} }
  g.location = { href }
  g.history = { state: null, replaceState: (_s: unknown, _t: string, u: string) => replaced.push(u) }
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  return { replaced, store }
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  init.mockClear()
  capture.mockClear()
})

describe('analytics', () => {
  it('with a key: cookieless PostHog, the share id logged and stripped, nothing stored', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const { replaced, store } = browser('https://game.test/?s=ab12cd34&ref=tt&utm_source=tiktok&creator=0#x')
    const a = await import('../src/analytics')
    // the address is cleaned only once the page-view counter has had time to read it
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    expect(a.initAnalytics()).toBe(true)
    expect(replaced.length).toBe(0)
    vi.advanceTimersByTime(6000)
    vi.useRealTimers()
    a.track('first_spin', { level: 1 })
    await vi.waitFor(() => expect(init).toHaveBeenCalled())
    const [key, cfg] = init.mock.calls[0]
    expect(key).toBe('phc_test')
    expect(cfg).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      cookieless_mode: 'always',
      person_profiles: 'never',
      persistence: 'memory',
      disable_persistence: true,
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
    })
    const events = capture.mock.calls.map((c) => c[0])
    expect(events).toEqual(['open', 'link_open', 'first_spin'])
    expect(capture.mock.calls[0][1]).toMatchObject({ s: 'ab12cd34', ref: 'tt', utm_source: 'tiktok' })
    expect(replaced[replaced.length - 1]).toBe('https://game.test/?creator=0#x')
    expect(store.size).toBe(0)
  })

  it('the privacy page off switch, and no key at all, both mean nothing is sent', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    browser('https://game.test/', new Map([['game7.analytics', 'off']]))
    let a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(false)
    a.track('open')
    vi.resetModules()
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    browser('https://game.test/')
    a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(false)
    a.track('open')
    await new Promise((r) => setTimeout(r, 20))
    expect(init).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })

  it('creator mode sends nothing', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    browser('https://game.test/?creator=1')
    const a = await import('../src/analytics')
    expect(a.initAnalytics({ creator: true })).toBe(false)
  })
})
