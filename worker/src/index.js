/**
 * ALTHEA — Cloudflare Worker (edge proxy)
 *
 * Arranque:
 *   - POST /                      -> proxy Groq (chat completion, SSE)
 *
 * Principio de diseño (§3-§10 del prompt de cierre):
 *   El Worker es un proxy CONTROLADO, no un relay HTTP genérico.
 *   Nada de lo que llega del cliente decide URL de proveedor, modelo,
 *   headers, credenciales ni destino. Todo eso es server-side.
 *
 * Reglas duras:
 *   1. CORS fail-closed: sin `CORS_ORIGIN` configurado => 500. Nunca `*`.
 *      Nunca se refleja el Origin del request sin compararlo contra la
 *      allowlist exacta. Lista separada por entorno (staging/production).
 *   2. Métodos: sólo POST (+ OPTIONS para preflight). 405 con `Allow`.
 *   3. Content-Type: `application/json` obligatorio en POST. Otro => 415.
 *   4. Body size: límite explícito (MAX_BODY_BYTES). Excedido => 413.
 *      El tamaño se mira en `Content-Length` ANTES de leer, y se recorta
 *      el stream en bytes como segunda barrera (Content-Length es falsificable).
 *   5. Payload: esquema cerrado. Se reenvía SÓLO lo validado. El cliente no
 *      puede elegir modelo, URL, headers ni campos extra.
 *   6. Timeout: AbortController en toda llamada saliente => 504.
 *   7. Errores: nunca se devuelve el cuerpo upstream ni stack traces.
 *   8. Rate limit: tres capas, se usa la más fuerte disponible y se declara
 *      cuál se usó en `X-RateLimit-Mode`.
 *        a) Durable Object (strongly consistent, boundary de seguridad real).
 *        b) KV namespace (eventualmente consistente; degrada de (a)).
 *        c) Memoria del isolate (sin garantía; sólo desarrollo).
 *      Ninguna capa degrada en silencio: el modo va siempre en la respuesta.
 */

import { checkRateLimit } from './rate-limiter.js'

// ───────────────────────────────────────────────────────────────────────────
// Límites (valores documentados a propósito; ver docs/INFRAESTRUCTURA.md)
// ───────────────────────────────────────────────────────────────────────────

/** Body máx del endpoint Groq. El Coach manda system prompt + contexto real;
 *  con max_tokens=512 el payload real ronda 2-8 KB. 64 KB es holgado y
 *  sigue siendo pequeño frente a un payload abusivo. */
const MAX_BODY_BYTES = 64 * 1024 // 65536

/** Timeout por defecto de la llamada a Groq (ms). Configurable por entorno. */
const DEFAULT_GROQ_TIMEOUT_MS = 60_000

/** Modelo fijado por servidor. El cliente NUNCA lo elige. */
const GROQ_MODEL = 'openai/gpt-oss-20b'

/** Params de generación: los fija el servidor, no el cliente. */
const GROQ_MAX_TOKENS = 512
const GROQ_TEMPERATURE = 0.7
const GROQ_TOP_P = 0.9

/** Esquema de mensajes del Coach. */
const MAX_MESSAGES = 40
const MAX_CONTENT_CHARS = 12_000
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant'])

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────
// La implementación vive en ./rate-limiter.js (capa DO + KV + memoria).
// Se re-exporta aquí porque el entry point es lo que Wrangler despliega.

export { checkRateLimit, resetMemoryRateLimits, RateLimiter, RATE_LIMIT_MODE } from './rate-limiter.js'

/** Rate limit por defecto del endpoint Groq (capa DO/KV). */
const RATE_LIMIT = {
  max: 20, // requests
  windowSeconds: 60, // por minuto
  keyPrefix: 'rl:groq',
}

// ───────────────────────────────────────────────────────────────────────────
// Utilidades de respuesta
// ───────────────────────────────────────────────────────────────────────────

/**
 * Extrae la allowlist de origins desde `CORS_ORIGIN`.
 * Acepta lista separada por coma. Nunca devuelve `*` ni vacío-como-wildcard.
 *
 * Si la configuración contiene un wildcard, se devuelve `[]` (config inválida)
 * en vez de una lista parcial: una config con `*` es un error de despliegue y
 * debe fallar ruidosamente, no aceptarse en silencio con la mitad de los hosts.
 *
 * @param {string | undefined | null} raw
 * @returns {string[]}
 */
export function parseAllowedOrigins(raw) {
  if (typeof raw !== 'string') return []
  const entries = raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
  if (entries.some((o) => o === '*')) return []
  return entries
}

/**
 * Fail-closed. Devuelve el origin permitido si `requestOrigin` está en la
 * allowlist exacta. `null` si no hay configuración o no coincide.
 *
 * Requests sin `Origin` (mismo origen, curl, health checks): se permiten
 * SOLO si no llevan Origin — el navegador siempre manda Origin en cross-origin,
 * así que la ausencia de Origin no es un hueco de CORS para el browser.
 * @param {string | undefined | null} requestOrigin
 * @param {string[] | undefined | null} allowed
 * @returns {string | null}
 */
export function resolveAllowedOrigin(requestOrigin, allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) return null
  // Sin Origin: request same-origin / no-browser. No es un bypass de CORS
  // porque el control real de credenciales lo hace SameSite + cookies.
  if (requestOrigin === null || requestOrigin === undefined || requestOrigin === '') {
    return null
  }
  return allowed.includes(requestOrigin) ? requestOrigin : null
}

/** Headers de CORS para un origin ya resuelto. */
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

/** Solo los headers de respuesta que el Worker controla. Nunca upstream. */
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

/**
 * Error controlado. `detail` es un código corto y estable, nunca texto de
 * upstream ni información de infraestructura.
 */
function errorResponse(status, code, headers = {}) {
  return jsonResponse({ error: code }, status, headers)
}

/**
 * Lee el body con un tope duro en bytes. `Content-Length` se usa como atajo
 * barato, pero NO es de fiar: si miente, el stream se corta igual.
 * @returns {Promise<{ ok: true, text: string } | { ok: false, code: string }>}
 */
export async function readBodyWithLimit(request, limitBytes) {
  const declared = request.headers.get('Content-Length')
  if (declared !== null) {
    const n = Number(declared)
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, code: 'invalid_content_length' }
    }
    if (n > limitBytes) {
      return { ok: false, code: 'payload_too_large' }
    }
  }

  if (!request.body) return { ok: true, text: '' }

  const reader = request.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limitBytes) {
        // Cancel explícito: no seguimos drenando de un body abusivo.
        await reader.cancel().catch(() => {})
        return { ok: false, code: 'payload_too_large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, code: 'body_read_error' }
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(merged) }
}

/** `application/json` (con o sin parámetros tipo charset). */
export function isJsonContentType(contentType) {
  if (typeof contentType !== 'string') return false
  const mime = contentType.split(';')[0].trim().toLowerCase()
  return mime === 'application/json'
}

// ───────────────────────────────────────────────────────────────────────────
// Validación de payload (Groq) — esquema cerrado
// ───────────────────────────────────────────────────────────────────────────

/**
 * Valida y NORMALIZA el body del Coach. Devuelve únicamente lo que se va a
 * reenviar — el modelo y los params de generación los pone el servidor.
 *
 * @param {unknown} body
 * @returns {{ ok: true, messages: Array<{role: string, content: string}> }
 *          | { ok: false, code: string }}
 */
export function validateChatPayload(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_payload' }
  }

  // El cliente sólo aporta `messages`. Las claves de provider que el frontend
  // ya envía (model, max_tokens, temperature, top_p, stream) se ACEPTAN pero se
  // IGNORAN: el servidor es quien las fija. Así el proxy sigue siendo
  // controlado sin romper el contrato actual del cliente Coach.
  const ALLOWED_KEYS = new Set([
    'messages',
    'model',
    'max_tokens',
    'temperature',
    'top_p',
    'stream',
  ])
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      // El cliente intentó controlar url/api_key/headers/modelo libre/lo que sea.
      return { ok: false, code: 'unexpected_field' }
    }
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, code: 'invalid_messages' }
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, code: 'too_many_messages' }
  }

  const out = []
  let totalChars = 0

  for (const m of messages) {
    if (m === null || typeof m !== 'object' || Array.isArray(m)) {
      return { ok: false, code: 'invalid_message' }
    }
    // Sin campos extra por mensaje: nada de `name`, `function_call`, etc.
    for (const key of Object.keys(m)) {
      if (key !== 'role' && key !== 'content') {
        return { ok: false, code: 'unexpected_message_field' }
      }
    }
    const { role, content } = m
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
      return { ok: false, code: 'invalid_role' }
    }
    if (typeof content !== 'string') {
      return { ok: false, code: 'invalid_content' }
    }
    if (content.length === 0) {
      return { ok: false, code: 'empty_content' }
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return { ok: false, code: 'content_too_long' }
    }
    totalChars += content.length
    out.push({ role, content })
  }

  return { ok: true, messages: out }
}

// ───────────────────────────────────────────────────────────────────────────
// Rate limiting — ver ./rate-limiter.js
// ───────────────────────────────────────────────────────────────────────────

/** Identidad para rate limit: IP del cliente (CF la normaliza). */
function clientKey(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

// ───────────────────────────────────────────────────────────────────────────
// Fetch con timeout
// ───────────────────────────────────────────────────────────────────────────

/**
 * `fetch` con AbortController. Nunca deja una request externa abierta.
 * @returns {Promise<Response | { timeout: true } | { error: true }>}
 */
export async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } catch (e) {
    if (e && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      return { timeout: true }
    }
    return { error: true }
  } finally {
    clearTimeout(timer)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Groq endpoint
// ───────────────────────────────────────────────────────────────────────────

async function handleGroq(request, env, cors, timeoutMs) {
  const rl = await checkRateLimit(env, clientKey(request), RATE_LIMIT, Date.now())
  const rlHeaders = {
    ...cors,
    'X-RateLimit-Limit': String(rl.limit),
    'X-RateLimit-Remaining': String(rl.remaining),
    'X-RateLimit-Reset': String(rl.resetSeconds),
    'X-RateLimit-Mode': rl.mode,
  }
  if (!rl.ok) {
    return errorResponse(429, 'rate_limited', { ...rlHeaders, 'Retry-After': String(rl.resetSeconds) })
  }

  // Content-Type obligatorio.
  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse(415, 'unsupported_media_type', rlHeaders)
  }

  // Body con tope duro.
  const body = await readBodyWithLimit(request, MAX_BODY_BYTES)
  if (!body.ok) {
    if (body.code === 'payload_too_large') {
      return errorResponse(413, 'payload_too_large', {
        ...rlHeaders,
        'X-Max-Body-Bytes': String(MAX_BODY_BYTES),
      })
    }
    return errorResponse(400, 'invalid_request', rlHeaders)
  }

  let parsed
  try {
    parsed = JSON.parse(body.text)
  } catch {
    return errorResponse(400, 'invalid_json', rlHeaders)
  }

  // Esquema cerrado: se reenvía SÓLO messages validadas.
  const validated = validateChatPayload(parsed)
  if (!validated.ok) {
    return errorResponse(422, validated.code, rlHeaders)
  }

  const GROQ_API_KEY = env.GROQ_API_KEY
  if (!GROQ_API_KEY) {
    // No se revela nada del entorno, sólo que falta configuración.
    return errorResponse(503, 'proxy_not_configured', rlHeaders)
  }

  // URL de proveedor: server-side. Configurada en wrangler, nunca del cliente.
  const GROQ_URL = env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions'

  // Payload reconstruido por el servidor: modelo y params NO son del cliente.
  const upstreamBody = JSON.stringify({
    model: GROQ_MODEL,
    messages: validated.messages,
    max_tokens: GROQ_MAX_TOKENS,
    temperature: GROQ_TEMPERATURE,
    top_p: GROQ_TOP_P,
    stream: true,
  })

  const upstream = await fetchWithTimeout(
    GROQ_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: upstreamBody,
      redirect: 'follow',
    },
    timeoutMs,
  )

  if (upstream.timeout) return errorResponse(504, 'upstream_timeout', rlHeaders)
  if (upstream.error) return errorResponse(502, 'upstream_error', rlHeaders)

  if (!upstream.ok) {
    // NO se reenvía el body de Groq (puede filtrar detalle de cuenta/modelo).
    // Se registra sólo el status, que es seguro.
    console.warn(`[althea-worker] groq upstream status=${upstream.status}`)
    return errorResponse(502, 'upstream_error', rlHeaders)
  }

  // SSE: se retransmite el stream, pero sólo con Content-Type controlado.
  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/event-stream')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Accel-Buffering', 'no')
  for (const [k, v] of Object.entries(rlHeaders)) headers.set(k, v)

  return new Response(upstream.body, { status: 200, headers })
}

// ───────────────────────────────────────────────────────────────────────────
// Router
// ───────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url)
    const path = url.pathname

    // ── 1. CORS fail-closed ───────────────────────────────────────────
    const allowedOrigins = parseAllowedOrigins(env.CORS_ORIGIN)
    if (allowedOrigins.length === 0) {
      // Sin allowlist no hay servicio. Fail-closed, sin fallback a `*`.
      return errorResponse(500, 'cors_not_configured')
    }

    const requestOrigin = request.headers.get('Origin')
    const origin = resolveAllowedOrigin(requestOrigin, allowedOrigins)
    if (origin === null) {
      // Origin ausente (same-origin/no-browser) o no permitido.
      if (requestOrigin) return errorResponse(403, 'forbidden_origin')
    }

    const cors = origin ? corsHeaders(origin) : {}

    // ── 2. Preflight ──────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      if (origin === null) return errorResponse(403, 'forbidden_origin')
      return new Response(null, { status: 204, headers: { ...cors, Allow: 'POST, OPTIONS' } })
    }

    // ── 3. Groq (POST /) ─────────────────────────────────────────────
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { ...cors, Allow: 'POST, OPTIONS' })
    }

    const timeoutMs = Number(env.GROQ_TIMEOUT_MS) || DEFAULT_GROQ_TIMEOUT_MS
    return handleGroq(request, env, cors, timeoutMs)
  },
}
