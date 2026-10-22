import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deployFor, siteFor, type Deploy, type Site } from './src/site'

const root = fileURLToPath(new URL('.', import.meta.url))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * THE SITE'S OWN FILES, WRITTEN FROM src/site.ts (P2/P4, the launch gate). The product name is
 * undecided, so nothing that names it is typed into a static file: the page titles, the Open Graph
 * and Twitter tags, the home-screen label and the manifest are all filled in here, at build time,
 * from the one config. The HTML pages carry `%SITE_*%` placeholders; the manifest is generated whole.
 */
function sitePages(site: Site, deploy: Deploy): Plugin {
  // THE PRIVACY PAGE SAYS WHAT RUNS (the live check, 2026-10-22: it described PostHog as running
  // and Cloudflare as "may", the reverse of the live site). Written from the deploy's own settings.
  const cf = deploy.cfBeacon || site.cfBeacon
  const analyticsHtml = [
    cf
      ? `<p>We count visits with <b>Cloudflare Web Analytics</b>: a page-view counter that sets no cookies and stores nothing on your device. It records the page address, where the visit came from, the kind of browser and device, the country, and how fast the page loaded, and shows us totals, never a person.</p>`
      : '',
    deploy.posthogKey
      ? `<p>To learn whether people reach the first spin and finish a series, the game also sends a handful of anonymous events (for example: the game was opened, the first spin happened, a series finished, a share button was pressed) to <b>PostHog</b>, hosted in the EU. Each event carries the page address, where the visit came from (for example the <code>ref</code> or <code>s</code> tag on a shared link), the kind of browser and device, and the game's own facts (level, result). PostHog runs in its cookieless mode: no cookies, no local storage, no identifier on your device; it derives a short-lived anonymous count on its own servers, builds no profile of you, and we never identify you. These events are kept for up to 12 months.</p>`
      : '',
    !cf && !deploy.posthogKey ? '<p>The game sends no analytics at all.</p>' : '',
  ].join('\n      ')
  const vars: Record<string, string> = {
    SITE_NAME: site.name,
    SITE_SHORT: site.shortName,
    SITE_TITLE: `${site.name} — spin the wheel, draft five, win the series`,
    SITE_DESC: site.description,
    SITE_URL: site.url,
    SITE_THEME: site.themeColor,
    SITE_DISCLAIMER: site.disclaimer,
    SITE_CONTACT: site.contact,
    OG_TITLE: site.ogTitle,
    OG_IMAGE: `${site.url}og-image.png`,
    OG_ALT: site.ogImageAlt,
    HTML_ANALYTICS: analyticsHtml,
  }
  // the manifest's start_url and scope follow the base: './' serves from any folder (GitHub Pages'
  // /Game7/), '/' from a domain's root (P3)
  const start = deploy.base === './' ? './' : deploy.base
  const manifest = JSON.stringify(
    {
      id: start,
      name: site.name,
      short_name: site.shortName,
      description: site.description,
      start_url: start,
      scope: start,
      display: 'standalone',
      orientation: 'portrait',
      background_color: site.themeColor,
      theme_color: site.themeColor,
      categories: ['games', 'sports'],
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      screenshots: [
        { src: 'screenshots/phone-draft.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'The wheel lands on a team-season' },
        { src: 'screenshots/phone-series.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'Game 7, play by play' },
        { src: 'screenshots/desk-home.jpg', sizes: '1920x1080', type: 'image/jpeg', form_factor: 'wide', label: 'Six ways to play' },
      ].filter((s) => existsSync(join(root, 'public', s.src))),
    },
    null,
    2,
  )
  let outDir = 'dist'
  return {
    name: 'site-pages',
    configResolved(c) {
      outDir = c.build.outDir
    },
    transformIndexHtml: {
      order: 'pre',
      // HTML_* values are written raw (markup this file builds); every other value is escaped
      handler: (html) =>
        html
          .replace(/%(SITE_[A-Z_]+|OG_[A-Z_]+|HTML_[A-Z_]+)%/g, (m, k: string) => (k in vars ? (k.startsWith('HTML_') ? vars[k] : esc(vars[k])) : m))
          .replace('<!--CF_BEACON-->', ''),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/manifest.webmanifest')) return next()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
      /* A REAL "NOT FOUND" (the live check, 2026-10-22): with no 404.html the host answered every
         unknown path with the game itself and a 200 — /favicon.ico, /robots.txt, a missing bundle
         (which the worker then kept for a year as that bundle). With this page the host answers 404,
         and a creator's /c/<handle> link is rewritten to the game in public/_redirects. */
      const home = deploy.base === './' ? site.url : deploy.base
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not here · ${esc(site.name)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${site.themeColor};color:#f6f4ef;font:16px/1.5 system-ui,sans-serif;text-align:center}a{color:#f0b323}</style></head><body><main><h1>Nothing here</h1><p><a href="${esc(home)}">Play ${esc(site.name)} →</a></p></main></body></html>
`,
      })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *
Allow: /
Sitemap: ${site.url}sitemap.xml
` })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site.url}</loc></url>
  <url><loc>${site.url}privacy/</loc></url>
</urlset>
`,
      })
    },
    /**
     * THE AI POSTERS, BEHIND A FLAG. `VITE_MOMENTS=0` leaves the iconic-moments pictures and the
     * Game 7 intro clip out of dist/ and empties the manifest the ladder reads, so nothing asks
     * for them. scripts/check-dist.mjs fails a build that was told to leave them out and did not.
     */
    closeBundle() {
      if (deploy.moments) return
      const dir = join(root, outDir, 'moments')
      if (!existsSync(dir)) return
      for (const f of readdirSync(dir)) if (/^the-.*\.(jpe?g|png|webp)$/i.test(f) || f === 'game7-intro.mp4') rmSync(join(dir, f))
      writeFileSync(join(dir, 'manifest.json'), '{}\n')
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, ''), ...process.env }
  const site = siteFor(env)
  const deploy = deployFor(env)
  return {
    plugins: [react(), sitePages(site, deploy)],
    // P3: './' by default (any folder, GitHub Pages' /Game7/ today); BASE_PATH=/ for a root domain
    base: deploy.base,
    define: {
      'import.meta.env.VITE_MOMENTS': JSON.stringify(deploy.moments ? '1' : '0'),
    },
    build: {
      rollupOptions: {
        // the game, and the static privacy page beside it (P5) — both written from src/site.ts
        input: { index: join(root, 'index.html'), privacy: join(root, 'privacy/index.html') },
      },
    },
    // PORT is honoured when the environment sets one, so a second session can bring up its own dev
    // server for verification without taking the port another session is already serving on. An
    // explicit `--port` on the command line still wins over this.
    server: { host: true, port: process.env.PORT ? Number(process.env.PORT) : undefined },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      testTimeout: 120_000,
    },
  } as never
})
