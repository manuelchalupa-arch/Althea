const PROXY_URL = (() => {
  try { return import.meta.env.VITE_GROQ_PROXY_URL || '' } catch { return '' }
})()

// Sin clave en frontend: si no hay proxy, no hay llamada directa a Groq.
export function getGroqUrl(): string {
  return PROXY_URL
}

// El Authorization/Bearer lo agrega el proxy del lado servidor, nunca acá.
export function getGroqHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

export function isProxyConfigured(): boolean {
  return !!PROXY_URL
}