import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applySave, collectSave, decodeSave, encodeSave } from '../src/state/savecode'

/**
 * P5: analytics are cookieless by default. With a key, PostHog is started in cookieless_mode
 * 'always' with nothing persisted, no person profiles, no autocapture and no replay; the share id
 * and ref are read off the address and taken off it; and nothing at all is written to storage.
 * Without a key nothing loads. Node has no browser, so the few globals the module touches are stood
 * in for here.
 *
 * HIS DECISION, 2026-10-24: "ID after a one-time yes (Recommended)". The ask shows once, after the
 * first series, only where PostHog actually runs; a yes stores a random ID beside the answer, in the
 * save, and PostHog carries it as the distinct id (still storing nothing itself); a no, ignoring it,
 * GPC, Do Not Track, the off switch and creator mode all leave the visit cookieless with no ID.
 */
const init = vi.fn()
const capture = vi.fn()
/** The instance a yes mid-visit starts (posthog.init with a name returns a separate instance). */
const named = { capture: vi.fn() }
vi.mock('posthog-js', () => ({ default: { init, capture } }))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function browser(href: string, store: Map<string, string> = new Map(), nav: Record<string, unknown> = {}) {
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
  vi.stubGlobal('navigator', { userAgent: 'test', ...nav })
  return { replaced, store }
}

/** A Storage over a Map, with key() and length, for the save code's own functions. */
function storage(m: Map<string, string>): Storage {
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  init.mockReset()
  capture.mockReset()
  named.capture.mockReset()
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
    expect(cfg.bootstrap).toBeUndefined()
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

  it('creator mode sends nothing and never asks', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const { store } = browser('https://game.test/?creator=1')
    const a = await import('../src/analytics')
    expect(a.initAnalytics({ creator: true })).toBe(false)
    expect(a.shouldAskStats()).toBe(false)
    a.answerStats(true)
    await new Promise((r) => setTimeout(r, 20))
    expect(init).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(store.get('game7.aid')).toBeUndefined()
  })
})

describe('the one-time stats ask (his decision, 2026-10-24)', () => {
  it('no key: never asked, no ID, nothing loaded', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    const { store } = browser('https://game.test/')
    const a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(false)
    expect(a.shouldAskStats()).toBe(false)
    a.answerStats(true)
    expect(store.has('game7.aid')).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(init).not.toHaveBeenCalled()
  })

  it('a module that was never started does not ask, even with a key', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    browser('https://game.test/')
    const a = await import('../src/analytics')
    expect(a.shouldAskStats()).toBe(false)
  })

  const refusals: [string, Record<string, unknown>, [string, string][]][] = [
    ['Global Privacy Control', { globalPrivacyControl: true }, []],
    ['Do Not Track', { doNotTrack: '1' }, []],
    ['the off switch', {}, [['game7.analytics', 'off']]],
  ]
  for (const [what, nav, saved] of refusals) {
    it(`${what}: no ask, no ID, nothing sent`, async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
      const { store } = browser('https://game.test/', new Map(saved), nav)
      const a = await import('../src/analytics')
      expect(a.initAnalytics()).toBe(false)
      expect(a.shouldAskStats()).toBe(false)
      a.answerStats(true)
      expect(store.has('game7.aid')).toBe(false)
      expect(a.anonId()).toBeNull()
      await new Promise((r) => setTimeout(r, 20))
      expect(init).not.toHaveBeenCalled()
      expect(capture).not.toHaveBeenCalled()
    })
  }

  it('yes: a random ID is stored beside the answer, and PostHog carries it as the distinct id', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const { store } = browser('https://game.test/')
    init.mockImplementation((_k: string, _c: unknown, name?: string) => (name ? named : undefined))
    const a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(true)
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    // the visit starts cookieless; the series ends; the ask is due exactly once
    expect(init.mock.calls[0][1].cookieless_mode).toBe('always')
    expect(a.shouldAskStats()).toBe(true)
    a.markStatsAsked()
    expect(a.shouldAskStats()).toBe(false)
    a.answerStats(true)
    const id = store.get('game7.aid')!
    expect(id).toMatch(UUID)
    expect(store.get('game7.statsConsent')).toBe('yes')
    expect(a.anonId()).toBe(id)
    // a yes mid-visit takes effect at once, on an instance of its own
    expect(init).toHaveBeenCalledTimes(2)
    const [key, cfg, name] = init.mock.calls[1]
    expect(key).toBe('phc_test')
    expect(name).toBe('g7aid')
    expect(cfg).toMatchObject({
      bootstrap: { distinctID: id, isIdentifiedID: false },
      person_profiles: 'never',
      persistence: 'memory',
      disable_persistence: true,
      autocapture: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
    })
    expect(cfg.cookieless_mode).toBeUndefined()
    a.track('series_complete', { level: 2 })
    expect(named.capture.mock.calls.map((c) => c[0])).toEqual(['stats_consent', 'series_complete'])
    expect(named.capture.mock.calls[0][1]).toEqual({ answer: 'yes' })
    // the cookieless instance heard only what came before the yes
    expect(capture.mock.calls.map((c) => c[0])).toEqual(['open'])
    // and nothing but the two save keys was written
    expect([...store.keys()].sort()).toEqual(['game7.aid', 'game7.statsConsent'])
  })

  it('the next load: no ask, and PostHog starts with the ID from the first event', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const id = '0f8e2a4c-1b3d-4e5f-9a7b-6c5d4e3f2a1b'
    browser('https://game.test/', new Map([['game7.statsConsent', 'yes'], ['game7.aid', id]]))
    const a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(true)
    expect(a.shouldAskStats()).toBe(false)
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    const [, cfg, name] = init.mock.calls[0]
    expect(name).toBeUndefined()
    expect(cfg.bootstrap).toEqual({ distinctID: id, isIdentifiedID: false })
    expect(cfg.cookieless_mode).toBeUndefined()
    expect(capture.mock.calls[0][0]).toBe('open')
  })

  it('a yes while PostHog is still loading starts the one instance with the ID', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const { store } = browser('https://game.test/')
    const a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(true)
    a.answerStats(true)
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    expect(init.mock.calls[0][1].bootstrap).toEqual({ distinctID: store.get('game7.aid'), isIdentifiedID: false })
    expect(init.mock.calls[0][2]).toBeUndefined()
    expect(capture.mock.calls.map((c) => c[0])).toEqual(['open', 'stats_consent'])
  })

  it('no, or dismissed: no ID, never asked again, and the visit stays cookieless', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const { store } = browser('https://game.test/')
    let a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(true)
    expect(a.shouldAskStats()).toBe(true)
    a.markStatsAsked()
    a.answerStats(false)
    expect(store.get('game7.statsConsent')).toBe('no')
    expect(store.has('game7.aid')).toBe(false)
    expect(a.shouldAskStats()).toBe(false)
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    expect(init.mock.calls[0][1].cookieless_mode).toBe('always')
    expect(capture.mock.calls.map((c) => c[0])).toEqual(['open', 'stats_consent'])
    expect(capture.mock.calls[1][1]).toEqual({ answer: 'no' })
    // shown and walked away from: the "no" stored at the showing stands, on every later load
    vi.resetModules()
    const ignored = browser('https://game.test/')
    a = await import('../src/analytics')
    a.initAnalytics()
    expect(a.shouldAskStats()).toBe(true)
    a.markStatsAsked()
    vi.resetModules()
    browser('https://game.test/', ignored.store)
    a = await import('../src/analytics')
    a.initAnalytics()
    expect(a.shouldAskStats()).toBe(false)
    expect(ignored.store.get('game7.statsConsent')).toBe('no')
    expect(ignored.store.has('game7.aid')).toBe(false)
  })

  it('the off switch deletes the ID at boot (a save imported into a browser that switched off)', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const id = '0f8e2a4c-1b3d-4e5f-9a7b-6c5d4e3f2a1b'
    const { store } = browser('https://game.test/', new Map([['game7.analytics', 'off'], ['game7.statsConsent', 'yes'], ['game7.aid', id]]))
    const a = await import('../src/analytics')
    expect(a.initAnalytics()).toBe(false)
    expect(store.has('game7.aid')).toBe(false)
    expect(store.get('game7.statsConsent')).toBe('no')
    expect(store.get('game7.analytics')).toBe('off')
  })

  it('an ID only lives beside a yes', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    const { store } = browser('https://game.test/', new Map([['game7.statsConsent', 'no'], ['game7.aid', '0f8e2a4c-1b3d-4e5f-9a7b-6c5d4e3f2a1b']]))
    const a = await import('../src/analytics')
    a.initAnalytics()
    expect(store.has('game7.aid')).toBe(false)
    expect(a.anonId()).toBeNull()
  })

  it('the ID is a v4 UUID with or without crypto.randomUUID', async () => {
    const a = await import('../src/analytics')
    expect(a.newAid()).toMatch(UUID)
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(0xab) })
    expect(a.newAid()).toMatch(UUID)
    vi.stubGlobal('crypto', undefined)
    const ids = new Set(Array.from({ length: 50 }, () => a.newAid()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID)
  })

  it('the privacy page: turning analytics off, or "Remove the ID", deletes the ID and the yes', () => {
    const html = readFileSync(new URL('../privacy/index.html', import.meta.url), 'utf8')
    const code = /<script>([\s\S]*?)<\/script>/.exec(html)![1]
    const id = '0f8e2a4c-1b3d-4e5f-9a7b-6c5d4e3f2a1b'
    const run = (withIdLine: boolean) => {
      const store = new Map([['game7.statsConsent', 'yes'], ['game7.aid', id], ['game7.campaign.v2', '{}']])
      const els: Record<string, { textContent: string; hidden: boolean; click: () => void; addEventListener: (t: string, f: () => void) => void; setAttribute: () => void }> = {}
      const el = () => {
        const e = { textContent: '', hidden: false, click: () => {}, addEventListener: (_t: string, f: () => void) => void (e.click = f), setAttribute: () => {} }
        return e
      }
      for (const k of ['state', 'toggle', ...(withIdLine ? ['aidstate', 'aidremove'] : [])]) els[k] = el()
      const doc = { getElementById: (k: string) => els[k] ?? null }
      const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
      new Function('document', 'localStorage', code)(doc, ls)
      return { store, els }
    }
    // the switch
    let { store, els } = run(true)
    expect(els.aidstate.textContent).toBe(id)
    expect(els.aidremove.hidden).toBe(false)
    els.toggle.click()
    expect(store.get('game7.analytics')).toBe('off')
    expect(store.has('game7.aid')).toBe(false)
    expect(store.get('game7.statsConsent')).toBe('no')
    expect(store.get('game7.campaign.v2')).toBe('{}')
    expect(els.aidstate.textContent).toBe('none')
    expect(els.aidremove.hidden).toBe(true)
    // turning analytics back on brings no ID back
    els.toggle.click()
    expect(store.has('game7.analytics')).toBe(false)
    expect(store.has('game7.aid')).toBe(false)
    // the ID's own button, which leaves the cookieless counting on
    ;({ store, els } = run(true))
    els.aidremove.click()
    expect(store.has('game7.aid')).toBe(false)
    expect(store.get('game7.statsConsent')).toBe('no')
    expect(store.has('game7.analytics')).toBe(false)
    // a deploy with no PostHog key prints no ID line, and the switch still works without it
    ;({ store, els } = run(false))
    els.toggle.click()
    expect(store.get('game7.analytics')).toBe('off')
  })
})

describe('the ID travels with the save (his decision: "it travels with save codes and the mover")', () => {
  it('a save code carries the answer and the ID, and importing it restores them', async () => {
    const id = '0f8e2a4c-1b3d-4e5f-9a7b-6c5d4e3f2a1b'
    const here = storage(
      new Map([
        ['game7.campaign.v2', '{"plays":3,"stars":[2]}'],
        ['game7.statsConsent', 'yes'],
        ['game7.aid', id],
        ['game7.analytics', 'off'],
        ['game7.staff', '1'],
      ]),
    )
    const data = collectSave(here)
    expect(data['game7.aid']).toBe(id)
    expect(data['game7.statsConsent']).toBe('yes')
    // the off switch and the staff flag stay with their own browser
    expect(data['game7.analytics']).toBeUndefined()
    expect(data['game7.staff']).toBeUndefined()
    const code = await encodeSave(data)
    const there = storage(new Map([['game7.statsConsent', 'no']]))
    applySave(await decodeSave(code), there)
    expect(there.getItem('game7.aid')).toBe(id)
    expect(there.getItem('game7.statsConsent')).toBe('yes')
    expect(there.getItem('game7.campaign.v2')).toBe('{"plays":3,"stars":[2]}')
  })
})
