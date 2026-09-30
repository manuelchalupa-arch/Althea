// wgerServerAuth — Autenticación WGER via Cloudflare Worker.
//
// ARQUITECTURA:
// - El frontend NUNCA ve ni almacena credenciales WGER.
// - El Cloudflare Worker maneja la autenticación y setea cookies HttpOnly.
// - El frontend solo llama a los endpoints del Worker.
// - El Worker inyecta el token en requests a WGER.
//
// REGLAS DE SEGURIDAD:
// - NO guardar password WGER en localStorage
// - NO guardar password WGER en Dexie
// - NO guardar password en Zustand
// - NO guardar JWT permanente en localStorage
// - NO guardar refresh token en frontend
// - NO guardar secretos en variables VITE_*
// - NO exponer credenciales en bundles

import { isFirebaseConfigured } from '@/services/firebase/config'
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

const WORKER_BASE = '/api/wger'

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
    const response = await fetch(`${WORKER_BASE}/user`, {
      credentials: 'include',
    })

    if (response.ok) {
      const data = await response.json()
      return {
        isLinked: true,
        wgerUsername: data.username,
        linkedAt: new Date().toISOString(),
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
 * Las credenciales se envían al Worker que las verifica y setea cookies HttpOnly.
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

  if (!credentials.username?.trim() || !credentials.password?.trim()) {
    return {
      success: false,
      message: 'Usuario y contraseña son obligatorios.',
    }
  }

  try {
    const response = await fetch(`${WORKER_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username.trim(),
        password: credentials.password,
      }),
      credentials: 'include',
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return {
        success: false,
        message: data.error || 'Las credenciales de WGER no son válidas.',
      }
    }

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
 * Elimina las cookies HttpOnly del Worker.
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
    const response = await fetch(`${WORKER_BASE}/token`, {
      method: 'DELETE',
      credentials: 'include',
    })

    if (!response.ok) {
      return {
        success: false,
        message: 'Error al desvincular la cuenta.',
      }
    }

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
 * Refresca el token de acceso WGER si es necesario.
 * El Worker maneja la lógica de refresh automáticamente.
 */
export async function refreshWgerToken(): Promise<WgerAuthResult> {
  try {
    const response = await fetch(`${WORKER_BASE}/refresh`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      return {
        success: false,
        message: 'No se pudo refrescar el token.',
      }
    }

    return {
      success: true,
      message: 'Token refrescado correctamente.',
    }
  } catch (error) {
    console.error('[wgerServerAuth] Error refreshing token:', error)
    return {
      success: false,
      message: 'Error al refrescar el token.',
    }
  }
}

/**
 * Ejecuta una operación autenticada contra WGER via el Worker proxy.
 * El Worker inyecta el token automáticamente desde la cookie HttpOnly.
 */
export async function executeWgerOperation<T>(
  operation: string,
  payload: unknown,
): Promise<T> {
  const response = await fetch(`${WORKER_BASE}/proxy/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`WGER operation failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}
