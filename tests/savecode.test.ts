import { describe, expect, it } from 'vitest'
import { applySave, BadCode, collectSave, decodeSave, encodeSave, hasProgress, importFromUrl } from '../src/state/savecode'

/** A Storage over a Map: node has no localStorage. */
function store(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init))
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

const SAVE = {
  'game7.team.v1': JSON.stringify({ city: 'Haifa', country: 'IL', name: 'Jets' }),
  'game7.campaign.v2': JSON.stringify({ plays: 12, stars: [3, 2, 1, ...Array(147).fill(0)], seed: 77 }),
  'game7.viewmode': 'user',
}

describe('the save code', () => {
  it('carries every game7 key and nothing else, and comes back byte for byte', async () => {
    const s = store({ ...SAVE, 'game7.analytics': 'off', other: 'x' })
    const data = collectSave(s)
    expect(Object.keys(data).sort()).toEqual(Object.keys(SAVE).sort())
    const code = await encodeSave(data)
    expect(code.startsWith('1.')).toBe(true)
    expect(code).toMatch(/^[0-9]\.[A-Za-z0-9_-]+$/)
    expect(await decodeSave(code)).toEqual(SAVE)
  })

  it('applying a code replaces the progress but keeps the analytics switch and foreign keys', async () => {
    const s = store({ 'game7.campaign.v2': '{"plays":1,"stars":[1]}', 'game7.salary.v2': '{}', 'game7.analytics': 'off', other: 'x' })
    applySave(SAVE, s)
    expect(collectSave(s)).toEqual(SAVE)
    expect(s.getItem('game7.salary.v2')).toBeNull()
    expect(s.getItem('game7.analytics')).toBe('off')
    expect(s.getItem('other')).toBe('x')
  })

  it('reads the plain fallback format and rejects junk with a readable error', async () => {
    const plain = '0.' + Buffer.from(JSON.stringify(SAVE)).toString('base64url')
    expect(await decodeSave(plain)).toEqual(SAVE)
    await expect(decodeSave('1.nonsense')).rejects.toBeInstanceOf(BadCode)
    await expect(decodeSave('hello')).rejects.toBeInstanceOf(BadCode)
  })

  it('knows a fresh browser from one with progress', () => {
    expect(hasProgress(store())).toBe(false)
    expect(hasProgress(store({ 'game7.campaign.v2': '{"plays":0,"stars":[0,0]}' }))).toBe(false)
    expect(hasProgress(store(SAVE))).toBe(true)
  })

  it('finds the code in a link: #import= first, ?import= for an Android intent', () => {
    expect(importFromUrl('https://x.test/#import=1.abc')).toBe('1.abc')
    expect(importFromUrl('https://x.test/?import=0.def')).toBe('0.def')
    expect(importFromUrl('https://x.test/')).toBeNull()
  })
})
