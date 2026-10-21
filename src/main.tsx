import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CardProvider } from './ui/CardSheet'
import './styles.css'

const root = document.getElementById('root')!
// THE SHARE CARD PREVIEW (dev server only): ?sharepreview=1 draws both card formats from fixed
// samples in place of the app, for a screenshot. `import.meta.env.DEV` is false in a build, so
// this branch and the module it loads are dropped from production.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('sharepreview') === '1') {
  void import('./share/preview').then((m) => m.mountSharePreview(root))
} else {
  createRoot(root).render(
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
// would serve yesterday's modules back to you.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
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
