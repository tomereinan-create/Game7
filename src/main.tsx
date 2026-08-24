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
