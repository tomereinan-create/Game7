/**
 * THE SAVE CODE (P9, and the mover of P3). Progress lives in this browser's localStorage, which is
 * tied to one origin in one browser: an in-app browser (TikTok, Instagram), the Home Screen app
 * and Safari each start empty, and moving the game to a new domain strands every save on the old
 * one. A save code is the whole save written out as text, so it can be carried across any of those
 * gaps by hand, or in a link's #import=<code>.
 *
 * WHAT IS IN IT: every key the game writes — all of them start `game7.` — and nothing else. The
 * analytics off switch (`game7.analytics`) stays with the browser it was set in, and so does the
 * staff flag (`game7.staff`, state/staff.ts): a code he hands someone must not hand them Scout mode.
 * The answer to the one-time stats ask and the anonymous ID a yes makes (`game7.statsConsent`,
 * `game7.aid`) DO travel — his decision, 2026-10-24: "Yes stores a random ID in the save (it travels
 * with save codes and the mover)" — so a player who moves browsers is still one returning player.
 * A browser that has switched analytics off deletes an ID that arrives this way (src/analytics.ts).
 *
 * FORMAT: `1.` + base64url(deflate-raw(JSON)) where the browser has CompressionStream (every
 * current one), `0.` + base64url(JSON) where it does not. Both decode everywhere the game runs.
 * No DOM here beyond the storage passed in, so the mover page bundles this same file.
 */
export const PREFIX = 'game7.'
const SKIP = new Set(['game7.analytics', 'game7.staff'])

export type SaveData = Record<string, string>

export function collectSave(store: Storage = localStorage): SaveData {
  const out: SaveData = {}
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith(PREFIX) && !SKIP.has(k)) out[k] = store.getItem(k) ?? ''
  }
  return out
}

/** Whether this browser holds any progress worth asking about before it is replaced. */
export function hasProgress(store: Storage = localStorage): boolean {
  const d = collectSave(store)
  for (const [k, v] of Object.entries(d)) {
    if (k === 'game7.team.v1' || k === 'game7.tut.team.v1') return true
    if (/^game7\.(tut\.)?(campaign|salary|death)\.v2$|^game7\.c2026\.v2$/.test(k)) {
      try {
        const p = JSON.parse(v) as { plays?: number; stars?: number[] }
        if ((p.plays ?? 0) > 0 || (p.stars ?? []).some((s) => s > 0)) return true
      } catch {
        return true
      }
    }
  }
  return false
}

export function applySave(data: SaveData, store: Storage = localStorage): void {
  const old: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith(PREFIX) && !SKIP.has(k)) old.push(k)
  }
  for (const k of old) store.removeItem(k)
  for (const [k, v] of Object.entries(data)) if (k.startsWith(PREFIX) && !SKIP.has(k)) store.setItem(k, v)
}

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64url = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '==='.slice((t.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer()
  return new Uint8Array(buf)
}

export async function encodeSave(data: SaveData): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(data))
  if (typeof CompressionStream === 'function') {
    try {
      return `1.${b64url(await pipe(raw, new CompressionStream('deflate-raw')))}`
    } catch {
      /* a browser that names the stream but not the format: fall through to the plain code */
    }
  }
  return `0.${b64url(raw)}`
}

export class BadCode extends Error {}

export async function decodeSave(code: string): Promise<SaveData> {
  const c = decodeURIComponent(code.trim()).replace(/\s+/g, '')
  const dot = c.indexOf('.')
  const v = c.slice(0, dot)
  try {
    let bytes: Uint8Array = unb64url(c.slice(dot + 1))
    if (v === '1') {
      if (typeof DecompressionStream !== 'function') throw new BadCode('This browser cannot read a compressed save code.')
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
    } else if (v !== '0') throw new BadCode('Not a save code.')
    const data = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BadCode('Not a save code.')
    const out: SaveData = {}
    for (const [k, val] of Object.entries(data as Record<string, unknown>)) if (k.startsWith(PREFIX) && typeof val === 'string') out[k] = val
    return out
  } catch (e) {
    throw e instanceof BadCode ? e : new BadCode('That save code is damaged or incomplete.')
  }
}

/** The code a link carries: `#import=<code>` (kept out of server logs), or `?import=` from an
 *  Android intent, whose own syntax owns the `#`. Read once; the caller takes it off the address. */
export function importFromUrl(href: string): string | null {
  const u = new URL(href)
  const h = /(?:^#|&)import=([^&]+)/.exec(u.hash)
  return h ? h[1] : u.searchParams.get('import')
}
