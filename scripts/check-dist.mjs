/**
 * Guards a finished build (dist/) before it is deployed — run by .github/workflows/deploy.yml.
 *
 *   · Every %SITE_*% / %OG_*% placeholder was written (src/site.ts reached every page).
 *   · The link-preview picture and the manifest are there.
 *   · With VITE_MOMENTS=0 (the AI posters left out of the build), no poster and no intro clip
 *     slipped into dist/moments — the CI check the launch plan asks for.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(fileURLToPath(new URL('..', import.meta.url)), 'dist')
const fail = []
for (const page of ['index.html', 'privacy/index.html']) {
  const p = join(dist, page)
  if (!existsSync(p)) fail.push(`missing ${page}`)
  else {
    const left = readFileSync(p, 'utf8').match(/%(SITE|OG)_[A-Z_]+%/g)
    if (left) fail.push(`${page}: placeholders not written: ${[...new Set(left)].join(', ')}`)
  }
}
for (const f of ['og-image.png', 'manifest.webmanifest', 'apple-touch-icon.png']) if (!existsSync(join(dist, f))) fail.push(`missing ${f}`)
if (process.env.VITE_MOMENTS === '0') {
  const dir = join(dist, 'moments')
  const posters = existsSync(dir) ? readdirSync(dir).filter((f) => /^the-.*\.(jpe?g|png|webp)$/i.test(f) || f === 'game7-intro.mp4') : []
  if (posters.length) fail.push(`VITE_MOMENTS=0 but dist/moments still has: ${posters.join(', ')}`)
}
if (fail.length) {
  console.error(`check-dist failed:\n  ${fail.join('\n  ')}`)
  process.exit(1)
}
console.log('check-dist: ok')
