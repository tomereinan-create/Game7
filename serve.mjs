/**
 * What the desktop shortcut runs. Serves the built game over http (not file://,
 * where browsers refuse localStorage and the run would forget itself), opens it,
 * and stays quiet. Builds first if dist/ isn't there yet.
 */
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')
const PORT = 5178

if (!existsSync(join(dist, 'index.html'))) {
  spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
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
  if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', '', url], { detached: true })
  else spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true })
}

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])
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
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((n) => n && n.family === 'IPv4' && !n.internal)
  console.log(`Gauntlet on http://localhost:${PORT}`)
  if (lan) console.log(`Phone:      http://${lan.address}:${PORT}`)
  open(`http://localhost:${PORT}`)
})
