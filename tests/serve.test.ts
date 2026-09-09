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

/**
 * G8 (2026-09-10): the server used to KILL ITSELF, and that is the whole of the bug that reached
 * him as "the ADVANCED screen cannot fetch its data (TypeError: Failed to fetch)".
 *
 * `existsSync` is an existence test, not a readability one, and `.pipe()` does not forward the
 * stream's 'error' event — so a request for a path that exists but cannot be read as a file (a
 * directory) raised an unhandled error and took the process down. Nothing looks broken afterwards:
 * the open tab already holds its bundle and its state, so a dead server only surfaces at the app's
 * one lazy fetch. Measured on the pre-fix script: `/` 200, `/provenance.json` 200, then `/assets`
 * kills it and every request after that fails.
 */
const status = (port: number, path: string) =>
  new Promise<number>((res, rej) => {
    httpGet({ host: '127.0.0.1', port, path }, (r) => {
      r.resume()
      res(r.statusCode ?? 0)
    }).on('error', rej)
  })

it('stays up when asked for something it cannot read', async () => {
  const port = await freePort()
  const child = spawn(process.execPath, [join(root, 'serve.mjs')], {
    cwd: root,
    env: { ...process.env, GAME7_PORT: String(port), GAME7_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (c) => (log += c))
  try {
    await new Promise<void>((res, rej) => {
      child.once('exit', (code) => rej(new Error(`serve.mjs exited (${code}): ${log}`)))
      const tick = setInterval(() => {
        if (log.includes(`http://localhost:${port}`)) {
          clearInterval(tick)
          res()
        }
      }, 100)
    })

    // the lazy fetch the ADVANCED screen makes — fine before, and it must be fine after
    expect(await status(port, '/provenance.json')).toBe(200)
    // a DIRECTORY. This is the request that used to end the process.
    expect(await status(port, '/assets')).toBe(200)
    // and the server is still answering, which is the whole point
    expect(await status(port, '/provenance.json')).toBe(200)
    expect(child.exitCode).toBeNull()
  } finally {
    child.kill()
  }
}, 240_000)
