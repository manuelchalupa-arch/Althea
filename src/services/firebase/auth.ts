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

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') { return false }
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator as { maxTouchPoints?: number }).maxTouchPoints !== undefined && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1)
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    if (isIOS()) {
      await signInWithRedirect(firebaseAuth(), provider)
      const cred = await getRedirectResult(firebaseAuth())
      if (!cred || !cred.user) {
        throw new Error('No se pudo completar el inicio de sesión con Google.')
      }
      setOfflineMode(false)
      return cred.user
    }
    const cred = await signInWithPopup(firebaseAuth(), provider)
    setOfflineMode(false)
    return cred.user
  } catch (e: any) {
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
