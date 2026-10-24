/**
 * THE CLIP PIPELINE: record creator-mode runs headless, from the seed, at 1080x1920 and 60 fps.
 *
 *   node scripts/capture/clip.mjs --app http://localhost:5193/ --a 1996-CHI --b 2017-GSW --seed 2969
 *   node scripts/capture/clip.mjs --app http://localhost:5193/ --b 1996-CHI --seed 4242 --team "Tel Aviv Jets"
 *   node scripts/capture/clip.mjs --app http://localhost:5193/ --level 30 --seed 99
 *   node scripts/capture/clip.mjs --app http://localhost:5193/ --batch clips.json     ([{a,b,level,seed,team,out}, ...])
 *
 * Options: --out clips/<name>.mp4 · --fps 60 · --ending 12 (seconds for the "-ending" cut; 0 = none)
 *          --quality 92 (JPEG quality of the captured frames) · --hold 2.5 (seconds held on the result)
 *
 * HOW. A 1080x1920 window opens the creator page, which lays the game out in its 432x768 phone frame
 * and scales that frame up 2.5x (src/boot.ts) — Chrome rasters the scaled frame at full resolution,
 * so text stays sharp. (A 432x768 viewport at device scale 2.5 would be the obvious way, but the
 * DevTools screencast hands back CSS-pixel frames, 432x768.) Frames come off the screencast as they
 * are painted and are laid onto a fixed 60 fps clock (a frame is held until the next one arrives —
 * a still screen paints nothing), then piped straight into ffmpeg as H.264, so nothing piles up.
 * (Playwright's own recordVideo would do too, but it needs an explicit `size` or it scales the video
 * down to fit 800x800, and it writes VP9 WebM, which editors take less kindly than MP4.)
 *
 * WHAT COMES OUT, per run: <out>.mp4 (the whole run, `auto=1` hands-free from the seed) and, when
 * --ending is set, <out>-ending.mp4: the last N seconds of the series up to the moment the strip
 * settles, plus the hold — the ticker's finish, the cut a video ends on. The log prints the times of
 * the run's beats (draft, series, Game 7 intro, settled) for the editor.
 *
 * Needs: a running server (npm run dev, or the built site), Chrome or Edge, and an ffmpeg (FFMPEG=, on
 * PATH, or Python's imageio-ffmpeg) — see browser.mjs.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findFfmpeg, launch } from './browser.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const argv = process.argv.slice(2)
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d)
const APP = opt('app', 'http://localhost:5193/')
const FPS = Number(opt('fps', 60))
const QUALITY = Number(opt('quality', 92))
const ENDING = Number(opt('ending', 12))
const HOLD = Number(opt('hold', 2.5))
const W = 1080
const H = 1920

const ffmpeg = findFfmpeg()
if (!ffmpeg) {
  console.error('No ffmpeg: set FFMPEG=<path>, put ffmpeg on PATH, or `pip install imageio-ffmpeg`.')
  process.exit(1)
}

function urlFor(run) {
  const u = new URL(APP)
  u.searchParams.set('creator', '1')
  u.searchParams.set('auto', '1')
  for (const k of ['seed', 'a', 'b', 'a5', 'b5', 'an', 'bn', 'aab', 'bab', 'level', 'team']) if (run[k] !== undefined && run[k] !== null) u.searchParams.set(k, String(run[k]))
  return u.href
}

function nameFor(run) {
  const parts = [run.a, run.b ? `vs-${run.b}` : run.level ? `L${run.level}` : 'L1', `s${run.seed}`].filter(Boolean)
  return join(root, 'clips', `${parts.join('_')}.mp4`)
}

function encoder(out) {
  mkdirSync(dirname(out), { recursive: true })
  const p = spawn(
    ffmpeg,
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))))
  const write = (buf) => (p.stdin.write(buf) ? Promise.resolve() : new Promise((r) => p.stdin.once('drain', r)))
  return { write, end: async () => (p.stdin.end(), done) }
}

function cut(src, from, to, out) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-ss', from.toFixed(3), '-to', to.toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: 'inherit' })
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg cut exited ${c}`))))
  })
}

async function record(browser, run) {
  const out = resolve(run.out ?? nameFor(run))
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const cdp = await page.context().newCDPSession(page)
  const enc = encoder(out)

  // the 60 fps clock: every tick writes the newest frame painted by then
  let t0 = null
  let last = null
  let ticks = 0
  let unique = 0
  let queue = Promise.resolve()
  const advanceTo = (t) => {
    while (last && (ticks + 1) / FPS <= t - t0) {
      const buf = last
      queue = queue.then(() => enc.write(buf))
      ticks++
    }
  }
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const t = metadata.timestamp ?? Date.now() / 1000
    if (t0 === null) t0 = t
    advanceTo(t)
    last = Buffer.from(data, 'base64')
    unique++
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })

  const url = urlFor(run)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: QUALITY, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
  // the game itself runs in the frame's iframe; its beats are read there
  let game = null
  for (let i = 0; i < 100 && !game; i++) {
    game = page.frames().find((f) => /framed=1/.test(f.url())) ?? null
    if (!game) await new Promise((r) => setTimeout(r, 100))
  }
  if (!game) throw new Error('the creator frame did not load')

  // the run's beats, in seconds from the first frame — for the trims and the editor
  const beats = {}
  let strip = ''
  const now = () => (t0 === null ? 0 : Date.now() / 1000 - t0)
  const deadline = Date.now() + 6 * 60 * 1000
  while (Date.now() < deadline) {
    const s = await game.evaluate(() => ({
      draft: !!document.querySelector('.cr-hud'),
      settle: !!document.querySelector('.cr-settle'),
      series: !!document.querySelector('.cr-hud') === false && !document.querySelector('.cr-settle'),
      g7: !!document.querySelector('.g7-intro'),
      done: document.body.dataset.creatorDone === '1',
    }))
    if (s.draft && beats.draft === undefined) beats.draft = now()
    if (s.settle && beats.sims === undefined) beats.sims = now()
    if (s.series && beats.series === undefined) beats.series = now()
    if (s.g7 && beats.g7 === undefined) beats.g7 = now()
    if (s.done) {
      beats.settled = now()
      // the series as it ended on screen — the seed log is checked against the footage, not a script
      strip = await game.evaluate(() => [...document.querySelectorAll('.gt b')].map((b) => b.textContent.replace(/\s/g, '')).join(' '))
      break
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  if (beats.settled === undefined) console.warn('  the run did not settle within six minutes; the clip ends where it stopped')
  await new Promise((r) => setTimeout(r, HOLD * 1000))
  await cdp.send('Page.stopScreencast').catch(() => {})
  advanceTo(Date.now() / 1000)
  await queue
  await enc.end()
  await page.close()

  const secs = ticks / FPS
  const fpsIn = unique / Math.max(secs, 0.001)
  console.log(`  ${out}  ${secs.toFixed(1)} s · ${ticks} frames at ${FPS} fps (${fpsIn.toFixed(0)} painted per second)`)
  console.log(`  beats: ${Object.entries(beats).map(([k, v]) => `${k} ${v.toFixed(1)}s`).join(' · ')}`)
  if (strip) console.log(`  strip: ${strip}`)
  if (beats.g7 !== undefined && beats.settled !== undefined) console.log(`  game 7 on screen: ${(beats.settled - beats.g7).toFixed(1)} s from its intro to the settled strip`)
  if (ENDING > 0 && beats.settled !== undefined) {
    const to = Math.min(secs, beats.settled + HOLD)
    const from = Math.max(beats.series ?? 0, beats.settled - ENDING)
    const end = out.replace(/\.mp4$/, '-ending.mp4')
    await cut(out, from, to, end)
    console.log(`  ${end}  ${from.toFixed(1)}–${to.toFixed(1)} s`)
  }
  return { out, beats, strip, seconds: secs, painted: fpsIn }
}

const runs = argv.includes('--batch')
  ? JSON.parse(readFileSync(resolve(opt('batch')), 'utf8'))
  : [{ a: opt('a'), b: opt('b'), level: opt('level'), seed: Number(opt('seed', 1)), team: opt('team'), out: opt('out') }]

const browser = await launch({ headless: true })
try {
  for (const run of runs) {
    console.log(`recording ${urlFor(run)}`)
    await record(browser, run)
  }
} finally {
  await browser.close()
}
