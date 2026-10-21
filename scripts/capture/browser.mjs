/**
 * The capture scripts' browser: the Chrome (or Edge) already installed on this machine, driven by
 * playwright-core, so no browser has to be downloaded. CHROME=<path> picks a specific executable.
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export async function launch(opts = {}) {
  if (process.env.CHROME) return chromium.launch({ executablePath: process.env.CHROME, ...opts })
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, ...opts })
    } catch {
      /* try the next one */
    }
  }
  throw new Error('No Chrome or Edge found: set CHROME=<path to chrome.exe>')
}

/** An ffmpeg: FFMPEG=<path>, one on PATH, or the one Python's imageio-ffmpeg ships. */
export function findFfmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return 'ffmpeg'
  } catch {
    /* not on PATH */
  }
  try {
    const p = execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim()
    if (p && existsSync(p)) return p
  } catch {
    /* no python, or no imageio-ffmpeg */
  }
  return null
}
