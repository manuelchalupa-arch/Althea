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
      includeAssets: ['favicon.svg', 'icons/*.png', 'assets/backgrounds/*.webp'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
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
            urlPattern: /^https:\/\/nutricion-api-arg\.fly\.dev\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'codulia-api', networkTimeoutSeconds: 5, cacheableResponse: { statuses:[0,200] } }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          db: ['dexie', 'zustand'],
          transformers: ['@huggingface/transformers']
        }
      }
    }
  },
  server: { port: 5173 }
})
