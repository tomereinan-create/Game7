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

  // Only the hashed build output is immutable. Anything else on this origin — a dev server's
  // /src/ modules and /@vite/ client, an un-hashed JSON — must come from the network first, or a
  // worker left behind by an earlier build serves yesterday's modules on top of today's server
  // (2026-09-03: a stray vite on 5178 showed Tomer the old Team DB for a day).
  const immutable =
    url.origin === self.location.origin && /\/assets\/[^/?]+-[A-Za-z0-9_-]{3,}\.[a-z0-9]+$/.test(url.pathname)

  e.respondWith(shell ? fromNetwork(req) : immutable ? fromCache(req) : fromNetworkThenCache(req))
})

/**
 * Un-hashed files and cross-origin fonts: network first, the cache only for being offline.
 *
 * G8 (2026-09-10), the latent half: the `try` used to span the CACHE WRITE as well as the fetch, so
 * a STORAGE failure was reported to the page as `Response.error()` — which the page reads as
 * `TypeError: Failed to fetch`, indistinguishable from the network being down. There was no path
 * that returned the 200 the worker was already holding. A failure to write our copy must never
 * change what the page gets. The write also no longer sits in front of the response: provenance.json
 * is 6.1 MB and the page has no reason to wait on a disk write to read bytes it already has.
 */
async function fromNetworkThenCache(req) {
  let res
  try {
    res = await fetch(req)
  } catch {
    // only a real network failure reaches here, and only then is a network error the honest answer
    return (await caches.match(req)) ?? Response.error()
  }
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone()
    caches
      .open(CACHE)
      .then((c) => c.put(req, copy))
      .catch(() => {})
    return res
  }
  return (await caches.match(req)) ?? res
}

/** index.html: network first, cache as the offline fallback. */
async function fromNetwork(req) {
  let fresh
  try {
    fresh = await fetch(req, { cache: 'no-store' })
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
    // G8: a storage failure here used to fail the whole NAVIGATION. The shell we just fetched is
    // good whether or not we managed to keep a copy of it, so hand it over if we have it.
    if (fresh) return fresh
    return (await caches.match(SHELL)) ?? Response.error()
  }
}

/** The hashed bundles under assets/: cache first, they never change under their name. */
async function fromCache(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  let res
  try {
    res = await fetch(req)
  } catch {
    return Response.error()
  }
  // G8: same rule — keeping a copy is our business, not the page's, so a storage failure must not
  // turn a perfectly good 200 into a network error. The write is AWAITED here on purpose, unlike in
  // fromNetworkThenCache: these are the hashed bundles, they are small, and cache-first only means
  // anything if the copy is in hand before the next request for the same name arrives.
  if (res.ok || res.type === 'opaque') {
    try {
      const cache = await caches.open(CACHE)
      await cache.put(req, res.clone())
    } catch {
      /* keeping the copy failed; the response is still good */
    }
  }
  return res
}
