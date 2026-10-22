import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  type User,
} from 'firebase/auth'

let googleRedirectResult: Promise<User | null> | null = null

export function completeGoogleRedirect(): Promise<User | null> {
  if (!googleRedirectResult) {
    googleRedirectResult = getRedirectResult(firebaseAuth())
      .then((cred) => {
        if (!cred?.user) { return null }
        setOfflineMode(false)
        return cred.user
      })
      .catch((e: any) => {
        throw new Error(toMessage(e?.code || '', 'No se pudo iniciar sesión con Google.'))
      })
  }
  return googleRedirectResult
}

export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    // Popup: no depende del iframe cross-origin de firebaseapp.com (Chrome
    // M115+ bloquea su storage en sitios que no están en Firebase Hosting).
    const cred = await signInWithPopup(firebaseAuth(), provider)
    setOfflineMode(false)
    return cred.user
  } catch (e: any) {
    if (e?.code === 'auth/popup-blocked') {
      // Si el navegador bloquea la ventana, caemos al redirect tradicional.
      await signInWithRedirect(firebaseAuth(), provider)
      return null
    }
    throw new Error(toMessage(e?.code || '', 'No se pudo iniciar sesión con Google.'))
  }
}
import { firebaseAuth, isFirebaseConfigured } from './config'

export type { User }

const OFFLINE_KEY = 'althea:offlineMode'

export function getOfflineMode(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1'
  } catch {
    return false
  }
}

export function setOfflineMode(v: boolean) {
  try {
    localStorage.setItem(OFFLINE_KEY, v ? '1' : '0')
  } catch {}
}

export function toMessage(code: string, fallback: string): string {
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'Ese correo ya está registrado. Iniciá sesión.',
    'auth/invalid-email': 'Correo electrónico inválido.',
    'auth/weak-password': 'Contraseña muy débil (mínimo 6 caracteres).',
    'auth/user-not-found': 'No hay cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
    'auth/network-request-failed': 'Sin conexión. Revisá internet e intentá de nuevo.',
    'auth/popup-closed-by-user': 'Se cerró la ventana de Google. Volvé a intentarlo.',
    'auth/cancelled-popup-request': 'Se cerró la ventana de Google. Volvé a intentarlo.',
  }
  return map[code] || fallback
}

export async function signUp(email: string, password: string): Promise<User> {
  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password)
    setOfflineMode(false)
    return cred.user
  } catch (e: any) {
    throw new Error(toMessage(e?.code || '', 'No se pudo crear la cuenta.'))
  }
}

export async function signIn(email: string, password: string): Promise<User> {
  try {
    const cred = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)
    setOfflineMode(false)
    return cred.user
  } catch (e: any) {
    throw new Error(toMessage(e?.code || '', 'No se pudo iniciar sesión.'))
  }
}

export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(firebaseAuth(), email.trim())
  } catch (e: any) {
    throw new Error(toMessage(e?.code || '', 'No se pudo enviar el correo.'))
  }
}

export async function signOut(): Promise<void> {
  if (!isFirebaseConfigured()) {return}
  try {
    await fbSignOut(firebaseAuth())
  } catch {}
}

export function currentUser(): User | null {
  if (!isFirebaseConfigured()) {return null}
  try {
    return firebaseAuth().currentUser
  } catch {
    return null
  }
}

export function onUser(cb: (u: User | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(firebaseAuth(), cb)
}
