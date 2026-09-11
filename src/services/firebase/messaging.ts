import { getMessaging, getToken, onMessage, isSupported, type MessagePayload } from 'firebase/messaging'
import { doc, setDoc } from 'firebase/firestore'
import { firebaseDb, isFirebaseConfigured } from './config'
import { currentUser } from './auth'

// Push FCM: recibe notificaciones enviadas desde Console/Functions.
// La config pública sale de Firebase Hosting (/__/firebase/init.json), sin secretos en el repo.
const TOKEN_KEY = 'althea:fcmToken'

function vapidKey(): string | null {
  try {
    return (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || null
  } catch {
    return null
  }
}

export async function isPushSupported(): Promise<boolean> {
  try {
    if (!isFirebaseConfigured()) return false
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false
    return await isSupported()
  } catch {
    return false
  }
}

export function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** Pide permiso, obtiene token FCM y lo guarda en users/{uid}/meta/tokens. */
export async function enablePush(): Promise<{ token: string }> {
  if (!isFirebaseConfigured()) throw new Error('Firebase no configurado.')
  if (!(await isPushSupported())) throw new Error('Este navegador no soporta push.')
  if (Notification.permission !== 'granted') {
    const p = await Notification.requestPermission()
    if (p !== 'granted') throw new Error('Permiso de notificaciones denegado.')
  }
  // El SW de Firebase Messaging debe estar registrado (public/firebase-messaging-sw.js)
  try {
    await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  } catch {}
  const vapid = vapidKey()
  if (!vapid) throw new Error('Falta VITE_FIREBASE_VAPID_KEY en el .env (consola Firebase → Cloud Messaging).')
  const messaging = getMessaging()
  const token = await getToken(messaging, { vapidKey: vapid })
  if (!token) throw new Error('No se pudo obtener el token del dispositivo.')
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {}
  const u = currentUser()
  if (u) {
    const ref = doc(firebaseDb(), 'users', u.uid, 'meta', 'tokens')
    await setDoc(
      ref,
      { [token]: { createdAt: new Date().toISOString(), platform: 'web' }, updatedAt: new Date().toISOString() },
      { merge: true },
    )
  }
  return { token }
}

/** Mensajes en primer plano: muestra notificación local del sistema. */
export function listenForeground(onTap?: (data: any) => void): () => void {
  let off: (() => void) | null = null
  ;(async () => {
    try {
      if (!(await isPushSupported())) return
      const unsub = onMessage(getMessaging(), (payload: MessagePayload) => {
        const title = payload.notification?.title || 'Althea'
        const body = payload.notification?.body || ''
        try {
          const n = new Notification(title, { body, icon: '/icons/icon-192.png', data: payload.data } as any)
          n.onclick = () => {
            try {
              window.focus()
            } catch {}
            onTap?.(payload.data)
            n.close()
          }
        } catch {}
      })
      off = unsub
    } catch {}
  })()
  return () => {
    try {
      off?.()
    } catch {}
  }
}
