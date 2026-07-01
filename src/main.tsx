import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { assetUrl } from './lib/assets'

// El fondo del body vive en CSS. Solo se inyecta la variable si la imagen carga correctamente;
// si Supabase no está disponible el gradiente de index.css actúa de fallback.
const _bgImg = new Image();
_bgImg.onload = () => {
  document.documentElement.style.setProperty('--bg-fondo', `url(${assetUrl('ui/fondo.webp')})`);
};
_bgImg.src = assetUrl('ui/fondo.webp');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
