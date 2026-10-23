/**
 * THE FRAME-PERFECT RECORDER: render a creator-mode run one 1/60 s frame at a time, so the footage
 * is a true 60 fps however slow the machine is.
 *
 *   node scripts/capture/render.mjs --app http://localhost:5195/ --a 1996-CHI --b 2017-GSW --seed 2969 --out clip.mp4
 *   node scripts/capture/render.mjs --app http://localhost:5195/ --batch clips.json     ([{a,b,a5,b5,an,bn,aab,bab,level,seed,team,out}, ...])
 *
 * Options: --fps 60 · --ending 7 (seconds for the "-ending" cut; 0 = none) · --hold 2.5 · --max 360 (s)
 *
 * WHY. clip.mjs films the screencast in real time, and Chrome hands back only the frames it gets to —
 * 8–11 a second at 1080x1920 here, so a spinning reel stutters. This drives Chrome's headless shell
 * in deterministic mode instead: the page's clock (timers, Date, animation frames) is VIRTUAL and
 * only moves when it is told to, and the compositor only draws a frame when one is asked for
 * (HeadlessExperimental.beginFrame), at a frame time this script sets. Every frame is advanced exactly
 * 1/60 s of page time and then drawn — CSS transitions and the reels included — so a 77 s run is
 * 4,620 real frames, rendered as fast as the machine allows.
 *
 * THE GAME 7 INTRO IS A VIDEO, and video does not run on virtual time: the page would sit on a blank
 * frame until its 15 s fallback. So when the intro mounts, the renderer ends it at exactly the clip's
 * own length of page time (the `ended` event the game waits for), and afterwards lays the clip itself
 * over those frames — scaled and centre-cropped as `object-fit: cover` shows it in the 9:16 frame.
 *
 * Needs Playwright's chromium_headless_shell (HEADLESS_SHELL=<path>, or the one in ms-playwright)
 * and an ffmpeg (see browser.mjs).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findFfmpeg } from './browser.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const argv = process.argv.slice(2)
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d)
const APP = opt('app', 'http://localhost:5195/')
const FPS = Number(opt('fps', 60))
const ENDING = Number(opt('ending', 7))
const HOLD = Number(opt('hold', 2.5))
const MAX = Number(opt('max', 360))
const W = 1080
const H = 1920
const STEP = 1000 / FPS

function headlessShell() {
  if (process.env.HEADLESS_SHELL && existsSync(process.env.HEADLESS_SHELL)) return process.env.HEADLESS_SHELL
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  if (existsSync(base))
    for (const d of readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) {
      const exe = join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
      if (existsSync(exe)) return exe
    }
  return null
}

const ffmpeg = findFfmpeg()
const SHELL = headlessShell()
const INTRO = join(root, 'public', 'moments', 'game7-intro.mp4')
if (!ffmpeg || !SHELL) {
  console.error(!ffmpeg ? 'No ffmpeg (see browser.mjs).' : 'No chromium_headless_shell: set HEADLESS_SHELL=<path to chrome-headless-shell.exe>.')
  process.exit(1)
}

/** A bare CDP client over the browser's websocket, with flattened sessions. */
async function cdpBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'g7render-'))
  const proc = spawn(SHELL, [
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--deterministic-mode',
    '--enable-begin-frame-control',
    '--disable-new-content-rendering-timeout',
    '--run-all-compositor-stages-before-draw',
    '--disable-threaded-animation',
    '--disable-threaded-scrolling',
    '--disable-checker-imaging',
    '--disable-image-animation-resync',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    'about:blank',
  ])
  const wsUrl = await new Promise((res, rej) => {
    let buf = ''
    proc.stderr.on('data', (d) => {
      buf += d
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf)
      if (m) res(m[1])
    })
    proc.on('exit', (c) => rej(new Error(`headless shell exited ${c}: ${buf.slice(-400)}`)))
  })
  const ws = new WebSocket(wsUrl)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? rej(new Error(`${m.error.message} ${m.error.data ?? ''}`)) : res(m.result)
    } else if (m.method) for (const l of listeners) l(m)
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const k = ++id
      pending.set(k, { res, rej })
      ws.send(JSON.stringify({ id: k, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  const once = (method, sessionId) => new Promise((res) => listeners.push(function l(m) { if (m.method === method && (!sessionId || m.sessionId === sessionId)) { listeners.splice(listeners.indexOf(l), 1); res(m.params) } }))
  const close = async () => {
    try { await send('Browser.close') } catch { /* gone */ }
    ws.close()
    await new Promise((r) => setTimeout(r, 500))
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* locked; harmless */ }
  }
  return { send, once, close }
}

function urlFor(run) {
  const u = new URL(APP)
  u.searchParams.set('creator', '1')
  u.searchParams.set('auto', '1')
  for (const k of ['seed', 'a', 'b', 'a5', 'b5', 'an', 'bn', 'aab', 'bab', 'level', 'team']) if (run[k] !== undefined && run[k] !== null) u.searchParams.set(k, String(run[k]))
  return u.href
}

function encoder(out) {
  mkdirSync(dirname(out), { recursive: true })
  const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))))
  const write = (buf) => (p.stdin.write(buf) ? Promise.resolve() : new Promise((r) => p.stdin.once('drain', r)))
  return { write, end: async () => (p.stdin.end(), done) }
}

/** The intro clip's length in seconds, read off ffmpeg's banner. */
function introSeconds() {
  return new Promise((res) => {
    if (!existsSync(INTRO)) return res(null)
    const p = spawn(ffmpeg, ['-hide_banner', '-i', INTRO])
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('close', () => {
      const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(err)
      res(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null)
    })
  })
}

/** Lay the intro clip over frames [from, to) of the render, as `object-fit: cover` fills the frame. */
function overlayIntro(src, from, to, out) {
  const a = (from / FPS).toFixed(4)
  const b = (to / FPS).toFixed(4)
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, [
      '-y', '-loglevel', 'error', '-i', src, '-itsoffset', a, '-i', INTRO,
      '-filter_complex', `[1:v]scale=-2:${H},crop=${W}:${H},fps=${FPS},setsar=1[iv];[0:v][iv]overlay=0:0:eof_action=pass:enable='between(t,${a},${b})'[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out,
    ], { stdio: 'inherit' })
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg overlay exited ${c}`))))
  })
}

function cut(src, from, to, out) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-ss', from.toFixed(3), '-to', to.toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: 'inherit' })
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg cut exited ${c}`))))
  })
}

async function render(run) {
  const out = resolve(run.out ?? join(root, 'clips', `render_s${run.seed}.mp4`))
  const raw = out.replace(/\.mp4$/, '.raw.mp4')
  const introLen = await introSeconds()
  const b = await cdpBrowser()
  try {
    const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true, width: W, height: H })
    const { sessionId: s } = await b.send('Target.attachToTarget', { targetId, flatten: true })
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, s)
    await b.send('Page.enable', {}, s)
    await b.send('Runtime.enable', {}, s)
    await b.send('HeadlessExperimental.enable', {}, s).catch(() => {})
    // virtual time: the page's clock moves only when this script advances it
    await b.send('Emulation.setVirtualTimePolicy', { policy: 'pause' }, s)
    await b.send('Page.navigate', { url: urlFor(run) }, s)

    const evaluate = async (expr) => (await b.send('Runtime.evaluate', { expression: expr, returnByValue: true }, s)).result.value
    // the run lives in the creator frame's iframe; its beats are read there
    const inGame = (body) => `(() => { const f = document.querySelector('iframe'); const d = f && f.contentDocument ? f.contentDocument : document; ${body} })()`
    const enc = encoder(raw)
    let introFrom = null
    let introTo = null
    let ticks = 0
    let last = null
    let t = 0
    const beats = {}
    let strip = ''
    let settledAt = null
    const t0 = Date.now()
    while (ticks < MAX * FPS) {
      // one frame of page time, then one drawn frame
      const expired = b.once('Emulation.virtualTimeBudgetExpired', s)
      await b.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: STEP, maxVirtualTimeTaskStarvationCount: 100 }, s)
      await expired
      t += STEP
      const f = await b.send('HeadlessExperimental.beginFrame', { frameTimeTicks: t, interval: STEP, noDisplayUpdates: false, screenshot: { format: 'jpeg', quality: 92 } }, s)
      if (f.screenshotData) last = Buffer.from(f.screenshotData, 'base64')
      if (last) {
        await enc.write(last)
        ticks++
      }
      // between the strip and the settle, the intro is watched every frame: it is timed to the frame
      if (beats.series !== undefined && introTo === null && ticks > 0) {
        const on = await evaluate(inGame(`return !!d.querySelector('.g7-intro')`))
        if (on && introFrom === null) {
          introFrom = ticks - 1
          // end it after exactly the clip's own length of page time, as playing it would
          const ms = Math.round((introLen ?? 8.75) * 1000 - STEP)
          await evaluate(inGame(`const v = d.querySelector('.g7-intro video'); if (v) { v.pause(); d.defaultView.setTimeout(() => v.dispatchEvent(new Event('ended')), ${ms}) } return true`))
        } else if (!on && introFrom !== null) introTo = ticks - 1
      }
      if (ticks % 6 === 0 && ticks > 0) {
        const st = await evaluate(inGame(`return { draft: !!d.querySelector('.cr-hud'), settle: !!d.querySelector('.cr-settle'), g7: !!d.querySelector('.g7-intro'), done: d.body && d.body.dataset.creatorDone === '1' }`))
        if (!st) continue
        const now = ticks / FPS
        if (st.draft && beats.draft === undefined) beats.draft = now
        if (st.settle && beats.sims === undefined) beats.sims = now
        if (!st.draft && !st.settle && beats.series === undefined && (beats.draft !== undefined || beats.sims !== undefined)) beats.series = now
        if (st.g7 && beats.g7 === undefined) beats.g7 = now
        if (st.done && settledAt === null) {
          settledAt = now
          beats.settled = now
          strip = await evaluate(inGame(`return [...d.querySelectorAll('.gt b')].map((b) => b.textContent.replace(/\\s/g, '')).join(' ')`))
        }
        if (settledAt !== null && now >= settledAt + HOLD) break
      }
    }
    await enc.end()
    if (introFrom !== null && introLen) {
      await overlayIntro(raw, introFrom, introTo ?? ticks, out)
      rmSync(raw, { force: true })
      console.log(`  intro clip laid over frames ${introFrom}–${introTo ?? ticks} (${(((introTo ?? ticks) - introFrom) / FPS).toFixed(2)} s)`)
    } else {
      rmSync(out, { force: true })
      await new Promise((r, j) => spawn(ffmpeg, ['-y', '-loglevel', 'error', '-i', raw, '-c', 'copy', out]).on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg copy')))))
      rmSync(raw, { force: true })
    }
    const secs = ticks / FPS
    console.log(`  ${out}  ${secs.toFixed(1)} s · ${ticks} frames at ${FPS} fps (rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
    console.log(`  beats: ${Object.entries(beats).map(([k, v]) => `${k} ${v.toFixed(1)}s`).join(' · ')}`)
    if (strip) console.log(`  strip: ${strip}`)
    if (beats.g7 !== undefined && beats.settled !== undefined) console.log(`  game 7 on screen: ${(beats.settled - beats.g7).toFixed(1)} s from its intro to the settled strip`)
    if (settledAt === null) console.warn('  the run did not settle within --max; the clip ends where it stopped')
    if (ENDING > 0 && settledAt !== null) {
      const to = Math.min(secs, settledAt + HOLD)
      const from = Math.max(beats.series ?? 0, settledAt - ENDING)
      const end = out.replace(/\.mp4$/, '-ending.mp4')
      await cut(out, from, to, end)
      console.log(`  ${end}  ${from.toFixed(1)}–${to.toFixed(1)} s`)
    }
    return { out, beats, strip, seconds: secs }
  } finally {
    await b.close()
  }
}

const runs = argv.includes('--batch')
  ? JSON.parse(readFileSync(resolve(opt('batch')), 'utf8'))
  : [{ a: opt('a'), b: opt('b'), level: opt('level'), seed: Number(opt('seed', 1)), team: opt('team'), out: opt('out') }]
for (const run of runs) {
  console.log(`rendering ${urlFor(run)}`)
  await render(run)
}
