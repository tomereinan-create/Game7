// FIRST, before anything that reads a save: creator mode's in-memory storage (see ./boot).
import { mountHere } from './boot'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CardProvider } from './ui/CardSheet'
import { CREATOR } from './creator/params'
import { initAnalytics } from './analytics'
import { listenForInstall } from './state/install'
import './styles.css'

if (mountHere()) {
  // P5: cookieless, and a no-op without a key; creator mode sends nothing
  initAnalytics({ creator: !!CREATOR })
  // P9: Chrome's install prompt can fire before anything is mounted to hear it
  if (!CREATOR) listenForInstall()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CardProvider>
        {/* The blue crawl used to hang here, outside App and pinned to the window, so that every
            screen ended on the same band. It is gone on his ruling, 2026-09-08: "Delete Draft five
            · beat 150 teams · hang the banners and the entire header" — the bar, not just its line.
            App is the whole window now. */}
        <App />
      </CardProvider>
    </StrictMode>,
  )
}

// The service worker is what makes the app installable on a phone, and what
// lets it open without a signal. Only in a real build — on the dev server it
// would serve yesterday's modules back to you. P3: registered at the build's
// base, so a root-domain host (BASE_PATH=/) scopes it to the whole site.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !CREATOR) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none', scope: import.meta.env.BASE_URL })
      .then((reg) => {
        // Coming back to the app is the moment to look for a new deploy; the
        // next refresh then has it. Nothing reloads underneath a game in play.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update()
        })
      })
      .catch(() => {})
  })
}
