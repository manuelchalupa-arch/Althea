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
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/*.wasm'],
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
            urlPattern: /^https:\/\/api\.groq\.com\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'groq-api' }
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
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }
          // State management
          if (id.includes('node_modules/dexie') || id.includes('node_modules/zustand')) {
            return 'vendor-state'
          }
          // Charts - split recharts
          if (id.includes('node_modules/recharts')) {
            return 'vendor-charts'
          }
          // Heavy AI/ML
          if (id.includes('node_modules/@huggingface/transformers')) {
            return 'vendor-transformers'
          }
          // Firebase
          if (id.includes('node_modules/firebase')) {
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
    include: ['react', 'react-dom', 'react-router-dom', 'dexie', 'zustand'],
    exclude: ['@huggingface/transformers']
  }
})
