import { currentUser } from '@/services/firebase/auth'

const LIMIT_PREFIX = 'LIMITE_IA:'

export function limitError(message: string): string {
  return `${LIMIT_PREFIX}${message}`
}

/**
 * Obtiene un ID token válido de la sesión Firebase actual.
 * Nunca envía solicitudes al Worker sin autenticación.
 * Comprueba que el token corresponda al proyecto del frontend.
 */
export async function getAiAuthHeaders(): Promise<Record<string, string>> {
  const expectedProjectId = String(
    import.meta.env.VITE_FIREBASE_PROJECT_ID || ''
  ).trim()

  if (!expectedProjectId) {
    throw new Error(
      limitError('La aplicación no tiene configurado su proyecto Firebase.')
    )
  }

  const user = currentUser()

  if (!user) {
    throw new Error(
      limitError('No hay una sesión activa de Althea. Iniciá sesión con tu cuenta para utilizar la IA.')
    )
  }

  let tokenResult

  try {
    // Firebase renueva automáticamente el token cuando corresponde.
    tokenResult = await user.getIdTokenResult()
  } catch {
    throw new Error(
      limitError('Firebase no pudo validar tu sesión. Volvé a iniciar sesión en Althea.')
    )
  }

  const token = tokenResult?.token
  const tokenProjectId = tokenResult?.claims?.aud

  if (!token) {
    throw new Error(
      limitError('Firebase no devolvió un token de autenticación válido.')
    )
  }

  if (tokenProjectId !== expectedProjectId) {
    throw new Error(
      limitError(
        'La sesión pertenece a otro proyecto Firebase. Cerrá sesión e ingresá en el entorno correcto.'
      )
    )
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

export function hasAiSession(): boolean {
  return currentUser() !== null
}

export function isLimitError(message: string): boolean {
  return message.startsWith(LIMIT_PREFIX)
}

export function stripLimitPrefix(message: string): string {
  return message.startsWith(LIMIT_PREFIX)
    ? message.slice(LIMIT_PREFIX.length)
    : message
}

/**
 * Convierte errores HTTP del servicio central en mensajes comprensibles.
 */
export function aiLimitMessage(
  status: number,
  code?: string
): string | null {
  if (status === 401) {
    return limitError(
      'El servidor de IA rechazó el token de sesión. Cerrá sesión y volvé a iniciarla. Si continúa, revisá que la aplicación y el Worker utilicen el mismo proyecto Firebase.'
    )
  }

  if (status === 429) {
    return limitError(
      code === 'quota_exhausted'
        ? 'La IA está temporalmente limitada por cuota. Se renueva a las 00:00 UTC; probá de nuevo más tarde.'
        : 'La IA está temporalmente limitada. Probá de nuevo en unos segundos.'
    )
  }

  if (status === 503) {
    return limitError(
      'El servicio de IA no está disponible ahora. Probá más tarde.'
    )
  }

  return null
}
