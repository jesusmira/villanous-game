import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { assetUrl } from './lib/assets'

// El fondo del body vive en CSS pero su URL está en Supabase: se inyecta como variable CSS.
document.documentElement.style.setProperty('--bg-fondo', `url(${assetUrl('ui/fondo.webp')})`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
