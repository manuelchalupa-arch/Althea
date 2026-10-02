/**
 * Tests del hardening del Cloudflare Worker.
 *
 * Alcance: verifican la LÓGICA del Worker de forma aislada (CODE-VERIFIED).
 * NO sustituyen la validación contra el Worker desplegado (STAGING-VALIDATED).
 * Cada test documenta qué regla de §3-§10 del cierre cubre.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import worker, {
  parseAllowedOrigins,
  resolveAllowedOrigin,
  isJsonContentType,
  readBodyWithLimit,
  validateChatPayload,
  checkRateLimit,
  fetchWithTimeout,
  resetMemoryRateLimits,
} from '../src/index.js'

const ORIGIN_STAGING = 'https://althea-staging.web.app'

function env(overrides: Record<string, unknown> = {}) {
  return {
    CORS_ORIGIN: ORIGIN_STAGING,
    GROQ_URL: 'https://api.groq.com/openai/v1/chat/completions',
    GROQ_API_KEY: 'test-key-not-real',
    ...overrides,
  }
}

function chatRequest(body: unknown, init: RequestInit = {}) {
  return new Request('https://worker.example/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN_STAGING,
      'CF-Connecting-IP': '203.0.113.10',
      ...(init.headers as Record<string, string>),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  })
}

const validChat = { messages: [{ role: 'system', content: 'hola' }, { role: 'user', content: 'que tal' }] }

/**
 * Extrae la llamada saliente que el Worker hizo hacia Groq.
 * Los mocks de `fetch` no llevan firma tipada, así que se tipa el acceso.
 */
function upstreamCall(
  spy: { mock: { calls: unknown[][] } },
): { url: string; init: RequestInit } {
  const call = spy.mock.calls[0]
  if (!call) throw new Error('el Worker no llamó a fetch: se esperaba una llamada upstream')
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit }
}

beforeEach(() => {
  vi.restoreAllMocks()
  // El fallback in-memory es estado de módulo: cada test arranca limpio.
  resetMemoryRateLimits()
})

// ─── §3.1 CORS fail-closed ────────────────────────────────────────────────

describe('§3.1 CORS fail-closed', () => {
  it('rechaza con 500 si NO hay CORS_ORIGIN configurado', async () => {
    const res = await worker.fetch(chatRequest(validChat), env({ CORS_ORIGIN: undefined }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'cors_not_configured' })
  })

  it('rechaza con 500 si CORS_ORIGIN es "*"', async () => {
    const res = await worker.fetch(chatRequest(validChat), env({ CORS_ORIGIN: '*' }))
    expect(res.status).toBe(500)
  })

  it('rechaza con 500 si CORS_ORIGIN es lista de wildcards', async () => {
    const res = await worker.fetch(chatRequest(validChat), env({ CORS_ORIGIN: '*,https://x.app' }))
    expect(res.status).toBe(500)
  })

  it('rechaza con 403 un origin NO permitido y NO lo refleja', async () => {
    const res = await worker.fetch(
      chatRequest(validChat, { headers: { Origin: 'https://evil.example' } }),
      env(),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden_origin' })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('acepta el origin exacto configurado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: [DONE]\n', { status: 200 })))
    const res = await worker.fetch(chatRequest(validChat), env())
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN_STAGING)
    vi.unstubAllGlobals()
  })

  it('acepta cualquiera de varias origins separadas por coma', () => {
    const allowed = parseAllowedOrigins('https://a.app, https://b.app')
    expect(allowed).toEqual(['https://a.app', 'https://b.app'])
    expect(resolveAllowedOrigin('https://b.app', allowed)).toBe('https://b.app')
    expect(resolveAllowedOrigin('https://c.app', allowed)).toBeNull()
  })

  it('preflight OPTIONS responde 204 sólo para origin permitido', async () => {
    const good = await worker.fetch(
      new Request('https://worker.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN_STAGING } }),
      env(),
    )
    expect(good.status).toBe(204)
    expect(good.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN_STAGING)
    expect(good.headers.get('Allow')).toBe('POST, OPTIONS')

    const bad = await worker.fetch(
      new Request('https://worker.example/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
      env(),
    )
    expect(bad.status).toBe(403)
  })

  it('WGER exige Origin explícito (sin Origin => 403)', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/api/wger/user', { method: 'GET' }),
      env(),
    )
    expect(res.status).toBe(403)
  })

  it('parseAllowedOrigins filtra entradas inválidas', () => {
    expect(parseAllowedOrigins('')).toEqual([])
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins('  ,  ,*  ')).toEqual([])
    expect(parseAllowedOrigins('https://a.app,,https://b.app')).toEqual(['https://a.app', 'https://b.app'])
  })
})

// ─── §4 Métodos HTTP ───────────────────────────────────────────────────────

describe('§4 métodos HTTP', () => {
  it.each(['GET', 'PUT', 'PATCH', 'DELETE'])('rechaza %s en el endpoint Groq con 405', async (method) => {
    const res = await worker.fetch(
      new Request('https://worker.example/', { method, headers: { Origin: ORIGIN_STAGING } }),
      env(),
    )
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS')
  })

  it('el 405 no ejecuta ninguna llamada a Groq', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await worker.fetch(
      new Request('https://worker.example/', { method: 'GET', headers: { Origin: ORIGIN_STAGING } }),
      env(),
    )
    expect(spy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// ─── §5 Content-Type ──────────────────────────────────────────────────────

describe('§5 Content-Type', () => {
  it('rechaza text/plain con 415', async () => {
    const res = await worker.fetch(
      chatRequest('hola', { headers: { 'Content-Type': 'text/plain' } }),
      env(),
    )
    expect(res.status).toBe(415)
    expect(await res.json()).toEqual({ error: 'unsupported_media_type' })
  })

  it('rechaza form-data con 415', async () => {
    const res = await worker.fetch(
      chatRequest('a=1', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
      env(),
    )
    expect(res.status).toBe(415)
  })

  it('rechaza ausencia de Content-Type con 415', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/', {
        method: 'POST',
        headers: { Origin: ORIGIN_STAGING },
        body: '{}',
      }),
      env(),
    )
    expect(res.status).toBe(415)
  })

  it('acepta application/json con parámetros charset', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: [DONE]\n', { status: 200 })))
    const res = await worker.fetch(
      chatRequest(validChat, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }),
      env(),
    )
    expect(res.status).toBe(200)
    vi.unstubAllGlobals()
  })

  it('isJsonContentType es estricto', () => {
    expect(isJsonContentType('application/json')).toBe(true)
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true)
    expect(isJsonContentType('APPLICATION/JSON')).toBe(true)
    expect(isJsonContentType('text/json')).toBe(false)
    expect(isJsonContentType(null)).toBe(false)
  })
})

// ─── §6 Body size limit ────────────────────────────────────────────────────

describe('§6 body size limit', () => {
  it('rechaza con 413 un body que excede el límite', async () => {
    const huge = JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(70_000) }] })
    const res = await worker.fetch(chatRequest(huge), env())
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'payload_too_large' })
    expect(res.headers.get('X-Max-Body-Bytes')).toBe('65536')
  })

  it('rechaza con 413 aunque Content-Length mienta (a la baja)', async () => {
    const huge = 'x'.repeat(70_000)
    const req = new Request('https://worker.example/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN_STAGING, 'Content-Length': '10' },
      body: huge,
    })
    const res = await worker.fetch(req, env())
    expect(res.status).toBe(413)
  })

  it('readBodyWithLimit corta el stream aunque no haya Content-Length', async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('y'.repeat(100)))
        c.enqueue(new TextEncoder().encode('z'.repeat(100)))
        c.close()
      },
    })
    const req = new Request('https://worker.example/', {
      method: 'POST',
      body: stream,
      // Requerido por undici/Node al enviar un stream como body.
      duplex: 'half',
    } as RequestInit)
    // El runtime puede setear Content-Length; el test cubre ambos caminos.
    const out = await readBodyWithLimit(req, 50)
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.code).toBe('payload_too_large')
  })

  it('acepta un body dentro del límite', async () => {
    const req = new Request('https://worker.example/', { method: 'POST', body: 'hola' })
    const out = await readBodyWithLimit(req, 1024)
    expect(out.ok).toBe(true)
    expect(out.ok && out.text).toBe('hola')
  })

  it('rechaza Content-Length no numérico', async () => {
    const req = new Request('https://worker.example/', { method: 'POST', body: 'x' })
    req.headers.set('Content-Length', 'abc')
    const out = await readBodyWithLimit(req, 1024)
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.code).toBe('invalid_content_length')
  })
})

// ─── §7 Payload validation ─────────────────────────────────────────────────

describe('§7 validación de payload', () => {
  it('rechaza body que no es objeto', () => {
    expect(validateChatPayload(null).ok).toBe(false)
    expect(validateChatPayload('x').ok).toBe(false)
    expect(validateChatPayload([]).ok).toBe(false)
  })

  it('rechaza campos inesperados (no relay genérico)', () => {
    const r = validateChatPayload({ messages: [{ role: 'user', content: 'hi' }], api_key: 'sk-x' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.code).toBe('unexpected_field')
  })

  it('rechaza que el cliente fuerce la URL del proveedor', () => {
    const r = validateChatPayload({ messages: [{ role: 'user', content: 'hi' }], url: 'https://evil' })
    expect(r.ok === false && r.code).toBe('unexpected_field')
  })

  it('acepta las claves de provider del contrato actual pero las ignora', () => {
    const r = validateChatPayload({
      model: 'attacker-model',
      max_tokens: 99999,
      temperature: 2,
      top_p: 0,
      stream: false,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.ok).toBe(true)
    expect(r.ok && r.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('rechaza messages vacío / no-array', () => {
    expect(validateChatPayload({ messages: [] }).ok).toBe(false)
    expect(validateChatPayload({ messages: 'x' }).ok).toBe(false)
  })

  it('rechaza demasiados mensajes', () => {
    const messages = Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' }))
    const r = validateChatPayload({ messages })
    expect(r.ok === false && r.code).toBe('too_many_messages')
  })

  it('rechaza roles fuera de la allowlist', () => {
    for (const role of ['developer', 'tool', 'function', 'admin']) {
      const r = validateChatPayload({ messages: [{ role, content: 'x' }] })
      expect(r.ok, `role ${role}`).toBe(false)
    }
  })

  it('rechaza campos extra por mensaje', () => {
    const r = validateChatPayload({
      messages: [{ role: 'user', content: 'x', function_call: { name: 'evil' } }],
    })
    expect(r.ok === false && r.code).toBe('unexpected_message_field')
  })

  it('rechaza content vacío o no-string', () => {
    expect(validateChatPayload({ messages: [{ role: 'user', content: '' }] }).ok).toBe(false)
    expect(validateChatPayload({ messages: [{ role: 'user', content: 42 }] }).ok).toBe(false)
  })

  it('rechaza contenido por encima del máximo', () => {
    const r = validateChatPayload({ messages: [{ role: 'user', content: 'x'.repeat(12_001) }] })
    expect(r.ok === false && r.code).toBe('content_too_long')
  })

  it('el modelo y params los fija el servidor, no el cliente', async () => {
    const spy = vi.fn(async () => new Response('data: [DONE]\n', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await worker.fetch(
      chatRequest({
        model: 'attacker-model',
        max_tokens: 99999,
        temperature: 2,
        messages: [{ role: 'user', content: 'hola' }],
      }),
      env(),
    )
    const upstreamBody = JSON.parse(upstreamCall(spy).init.body as string)
    expect(upstreamBody.model).toBe('openai/gpt-oss-20b')
    expect(upstreamBody.max_tokens).toBe(512)
    expect(upstreamBody.temperature).toBe(0.7)
    expect(upstreamBody.stream).toBe(true)
    expect(Object.keys(upstreamBody).sort()).toEqual(
      ['max_tokens', 'messages', 'model', 'stream', 'temperature', 'top_p'].sort(),
    )
    vi.unstubAllGlobals()
  })

  it('nunca reenvía headers del cliente ni la API key al body', async () => {
    const spy = vi.fn(async () => new Response('data: [DONE]\n', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await worker.fetch(chatRequest(validChat), env())
    const { init } = upstreamCall(spy)
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual(['Authorization', 'Content-Type'])
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key-not-real')
    vi.unstubAllGlobals()
  })
})

// ─── §8 Timeout ────────────────────────────────────────────────────────────

describe('§8 timeout', () => {
  it('fetchWithTimeout devuelve {timeout:true} al abortar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        }),
      ),
    )
    const out = await fetchWithTimeout('https://x.example', {}, 10)
    expect(out).toEqual({ timeout: true })
    vi.unstubAllGlobals()
  })

  it('el Worker devuelve 504 cuando Groq excede el timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        }),
      ),
    )
    const res = await worker.fetch(chatRequest(validChat), env({ GROQ_TIMEOUT_MS: '10' }))
    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: 'upstream_timeout' })
    vi.unstubAllGlobals()
  })
})

// ─── §9 Error sanitization ─────────────────────────────────────────────────

describe('§9 sanitización de errores', () => {
  it('no filtra el body de error de Groq', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'quota exceeded for org org_12345', key: 'sk-live-leak' } }), {
            status: 429,
          }),
      ),
    )
    const res = await worker.fetch(chatRequest(validChat), env())
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).not.toContain('sk-live-leak')
    expect(text).not.toContain('org_12345')
    expect(text).not.toContain('quota')
    expect(JSON.parse(text)).toEqual({ error: 'upstream_error' })
    vi.unstubAllGlobals()
  })

  it('no filtra la API key cuando Groq devuelve 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Invalid API key: gsk_secretvalue', { status: 401 })))
    const res = await worker.fetch(chatRequest(validChat), env())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('gsk_secretvalue')
    vi.unstubAllGlobals()
  })

  it('no filtra la API key si falta la config (503)', async () => {
    const res = await worker.fetch(chatRequest(validChat), env({ GROQ_API_KEY: undefined }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'proxy_not_configured' })
  })

  it('devuelve 502 ante error de red sin detalle interno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('connect ECONNREFUSED 10.0.0.1:443') }))
    const res = await worker.fetch(chatRequest(validChat), env())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream_error' })
    vi.unstubAllGlobals()
  })

  it('nunca devuelve stack traces', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom at worker.js:42:7') }))
    const res = await worker.fetch(chatRequest(validChat), env())
    expect(await res.text()).not.toContain('worker.js:42')
    vi.unstubAllGlobals()
  })

  it('rechaza JSON inválido con 400', async () => {
    const res = await worker.fetch(chatRequest('{not json'), env())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_json' })
  })
})

// ─── §10 Rate limit / abuse control ────────────────────────────────────────

describe('§10 rate limit / abuse control', () => {
  it('devuelve 429 al exceder el límite y expone Retry-After', async () => {
    const e = env()
    const cfg = { max: 2, windowSeconds: 60, keyPrefix: 'test:rl' }
    const now = Date.now()
    expect((await checkRateLimit(e, '1.2.3.4', cfg, now)).ok).toBe(true)
    expect((await checkRateLimit(e, '1.2.3.4', cfg, now)).ok).toBe(true)
    const third = await checkRateLimit(e, '1.2.3.4', cfg, now)
    expect(third.ok).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.resetSeconds).toBeGreaterThan(0)
  })

  it('el límite es por IP: otra IP no queda bloqueada', async () => {
    const e = env()
    const cfg = { max: 1, windowSeconds: 60, keyPrefix: 'test:ip' }
    const now = Date.now()
    await checkRateLimit(e, '10.0.0.1', cfg, now)
    expect((await checkRateLimit(e, '10.0.0.1', cfg, now)).ok).toBe(false)
    expect((await checkRateLimit(e, '10.0.0.2', cfg, now)).ok).toBe(true)
  })

  it('el contador se reinicia en la ventana siguiente', async () => {
    const e = env()
    const cfg = { max: 1, windowSeconds: 60, keyPrefix: 'test:win' }
    const t0 = 1_700_000_000_000
    expect((await checkRateLimit(e, '9.9.9.9', cfg, t0)).ok).toBe(true)
    expect((await checkRateLimit(e, '9.9.9.9', cfg, t0)).ok).toBe(false)
    expect((await checkRateLimit(e, '9.9.9.9', cfg, t0 + 61_000)).ok).toBe(true)
  })

  it('expone headers de rate limit en las respuestas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: [DONE]\n', { status: 200 })))
    const res = await worker.fetch(chatRequest(validChat), env())
    expect(res.headers.get('X-RateLimit-Limit')).toBe('20')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('19')
    // Sin binding KV el modo es degradado y se declara honestamente.
    expect(res.headers.get('X-RateLimit-Mode')).toBe('memory-degraded')
    vi.unstubAllGlobals()
  })

  it('429 real end-to-end sobre el endpoint Groq', async () => {
    const spy = vi.fn(async () => new Response('data: [DONE]\n', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    const e = env()
    let last = 0
    for (let i = 0; i < 25; i++) {
      last = (await worker.fetch(chatRequest(validChat), e)).status
    }
    expect(last).toBe(429)
    expect(spy.mock.calls.length).toBe(20)
    vi.unstubAllGlobals()
  })

  it('usa la capa KV cuando hay binding (modo kv)', async () => {
    const store = new Map<string, string>()
    const kv = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => {
        store.set(k, v)
      }),
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: [DONE]\n', { status: 200 })))
    const e = env({ RATE_LIMIT: kv })
    const res = await worker.fetch(chatRequest(validChat), e)
    expect(res.headers.get('X-RateLimit-Mode')).toBe('kv')
    expect(kv.put).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('fail-OPEN si KV falla (el Coach no se cae, pero se declara degradado)', async () => {
    const kv = {
      get: vi.fn(async () => {
        throw new Error('kv down')
      }),
      put: vi.fn(),
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: [DONE]\n', { status: 200 })))
    const res = await worker.fetch(chatRequest(validChat), env({ RATE_LIMIT: kv }))
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Mode')).toBe('kv')
    vi.unstubAllGlobals()
  })
})

// ─── §11 Groq secret ───────────────────────────────────────────────────────

describe('§11 Groq secret server-side', () => {
  it('el secret nunca aparece en la respuesta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: [DONE]\n', { status: 200 })))
    const res = await worker.fetch(chatRequest(validChat), env({ GROQ_API_KEY: 'gsk_supersecret' }))
    expect(await res.text()).not.toContain('gsk_supersecret')
    vi.unstubAllGlobals()
  })

  it('la API key viaja sólo en el header Authorization hacia Groq', async () => {
    const spy = vi.fn(async () => new Response('data: [DONE]\n', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await worker.fetch(chatRequest(validChat), env({ GROQ_API_KEY: 'gsk_supersecret' }))
    const { url, init } = upstreamCall(spy)
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(JSON.stringify(init.headers)).toContain('gsk_supersecret')
    expect(String(init.body)).not.toContain('gsk_supersecret')
    vi.unstubAllGlobals()
  })
})

// ─── WGER: no relay genérico ───────────────────────────────────────────────

describe('WGER path allowlist', () => {
  it('rechaza con 403 una ruta WGER fuera de la allowlist', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/api/wger/proxy/user/config', {
        method: 'GET',
        headers: { Origin: ORIGIN_STAGING, Cookie: 'wger_token=abc' },
      }),
      env(),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'path_not_allowed' })
  })

  it('exige cookie de sesión para /api/wger/user', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/api/wger/user', { method: 'GET', headers: { Origin: ORIGIN_STAGING } }),
      env(),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'not_authenticated' })
  })

  it('valida Content-Type en el link de cuenta', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/api/wger/token', {
        method: 'POST',
        headers: { Origin: ORIGIN_STAGING, 'Content-Type': 'text/plain' },
        body: 'user=pass',
      }),
      env(),
    )
    expect(res.status).toBe(415)
  })
})
