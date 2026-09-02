/**
 * What the desktop shortcut runs. Serves the built game over http (not file://,
 * where browsers refuse localStorage and the run would forget itself), opens it,
 * and stays quiet. Builds first if dist/ is missing OR older than the source it
 * was built from — a merge lands on main, the shortcut is double-clicked, and
 * what comes up has to be the game as it is now, not the last time anyone
 * happened to run a build.
 *
 * It is still a static file server, not a dev server: nothing watches, nothing
 * hot-reloads. The check is a handful of stat() calls on start and on the
 * requests for the page itself.
 *
 * GAME7_PORT and GAME7_NO_OPEN exist so a test can run this on a spare port
 * without stealing the browser; the shortcut sets neither.
 */
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')
const PORT = Number(process.env.GAME7_PORT) || 5178

/** Everything `npm run build` reads. If any of it is newer, dist/ is yesterday's game. */
const SOURCES = ['src', 'public', 'index.html', 'package.json', 'vite.config.ts']

const newestUnder = (path) => {
  let newest = 0
  const walk = (p) => {
    let s
    try {
      s = statSync(p)
    } catch {
      return // deleted between readdir and stat, or simply not there
    }
    if (s.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e))
    else if (s.mtimeMs > newest) newest = s.mtimeMs
  }
  walk(path)
  return newest
}

const mtimeOf = (p) => {
  try {
    return statSync(p).mtimeMs
  } catch {
    return 0
  }
}

/**
 * The source stamp we have already acted on. Without it a build that fails
 * (a type error on main) would be retried on every reload, eight seconds a go.
 */
let handled = 0

const ensureFresh = () => {
  const source = Math.max(...SOURCES.map((s) => newestUnder(join(root, s))))
  if (source <= handled) return
  handled = source
  const built = mtimeOf(join(dist, 'index.html'))
  if (built && built >= source) return
  console.log(built ? 'Source is newer than dist/ — building (~8s)' : 'No dist/ yet — building (~8s)')
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) console.log('Build failed — serving the dist/ that is there.')
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const open = (url) => {
  if (process.env.GAME7_NO_OPEN) return
  if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', '', url], { detached: true })
  else spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true })
}

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])
  // Only the page itself. The hashed assets it then asks for belong to whatever
  // build this reply came from, and a rebuild mid-page would be the wrong one.
  // spawnSync holds this request until the build is done, which is the point:
  // waiting eight seconds beats being handed the old game.
  if (path === '/' || path === '/index.html') ensureFresh()
  let file = join(dist, normalize(path).replace(/^(\.\.[/\\])+/, ''))
  if (!existsSync(file) || path === '/') file = join(dist, 'index.html')
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-cache',
  })
  createReadStream(file).pipe(res)
})

server.on('error', (err) => {
  // Already running from an earlier double-click: just bring it up.
  if (err.code === 'EADDRINUSE') {
    open(`http://localhost:${PORT}`)
    process.exit(0)
  }
  throw err
})

server.listen(PORT, '0.0.0.0', () => {
  // After the bind, so the second double-click reaches EADDRINUSE and reopens
  // the tab instead of spending eight seconds building for a server it will not
  // become. Requests that arrive during the build queue behind it.
  ensureFresh()
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((n) => n && n.family === 'IPv4' && !n.internal)
  console.log(`Gauntlet on http://localhost:${PORT}`)
  if (lan) console.log(`Phone:      http://${lan.address}:${PORT}`)
  open(`http://localhost:${PORT}`)
})
