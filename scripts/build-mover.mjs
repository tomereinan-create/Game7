/**
 * Builds the MOVER (P3) into dist-mover/: the page that replaces the game at its old address
 * (https://tomereinan-create.github.io/Game7/) and carries every save to the new domain.
 *
 *   node scripts/build-mover.mjs            (MOVER_TARGET=https://example.com/ to point it elsewhere)
 *
 * Since 2026-10-22 (his word: "yes replace github.io with the mover") .github/workflows/deploy.yml
 * builds THIS on every push to main and publishes it as the old address's GitHub Pages site — the
 * game itself is served from the domain by cloudflare-pages.yml. Keep it live until at least
 * 2027-04-22: every phone that played at the old address can only reach its save through here.
 *
 * dist-mover/: index.html, 404.html (every old deep link lands on the mover too), sw.js (replaces
 * the game's worker on phones that installed it) and .nojekyll.
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

// the site's own config, as the app reads it — compiled on the fly, so this runs on any Node
const siteJs = await build({ entryPoints: [join(root, 'src/site.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral' })
const { SITE } = await import(`data:text/javascript;base64,${Buffer.from(siteJs.outputFiles[0].text).toString('base64')}`)

const target = process.env.MOVER_TARGET || (SITE.domain ? `https://${SITE.domain}/` : '')
if (!target) {
  console.error('No new address: set DOMAIN in src/site.ts (or MOVER_TARGET). The mover must not point at the address it replaces.')
  process.exit(1)
}
if (/github\.io/.test(target)) {
  console.error(`Refusing to build a mover that points at ${target}: that is the old address.`)
  process.exit(1)
}

const js = await build({
  entryPoints: [join(root, 'mover/mover.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  target: ['es2019', 'safari13'],
  define: { TARGET: JSON.stringify(target) },
})
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const html = readFileSync(join(root, 'mover/index.html'), 'utf8')
  .replaceAll('%SITE_NAME%', esc(SITE.name))
  .replaceAll('%SITE_DESC%', esc(SITE.description))
  .replaceAll('%OG_TITLE%', esc(SITE.ogTitle))
  .replaceAll('%OG_ALT%', esc(SITE.ogImageAlt))
  .replaceAll('%SITE_THEME%', SITE.themeColor)
  .replaceAll('%SITE_DISCLAIMER%', esc(SITE.disclaimer))
  .replaceAll('%TARGET_PRINTED%', esc(target.replace(/^https?:\/\//, '').replace(/\/$/, '')))
  .replaceAll('%TARGET%', esc(target))
  .replace('%MOVER_JS%', () => js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'))
if (/%[A-Z_]+%/.test(html)) {
  console.error(`mover/index.html still has placeholders: ${html.match(/%[A-Z_]+%/g).join(', ')}`)
  process.exit(1)
}

const out = join(root, 'dist-mover')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'index.html'), html)
writeFileSync(join(out, '404.html'), html)
writeFileSync(join(out, 'sw.js'), readFileSync(join(root, 'mover/sw.js')))
writeFileSync(join(out, '.nojekyll'), '')
console.log(`dist-mover/ written: the old address will send every save to ${target}`)
