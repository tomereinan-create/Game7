/**
 * The mover's service worker (P3). The old address still has the game's worker installed on every
 * phone that played there, caching the old game. This one replaces it: it empties every cache, takes
 * over every open page, and answers every navigation — any old deep link, the Home Screen app's
 * start URL — with the mover page, which carries the save on to the new address.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(new URL('./', self.registration.scope), { cache: 'no-store' }))
})
