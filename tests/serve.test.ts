/**
 * The desktop shortcut must not hand him last week's game.
 *
 * "Still dont see the stars" — the fix was on main, `dist/` was from before, and
 * serve.mjs only built when `dist/` was missing entirely. This drives the real
 * script: start it, ask for the page, change a source file, ask again, and the
 * page must now point at a different bundle.
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const css = join(root, 'src', 'styles.css')

const freePort = () =>
  new Promise<number>((res, rej) => {
    const s = createServer()
    s.once('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => res(port))
    })
  })

/** No timeout on purpose: a request that arrives mid-rebuild is meant to wait. */
const page = (port: number) =>
  new Promise<string>((res, rej) => {
    httpGet({ host: '127.0.0.1', port, path: '/' }, (r) => {
      let body = ''
      r.setEncoding('utf8')
      r.on('data', (c) => (body += c))
      r.on('end', () => res(body))
    }).on('error', rej)
  })

/** The hashed files index.html points at — the whole build, in two names. */
const bundles = (html: string) => (html.match(/assets\/index-[\w-]+\.(?:js|css)/g) ?? []).sort()

it('rebuilds a stale dist/ before serving the page', async () => {
  const port = await freePort()
  const original = readFileSync(css, 'utf8')
  const child = spawn(process.execPath, [join(root, 'serve.mjs')], {
    cwd: root,
    env: { ...process.env, GAME7_PORT: String(port), GAME7_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (c) => (log += c))

  try {
    // The banner comes after the freshness check, so this waits out the first build.
    await new Promise<void>((res, rej) => {
      child.once('exit', (code) => rej(new Error(`serve.mjs exited (${code}): ${log}`)))
      const tick = setInterval(() => {
        if (log.includes(`http://localhost:${port}`)) {
          clearInterval(tick)
          res()
        }
      }, 100)
    })

    const before = bundles(await page(port))
    expect(before.length).toBe(2)

    // A source change of the kind a merge brings, and then the same request again.
    writeFileSync(css, `${original}\n.freshness-probe-${port} {\n  color: #123456;\n}\n`)
    const after = bundles(await page(port))

    expect(after.length).toBe(2)
    expect(after).not.toEqual(before)
    expect(log).toContain('Source is newer than dist/')
  } finally {
    writeFileSync(css, original)
    child.kill()
  }
  // Two real builds, on a machine already running the rest of the suite.
}, 240_000)
