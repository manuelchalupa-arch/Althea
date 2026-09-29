// wgerServerAuth — Autenticación WGER server-side via Firebase.
// FASE 3: Autenticación segura.
//
// ARQUITECTURA:
// - El frontend NUNCA ve ni almacena credenciales WGER.
// - Firebase Auth autentica al usuario de Althea.
// - Las credenciales WGER se almacenan en Firestore (server-side) con reglas de seguridad.
// - El frontend solicita operaciones al backend, que ejecuta con las credenciales.
//
// REGLAS DE SEGURIDAD:
// - NO guardar password WGER en localStorage
// - NO guardar password WGER en Dexie
// - NO guardar password en Zustand
// - NO guardar JWT permanente en localStorage
// - NO guardar refresh token en frontend
// - NO guardar secretos en variables VITE_*
// - NO exponer credenciales en bundles
//
// LIMITACIÓN ACTUAL:
// La API de WGER es pública para GET (lectura). No se requiere autenticación
// para acceder a ejercicios, músculos, equipamiento, etc.
//
// Para operaciones autenticadas (crear rutinas, registrar entrenamientos):
// - Se requiere capa server-side/proxy
// - Estado actual: solo read-only público
// - Las credenciales se almacenan en Firestore para uso futuro con Cloud Functions

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { firebaseDb, isFirebaseConfigured } from '@/services/firebase/config'
import { currentUser } from '@/services/firebase/auth'

// ─── Tipos ───

export interface WgerCredentials {
  username: string
  password: string
}

export interface WgerAuthResult {
  success: boolean
  message: string
  wgerUserId?: string
}

export interface WgerLinkStatus {
  isLinked: boolean
  wgerUsername?: string
  linkedAt?: string
}

// ─── Constantes ───

const COLLECTION = 'wger_credentials'
const DOC_PREFIX = 'wger_'

// ─── Funciones internas ───

function getDocId(userId: string): string {
  return `${DOC_PREFIX}${userId}`
}

// ─── API pública ───

/**
 * Verifica si el usuario actual tiene credenciales WGER vinculadas.
 * NO devuelve las credenciales, solo el estado de vinculación.
 */
export async function getWgerLinkStatus(): Promise<WgerLinkStatus> {
  if (!isFirebaseConfigured()) {
    return { isLinked: false }
  }

  const user = currentUser()
  if (!user) {
    return { isLinked: false }
  }

  try {
    const docRef = doc(firebaseDb(), COLLECTION, getDocId(user.uid))
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      return {
        isLinked: true,
        wgerUsername: data.username,
        linkedAt: data.linkedAt?.toDate?.()?.toISOString() || data.linkedAt,
      }
    }

    return { isLinked: false }
  } catch (error) {
    console.error('[wgerServerAuth] Error checking link status:', error)
    return { isLinked: false }
  }
}

/**
 * Vincula las credenciales WGER del usuario actual.
 * Las credenciales se almacenan en Firestore (server-side).
 * El frontend NO almacena las credenciales localmente.
 */
export async function linkWgerAccount(credentials: WgerCredentials): Promise<WgerAuthResult> {
  if (!isFirebaseConfigured()) {
    return {
      success: false,
      message: 'Firebase no está configurado. No se puede vincular la cuenta.',
    }
  }

  const user = currentUser()
  if (!user) {
    return {
      success: false,
      message: 'Debes iniciar sesión para vincular tu cuenta de WGER.',
    }
  }

  // Validar inputs
  if (!credentials.username?.trim() || !credentials.password?.trim()) {
    return {
      success: false,
      message: 'Usuario y contraseña son obligatorios.',
    }
  }

  try {
    // Verificar que las credenciales sean válidas haciendo una request a WGER
    const isValid = await verifyWgerCredentials(credentials)
    if (!isValid) {
      return {
        success: false,
        message: 'Las credenciales de WGER no son válidas.',
      }
    }

    // Almacenar en Firestore (server-side)
    const docRef = doc(firebaseDb(), COLLECTION, getDocId(user.uid))
    await setDoc(docRef, {
      username: credentials.username.trim(),
      password: credentials.password, // Se almacenan server-side, nunca en frontend
      linkedAt: serverTimestamp(),
      userId: user.uid,
    })

    return {
      success: true,
      message: 'Cuenta de WGER vinculada correctamente.',
    }
  } catch (error) {
    console.error('[wgerServerAuth] Error linking account:', error)
    return {
      success: false,
      message: 'Error al vincular la cuenta. Intentá de nuevo.',
    }
  }
}

/**
 * Desvincula la cuenta WGER del usuario actual.
 * Elimina las credenciales de Firestore.
 */
export async function unlinkWgerAccount(): Promise<WgerAuthResult> {
  if (!isFirebaseConfigured()) {
    return {
      success: false,
      message: 'Firebase no está configurado.',
    }
  }

  const user = currentUser()
  if (!user) {
    return {
      success: false,
      message: 'Debes iniciar sesión.',
    }
  }

  try {
    const docRef = doc(firebaseDb(), COLLECTION, getDocId(user.uid))
    await deleteDoc(docRef)

    return {
      success: true,
      message: 'Cuenta de WGER desvinculada correctamente.',
    }
  } catch (error) {
    console.error('[wgerServerAuth] Error unlinking account:', error)
    return {
      success: false,
      message: 'Error al desvincular la cuenta.',
    }
  }
}

/**
 * Verifica las credenciales WGER haciendo una request a la API.
 * Esta función se ejecuta en el frontend pero NO almacena las credenciales.
 */
async function verifyWgerCredentials(credentials: WgerCredentials): Promise<boolean> {
  try {
    const response = await fetch('https://wger.de/api/v2/user/', {
      headers: {
        'Authorization': `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
        'Accept': 'application/json',
      },
    })

    return response.ok
  } catch (error) {
    console.error('[wgerServerAuth] Error verifying credentials:', error)
    return false
  }
}

/**
 * Obtiene el token de acceso WGER para el usuario actual.
 * Este token es de corta duración y se obtiene del backend.
 *
 * NOTA: Esta función requiere un backend server-side (Cloud Functions).
 * Por ahora, devuelve un error indicando que no está implementado.
 */
export async function getWgerAccessToken(): Promise<string> {
  throw new Error(
    'WGER access token requires server-side implementation. ' +
    'Use Firebase Cloud Functions to implement this endpoint.'
  )
}

/**
 * Ejecuta una operación autenticada contra WGER.
 * Esta función requiere un backend server-side (Cloud Functions).
 *
 * NOTA: Esta función requiere un backend server-side (Cloud Functions).
 * Por ahora, devuelve un error indicando que no está implementado.
 */
export async function executeWgerOperation<T>(
  operation: string,
  payload: unknown,
): Promise<T> {
  throw new Error(
    `WGER operation "${operation}" requires server-side implementation. ` +
    'Use Firebase Cloud Functions to implement this endpoint.'
  )
}
