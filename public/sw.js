/**
 * Offline cache for the installed app.
 *
 * The rule that shapes everything here: a refresh must always show the newest
 * deploy. So index.html is fetched from the network first and the cache is only
 * a fallback for being offline. The hashed files under assets/ are immutable —
 * a new build renames them — so those are served from the cache when present.
 *
 * When the network hands back an index.html that differs from the cached one,
 * a new build has landed and every cached asset is now unreachable by name.
 * The cache is wiped rather than left to grow by a bundle per deploy.
 */
const CACHE = 'game7'
const SHELL = new URL('index.html', self.location).href

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  const shell =
    req.mode === 'navigate' ||
    (url.origin === self.location.origin && url.href.replace(/\/$/, '/index.html') === SHELL)

  e.respondWith(shell ? fromNetwork(req) : fromCache(req))
})

/** index.html: network first, cache as the offline fallback. */
async function fromNetwork(req) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' })
    if (!fresh.ok) throw new Error(String(fresh.status))

    const html = await fresh.clone().text()
    const cache = await caches.open(CACHE)
    const cached = await cache.match(SHELL)
    if (cached && (await cached.text()) !== html) {
      await caches.delete(CACHE) // a new build; the old assets are dead weight
    }
    const target = await caches.open(CACHE)
    await target.put(SHELL, new Response(html, { headers: { 'content-type': 'text/html' } }))

    return fresh
  } catch {
    return (await caches.match(SHELL)) ?? Response.error()
  }
}

/** Everything else — hashed bundles, JSON, fonts: cache first. */
async function fromCache(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (res.ok || res.type === 'opaque') {
      const cache = await caches.open(CACHE)
      await cache.put(req, res.clone())
    }
    return res
  } catch {
    return Response.error()
  }
}
