/**
 * Guards a finished build (dist/) before it is deployed — run by .github/workflows/cloudflare-pages.yml.
 *
 *   · Every %SITE_*% / %OG_*% placeholder was written (src/site.ts reached every page).
 *   · The link-preview picture and the manifest are there; the privacy page's contact is exempt from
 *     Cloudflare's email obfuscation.
 *   · With VITE_MOMENTS=0 (the AI posters left out of the build), no poster and no intro clip
 *     slipped into dist/moments — the CI check the launch plan asks for.
 *   · On a public build, no provenance.json (launch plan P2: 6.1 MB of every card's formula inputs,
 *     read only by the Advanced window, which is Scout mode's and so staff's — his ruling,
 *     2026-10-24: "Scout mode is only for me. Once I publish the game, only the user mode matters").
 *     The same rule as src/site.ts `provenance`: VITE_PROVENANCE when it is set (0 = left out),
 *     else every CI build is public. Run here with neither, a local dist/ keeps the file and passes.
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
    const left = readFileSync(p, 'utf8').match(/%(SITE|OG|HTML)_[A-Z_]+%/g)
    if (left) fail.push(`${page}: placeholders not written: ${[...new Set(left)].join(', ')}`)
  }
}
// the contact stays readable on the live domain: its Cloudflare zone rewrites any address it is not
// told to leave alone (privacy/index.html, 2026-10-22)
{
  const p = join(dist, 'privacy/index.html')
  if (existsSync(p) && !/<!--email_off-->\s*<a href="mailto:[^"]+@[^"]+">[^<]+@[^<]+<\/a>\s*<!--\/email_off-->/.test(readFileSync(p, 'utf8')))
    fail.push('privacy/index.html: the contact address is not inside <!--email_off--> markers')
}
for (const f of ['og-image.png', 'manifest.webmanifest', 'apple-touch-icon.png']) if (!existsSync(join(dist, f))) fail.push(`missing ${f}`)
if (process.env.VITE_MOMENTS === '0') {
  const dir = join(dist, 'moments')
  const posters = existsSync(dir) ? readdirSync(dir).filter((f) => /^the-.*\.(jpe?g|png|webp)$/i.test(f) || f === 'game7-intro.mp4') : []
  if (posters.length) fail.push(`VITE_MOMENTS=0 but dist/moments still has: ${posters.join(', ')}`)
}
{
  const env = process.env
  const provenanceOff = env.VITE_PROVENANCE ? env.VITE_PROVENANCE === '0' : !!env.CI
  if (provenanceOff && existsSync(join(dist, 'provenance.json')))
    fail.push('dist/provenance.json is in a public build (the Advanced window is staff-only; see src/site.ts `provenance`)')
}
if (fail.length) {
  console.error(`check-dist failed:\n  ${fail.join('\n  ')}`)
  process.exit(1)
}
console.log('check-dist: ok')
