/**
 * ALTHEA — Verificación LIVE del Worker de staging.
 *
 * Ejecuta la matriz de seguridad real contra el Worker DESPLEGADO. Esto es
 * STAGING-VALIDATED: pruebas contra el servicio real, no inspección de código.
 *
 * El Worker exige el ID token de Firebase en cada petición. Se toma de
 * `ALTHEA_AI_ID_TOKEN` (token de una sesión real). Sin él se validan CORS,
 * métodos, Content-Type y el fail-closed de autenticación; el resto se marca
 * NOT VALIDATED, nunca PASS.
 *
 * NO imprime tokens. NO despliega. NO toca producción.
 *
 * Uso:
 *   ALTHEA_AI_ID_TOKEN=<idToken> node scripts/worker-live-check.mjs <WORKER_URL> <ALLOWED_ORIGIN> [--skip-wait]
 */

import process from 'node:process'

const url = process.argv[2]
const allowedOrigin = process.argv[3]
const skipWait = process.argv.includes('--skip-wait')
const idToken = process.env.ALTHEA_AI_ID_TOKEN || ''

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
  if (idToken) headers.Authorization = `Bearer ${idToken}`
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

// ── Fail-closed de autenticación ──────────────────────────────────────────
console.log('\n[C] Identidad del usuario (fail-closed)')
if (idToken) {
  console.log('  token de sesión presente; el resto de la matriz usa identidad verificada')
} else {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: validChat,
  })
  record('AUTH', 'sin ID token el Worker responde 401', 401, res.status)
  record('AUTH', 'el error no revela credenciales', false, /gsk_|api\.groq\.com|secret/i.test(await res.text()))
}

// ── Validación de payload (requiere identidad verificada) ─────────────────
console.log('\n[D] Content-Type, body limit y validación de payload')
if (!idToken) {
  for (const name of [
    'POST sin Content-Type -> 415',
    'POST con text/plain -> 415',
    'body > 64 KB -> 413',
    'campo inesperado -> 422',
    'rol no permitido -> 422',
    'demasiados mensajes -> 422',
    'mensajes vacíos -> 422',
  ]) {
    skip('PAYLOAD', name, 'se necesita ALTHEA_AI_ID_TOKEN')
  }
} else {
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
    record('BODY_LIMIT', 'body > 64 KB', 413, (await post(huge)).status)
  }
  record(
    'PAYLOAD',
    'campo inesperado (api_key)',
    422,
    (await post(JSON.stringify({ messages: [{ role: 'user', content: 'hola' }], api_key: 'x' }))).status,
  )
  record(
    'PAYLOAD',
    'rol no permitido',
    422,
    (await post(JSON.stringify({ messages: [{ role: 'system', content: 'ok' }, { role: 'admin', content: 'x' }] }))).status,
  )
  {
    const many = Array.from({ length: 60 }, () => ({ role: 'user', content: 'x' }))
    record('PAYLOAD', 'demasiados mensajes (>40)', 422, (await post(JSON.stringify({ messages: many }))).status)
  }
  record('PAYLOAD', 'array de mensajes vacío', 422, (await post(JSON.stringify({ messages: [] }))).status)
  {
    // El cliente no puede elegir modelo ni parámetros de generación.
    const res = await post(JSON.stringify({ messages: [{ role: 'user', content: 'hola' }], model: 'attacker-model', temperature: 2 }))
    const accepted = [503, 502, 504, 200].includes(res.status)
    record('PAYLOAD', 'model/temperature del cliente no rompen el proxy', true, accepted)
  }
}

// ── Fase C: rate limiting real ────────────────────────────────────────────
console.log('\n[E] Rate limiting real')
if (!idToken) {
  skip('RATE_LIMIT', 'se alcanza el límite y responde 429', 'se necesita ALTHEA_AI_ID_TOKEN')
  skip('RATE_LIMIT', 'cabeceras X-RateLimit-*', 'se necesita ALTHEA_AI_ID_TOKEN')
} else {
  if (!skipWait) {
    console.log('  (esperando a que expire la ventana de rate limit: 65s)')
    await new Promise((r) => setTimeout(r, 65_000))
  }

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

// ── Flujo real del proveedor ──────────────────────────────────────────────
console.log('\n[F] Cloudflare Workers AI (Gemma 4)')
if (!idToken) {
  skip('AI_E2E', 'Coach: 200 + SSE con contenido', 'se necesita ALTHEA_AI_ID_TOKEN')
  skip('AI_E2E', 'Rutinas: JSON válido', 'se necesita ALTHEA_AI_ID_TOKEN')
  skip('AI_E2E', 'consumo real de neuronas', 'se necesita ALTHEA_AI_ID_TOKEN')
} else {
  {
    const res = await post(validChat)
    const body = await res.text()
    const ct = res.headers.get('content-type') || ''
    record('AI_E2E', 'Coach responde 200', 200, res.status)
    record('AI_E2E', 'la respuesta es SSE', true, ct.includes('text/event-stream'))
    record('AI_E2E', 'el SSE trae contenido del modelo', true, /"content"\s*:\s*"[^"]+/.test(body))
    record('AI_E2E', 'el modelo es Gemma 4', true, /gemma-4/i.test(body), '')
  }
  {
    const res = await post(JSON.stringify({
      task: 'routine',
      messages: [{ role: 'user', content: 'Devuelve SOLO este JSON: {"ok":true}' }],
    }))
    const text = await res.text()
    record('AI_E2E', 'Rutinas responde 200', 200, res.status)
    let content = ''
    try {
      content = JSON.parse(text)?.choices?.[0]?.message?.content || ''
    } catch {}
    let validJson = false
    try {
      validJson = typeof JSON.parse(content) === 'object'
    } catch {}
    record('AI_E2E', 'el contenido es JSON parseable', true, validJson)
  }
  {
    const res = await post(validChat)
    const body = await res.text()
    const neurons = body.match(/"neurons"\s*:\s*([0-9.]+)/)
    record('AI_E2E', 'el proveedor reporta neuronas', true, Boolean(neurons), neurons ? `(neurons=${neurons[1]})` : '')
    record('AI_E2E', 'X-AI-Budget-Mode = enforced', 'enforced', res.headers.get('x-ai-budget-mode'))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(66))
const passed = results.filter((r) => r.status === 'PASS').length
console.log(`PASS=${passed}  FAIL=${failures}  NOT VALIDATED=${notValidated}`)
console.log(`WORKER LIVE CHECK = ${failures === 0 ? (notValidated ? 'PASS (parcial)' : 'PASS') : 'FAIL'}`)
process.exit(failures === 0 ? 0 : 1)
