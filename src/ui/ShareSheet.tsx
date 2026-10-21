import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../analytics'
import { renderShareCard, type CardFormat } from '../share/card'
import { altText, fileName, shareData, shareText, xIntent, type ShareData, type ShareInput } from '../share/data'
import { inAppBrowser, platform } from '../share/inapp'
import { newShareId, shareLink } from '../share/link'

/**
 * THE SHARE DOOR ON THE RESULT (P10), and the sheet behind it.
 *
 * Three rooms, because a share is three different acts depending on where the page is open:
 *
 *   a phone browser that can share a file   ONE TAP: the result's Share button hands the story
 *                                           picture, the text and the link straight to the phone's
 *                                           own share sheet. The picture is drawn ahead of time,
 *                                           while the screen is idle, because a phone only lets a
 *                                           page open its share sheet in the moment of the tap.
 *   TikTok, Instagram, any app's webview    no file sharing and no downloads worth the name there,
 *                                           so the sheet SHOWS the picture and says to press and
 *                                           hold it, and offers the text to copy. Never a download.
 *   a desk, or a browser with no share API  X first, then the text to copy, then the two pictures
 *                                           to download.
 *
 * Every link handed out is minted for the place it goes — a fresh share ID (`s`) and a `ref`
 * naming the target — and `track('share_click')` counts the target, never the person.
 */

type Env = 'inapp' | 'native' | 'desktop'

/** Whether this browser can hand a PNG to the platform's share sheet. */
function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] })
  } catch {
    return false
  }
}

/** Which of the three rooms this page is standing in. A desk is always the desk, share API or not. */
function shareEnv(): Env {
  if (typeof navigator === 'undefined') return 'desktop'
  if (inAppBrowser()) return 'inapp'
  if (platform() === 'desktop') return 'desktop'
  return canShareFile(new File([new Uint8Array(8)], 'probe.png', { type: 'image/png' })) ? 'native' : 'desktop'
}

/** A fresh share ID and the link that carries it — with the challenge (P11) in its hash, when the
 *  series can be replayed, so every share is also a playable "beat it" link. */
const linkFor = (d: ShareData, s: string, ref: string) => shareLink({ s, ref }, d.challenge ? `c=${d.challenge}` : '')
const mint = (d: ShareData, ref: string) => {
  const s = newShareId()
  return { s, link: linkFor(d, s, ref) }
}

const clicked = (d: ShareData, target: string, s: string, extra: Record<string, string> = {}) =>
  track('share_click', {
    target,
    s,
    won: d.won,
    score: `${d.wins}-${d.losses}`,
    games: d.games.length,
    exhibition: d.exhibition,
    stamps: d.stamps.join(',') || undefined,
    ...extra,
  })

/**
 * The platform share sheet with the story picture. Everything before `navigator.share` is
 * synchronous on purpose: the call has to land inside the tap that asked for it.
 */
function shareNatively(d: ShareData, story: Blob): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const file = new File([story], fileName(d, 'story'), { type: 'image/png' })
    if (!canShareFile(file)) return Promise.resolve('failed')
    const { s, link } = mint(d, 'native')
    clicked(d, 'native', s)
    return navigator.share({ files: [file], text: shareText(d, link, false), url: link }).then(
      () => 'shared' as const,
      (e: unknown) => ((e as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'failed'),
    )
  } catch {
    return Promise.resolve('failed')
  }
}

/** The clipboard, then the old copy command, then nothing (the sheet shows the text to select). */
async function copy(t: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t)
      return true
    }
  } catch {
    /* refused: try the old way */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = t
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, t.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

const ShareGlyph = () => (
  <svg viewBox="0 0 16 16" aria-hidden width="14" height="14">
    <path d="M8 1.5v8.5M4.8 4.6 8 1.5l3.2 3.1M3 8v5.5h10V8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * The result screen's Share door. Drawn only once the series has settled (Series.tsx places it
 * under the verdict), so it can never give the result away before the strip has landed.
 */
export function ShareButton({ input }: { input: ShareInput }) {
  const latest = useRef(input)
  latest.current = input
  const [open, setOpen] = useState(false)
  /** The story picture, drawn ahead of the tap on a phone that can share it. */
  const story = useRef<Blob | null>(null)
  const door = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    story.current = null
    if (shareEnv() !== 'native') return
    let live = true
    const go = () => {
      renderShareCard(shareData(latest.current), 'story')
        .then((b) => {
          if (live) story.current = b
        })
        .catch(() => {})
    }
    // after the result has had its moment, while nothing else is happening
    const idle = typeof window.requestIdleCallback === 'function'
    const id = idle ? window.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 900)
    return () => {
      live = false
      if (idle) window.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [input.result])

  const onShare = () => {
    const blob = story.current
    if (blob && shareEnv() === 'native') {
      // one tap: the phone's own sheet. Only a refusal (not a cancel) falls back to ours.
      void shareNatively(shareData(latest.current), blob).then((r) => {
        if (r === 'failed') setOpen(true)
      })
      return
    }
    setOpen(true)
  }

  const data = useMemo(() => (open ? shareData(latest.current) : null), [open, input.result])
  const close = () => {
    setOpen(false)
    door.current?.focus()
  }

  return (
    <>
      <button type="button" ref={door} className="shr-open" onClick={onShare} aria-haspopup="dialog">
        <ShareGlyph />
        Share
      </button>
      {open && data ? createPortal(<ShareSheet data={data} story={story.current} onClose={close} />, document.body) : null}
    </>
  )
}

/**
 * The sheet: the picture, and the ways to post it that work where the page is open. Full screen,
 * like every other sheet in the app, with DONE in its top bar.
 */
export function ShareSheet({ data, story: drawn = null, onClose }: { data: ShareData; story?: Blob | null; onClose: () => void }) {
  const env = useMemo(shareEnv, [])
  const [story, setStory] = useState<Blob | null>(drawn)
  const [wide, setWide] = useState<Blob | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  /** The platform sheet turned the file down: this browser is a desk after all. */
  const [refused, setRefused] = useState(false)
  const [note, setNote] = useState('')
  /** The text, shown to select by hand when no clipboard would take it. */
  const [manual, setManual] = useState<string | null>(null)
  const done = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  /** A link minted for the X button's href, so a long-press or a middle-click carries one too. */
  const [xs, setXs] = useState(newShareId)

  /** Whether the drawn picture itself passes the platform's check — the probe at the door was a stand-in. */
  const takesFile = useMemo(() => !story || canShareFile(new File([story], fileName(data, 'story'), { type: 'image/png' })), [story, data])
  const room: Env = env === 'native' && (refused || !takesFile) ? 'desktop' : env

  // draw the story (unless the door already has), and on a desk the wide one after it
  useEffect(() => {
    let live = true
    const first = drawn ? Promise.resolve(drawn) : renderShareCard(data, 'story')
    first
      .then((b) => {
        if (!live) return
        setStory(b)
        if (env !== 'inapp') return renderShareCard(data, 'wide').then((w) => live && setWide(w))
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [data, drawn, env])

  // An app's webview saves a pressed-and-held data: picture far more reliably than a blob: one.
  useEffect(() => {
    if (!story) return
    if (env === 'inapp') {
      let live = true
      const r = new FileReader()
      r.onload = () => live && setSrc(String(r.result))
      r.readAsDataURL(story)
      return () => {
        live = false
      }
    }
    const u = URL.createObjectURL(story)
    setSrc(u)
    return () => URL.revokeObjectURL(u)
  }, [story, env])

  useEffect(() => {
    done.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const copyText = async () => {
    const { s, link } = mint(data, 'copy')
    const t = shareText(data, link)
    clicked(data, 'copy', s)
    if (await copy(t)) {
      setManual(null)
      setNote(room === 'inapp' ? 'Copied. Paste it with the picture.' : 'Copied.')
    } else {
      setManual(t)
      setNote('Select the text below and copy it.')
    }
  }

  const save = (format: CardFormat) => {
    const b = format === 'story' ? story : wide
    if (!b) return
    clicked(data, 'save', newShareId(), { format })
    const u = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = u
    a.download = fileName(data, format)
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(u), 10000)
  }

  const shareNow = () => {
    if (!story) return
    void shareNatively(data, story).then((r) => {
      if (r === 'failed') {
        setRefused(true)
        setNote('This browser would not share the picture. Download it or copy the text instead.')
      }
    })
  }

  const xHref = (s: string) => xIntent(data, linkFor(data, s, 'x'))
  const xLink = (primary: boolean) => (
    <a
      className={primary ? 'btn shr-t' : 'btn ghost shr-t'}
      href={xHref(xs)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // a fresh share ID for every post; the href is read after this handler runs
        const s = newShareId()
        e.currentTarget.href = xHref(s)
        clicked(data, 'x', s)
        window.setTimeout(() => setXs(newShareId()), 0)
      }}
    >
      Post on X
    </a>
  )
  const copyButton = (primary: boolean) => (
    <button type="button" className={primary ? 'btn shr-t' : 'btn ghost shr-t'} onClick={copyText}>
      Copy text
    </button>
  )
  const saveButton = (format: CardFormat) => (
    <button type="button" className="btn ghost shr-t" onClick={() => save(format)} disabled={!(format === 'story' ? story : wide)}>
      Download {format}
      <small>{format === 'story' ? '1080×1920' : '1200×630'}</small>
    </button>
  )

  return (
    <div className={`sheet shr-sheet ${room}`} role="dialog" aria-modal="true" aria-labelledby="shr-title" onClick={(e) => e.stopPropagation()}>
      <div className="topbar">
        <span id="shr-title">Share the result</span>
        <button type="button" ref={done} onClick={() => closeRef.current()}>
          ← Done
        </button>
      </div>
      <div className="rule2" />
      <div className="shr-body">
        <figure className="shr-fig">
          {room === 'inapp' ? <figcaption className="shr-hint">Press and hold the picture to save it</figcaption> : null}
          {src ? (
            <img className="shr-img" src={src} alt={altText(data)} width={1080} height={1920} />
          ) : (
            <div className="shr-img shr-wait" role="img" aria-label={altText(data)}>
              <span>{failed ? 'The picture could not be drawn here. The text still can be copied.' : 'Drawing the card…'}</span>
            </div>
          )}
        </figure>
        <div className="shr-side">
          <div className="shr-targets">
            {room === 'inapp' ? (
              copyButton(true)
            ) : room === 'native' ? (
              <>
                <button type="button" className="btn shr-t" onClick={shareNow} disabled={!story}>
                  Share the card
                </button>
                {xLink(false)}
                {copyButton(false)}
                {saveButton('story')}
              </>
            ) : (
              <>
                {xLink(true)}
                {copyButton(false)}
                {saveButton('story')}
                {saveButton('wide')}
              </>
            )}
          </div>
          {room === 'inapp' ? <p className="shr-help">Then paste the text with the picture in your post.</p> : null}
          <p className="shr-note" role="status" aria-live="polite">
            {note}
          </p>
          {manual ? <textarea className="shr-manual" readOnly value={manual} rows={5} onFocus={(e) => e.currentTarget.select()} /> : null}
        </div>
      </div>
    </div>
  )
}
