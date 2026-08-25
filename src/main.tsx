import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CardProvider } from './ui/CardSheet'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CardProvider>
      <App />
    </CardProvider>
  </StrictMode>,
)

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
