/**
 * Builds the MOVER (P3) into dist-mover/: the page that replaces the game at its old address and
 * carries every save to the new domain. Run once the domain is set in src/site.ts:
 *
 *   node scripts/build-mover.mjs            (or MOVER_TARGET=https://example.com/ to override)
 *
 * dist-mover/ is the whole content of the new public repo that keeps the old GitHub Pages address
 * alive: index.html, 404.html (every old deep link lands on the mover too), sw.js (replaces the
 * game's worker on phones that installed it) and .nojekyll. Keep it live for at least six months.
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const siteSrc = readFileSync(join(root, 'src/site.ts'), 'utf8')
const pick = (re) => (re.exec(siteSrc) ?? [])[1] ?? ''
const NAME = pick(/const NAME = '([^']*)'/)
const DOMAIN = pick(/const DOMAIN = '([^']*)'/)
const THEME = pick(/themeColor: '([^']*)'/)
const DISCLAIMER = pick(/disclaimer:\s*'([^']*)'/)
const target = process.env.MOVER_TARGET || (DOMAIN ? `https://${DOMAIN}/` : '')
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
  .replaceAll('%SITE_NAME%', esc(NAME))
  .replaceAll('%SITE_THEME%', THEME)
  .replaceAll('%SITE_DISCLAIMER%', esc(DISCLAIMER))
  .replaceAll('%TARGET_PRINTED%', esc(target.replace(/^https?:\/\//, '').replace(/\/$/, '')))
  .replaceAll('%TARGET%', esc(target))
  .replace('%MOVER_JS%', () => js.outputFiles[0].text.replace(/<\/script/gi, '<\/script'))

const out = join(root, 'dist-mover')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'index.html'), html)
writeFileSync(join(out, '404.html'), html)
writeFileSync(join(out, 'sw.js'), readFileSync(join(root, 'mover/sw.js')))
writeFileSync(join(out, '.nojekyll'), '')
console.log(`dist-mover/ written: the old address will send every save to ${target}`)
