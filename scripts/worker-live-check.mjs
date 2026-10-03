/**
 * ALTHEA — Verificación LIVE del Worker de staging.
 *
 * Ejecuta la matriz de seguridad real contra el Worker DESPLEGADO. Esto es
 * STAGING-VALIDATED: pruebas contra el servicio real, no inspección de código.
 *
 * Qué puede validarse sin `GROQ_API_KEY` (que es secret del propietario):
 *   CORS, métodos, Content-Type, límite de body, validación de payload,
 *   rate limiting y el comportamiento fail-closed cuando falta el secret.
 *
 * Qué NO puede validarse sin el secret:
 *   el flujo real Groq (timeout 504, error upstream 502, respuesta 200).
 *   Esos se marcan NOT VALIDATED, nunca PASS.
 *
 * NO imprime secretos. NO despliega. NO toca producción.
 *
 * Uso:
 *   node scripts/worker-live-check.mjs <WORKER_URL> <ALLOWED_ORIGIN> [--skip-wait]
 */

import process from 'node:process'

const url = process.argv[2]
const allowedOrigin = process.argv[3]
const skipWait = process.argv.includes('--skip-wait')

if (!url || !allowedOrigin) {
  console.error('uso: node scripts/worker-live-check.mjs <WORKER_URL> <ALLOWED_ORIGIN> [--skip-wait]')
  process.exit(1)
}

const EVIL_ORIGIN = 'https://attacker.example'
const results = []
let failures = 0
let notValidated = 0

function record(section, name, expected, actual, extra = '') {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected
  const status = ok ? 'PASS' : 'FAIL'
  if (!ok) failures++
  results.push({ section, name, expected: String(expected), actual: String(actual), status, extra })
  console.log(`  [${status}] ${name} — esperado ${expected}, obtenido ${actual}${extra ? ` ${extra}` : ''}`)
}

function skip(section, name, reason) {
  notValidated++
  results.push({ section, name, expected: 'live', actual: 'not validated', status: 'NOT VALIDATED', extra: reason })
  console.log(`  [NOT VALIDATED] ${name} — ${reason}`)
}

/** POST / con body JSON válido y Origin dado. */
function post(bodyText, { origin = allowedOrigin, contentType = 'application/json' } = {}) {
  const headers = { Origin: origin }
  if (contentType) headers['Content-Type'] = contentType
  return fetch(url, { method: 'POST', headers, body: bodyText })
}

const validChat = JSON.stringify({
  messages: [
    { role: 'system', content: 'Eres un asistente.' },
    { role: 'user', content: 'hola' },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n=== WORKER LIVE CHECK ===`)
console.log(`worker   = ${url}`)
console.log(`origin   = ${allowedOrigin}`)
console.log('─'.repeat(66))

// ── Fase A: controles que no consumen cuota (CORS y métodos) ────────────────
console.log('\n[A] CORS fail-closed (no consume cuota de rate limit)')

{
  const res = await fetch(url, { method: 'OPTIONS', headers: { Origin: allowedOrigin } })
  record('CORS', 'OPTIONS con origin permitido', 204, res.status)
  record('CORS', 'OPTIONS expone ACAO al origin permitido', allowedOrigin, res.headers.get('access-control-allow-origin'))
}

{
  const res = await fetch(url, { method: 'OPTIONS', headers: { Origin: EVIL_ORIGIN } })
  record('CORS', 'OPTIONS con origin NO permitido', 403, res.status)
}

{
  const res = await post(validChat, { origin: EVIL_ORIGIN })
  record('CORS', 'POST con origin NO permitido', 403, res.status)
  const body = await res.text()
  record('CORS', 'el 403 no filtra información interna', false, /groq|api_key|stack|at \w+ \(/.test(body))
}

console.log('\n[B] Métodos HTTP (no consume cuota)')

for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
  const res = await fetch(url, { method, headers: { Origin: allowedOrigin } })
  record('METODOS', `${method} en POST /`, 405, res.status)
  if (method === 'GET') {
    record('METODOS', '405 incluye header Allow', true, (res.headers.get('allow') || '').includes('POST'))
  }
}

// ── Fase B: controles que SÍ consumen cuota (una vez cada uno) ─────────────
console.log('\n[C] Content-Type, body limit y validación de payload (consumen cuota)')

record('CONTENT_TYPE', 'POST sin Content-Type', 415, (await post(validChat, { contentType: null })).status)
record('CONTENT_TYPE', 'POST con text/plain', 415, (await post(validChat, { contentType: 'text/plain' })).status)
record(
  'CONTENT_TYPE',
  'POST con application/json; charset=utf-8 (debe pasar la comprobación)',
  [503, 502, 504, 200],
  (await post(validChat, { contentType: 'application/json; charset=utf-8' })).status,
)

{
  const huge = JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(70 * 1024) }] })
  const res = await post(huge)
  record('BODY_LIMIT', 'body > 64 KB', 413, res.status)
}

{
  const res = await post(JSON.stringify({ messages: [{ role: 'user', content: 'hola' }], api_key: 'x' }))
  record('PAYLOAD', 'campo inesperado (api_key)', 422, res.status)
}

{
  const res = await post(JSON.stringify({ messages: [{ role: 'system', content: 'ok' }, { role: 'admin', content: 'x' }] }))
  record('PAYLOAD', 'rol no permitido', 422, res.status)
}

{
  const many = Array.from({ length: 60 }, () => ({ role: 'user', content: 'x' }))
  const res = await post(JSON.stringify({ messages: many }))
  record('PAYLOAD', 'demasiados mensajes (>40)', 422, res.status)
}

{
  const res = await post(JSON.stringify({ messages: [] }))
  record('PAYLOAD', 'array de mensajes vacío', 422, res.status)
}

{
  // El cliente no puede elegir modelo ni parámetros de generación.
  const res = await post(JSON.stringify({ messages: [{ role: 'user', content: 'hola' }], model: 'attacker-model', temperature: 2 }))
  const accepted = [503, 502, 504, 200].includes(res.status)
  record('PAYLOAD', 'model/temperature del cliente no rompen el proxy', true, accepted)
}

// ── Fail-closed del secret ────────────────────────────────────────────────
console.log('\n[D] Secret server-side (fail-closed)')
{
  const res = await post(validChat)
  const status = res.status
  const body = await res.text()
  if (status === 503) {
    record('SECRET', 'sin GROQ_API_KEY el proxy responde 503 fail-closed', 503, status)
    record('SECRET', 'el 503 no revela la clave', false, /gsk_|api\.groq\.com|secret/i.test(body))
  } else {
    record('SECRET', 'sin GROQ_API_KEY el proxy responde 503 fail-closed', 503, status, '(el secret ya está configurado)')
  }
}

// ── Fase C: rate limiting real ────────────────────────────────────────────
console.log('\n[E] Rate limiting real')

if (!skipWait) {
  console.log('  (esperando a que expire la ventana de rate limit de la fase B: 65s)')
  await new Promise((r) => setTimeout(r, 65_000))
}

{
  // El límite configurado para Groq es 20/min por IP. Se supera a propósito.
  let limited = null
  let firstHeaders = null
  const LIMIT = 26
  for (let i = 0; i < LIMIT; i++) {
    const res = await post(validChat)
    if (i === 0) firstHeaders = res.headers
    if (res.status === 429 && !limited) {
      limited = {
        status: 429,
        retryAfter: res.headers.get('retry-after'),
        limit: res.headers.get('x-ratelimit-limit'),
        remaining: res.headers.get('x-ratelimit-remaining'),
        reset: res.headers.get('x-ratelimit-reset'),
        mode: res.headers.get('x-ratelimit-mode'),
      }
      break
    }
  }

  if (limited) {
    record('RATE_LIMIT', 'se alcanza el límite y responde 429', 429, limited.status)
    record('RATE_LIMIT', '429 incluye Retry-After', true, !!limited.retryAfter)
    record('RATE_LIMIT', '429 incluye X-RateLimit-Limit', true, !!limited.limit)
    record('RATE_LIMIT', '429 reporta remaining=0', '0', limited.remaining)
    record('RATE_LIMIT', 'la capa usada queda declarada', true, !!limited.mode, `(mode=${limited.mode})`)
  } else {
    record('RATE_LIMIT', 'se alcanza el límite y responde 429', 429, 'sin 429 en ' + LIMIT + ' requests')
  }

  record('RATE_LIMIT', 'X-RateLimit-Limit = 20 (configurado)', '20', firstHeaders?.get('x-ratelimit-limit'))
  record(
    'RATE_LIMIT',
    'la primera respuesta declara la capa de rate limit',
    true,
    !!firstHeaders?.get('x-ratelimit-mode'),
    `(mode=${firstHeaders?.get('x-ratelimit-mode')})`,
  )
}

// ── Lo que no se puede validar sin el secret ──────────────────────────────
console.log('\n[F] Flujo Groq real (requiere GROQ_API_KEY del propietario)')
skip('GROQ_E2E', 'respuesta 200 con contenido del modelo', 'falta GROQ_API_KEY en el Worker de staging')
skip('GROQ_E2E', 'timeout upstream devuelve 504', 'falta GROQ_API_KEY en el Worker de staging')
skip('GROQ_E2E', 'error upstream devuelve 502 sanitizado', 'falta GROQ_API_KEY en el Worker de staging')
skip('COACH_E2E', 'frontend → Worker → Groq → frontend', 'falta GROQ_API_KEY y frontend en staging')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(66))
const passed = results.filter((r) => r.status === 'PASS').length
console.log(`PASS=${passed}  FAIL=${failures}  NOT VALIDATED=${notValidated}`)
console.log(`WORKER LIVE CHECK = ${failures === 0 ? 'PASS (parcial: Groq E2E sin secret)' : 'FAIL'}`)
process.exit(failures === 0 ? 0 : 1)
