/**
 * ALTHEA — Cloudflare Worker (servicio central de IA)
 *
 *   - POST /   -> Cloudflare Workers AI (@cf/google/gemma-4-26b-a4b-it)
 *   - OPTIONS  -> preflight CORS
 *
 * El usuario nunca aporta claves: el proveedor se llama exclusivamente desde
 * el servidor con el binding `AI`. La identidad se verifica en CADA petición
 * con el ID token de Firebase. El cliente no elige modelo, URL ni parámetros.
 *
 * Reglas duras heredadas y ampliadas:
 *   1. CORS fail-closed (nunca `*`), allowlist exacta por entorno.
 *   2. Sólo POST (+ OPTIONS), Content-Type application/json, body ≤64 KB.
 *   3. Esquema cerrado: sólo `messages` y `task` llegan al proveedor.
 *   4. Auth Firebase obligatoria; el `uid` verificado es la clave de cuota.
 *   5. Cuota: 20 req/min por usuario, 240 req/min globales, presupuesto
 *      diario de neuronas y concurrencia global, todo en Durable Objects.
 *   6. Errores sanitizados: nunca cuerpo del proveedor ni stack traces.
 *   7. Logs: sólo códigos/status. Nunca prompts, respuestas ni tokens.
 */

import { verifyFirebaseIdToken } from './firebase-auth.js'
import { estimateNeurons, reserveDailyNeurons, secondsUntilUtcMidnight } from './quota.js'
import { checkRateLimit } from './rate-limiter.js'
import { acquireSlot, releaseSlot, resetConcurrency } from './concurrency.js'

const MAX_BODY_BYTES = 64 * 1024
const DEFAULT_AI_TIMEOUT_MS = 60_000
const DEFAULT_ROUTINE_TIMEOUT_MS = 120_000
const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it'
const DEFAULT_MAX_CONCURRENCY = 6

/** Parámetros fijados por servidor según la función solicitada. */
const TASKS = {
  chat: {
    maxTokens: 512,
    stream: true,
    responseFormat: { type: 'text' },
  },
  routine: {
    maxTokens: 4096,
    stream: false,
    responseFormat: { type: 'json_object' },
  },
}

const MAX_MESSAGES = 40
const MAX_CONTENT_CHARS = 12_000
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant'])

export { checkRateLimit, resetMemoryRateLimits, RateLimiter, RATE_LIMIT_MODE } from './rate-limiter.js'
export { verifyFirebaseIdToken, resetJwksCache } from './firebase-auth.js'
export { estimateNeurons, reserveDailyNeurons, utcDayKey, secondsUntilUtcMidnight } from './quota.js'

const PER_USER_RATE_LIMIT = { max: 20, windowSeconds: 60, keyPrefix: 'ai:user' }
const GLOBAL_RATE_LIMIT = { max: 240, windowSeconds: 60, keyPrefix: 'ai:global' }

// ─────────────────────────────────────────────────────────────────────────────
// Respuestas y CORS
// ─────────────────────────────────────────────────────────────────────────────

export function parseAllowedOrigins(raw) {
  if (typeof raw !== 'string') return []
  const entries = raw.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
  if (entries.some((o) => o === '*')) return []
  return entries
}

export function resolveAllowedOrigin(requestOrigin, allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) return null
  if (requestOrigin === null || requestOrigin === undefined || requestOrigin === '') return null
  return allowed.includes(requestOrigin) ? requestOrigin : null
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function errorResponse(status, code, headers = {}) {
  return jsonResponse({ error: code }, status, headers)
}

export async function readBodyWithLimit(request, limitBytes) {
  const declared = request.headers.get('Content-Length')
  if (declared !== null) {
    const n = Number(declared)
    if (!Number.isFinite(n) || n < 0) return { ok: false, code: 'invalid_content_length' }
    if (n > limitBytes) return { ok: false, code: 'payload_too_large' }
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

export function isJsonContentType(contentType) {
  if (typeof contentType !== 'string') return false
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json'
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación del payload: el cliente sólo entrega mensajes y la función.
// ─────────────────────────────────────────────────────────────────────────────

export function validateChatPayload(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_payload' }
  }

  const ALLOWED_KEYS = new Set(['messages', 'task', 'model', 'max_tokens', 'temperature', 'top_p', 'stream'])
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, code: 'unexpected_field' }
  }

  const task = body.task === undefined ? 'chat' : body.task
  if (task !== 'chat' && task !== 'routine') {
    return { ok: false, code: 'invalid_task' }
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, code: 'invalid_messages' }
  if (messages.length > MAX_MESSAGES) return { ok: false, code: 'too_many_messages' }

  const out = []
  for (const m of messages) {
    if (m === null || typeof m !== 'object' || Array.isArray(m)) return { ok: false, code: 'invalid_message' }
    for (const key of Object.keys(m)) {
      if (key !== 'role' && key !== 'content') return { ok: false, code: 'unexpected_message_field' }
    }
    if (typeof m.role !== 'string' || !ALLOWED_ROLES.has(m.role)) return { ok: false, code: 'invalid_role' }
    if (typeof m.content !== 'string' || m.content.length === 0) return { ok: false, code: 'empty_content' }
    if (m.content.length > MAX_CONTENT_CHARS) return { ok: false, code: 'content_too_long' }
    out.push({ role: m.role, content: m.content })
  }

  return { ok: true, messages: out, task }
}

// ─────────────────────────────────────────────────────────────────────────────
// Autenticación
// ─────────────────────────────────────────────────────────────────────────────

async function authenticate(request, env, cors) {
  const header = request.headers.get('Authorization') || ''
  if (!header.startsWith('Bearer ')) {
    return { error: errorResponse(401, 'unauthorized', { ...cors, 'WWW-Authenticate': 'Bearer' }) }
  }
  const uid = await verifyFirebaseIdToken(header.slice(7).trim(), env.FIREBASE_PROJECT_ID)
  if (!uid) {
    return { error: errorResponse(401, 'unauthorized', { ...cors, 'WWW-Authenticate': 'Bearer' }) }
  }
  return { uid }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proveedor: Cloudflare Workers AI
// ─────────────────────────────────────────────────────────────────────────────

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('inference_timeout')
      e.inferenceTimeout = true
      reject(e)
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function isQuotaError(e) {
  const status = e && (e.status || (e.response && e.response.status))
  const code = String((e && e.code) || '')
  const message = String((e && e.message) || '')
  return status === 429 || code.includes('429') || message.includes('429') ||
    (/quota|rate.?limit|capacity/i.test(message) && /exceed|reached|exhaust/i.test(message))
}

async function handleAi(request, env, cors, timeoutMs, uid) {
  const userLimit = await checkRateLimit(env, uid, PER_USER_RATE_LIMIT, Date.now())
  const limitHeaders = {
    ...cors,
    'X-RateLimit-Limit': String(userLimit.limit),
    'X-RateLimit-Remaining': String(userLimit.remaining),
    'X-RateLimit-Reset': String(userLimit.resetSeconds),
    'X-RateLimit-Mode': userLimit.mode,
  }
  if (!userLimit.ok) {
    return errorResponse(429, 'rate_limited', { ...limitHeaders, 'Retry-After': String(userLimit.resetSeconds) })
  }

  const globalLimit = await checkRateLimit(env, 'all', GLOBAL_RATE_LIMIT, Date.now())
  if (!globalLimit.ok) {
    return errorResponse(429, 'global_rate_limited', {
      ...limitHeaders,
      'Retry-After': String(globalLimit.resetSeconds),
    })
  }

  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse(415, 'unsupported_media_type', limitHeaders)
  }

  const body = await readBodyWithLimit(request, MAX_BODY_BYTES)
  if (!body.ok) {
    if (body.code === 'payload_too_large') {
      return errorResponse(413, 'payload_too_large', {
        ...limitHeaders,
        'X-Max-Body-Bytes': String(MAX_BODY_BYTES),
      })
    }
    return errorResponse(400, 'invalid_request', limitHeaders)
  }

  let parsed
  try {
    parsed = JSON.parse(body.text)
  } catch {
    return errorResponse(400, 'invalid_json', limitHeaders)
  }

  const validated = validateChatPayload(parsed)
  if (!validated.ok) return errorResponse(422, validated.code, limitHeaders)

  // Las rutinas devuelven JSON completo y requieren más margen que el chat.
  // El límite se acota para evitar que una variable mal configurada deje slots retenidos.
  const configuredRoutineTimeout = Number(env.AI_ROUTINE_TIMEOUT_MS)
  const effectiveTimeoutMs = validated.task === 'routine'
    ? (Number.isFinite(configuredRoutineTimeout) && configuredRoutineTimeout > 0
      ? Math.min(configuredRoutineTimeout, 180_000)
      : DEFAULT_ROUTINE_TIMEOUT_MS)
    : timeoutMs

  if (!env.AI || typeof env.AI.run !== 'function') {
    return errorResponse(503, 'ai_not_configured', limitHeaders)
  }

  const maxConcurrency = Number(env.AI_MAX_CONCURRENCY) || DEFAULT_MAX_CONCURRENCY
  const slot = await acquireSlot(env, maxConcurrency, effectiveTimeoutMs + 15_000)
  if (!slot.ok) {
    return errorResponse(429, 'busy', { ...limitHeaders, 'Retry-After': '2' })
  }

  let quotaHeaders = {}
  try {
    const taskConfig = TASKS[validated.task]
    const cost = estimateNeurons(validated.messages, taskConfig.maxTokens)
    const quota = await reserveDailyNeurons(env, cost, Date.now())
    quotaHeaders = {
      'X-AI-Neurons-Reserved': String(cost),
      'X-AI-Budget-Remaining': String(quota.remaining),
      'X-AI-Budget-Mode': quota.degraded ? 'degraded' : 'enforced',
    }
    if (!quota.ok) {
      return errorResponse(429, 'quota_exhausted', {
        ...limitHeaders,
        ...quotaHeaders,
        'Retry-After': String(secondsUntilUtcMidnight()),
      })
    }

    const model = typeof env.AI_MODEL === 'string' && env.AI_MODEL.trim()
      ? env.AI_MODEL.trim()
      : DEFAULT_MODEL
    const input = {
      messages: validated.messages,
      max_completion_tokens: taskConfig.maxTokens,
      temperature: 0.7,
      top_p: 0.9,
      stream: taskConfig.stream,
      store: false,
      chat_template_kwargs: { enable_thinking: false },
      response_format: taskConfig.responseFormat,
      user: uid,
    }

    const result = await withTimeout(env.AI.run(model, input), effectiveTimeoutMs)
    const headers = {
      ...limitHeaders,
      ...quotaHeaders,
      'Cache-Control': 'no-store',
    }

    if (taskConfig.stream) {
      return new Response(result, {
        status: 200,
        headers: { ...headers, 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' },
      })
    }
    return jsonResponse(result, 200, headers)
  } catch (e) {
    if (e && e.inferenceTimeout) {
      return errorResponse(504, 'upstream_timeout', limitHeaders)
    }
    if (isQuotaError(e)) {
      console.warn('[althea-ai] provider status=429')
      return errorResponse(429, 'quota_exhausted', {
        ...limitHeaders,
        ...quotaHeaders,
        'Retry-After': String(secondsUntilUtcMidnight()),
      })
    }
    // Sólo el código, nunca el mensaje: el proveedor puede incluir detalles
    // de cuenta ni se registran prompts ni respuestas.
    console.warn('[althea-ai] provider_error status=' + String((e && e.status) || 'unknown'))
    return errorResponse(502, 'upstream_error', limitHeaders)
  } finally {
    await releaseSlot(env, slot)
  }
}

// Solo para tests: reinicia el fallback de concurrencia en memoria.
export { resetConcurrency }

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env = {}) {
    const allowedOrigins = parseAllowedOrigins(env.CORS_ORIGIN)
    if (allowedOrigins.length === 0) return errorResponse(500, 'cors_not_configured')

    const requestOrigin = request.headers.get('Origin')
    const origin = resolveAllowedOrigin(requestOrigin, allowedOrigins)
    if (origin === null && requestOrigin) return errorResponse(403, 'forbidden_origin')
    const cors = origin ? corsHeaders(origin) : {}

    if (request.method === 'OPTIONS') {
      if (origin === null) return errorResponse(403, 'forbidden_origin')
      return new Response(null, { status: 204, headers: { ...cors, Allow: 'POST, OPTIONS' } })
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { ...cors, Allow: 'POST, OPTIONS' })
    }

    const identity = await authenticate(request, env, cors)
    if (identity.error) return identity.error

    const timeoutMs = Number(env.AI_TIMEOUT_MS) || DEFAULT_AI_TIMEOUT_MS
    return handleAi(request, env, cors, timeoutMs, identity.uid)
  },
}
