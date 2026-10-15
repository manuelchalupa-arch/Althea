import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/*.svg', 'assets/icons/**/*.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Las cuatro figuras del atlas muscular SÍ se pre-cachean: son los
        // recursos de `src/assets/muscle-atlas/` que el mapa de Progreso
        // renderiza para M/F (ver atlasFigure.ts). Suman ~1.4 MB y hacen que
        // el atlas funcione sin conexión. No están en WebP, así que no se
        // pueden excluir como los fallbacks de marca.
        //
        // PERF-001: `AltheaAvatar` sirve WebP con `<picture>` y usa el PNG solo
        // como fallback para navegadores sin soporte. Los tres PNG grandes se
        // descargaban en cada instalación de la PWA sin necesidad (1,59 MB).
        // Se excluyen del precache; el PNG pequeño `althea-header-96.png`
        // sí se conserva porque `reportPdf.ts` lo hace fetch() para el informe,
        // igual que `apple-touch-icon-180.png` e `althea-avatar-128.png`.
        globIgnores: [
          '**/*.wasm',
          '**/althea-hero-1000.png',
          '**/althea-empty-state-700.png',
          '**/althea-coach-480.png',
        ],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/JahelCuadrado\/ExerciseGymGifsDB\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'exgym-api', expiration: { maxEntries: 200, maxAgeSeconds: 60*60*24*7 }, cacheableResponse: { statuses:[0,200] } }
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*\.gif$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'exgym-gifs', expiration: { maxEntries: 300, maxAgeSeconds: 60*60*24*30 }, cacheableResponse: { statuses:[0,200] } }
          },
          {
            urlPattern: /.*\.wasm$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'wasm-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60*60*24*30 }, cacheableResponse: { statuses:[0,200] } }
          },
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.workers\.dev\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'groq-proxy' }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core vendor
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) {
            return 'vendor-react'
          }
          // State management
          if (id.includes('node_modules/dexie')) {
            return 'vendor-state'
          }
          // Firebase (el SDK vive en @firebase/*, no en firebase/*)
          if (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase')) {
            return 'vendor-firebase'
          }
          // Utils
          if (id.includes('node_modules/uuid')) {
            return 'vendor-utils'
          }
          // UI icons
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
          // Other node_modules
          if (id.includes('node_modules')) {
            return 'vendor-other'
          }
        }
      }
    },
    // Reduce chunk size warning threshold
    chunkSizeWarningLimit: 500,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Minify options
    minify: 'esbuild',
    target: 'es2020'
  },
  server: { port: 5173 },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'dexie'],
  }
})
