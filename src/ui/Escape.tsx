import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../analytics'
import { inAppBrowser, platform, standalone } from '../share/inapp'
import { shareLink } from '../share/link'
import { SITE } from '../site'
import { FIRST_SPIN, promptInstall, useCanInstall } from '../state/install'
import { applySave, BadCode, collectSave, decodeSave, encodeSave, hasProgress, importFromUrl } from '../state/savecode'

/**
 * THE WAY OUT, AND THE WAY HOME (P9, the launch gate).
 *
 * Players arrive from TikTok and Instagram, inside those apps' own browsers. Progress made there is
 * stranded when the app is closed; Safari and Chrome are separate browsers with separate storage;
 * and an iPhone's Home Screen app starts empty again. Every piece here carries the save across one
 * of those gaps — and none of them moves anyone without a tap. Never an automatic redirect.
 */

const flag = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const setFlag = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* private mode: the hint may come back next visit, which is harmless */
  }
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The game's address carrying this browser's save in its hash, or bare when there is none yet. */
async function linkWithSave(ref: string): Promise<string> {
  const code = hasProgress() ? await encodeSave(collectSave()) : ''
  return shareLink({ ref }, code ? `import=${code}` : '')
}

/**
 * Hand the address to the system browser. Each in-app browser has its own door, and each can be
 * shut by an app update — so the sheet that follows always offers the copied link as well.
 */
function openOutside(url: string) {
  const plat = platform()
  const app = inAppBrowser()
  if (plat === 'android') {
    // an intent owns the `#`, so the save rides in the query here (importFromUrl reads both)
    const u = new URL(url)
    const code = /import=([^&]+)/.exec(u.hash)?.[1]
    u.hash = ''
    if (code) u.searchParams.set('import', code)
    location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(u.href)};end`
  } else if (plat === 'ios') {
    location.href = app === 'instagram' ? `instagram://extbrowser/?url=${encodeURIComponent(url)}` : `x-safari-${url}`
  }
}

function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  // portalled to the body: a sheet opened from the footer must not wear the footer's link styles
  return createPortal(
    <div className="g7-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="g7-card">
        <div className="g7-head">
          <b>{title}</b>
          {onClose ? (
            <button className="g7-x" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** In TikTok / Instagram / any in-app browser: the one visible button out. The front door's top. */
export function EscapeBanner() {
  const app = inAppBrowser()
  const [help, setHelp] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  if (!app) return null
  const browser = platform() === 'android' ? 'Chrome' : 'Safari'
  const go = async () => {
    const url = await linkWithSave('escape')
    track('escape_click', { inapp: app, platform: platform() })
    setHelp(url)
    openOutside(url)
  }
  return (
    <>
      <button className="g7-escape" onClick={go}>
        <span>Open in {browser} to keep your progress</span>
        <b>→</b>
      </button>
      {help ? (
        <Sheet title={`Open in ${browser}`} onClose={() => setHelp(null)}>
          <p>
            {app === 'tiktok' || app === 'instagram' || app === 'facebook'
              ? `If ${browser} did not open, tap the ••• menu at the top of this screen and choose "Open in browser".`
              : `If ${browser} did not open, copy the link and paste it into ${browser}.`}{' '}
            The link carries your progress with it.
          </p>
          <input className="g7-code" readOnly value={help} onFocus={(e) => e.currentTarget.select()} aria-label="Link to the game with your progress" />
          <button className="btn" onClick={async () => setCopied(await copy(help))}>
            {copied ? 'Copied — paste it into ' + browser : 'Copy the link'}
          </button>
        </Sheet>
      ) : null}
    </>
  )
}

/** Export and import, by hand. Opened from the front door's footer. */
export function SaveSheet({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('')
  const [link, setLink] = useState('')
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  useEffect(() => {
    let on = true
    void encodeSave(collectSave()).then((c) => {
      if (!on) return
      setCode(c)
      setLink(shareLink({ ref: 'savecode' }, `import=${c}`))
    })
    return () => {
      on = false
    }
  }, [])
  const load = async () => {
    try {
      const data = await decodeSave(paste)
      if (hasProgress() && !armed) {
        setArmed(true)
        setMsg('This replaces the progress in this browser. Tap again to load it.')
        return
      }
      applySave(data)
      track('savecode_import', { via: 'paste' })
      location.reload()
    } catch (e) {
      setMsg(e instanceof BadCode ? e.message : 'That save code could not be read.')
    }
  }
  return (
    <Sheet title="Save code" onClose={onClose}>
      <p>Your progress lives in this browser only. Copy this code to carry it to another browser, a phone, or the Home Screen app.</p>
      <textarea className="g7-code" readOnly rows={3} value={code || 'Writing your code…'} onFocus={(e) => e.currentTarget.select()} aria-label="Your save code" />
      <div className="g7-row">
        <button
          className="btn"
          disabled={!code}
          onClick={async () => {
            if (await copy(code)) setCopied('code')
            track('savecode_export', { via: 'code' })
          }}
        >
          {copied === 'code' ? 'Code copied' : 'Copy code'}
        </button>
        <button
          className="btn ghost"
          disabled={!link}
          onClick={async () => {
            if (await copy(link)) setCopied('link')
            track('savecode_export', { via: 'link' })
          }}
        >
          {copied === 'link' ? 'Link copied' : 'Copy as a link'}
        </button>
      </div>
      <div className="g7-rule" />
      <p>Have a code from another browser? Paste it here.</p>
      <textarea
        className="g7-code"
        rows={3}
        value={paste}
        placeholder="1.xxxxxxxx…"
        onChange={(e) => {
          setPaste(e.target.value)
          setArmed(false)
          setMsg(null)
        }}
        aria-label="Paste a save code"
      />
      {msg ? <p className="g7-msg">{msg}</p> : null}
      <button className="btn" disabled={!paste.trim()} onClick={load}>
        {armed ? 'Replace my progress' : 'Load this save'}
      </button>
    </Sheet>
  )
}

/**
 * A LINK THAT CARRIES A SAVE — the escape button's, a copied save link, or the mover's redirect from
 * the old address (P3). Read once on arrival and taken off the address. A browser with no progress
 * of its own takes it at once; one that has some is asked first, because the code replaces it.
 */
export function ImportPrompt() {
  const [state, setState] = useState<{ data: Record<string, string> } | { error: string } | null>(null)
  useEffect(() => {
    const code = importFromUrl(location.href)
    if (!code) return
    const u = new URL(location.href)
    u.hash = u.hash.replace(/(^#|&)import=[^&]*/, '').replace(/^#&?$/, '')
    u.searchParams.delete('import')
    history.replaceState(history.state, '', u.href)
    decodeSave(code)
      .then((data) => {
        if (!hasProgress()) {
          applySave(data)
          track('savecode_import', { via: 'link', replaced: false })
          location.reload()
        } else setState({ data })
      })
      .catch((e) => setState({ error: e instanceof BadCode ? e.message : 'That link’s save could not be read.' }))
  }, [])
  if (!state) return null
  if ('error' in state)
    return (
      <Sheet title="Could not load the save" onClose={() => setState(null)}>
        <p>{state.error} Your progress in this browser is unchanged.</p>
        <button className="btn" onClick={() => setState(null)}>
          OK
        </button>
      </Sheet>
    )
  return (
    <Sheet title="Load the progress from this link?" onClose={() => setState(null)}>
      <p>This browser already has progress of its own. Loading the link's save replaces it.</p>
      <div className="g7-row">
        <button
          className="btn"
          onClick={() => {
            applySave(state.data)
            track('savecode_import', { via: 'link', replaced: true })
            location.reload()
          }}
        >
          Load it
        </button>
        <button className="btn ghost" onClick={() => setState(null)}>
          Keep mine
        </button>
      </div>
    </Sheet>
  )
}

const A2HS = 'game7.a2hs'

/**
 * iOS: ADD TO HOME SCREEN, AFTER THE FIRST SPIN. Safari has no install prompt, so this says how —
 * once, after the wheel has landed for the first time, and only in Safari itself (an in-app browser
 * cannot add to the Home Screen; the escape button comes first there). The Home Screen app starts
 * with empty storage, so the same tap copies the save code it will ask for.
 */
export function IosHint() {
  const [shown, setShown] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (platform() !== 'ios' || inAppBrowser() || standalone() || flag(A2HS)) return
    let t = 0
    const on = () => {
      t = window.setTimeout(() => setShown(true), 7500)
    }
    window.addEventListener(FIRST_SPIN, on, { once: true })
    return () => {
      window.removeEventListener(FIRST_SPIN, on)
      window.clearTimeout(t)
    }
  }, [])
  if (!shown) return null
  const done = () => {
    setFlag(A2HS, 'done')
    setShown(false)
    setOpen(false)
  }
  return (
    <>
      {!open ? (
        <div className="g7-toast" role="status">
          <button className="g7-toast-go" onClick={() => setOpen(true)}>
            Play it like an app: <b>Add to Home Screen</b>
          </button>
          <button className="g7-x" onClick={done} aria-label="Not now">
            ×
          </button>
        </div>
      ) : (
        <Sheet title="Add to Home Screen" onClose={done}>
          <ol className="g7-steps">
            <li>
              Tap <b>Share</b> <span aria-hidden>(the square with the arrow)</span> in Safari's toolbar.
            </li>
            <li>
              Choose <b>Add to Home Screen</b>, then <b>Add</b>.
            </li>
            <li>Open {SITE.shortName} from your Home Screen and paste your save code when it asks.</li>
          </ol>
          <p>The Home Screen app starts empty, so take your progress with you:</p>
          <button
            className="btn"
            onClick={async () => {
              const ok = await copy(await encodeSave(collectSave()))
              setCopied(ok)
              track('a2hs_copy', { ok })
              setFlag(A2HS, 'done')
            }}
          >
            {copied ? 'Save code copied' : 'Copy my save code'}
          </button>
        </Sheet>
      )}
    </>
  )
}

const WELCOMED = 'game7.welcomed'

/** The Home Screen app's first launch, with nothing in it yet: offer to paste the code. */
export function StandaloneWelcome() {
  const [open, setOpen] = useState(() => standalone() && !hasProgress() && !flag(WELCOMED))
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  if (!open) return null
  const close = () => {
    setFlag(WELCOMED, '1')
    setOpen(false)
  }
  const load = async (text: string) => {
    try {
      applySave(await decodeSave(text))
      setFlag(WELCOMED, '1')
      track('savecode_import', { via: 'standalone' })
      location.reload()
    } catch (e) {
      setMsg(e instanceof BadCode ? e.message : 'That save code could not be read.')
    }
  }
  return (
    <Sheet title="Continue your progress" onClose={close}>
      <p>Coming from Safari? Paste the save code you copied there and pick up where you left off.</p>
      <button
        className="btn"
        onClick={async () => {
          try {
            const t = await navigator.clipboard.readText()
            setPaste(t)
            await load(t)
          } catch {
            setMsg('Could not read the clipboard — paste the code into the box instead.')
          }
        }}
      >
        Paste my save code
      </button>
      <textarea className="g7-code" rows={3} value={paste} placeholder="…or paste it here" onChange={(e) => setPaste(e.target.value)} aria-label="Save code" />
      {msg ? <p className="g7-msg">{msg}</p> : null}
      <div className="g7-row">
        <button className="btn ghost" disabled={!paste.trim()} onClick={() => load(paste)}>
          Load it
        </button>
        <button className="btn ghost" onClick={close}>
          Start fresh
        </button>
      </div>
    </Sheet>
  )
}

/** The footer's own doors: the save code, and Install where the browser offers one. */
export function FooterDoors() {
  const [save, setSave] = useState(false)
  const canInstall = useCanInstall()
  return (
    <>
      {canInstall ? (
        <button onClick={() => void promptInstall()} className="g7-install">
          Install the app
        </button>
      ) : null}
      <button onClick={() => setSave(true)}>Save code</button>
      {save ? <SaveSheet onClose={() => setSave(false)} /> : null}
    </>
  )
}
