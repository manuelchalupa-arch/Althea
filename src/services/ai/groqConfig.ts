// Proxy de IA: si no hay URL configurada en el entorno, se usa el proxy de
// producción (única fuente de verdad, siempre activo). Así el Coach queda
// en línea tanto en local como en Netlify sin configuración manual.
const DEFAULT_PROXY_URL = 'https://althea-proxy-production.manuelchalupa.workers.dev'

const PROXY_URL = (() => {
  const fromEnv = import.meta.env.VITE_GROQ_PROXY_URL
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim()
  }
  return DEFAULT_PROXY_URL
})()

// Sin clave en frontend: si no hay proxy, no hay llamada directa a Groq.
export function getGroqUrl(): string {
  return PROXY_URL
}

// El Authorization/Bearer lo agrega el proxy del lado servidor, nunca acá.
export function getGroqHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}
