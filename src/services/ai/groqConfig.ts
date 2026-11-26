const WORKERS: Record<string, string> = {
  'althea-stg':
    'https://althea-proxy-staging.manuelchalupa.workers.dev',

  'althea-4b1d0':
    'https://althea-proxy-production.manuelchalupa.workers.dev',
}

export function getProxyUrl(): string {
  const projectId = String(
    import.meta.env.VITE_FIREBASE_PROJECT_ID || ''
  ).trim()

  const configuredUrl = String(
    import.meta.env.VITE_GROQ_PROXY_URL || ''
  ).trim()

  const expectedUrl = WORKERS[projectId]

  if (!expectedUrl) {
    throw new Error(
      'Proyecto Firebase no reconocido para el servicio de IA.'
    )
  }

  if (!configuredUrl) {
    throw new Error(
      'Falta configurar la URL del servicio de IA.'
    )
  }

  let actualOrigin: string

  try {
    actualOrigin = new URL(configuredUrl).origin
  } catch {
    throw new Error('La URL del servicio de IA es inválida.')
  }

  if (actualOrigin !== expectedUrl) {
    throw new Error(
      'La URL del servicio de IA no corresponde al entorno actual.'
    )
  }

  return expectedUrl
}

export function getGroqHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  }
}
