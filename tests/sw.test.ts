import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The service worker is what the phone runs. Its one job beyond going offline
 * is never to hide a new deploy behind an old one, and that is what these
 * exercise: sw.js is loaded into a fake worker scope with a fake Cache API, and
 * the network is a dictionary we edit between requests the way a push does.
 */

const SRC = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ORIGIN = 'https://example.github.io/Game7/'

const keyOf = (req: Request | string) => (typeof req === 'string' ? req : req.url)

class FakeCache {
  store = new Map<string, string>()
  async match(req: Request | string) {
    const body = this.store.get(keyOf(req))
    return body === undefined ? undefined : new Response(body)
  }
  async put(req: Request | string, res: Response) {
    this.store.set(keyOf(req), await res.text())
  }
}

class FakeCaches {
  boxes = new Map<string, FakeCache>()
  async open(name: string) {
    let c = this.boxes.get(name)
    if (!c) this.boxes.set(name, (c = new FakeCache()))
    return c
  }
  async delete(name: string) {
    return this.boxes.delete(name)
  }
  async keys() {
    return [...this.boxes.keys()]
  }
  async match(req: Request | string) {
    for (const c of this.boxes.values()) {
      const hit = await c.match(req)
      if (hit) return hit
    }
    return undefined
  }
}

/** A worker scope wired to a network you control. */
function boot(net: Map<string, string>, offline = { now: false }) {
  const listeners = new Map<string, (e: never) => void>()
  const self = {
    location: new URL(`${ORIGIN}sw.js`), // stringifies to the href, as WorkerLocation does
    addEventListener: (type: string, fn: (e: never) => void) => listeners.set(type, fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  }
  const caches = new FakeCaches()
  const fetch = async (req: Request | string) => {
    if (offline.now) throw new Error('offline')
    const body = net.get(keyOf(req))
    return body === undefined ? new Response('', { status: 404 }) : new Response(body)
  }

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Response', 'URL', SRC)(
    self,
    caches,
    fetch,
    Response,
    URL,
  )

  /** Drive one request through the worker's fetch handler. */
  const get = async (url: string, mode = 'no-cors') => {
    let answer!: Promise<Response>
    const req = { url, method: 'GET', mode, clone: () => req } as unknown as Request
    listeners.get('fetch')!({ request: req, respondWith: (r: Promise<Response>) => (answer = r) } as never)
    return await answer
  }

  const activate = async () => {
    let done!: Promise<unknown>
    listeners.get('activate')!({ waitUntil: (p: Promise<unknown>) => (done = p) } as never)
    await done
  }

  return { get, activate, caches }
}

const shellV1 = '<!doctype html><script src="assets/index-AAA.js"></script>'
const shellV2 = '<!doctype html><script src="assets/index-BBB.js"></script>'

function network(shell: string, asset: string, body: string) {
  return new Map([
    [ORIGIN, shell],
    [`${ORIGIN}index.html`, shell],
    [`${ORIGIN}${asset}`, body],
  ])
}

describe('service worker — the phone always sees the newest deploy', () => {
  it('serves index.html from the network, so a push shows up on the next refresh', async () => {
    const net = network(shellV1, 'assets/index-AAA.js', 'v1')
    const sw = boot(net)

    expect(await (await sw.get(ORIGIN, 'navigate')).text()).toBe(shellV1)

    // A push lands: new html, new hashed bundle.
    net.set(ORIGIN, shellV2)
    net.set(`${ORIGIN}index.html`, shellV2)
    net.set(`${ORIGIN}assets/index-BBB.js`, 'v2')

    expect(await (await sw.get(ORIGIN, 'navigate')).text()).toBe(shellV2)
  })

  it('wipes the cache when a new build lands, so it does not grow by a bundle a deploy', async () => {
    const net = network(shellV1, 'assets/index-AAA.js', 'v1')
    const sw = boot(net)

    await sw.get(ORIGIN, 'navigate')
    await sw.get(`${ORIGIN}assets/index-AAA.js`)
    const box = await sw.caches.open('game7')
    expect([...box.store.keys()]).toContain(`${ORIGIN}assets/index-AAA.js`)

    net.set(ORIGIN, shellV2)
    net.set(`${ORIGIN}index.html`, shellV2)
    await sw.get(ORIGIN, 'navigate')

    const after = await sw.caches.open('game7')
    expect([...after.store.keys()]).toEqual([`${ORIGIN}index.html`])
  })

  it('opens with no signal: the cached shell and the cached bundle come back', async () => {
    const net = network(shellV1, 'assets/index-AAA.js', 'v1')
    const offline = { now: false }
    const sw = boot(net, offline)

    await sw.get(ORIGIN, 'navigate')
    await sw.get(`${ORIGIN}assets/index-AAA.js`)

    offline.now = true
    expect(await (await sw.get(ORIGIN, 'navigate')).text()).toBe(shellV1)
    expect(await (await sw.get(`${ORIGIN}assets/index-AAA.js`)).text()).toBe('v1')
  })

  it('serves a hashed bundle from cache once seen — the network is asked once', async () => {
    const net = network(shellV1, 'assets/index-AAA.js', 'v1')
    const sw = boot(net)

    await sw.get(`${ORIGIN}assets/index-AAA.js`)
    net.delete(`${ORIGIN}assets/index-AAA.js`) // gone from the network; cache must answer
    expect(await (await sw.get(`${ORIGIN}assets/index-AAA.js`)).text()).toBe('v1')
  })

  it('activating drops caches from an older worker', async () => {
    const sw = boot(network(shellV1, 'assets/index-AAA.js', 'v1'))
    await sw.get(ORIGIN, 'navigate') // fills the current cache
    const stale = await sw.caches.open('game7-old')
    await stale.put(`${ORIGIN}junk.js`, new Response('junk'))

    await sw.activate()
    expect(await sw.caches.keys()).toEqual(['game7'])
    expect(await sw.caches.match(`${ORIGIN}junk.js`)).toBeUndefined()
  })
})
