import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@/services/pwa/installPrompt'
import './index.css'
import './styles/althea-tokens.css'
import './styles/althea-brand.css'
import './styles/althea-components.css'
import './styles/althea-mobile-stitch.css'

// Migración legacy -> modelo oficial (una vez, idempotente, sin borrar datos).
import('@/services/training/migrate').then(async ({ migrateLegacyTrainingData, wasMigratedV5 }) => {
  try { if (!wasMigratedV5()) {await migrateLegacyTrainingData()} } catch { /* noop */ }
})
// Registro manual del SW (injectRegister: false): un SW nuevo espera y solo
// se activa al presionar el botón ⟳ del encabezado. Sin recargas automáticas.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{})
  })
}
// Pide almacenamiento durable: protege los datos locales (IndexedDB) de ser
// evictados por presión de espacio. Best-effort; browsers sin soporte lo ignoran.
// R3: persist() es una promesa — un rechazo (denegado/sin soporte) no debe
// quedar como unhandled rejection ni bloquear el arranque. Pedir ≠ tener.
try { void navigator.storage?.persist?.()?.catch(() => {}) } catch { /* noop */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
