// wgerAuth — Manejo seguro de credenciales WGER.
// FASE 3: Autenticación segura.
//
// REGLAS:
// - NO almacenar username/password de WGER en Dexie
// - NO almacenar credenciales en código
// - NO crear VITE_WGER_API_KEY
// - NO exponer refresh tokens en frontend
// - NO enviar secretos desde componentes React
// - NO imprimir tokens en logs
// - NO incluir tokens en errores
// - NO guardar secretos en localStorage
//
// ARQUITECTURA:
// - El frontend NUNCA ve ni almacena credenciales WGER.
// - Firebase Auth autentica al usuario de Althea.
// - Las credenciales WGER se almacenan en Firestore (server-side).
// - Las operaciones autenticadas se ejecutan via Cloud Functions.
//
// LIMITACIÓN ACTUAL:
// La API de WGER es pública para GET (lectura). No se requiere autenticación
// para acceder a ejercicios, músculos, equipamiento, etc.
//
// Para operaciones autenticadas (crear rutinas, registrar entrenamientos):
// - Se requiere capa server-side/proxy (Cloud Functions)
// - Estado actual: solo read-only público + vinculación de cuentas

import { getWgerLinkStatus, linkWgerAccount, unlinkWgerAccount } from './wgerServerAuth'

export type WgerAuthStatus = 'public-only' | 'authenticated'

export interface WgerAuthState {
  status: WgerAuthStatus
  isAuthenticated: boolean
  canWrite: boolean
  isLinked: boolean
  wgerUsername?: string
}

let authState: WgerAuthState = {
  status: 'public-only',
  isAuthenticated: false,
  canWrite: false,
  isLinked: false,
}

export function getWgerAuthState(): WgerAuthState {
  return { ...authState }
}

export function isWgerAuthenticated(): boolean {
  return authState.isAuthenticated
}

export function getWgerAuthStatus(): WgerAuthStatus {
  return authState.status
}

/**
 * Verifica el estado de vinculación de la cuenta WGER.
 * NO devuelve credenciales, solo el estado.
 */
export async function checkWgerLinkStatus(): Promise<WgerAuthState> {
  const status = await getWgerLinkStatus()

  authState = {
    status: status.isLinked ? 'authenticated' : 'public-only',
    isAuthenticated: status.isLinked,
    canWrite: status.isLinked,
    isLinked: status.isLinked,
    wgerUsername: status.wgerUsername,
  }

  return { ...authState }
}

/**
 * Vincula la cuenta WGER del usuario actual.
 * Las credenciales se almacenan en Firestore (server-side).
 */
export async function authenticateWger(username: string, password: string): Promise<void> {
  const result = await linkWgerAccount({ username, password })

  if (!result.success) {
    throw new Error(result.message)
  }

  await checkWgerLinkStatus()
}

/**
 * Desvincula la cuenta WGER del usuario actual.
 */
export async function deauthenticateWger(): Promise<void> {
  const result = await unlinkWgerAccount()

  if (!result.success) {
    throw new Error(result.message)
  }

  resetWgerAuth()
}

export function resetWgerAuth(): void {
  authState = {
    status: 'public-only',
    isAuthenticated: false,
    canWrite: false,
    isLinked: false,
  }
}
