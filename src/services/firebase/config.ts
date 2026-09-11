import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Configuración vía variables VITE_FIREBASE_* (ver .env.example).
// Si faltan, Firebase queda deshabilitado y la app funciona 100% offline.
const env = (import.meta as any).env || {}

function readConfig() {
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
  }
  return cfg.apiKey && cfg.projectId ? cfg : null
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let firestore: Firestore | null = null

export function isFirebaseConfigured(): boolean {
  return readConfig() !== null
}

function ensure(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  const cfg = readConfig()
  if (!cfg) throw new Error('Firebase no configurado: faltan variables VITE_FIREBASE_* (ver .env.example)')
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(cfg)
    auth = getAuth(app)
    // Sesión persistente en el dispositivo (funciona offline tras el primer login)
    setPersistence(auth, browserLocalPersistence).catch(() => {})
    firestore = getFirestore(app)
  }
  return { app, auth: auth!, db: firestore! }
}

export function firebaseAuth(): Auth {
  return ensure().auth
}

export function firebaseDb(): Firestore {
  return ensure().db
}
