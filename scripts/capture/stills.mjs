/**
 * THE STILLS (P4): the 1200x630 link-preview picture and the manifest's screenshots.
 *
 *   node scripts/capture/stills.mjs                       the OG image only (public/og-image.png)
 *   node scripts/capture/stills.mjs --app http://localhost:5193/
 *                                                         + public/screenshots/*.png off a running dev server
 *
 * The OG picture is scripts/capture/og.html with the product's name from src/site.ts written in, so
 * renaming the product is: edit src/site.ts, run this, commit the PNG. No logos, no real faces.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launch } from './browser.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2)
const app = args.includes('--app') ? args[args.indexOf('--app') + 1] : null
const site = readFileSync(join(root, 'src/site.ts'), 'utf8')
const NAME = (/const NAME = '([^']*)'/.exec(site) ?? [])[1] ?? 'Game'
const words = NAME.split(' ')
const nameHtml = words.length > 1 ? `${words.slice(0, -1).join(' ')}<br /><em>${words.at(-1)}</em>` : `<em>${NAME}</em>`

const browser = await launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  const tmp = join(root, 'scripts/capture/.og.render.html')
  writeFileSync(tmp, readFileSync(join(root, 'scripts/capture/og.html'), 'utf8').replace('%NAME_HTML%', nameHtml))
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(root, 'public/og-image.png'), type: 'png' })
  rmSync(tmp)
  console.log('wrote public/og-image.png (1200x630)')

  if (app) {
    mkdirSync(join(root, 'public/screenshots'), { recursive: true })
    // phone: the creator frame's 432x768 at 2.5x is exactly 1080x1920
    const phone = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true })
    await phone.goto(`${app}?creator=1&framed=1&seed=4242&b=1996-CHI&auto=1`, { waitUntil: 'networkidle' })
    await phone.waitForSelector('.wheel-card .spin-roster', { timeout: 30000 })
    await phone.waitForTimeout(600)
    await phone.screenshot({ path: join(root, 'public/screenshots/phone-draft.png') })
    await phone.waitForSelector('[data-creator-done]', { timeout: 180000, state: 'attached' })
    await phone.evaluate(() => window.scrollTo(0, 0))
    await phone.screenshot({ path: join(root, 'public/screenshots/phone-series.png') })
    const desk = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
    await desk.goto(app, { waitUntil: 'networkidle' })
    await desk.waitForTimeout(800)
    await desk.screenshot({ path: join(root, 'public/screenshots/desk-home.png') })
    console.log('wrote public/screenshots/{phone-draft,phone-series,desk-home}.png')
  }
} finally {
  await browser.close()
}
