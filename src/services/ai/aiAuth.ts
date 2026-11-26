import { currentUser } from '@/services/firebase/auth'

/** Prefijo interno para que la UI distinga errores de cuota/sesión de otros fallos. */
const LIMIT_PREFIX = 'LIMITE_IA:'

/** Token de la sesión existente de Althea. Nunca una clave de proveedor. */
export async function getAiAuthHeaders(): Promise<Record<string, string>> {
  const user = currentUser()
  if (!user) { return {} }
  try {
    const token = await user.getIdToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export function hasAiSession(): boolean {
  return currentUser() !== null
}

export function limitError(message: string): string {
  return `${LIMIT_PREFIX}${message}`
}

export function isLimitError(message: string): boolean {
  return message.startsWith(LIMIT_PREFIX)
}

export function stripLimitPrefix(message: string): string {
  return message.startsWith(LIMIT_PREFIX) ? message.slice(LIMIT_PREFIX.length) : message
}

/** Errores del servicio central que deben comunicarse al usuario sin simul IA. */
export function aiLimitMessage(status: number, code?: string): string | null {
  if (status === 401) { return limitError('Iniciá sesión en Althea para usar la IA.') }
  if (status === 429) {
    return limitError(
      code === 'quota_exhausted'
        ? 'La IA está temporalmente limitada por cuota. Se renueva a las 00:00 UTC; probá de nuevo más tarde.'
        : 'La IA está temporalmente limitada. Probá de nuevo en unos segundos.',
    )
  }
  if (status === 503) { return limitError('El servicio de IA no está disponible ahora. Probá más tarde.') }
  return null
}
