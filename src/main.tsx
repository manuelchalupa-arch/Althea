import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Migración legacy -> modelo oficial (una vez, idempotente, sin borrar datos).
import('@/services/training/migrate').then(async ({ migrateLegacyTrainingData, wasMigratedV5 }) => {
  try { if (!wasMigratedV5()) await migrateLegacyTrainingData() } catch { /* noop */ }
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
