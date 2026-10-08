import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/althea-tokens.css'
import './styles/althea-brand.css'
import './styles/althea-components.css'
import './styles/althea-mobile-stitch.css'
// Material Symbols llega por CDN. Si no carga, sus ligaduras muestran la
// palabra inglesa. ensureIconFont() marca el estado en <html> para que el CSS
// la oculte; se llama antes del render para que nunca haya un frame visible
// con el texto crudo.
import { ensureIconFont } from '@/utils/iconFont'
ensureIconFont()

// Migración legacy -> modelo oficial (una vez, idempotente, sin borrar datos).
import('@/services/training/migrate').then(async ({ migrateLegacyTrainingData, wasMigratedV5 }) => {
  try { if (!wasMigratedV5()) {await migrateLegacyTrainingData()} } catch { /* noop */ }
})
// PWA register handled by vite-plugin-pwa auto
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
