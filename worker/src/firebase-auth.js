/**
 * ALTHEA — Verificación del ID token de Firebase en el Worker.
 *
 * No se confía en el `uid` que envía el cliente: se verifica la firma RS256
 * contra las claves públicas de Google y se comprueban `aud`, `iss` y `exp`.
 * Solo se cachean las claves públicas (nunca tokens ni datos de conversación).
 */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const KEYS_TTL_MS = 60 * 60 * 1000

let cachedKeys = null

function base64UrlToBytes(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function decodePart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)))
}

async function getPublicKeys() {
  if (cachedKeys && Date.now() < cachedKeys.expiresAt) {
    return cachedKeys.keys
  }

  try {
    const res = await fetch(JWKS_URL)
    if (!res.ok) throw new Error('jwks_status')
    const jwks = await res.json()
    const keys = new Map()
    for (const jwk of jwks.keys || []) {
      if (jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || typeof jwk.kid !== 'string') continue
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      keys.set(jwk.kid, key)
    }
    if (keys.size === 0) throw new Error('jwks_empty')
    cachedKeys = { keys, expiresAt: Date.now() + KEYS_TTL_MS }
    return keys
  } catch {
    // Si ya teníamos claves, se reutilizan aunque estén vencidas: es mejor
    // rechazar firmas con claves rotadas que dejar sin IA a todos por un
    // fallo de red. Las claves caducan solas cuando vuelve la conexión.
    if (cachedKeys && cachedKeys.keys.size > 0) return cachedKeys.keys
    throw new Error('jwks_unavailable')
  }
}

/** Devuelve el `uid` del usuario, o `null` si el token no es válido. */
export async function verifyFirebaseIdToken(token, projectId) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 8192) return null
  if (typeof projectId !== 'string' || projectId.trim().length === 0) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  let header, payload
  try {
    header = decodePart(parts[0])
    payload = decodePart(parts[1])
  } catch {
    return null
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null

  let key
  try {
    key = (await getPublicKeys()).get(header.kid)
  } catch {
    return null
  }
  if (!key) return null

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  let signatureValid = false
  try {
    signatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlToBytes(parts[2]),
      signed,
    )
  } catch {
    return null
  }
  if (!signatureValid) return null

  const now = Math.floor(Date.now() / 1000)
  if (payload.aud !== projectId) return null
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) return null
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null

  return payload.sub
}

/** Solo para tests: descarta la caché de claves públicas. */
export function resetJwksCache() {
  cachedKeys = null
}
