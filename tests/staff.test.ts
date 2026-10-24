/**
 * HIS RULING, 2026-10-24: "Scout mode is only for me. Once I publish the game, only the user mode
 * matters". Who counts as staff (src/state/staff.ts), which mode a browser opens in
 * (src/state/viewmode.ts `resolveMode`), and which builds carry the provenance file the Advanced
 * window reads (src/site.ts `deployFor`).
 *
 * This file runs as staff (vitest is a dev build), the way the rest of the suite does. What the
 * published site sees is tests/publicmode.test.ts.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStaff, STAFF, STAFF_KEY } from '../src/state/staff'
import { resolveMode, setViewMode, viewMode } from '../src/state/viewmode'
import { deployFor } from '../src/site'
import { PLAYERS } from '../src/engine/pool'
import { DetailGrid } from '../src/ui/Stat'
import { CardSheet } from '../src/ui/CardSheet'
import { applySave, collectSave } from '../src/state/savecode'

describe('which mode a browser opens in', () => {
  it('on the published site: User by default, and never Scout', () => {
    expect(resolveMode(null, null, false)).toBe('user')
    expect(resolveMode('scout', null, false)).toBe('user')
    expect(resolveMode(null, '0', false)).toBe('user')
    expect(resolveMode(null, '1', false)).toBe('user')
    expect(resolveMode('user', '1', false)).toBe('user')
    expect(resolveMode('tutorial', '1', false)).toBe('tutorial')
    expect(resolveMode('nonsense', null, false)).toBe('user')
  })

  it('on staff: what it always was — Scout by default, the stored mode when there is one', () => {
    expect(resolveMode(null, null, true)).toBe('scout')
    expect(resolveMode('scout', '0', true)).toBe('scout')
    expect(resolveMode(null, '0', true)).toBe('scout')
    expect(resolveMode(null, '1', true)).toBe('user')
    expect(resolveMode('tutorial', '1', true)).toBe('tutorial')
    expect(resolveMode('user', '0', true)).toBe('user')
    expect(resolveMode('nonsense', 'x', true)).toBe('scout')
  })

  it('the suite runs as staff, so a fresh store still opens in Scout and Scout can be chosen', () => {
    expect(STAFF).toBe(true)
    setViewMode('user')
    setViewMode('scout')
    expect(viewMode()).toBe('scout')
  })
})

/** A page at `href` with a Map for its storage, for readStaff to read and rewrite. */
function page(href: string, stored: Record<string, string> = {}) {
  const store = new Map(Object.entries(stored))
  let at = href
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal('location', {
    get href() {
      return at
    },
    get hostname() {
      return new URL(at).hostname
    },
  })
  vi.stubGlobal('history', { state: null, replaceState: (_s: unknown, _t: string, url: string) => void (at = new URL(url, at).href) })
  return { store, href: () => at }
}

describe('who is staff', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('a visitor to the published site is not', () => {
    page('https://game7draft.com/')
    expect(readStaff(false)).toBe(false)
  })

  it('?scout=1 opens the door, remembers it, and leaves the address as it found it but for itself', () => {
    const p = page('https://game7draft.com/?ref=tt&scout=1&utm_source=ig#c=abc')
    expect(readStaff(false)).toBe(true)
    expect(p.store.get(STAFF_KEY)).toBe('1')
    expect(p.href()).toBe('https://game7draft.com/?ref=tt&utm_source=ig#c=abc')
    // the reload: no parameter, the flag carries it
    const again = page(p.href(), Object.fromEntries(p.store))
    expect(readStaff(false)).toBe(true)
    expect(again.href()).toBe('https://game7draft.com/?ref=tt&utm_source=ig#c=abc')
  })

  it('?scout=0 closes it again, and a lone parameter leaves no "?" behind', () => {
    const p = page('https://game7draft.com/?scout=0#import=1.abc', { [STAFF_KEY]: '1' })
    expect(readStaff(false)).toBe(false)
    expect(p.store.has(STAFF_KEY)).toBe(false)
    expect(p.href()).toBe('https://game7draft.com/#import=1.abc')
  })

  it('this machine is, as it is for the ?stars= door — but not the Android app on its https://localhost', () => {
    for (const h of ['http://localhost:5178/', 'http://127.0.0.1:5178/', 'http://[::1]:5178/', 'http://game7.localhost:5300/']) {
      page(h)
      expect(readStaff(false), h).toBe(true)
    }
    page('https://localhost/')
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true })
    expect(readStaff(false)).toBe(false)
  })

  it('the dev server always is', () => {
    page('https://game7draft.com/')
    expect(readStaff(true)).toBe(true)
  })

  it('the flag stays with the browser: a save code neither carries it nor clears it', () => {
    const m = new Map<string, string>([
      [STAFF_KEY, '1'],
      ['game7.viewmode', 'scout'],
    ])
    const s = {
      get length() {
        return m.size
      },
      clear: () => m.clear(),
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      key: (i: number) => [...m.keys()][i] ?? null,
      removeItem: (k: string) => void m.delete(k),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
    } as Storage
    expect(collectSave(s)).toEqual({ 'game7.viewmode': 'scout' })
    applySave({ 'game7.viewmode': 'user', [STAFF_KEY]: '1' }, s)
    expect(m.get(STAFF_KEY)).toBe('1')
    m.delete(STAFF_KEY)
    applySave({ 'game7.viewmode': 'user', [STAFF_KEY]: '1' }, s)
    expect(m.has(STAFF_KEY)).toBe(false)
  })

  it('storage that throws is a visitor, not a crash', () => {
    page('https://game7draft.com/')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readStaff(false)).toBe(false)
  })
})

describe('the provenance file ships only where the Advanced window can be opened', () => {
  it('every CI build is public and leaves it out; a local build and the dev server keep it', () => {
    expect(deployFor({}).provenance).toBe(true)
    expect(deployFor({ CI: 'true' }).provenance).toBe(false)
  })

  it('VITE_PROVENANCE overrides either way, and an empty one (an unset repository variable) does not', () => {
    expect(deployFor({ CI: 'true', VITE_PROVENANCE: '1' }).provenance).toBe(true)
    expect(deployFor({ VITE_PROVENANCE: '0' }).provenance).toBe(false)
    expect(deployFor({ CI: 'true', VITE_PROVENANCE: '' }).provenance).toBe(false)
    expect(deployFor({ VITE_PROVENANCE: '' }).provenance).toBe(true)
  })

  it('on staff in Scout mode the sheet and the card offer Advanced when the build carries the file, and never in user mode', () => {
    const p = PLAYERS[0]
    const built = import.meta.env.VITE_PROVENANCE === '1'
    // vite.config.ts writes the define from the same rule (a local run carries the file; CI does not)
    expect(built).toBe(deployFor(process.env).provenance)
    const card = () => renderToStaticMarkup(createElement(CardSheet, { p, onClose: () => {} }))
    setViewMode('scout')
    expect(renderToStaticMarkup(createElement(DetailGrid, { p })).includes('adv-open')).toBe(built)
    expect(card().includes('pc-adv')).toBe(built)
    setViewMode('user')
    expect(renderToStaticMarkup(createElement(DetailGrid, { p }))).not.toContain('adv-open')
    expect(card()).not.toContain('pc-adv')
    setViewMode('scout')
  })
})
