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
// LIMITACIÓN ACTUAL:
// La API de WGER es pública para GET (lectura). No se requiere autenticación
// para acceder a ejercicios, músculos, equipamiento, etc.
//
// Para operaciones autenticadas (crear rutinas, registrar entrenamientos):
// - Se requiere capa server-side/proxy
// - NO implementar en frontend directamente
// - Estado actual: solo read-only público

export type WgerAuthStatus = 'public-only' | 'authenticated'

export interface WgerAuthState {
  status: WgerAuthStatus
  isAuthenticated: boolean
  canWrite: boolean
}

const authState: WgerAuthState = {
  status: 'public-only',
  isAuthenticated: false,
  canWrite: false,
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

// Función placeholder para futura autenticación server-side.
// NO implementar en frontend. Requiere proxy/server.
export async function authenticateWger(): Promise<never> {
  throw new Error('WGER authentication requires server-side proxy. Not implemented in frontend.')
}

export function resetWgerAuth(): void {
  authState.status = 'public-only'
  authState.isAuthenticated = false
  authState.canWrite = false
}
