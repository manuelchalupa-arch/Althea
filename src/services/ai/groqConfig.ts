const PROXY_URL = (() => {
  try { return (import.meta as any).env?.VITE_GROQ_PROXY_URL || '' } catch { return '' }
})()

const DIRECT_URL = 'https://api.groq.com/openai/v1/chat/completions'

export function getGroqUrl(): string {
  return PROXY_URL || DIRECT_URL
}

export function getGroqHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!PROXY_URL) {
    const key = (() => {
      try { return (import.meta as any).env?.VITE_GROQ_API_KEY || '' } catch { return '' }
    })()
    if (key) headers['Authorization'] = `Bearer ${key}`
  }
  return headers
}

export function isProxyConfigured(): boolean {
  return !!PROXY_URL
}
