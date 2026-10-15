import { soundOn } from '../state/sound'
import achievement from '../sounds/achievement.mp3'
import bid from '../sounds/bid.mp3'
import champion from '../sounds/champion.mp3'
import click from '../sounds/click.mp3'
import coach from '../sounds/coach.mp3'
import error from '../sounds/error.mp3'
import game from '../sounds/game.mp3'
import lose from '../sounds/lose.mp3'
import pick from '../sounds/pick.mp3'
import reveal from '../sounds/reveal.mp3'
import sold from '../sounds/sold.mp3'
import spin from '../sounds/spin.wav'
import stars from '../sounds/stars.mp3'
import whistle from '../sounds/whistle.mp3'
import win from '../sounds/win.mp3'

/**
 * THE SOUNDS — every one CC0, picked by ear in a sound lab on 2026-10-15 and trimmed, levelled to
 * the same peak and cut to mono there; `vol` is the level each plays at, as heard in the lab.
 * Sources (credit is not required by CC0, but is due): Kenney's Interface Sounds, Casino Audio and
 * Music Jingles (kenney.nl), and BigSoundBank (bigsoundbank.com) for the bike wheel, the coin, the
 * crowd, the applause and the whistle.
 *
 * IMPORTED, NOT FETCHED FROM public/: Vite hashes them into assets/, which the service worker
 * keeps cache-first, so they survive a deploy's cache wipe and play offline in the APK.
 *
 * `spin` is the one WAV: it loops, and an MP3 carries ~25 ms of encoder padding that would put a
 * gap in every turn of the loop. Every MP3 has that padding at its head, so the loader trims each
 * one-shot to its first sound.
 */
const SOUNDS = {
  click: { url: click, vol: 0.35 },
  spin: { url: spin, vol: 0.25 },
  reveal: { url: reveal, vol: 0.5 },
  pick: { url: pick, vol: 0.55 },
  bid: { url: bid, vol: 0.5 },
  sold: { url: sold, vol: 0.5 },
  whistle: { url: whistle, vol: 0.35 },
  game: { url: game, vol: 0.5 },
  win: { url: win, vol: 0.6 },
  lose: { url: lose, vol: 0.55 },
  champion: { url: champion, vol: 0.6 },
  achievement: { url: achievement, vol: 0.5 },
  stars: { url: stars, vol: 0.5 },
  coach: { url: coach, vol: 0.4 },
  error: { url: error, vol: 0.4 },
} satisfies Record<string, { url: string; vol: number }>

export type Sfx = keyof typeof SOUNDS

interface Loaded {
  buf: AudioBuffer
  /** Where the sound starts, past the encoder's silent lead-in. */
  at: number
}

let ctx: AudioContext | null = null
const loaded = new Map<Sfx, Loaded>()
let loading: Promise<void> | null = null
const lastAt = new Map<Sfx, number>()
/** A button's own click, held one beat so a sound of its own can replace it. */
let pendingClick = 0

function audio(): AudioContext | null {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
  } catch {
    return null
  }
  return ctx
}

function leadIn(buf: AudioBuffer): number {
  const d = buf.getChannelData(0)
  let peak = 0
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
  let i = 0
  while (i < d.length && Math.abs(d[i]) < peak * 0.01) i++
  return Math.max(0, i / buf.sampleRate - 0.002)
}

function load(c: AudioContext): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(SOUNDS) as Sfx[]).map(async (name) => {
      try {
        const res = await fetch(SOUNDS[name].url)
        const buf = await c.decodeAudioData(await res.arrayBuffer())
        loaded.set(name, { buf, at: name === 'spin' ? 0 : leadIn(buf) })
      } catch {
        /* a sound that will not load stays silent; the game does not wait on it */
      }
    }),
  ).then(() => {})
  return loading
}

/** Browsers start audio only inside a tap, so the first tap wakes it and fetches the set. */
function wake() {
  const c = audio()
  if (!c) return
  if (c.state !== 'running') void c.resume().catch(() => {})
  void load(c)
}

/** Play one sound. Silent until the first tap, and when the sound chip is off. */
export function play(name: Sfx, opts: { rate?: number; vol?: number } = {}) {
  if (name !== 'click' && pendingClick) {
    window.clearTimeout(pendingClick)
    pendingClick = 0
  }
  if (!soundOn() || !ctx) return
  // the same sound twice inside a beat is one sound (two trophies at once, a doubled effect)
  const now = performance.now()
  if (now - (lastAt.get(name) ?? -1e9) < 60) return
  lastAt.set(name, now)
  const s = loaded.get(name)
  if (!s) return
  const c = ctx
  const src = c.createBufferSource()
  src.buffer = s.buf
  src.playbackRate.value = opts.rate ?? 1
  const g = c.createGain()
  g.gain.value = SOUNDS[name].vol * (opts.vol ?? 1)
  src.connect(g)
  g.connect(c.destination)
  src.start(0, s.at)
}

/**
 * THE WHEEL'S WHIRR: the bike-wheel loop, run at the reel's own speed. `rates` is the reel's speed
 * as a fraction of flat-out, one value per `stepMs`, ending where the reel stops visibly moving —
 * so the clicking slows exactly as the names do. Returns the brake for a spin cut short.
 */
export function whirr(rates: Float32Array, stepMs: number, pitch = 1): () => void {
  const s = loaded.get('spin')
  if (!soundOn() || !ctx || !s || rates.length < 2) return () => {}
  const c = ctx
  const src = c.createBufferSource()
  src.buffer = s.buf
  src.loop = true
  const g = c.createGain()
  src.connect(g)
  g.connect(c.destination)
  const t = c.currentTime
  const dur = ((rates.length - 1) * stepMs) / 1000
  const vol = SOUNDS.spin.vol
  src.playbackRate.setValueCurveAtTime(rates.map((r) => Math.max(0.04, r * pitch)), t, dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.03)
  g.gain.setValueAtTime(vol, t + Math.max(0.04, dur - 0.12))
  g.gain.linearRampToValueAtTime(0, t + dur)
  // a random way into the loop, so two reels starting together do not click in step
  src.start(t, Math.random() * s.buf.duration)
  src.stop(t + dur + 0.02)
  return () => {
    try {
      const n = c.currentTime
      g.gain.cancelScheduledValues(n)
      g.gain.setValueAtTime(g.gain.value, n)
      g.gain.linearRampToValueAtTime(0, n + 0.05)
      src.stop(n + 0.06)
    } catch {
      /* already stopped */
    }
  }
}

/**
 * ONE HOOK FOR EVERY BUTTON. There is no shared button component — two hundred buttons across
 * thirty files — so the tap sound listens at the document. It waits one beat, and any other sound
 * played in that beat (the pick, the bid, the sold) replaces it rather than doubling it. A
 * disabled button never fires a click, so it never sounds.
 */
export function installSfx() {
  if (typeof document === 'undefined') return
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) document.addEventListener(ev, wake, true)
  document.addEventListener(
    'click',
    (e) => {
      wake()
      const el = e.target instanceof Element ? e.target.closest('button, [role="button"], a[href]') : null
      if (!el || el.getAttribute('aria-disabled') === 'true') return
      window.clearTimeout(pendingClick)
      pendingClick = window.setTimeout(() => {
        pendingClick = 0
        play('click')
      }, 0)
    },
    true,
  )
}
