/// <reference types="vite/client" />

// Variables públicas de build. IMPORTANTE:
// - Leerlas SIEMPRE como import.meta.env.VITE_X directo (sin casts ni objetos completos);
//   Vite reemplaza solo esa clave y NO embebe el resto del objeto env en el bundle.
// - No declarar acá VITE_GROQ_API_KEY ni ningún secreto: nunca se leen en frontend.
interface ImportMetaEnv {
  readonly VITE_GROQ_PROXY_URL?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}