/**
 * Tests del servicio central de IA (Cloudflare Workers AI).
 * Verifican la lógica del Worker de forma aislada; no sustituyen la validación
 * contra el Worker desplegado.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import worker, {
  parseAllowedOrigins,
  resolveAllowedOrigin,
  isJsonContentType,
  readBodyWithLimit,
  validateChatPayload,
  checkRateLimit,
  resetMemoryRateLimits,
  resetConcurrency,
  reserveDailyNeurons,
  RateLimiter,
} from '../src/index.js'

vi.mock('../src/firebase-auth.js', () => ({
  verifyFirebaseIdToken: vi.fn(async (token: string) => (token === 'valid-token' ? 'user-1' : null)),
  resetJwksCache: vi.fn(),
}))

const ORIGIN = 'https://althea-stg.web.app'

function sseStream() {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hola"}}]}\n'))
      c.close()
    },
  })
}

function env(overrides: Record<string, unknown> = {}) {
  return {
    CORS_ORIGIN: ORIGIN,
    FIREBASE_PROJECT_ID: 'althea-stg',
    AI: { run: vi.fn(async () => sseStream()) },
    ...overrides,
  }
}

function request(body: unknown = { messages: [{ role: 'user', content: 'hola' }] }, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Authorization: 'Bearer valid-token',
    'CF-Connecting-IP': '203.0.113.10',
    ...(init.headers as Record<string, string>),
  }
  return new Request('https://worker.example/', {
    method: 'POST',
    ...init,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function aiRun(e: Record<string, any>) {
  return e.AI.run as ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMemoryRateLimits()
  resetConcurrency()
})

// ── CORS y método ──────────────────────────────────────────────────────────

describe('CORS fail-closed y método', () => {
  it('500 sin CORS_ORIGIN o con *', async () => {
    expect((await worker.fetch(request(), env({ CORS_ORIGIN: undefined }))).status).toBe(500)
    expect((await worker.fetch(request(), env({ CORS_ORIGIN: '*' }))).status).toBe(500)
  })

  it('403 para origin no permitido', async () => {
    const res = await worker.fetch(request(), env())
    const bad = await worker.fetch(
      request({}, { headers: { Origin: 'https://evil.example' } }),
      env(),
    )
    expect(res.status).toBe(200)
    expect(bad.status).toBe(403)
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('preflight anuncia Authorization', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      env(),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })

  it.each(['GET', 'PUT', 'PATCH', 'DELETE'])('405 para %s', async (method) => {
    const res = await worker.fetch(
      new Request('https://worker.example/', { method, headers: { Origin: ORIGIN } }),
      env(),
    )
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS')
  })

  it('parseAllowedOrigins / resolveAllowedOrigin', () => {
    const allowed = parseAllowedOrigins('https://a.app, https://b.app')
    expect(allowed).toEqual(['https://a.app', 'https://b.app'])
    expect(resolveAllowedOrigin('https://b.app', allowed)).toBe('https://b.app')
    expect(resolveAllowedOrigin('https://c.app', allowed)).toBeNull()
    expect(parseAllowedOrigins('*,https://a.app')).toEqual([])
  })
})

// ── Body y payload ─────────────────────────────────────────────────────────

describe('body y payload', () => {
  it('415 sin Content-Type JSON', async () => {
    const res = await worker.fetch(
      request('hola', { headers: { 'Content-Type': 'text/plain' } }),
      env(),
    )
    expect(res.status).toBe(415)
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true)
  })

  it('413 por body excedido (aunque Content-Length mienta)', async () => {
    const huge = JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(70_000) }] })
    const res = await worker.fetch(request(huge), env())
    expect(res.status).toBe(413)
    expect(res.headers.get('X-Max-Body-Bytes')).toBe('65536')
  })

  it('400 por JSON inválido y 422 por campos inesperados', async () => {
    expect((await worker.fetch(request('{no'), env())).status).toBe(400)
    const res = await worker.fetch(
      request({ messages: [{ role: 'user', content: 'hola' }], api_key: 'sk-leak' }),
      env(),
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('unexpected_field')
  })

  it('validateChatPayload acepta task y fija el resto', () => {
    const r = validateChatPayload({
      task: 'routine',
      model: 'evil-model',
      max_tokens: 99999,
      messages: [{ role: 'user', content: 'hola' }],
    })
    expect(r.ok).toBe(true)
    expect(r.ok && r.task).toBe('routine')
    expect(r.ok && r.messages).toEqual([{ role: 'user', content: 'hola' }])
    expect((validateChatPayload({ task: 'otra', messages: [{ role: 'user', content: 'hola' }] }) as any).code).toBe('invalid_task')
    expect((validateChatPayload({ messages: [{ role: 'tool', content: 'hola' }] }) as any).code).toBe('invalid_role')
  })

  it('readBodyWithLimit corta el stream', async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('x'.repeat(100)))
        c.close()
      },
    })
    const req = new Request('https://worker.example/', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)
    const out = await readBodyWithLimit(req, 50)
    expect(out.ok).toBe(false)
  })
})

// ── Autenticación ──────────────────────────────────────────────────────────

describe('autenticación del usuario', () => {
  it('401 sin header o con token inválido, sin llamar al proveedor', async () => {
    const e = env()
    const missing = await worker.fetch(
      request({}, { headers: { Authorization: '' } }),
      e,
    )
    const invalid = await worker.fetch(
      request({}, { headers: { Authorization: 'Bearer invalid-token' } }),
      e,
    )
    expect(missing.status).toBe(401)
    expect(invalid.status).toBe(401)
    expect((await invalid.json()).error).toBe('unauthorized')
    expect(aiRun(e)).not.toHaveBeenCalled()
  })
})

// ── Proveedor ──────────────────────────────────────────────────────────────

describe('Cloudflare Workers AI', () => {
  it('chat usa el modelo fijado, sin reasoning ni almacenamiento', async () => {
    const e = env()
    const res = await worker.fetch(request(), e)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    const call = aiRun(e).mock.calls[0]
    expect(call[0]).toBe('@cf/google/gemma-4-26b-a4b-it')
    expect(call[1]).toMatchObject({
      max_completion_tokens: 512,
      stream: true,
      store: false,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: 'text' },
      user: 'user-1',
    })
    expect(JSON.stringify(call[1])).not.toContain('GROQ')
    expect(JSON.stringify(call[1])).not.toContain('api_key')
  })

  it('routine fuerza JSON estructurado y respuesta no streamed', async () => {
    const e = env({
      AI: {
        run: vi.fn(async () => ({
          choices: [{ message: { content: '{"cycle":{},"dayExercises":{}}' } }],
        })),
      },
    })
    const res = await worker.fetch(request({ task: 'routine', messages: [{ role: 'user', content: 'rutina' }] }), e)
    expect(res.status).toBe(200)
    const call = aiRun(e).mock.calls[0]
    expect(call[1]).toMatchObject({
      max_completion_tokens: 8192,
      stream: false,
      response_format: { type: 'json_object' },
    })
    expect((await res.json()).choices[0].message.content).toContain('dayExercises')
  })

  it('503 si no hay binding AI', async () => {
    const res = await worker.fetch(request(), env({ AI: undefined }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('ai_not_configured')
  })

  it('504 por timeout', async () => {
    const e = env({ AI_TIMEOUT_MS: '10', AI: { run: vi.fn(() => new Promise(() => {})) } })
    const res = await worker.fetch(request(), e)
    expect(res.status).toBe(504)
    expect((await res.json()).error).toBe('upstream_timeout')
  })

  it('429 de cuota se traduce sin filtrar el proveedor', async () => {
    const e = env({
      AI: { run: vi.fn(async () => { throw Object.assign(new Error('quota exceeded org_secret'), { status: 429 }) }) },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await worker.fetch(request(), e)
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('quota_exhausted')
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(warn.mock.calls.join(' ')).not.toContain('org_secret')
    warn.mockRestore()
  })

  it('502 sanitizado ante error del proveedor', async () => {
    const e = env({
      AI: { run: vi.fn(async () => { throw new Error('token secreto del proveedor') }) },
    })
    const res = await worker.fetch(request(), e)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('token secreto')
  })

  it('los logs no contienen prompts ni respuestas', async () => {
    const e = env()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await worker.fetch(request({ messages: [{ role: 'user', content: 'MI_SECRETO_PERSONAL_123' }] }), e)
    expect(warn.mock.calls.join(' ')).not.toContain('MI_SECRETO_PERSONAL_123')
    warn.mockRestore()
  })
})

// ── Cuota y concurrencia ───────────────────────────────────────────────────

describe('cuota compartida', () => {
  it('20 peticiones/minuto por usuario', async () => {
    const e = env()
    let last = 0
    for (let i = 0; i < 21; i++) last = (await worker.fetch(request(), e)).status
    expect(last).toBe(429)
    expect(aiRun(e).mock.calls.length).toBe(20)
  })

  it('el límite es por uid, no por IP', async () => {
    const cfg = { max: 1, windowSeconds: 60, keyPrefix: 'test:uid' }
    const e = env()
    expect((await checkRateLimit(e, 'user-1', cfg, Date.now())).ok).toBe(true)
    expect((await checkRateLimit(e, 'user-1', cfg, Date.now())).ok).toBe(false)
    expect((await checkRateLimit(e, 'user-2', cfg, Date.now())).ok).toBe(true)
  })

  it('límite global cuando se baja la configuración', async () => {
    const e = env()
    // El techo global del Worker es 240; se prueba la capa directamente.
    const cfg = { max: 2, windowSeconds: 60, keyPrefix: 'test:global' }
    expect((await checkRateLimit(e, 'all', cfg, Date.now())).ok).toBe(true)
    expect((await checkRateLimit(e, 'all', cfg, Date.now())).ok).toBe(true)
    expect((await checkRateLimit(e, 'all', cfg, Date.now())).ok).toBe(false)
  })

  it('reserva neuronas diarias en KV con clave UTC', async () => {
    const store = new Map<string, string>()
    const kv = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => { store.set(k, v) }),
    }
    const e = env({ RATE_LIMIT: kv, AI_DAILY_NEURON_BUDGET: '1000' })
    const res = await worker.fetch(request(), e)
    expect(res.status).toBe(200)
    expect(Number(res.headers.get('X-AI-Neurons-Reserved'))).toBeGreaterThan(0)
    expect([...store.keys()].some((k) => /^ai:neurons:\d{4}-\d{2}-\d{2}$/.test(k))).toBe(true)
  })

  it('bloquea la petición cuando el presupuesto diario se agota', async () => {
    const store = new Map<string, string>()
    const kv = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => { store.set(k, v) }),
    }
    const e = env({ RATE_LIMIT: kv, AI_DAILY_NEURON_BUDGET: '1' })
    const res = await worker.fetch(request(), e)
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('quota_exhausted')
    expect(Number(res.headers.get('X-AI-Budget-Remaining'))).toBeGreaterThanOrEqual(0)
  })

  it('reserveDailyNeurons falla abierto si KV no responde', async () => {
    const kv = {
      get: vi.fn(async () => { throw new Error('kv down') }),
      put: vi.fn(),
    }
    const out = await reserveDailyNeurons({ RATE_LIMIT: kv } as any, 10)
    expect(out.ok).toBe(true)
    expect(out.degraded).toBe(true)
  })

  it('concurrencia máxima por isolate', async () => {
    const e = env({ AI_MAX_CONCURRENCY: '1', AI_TIMEOUT_MS: '20', AI: { run: vi.fn(() => new Promise(() => {})) } })
    const first = worker.fetch(request(), e)
    const second = await worker.fetch(request(), e)
    expect(second.status).toBe(429)
    expect((await second.json()).error).toBe('busy')
    // Se cancela la primera para no dejar la promesa colgada.
    void first
  })

  it('el presupuesto diario se comparte entre isolates vía Durable Object', async () => {
    const namespace = doNamespace()
    const a = env({ RATE_LIMITER: namespace, AI_DAILY_NEURON_BUDGET: '1000' })
    const b = env({ RATE_LIMITER: namespace, AI_DAILY_NEURON_BUDGET: '1000' })
    const first = await worker.fetch(request(), a)
    const second = await worker.fetch(request(), b)
    expect(first.headers.get('X-AI-Budget-Mode')).toBe('enforced')
    expect(second.headers.get('X-AI-Budget-Mode')).toBe('enforced')
    expect(Number(second.headers.get('X-AI-Budget-Remaining')))
      .toBeLessThan(Number(first.headers.get('X-AI-Budget-Remaining')))
  })

  it('la concurrencia se comparte entre isolates vía Durable Object', async () => {
    const namespace = doNamespace()
    let started: () => void = () => {}
    const inFlight = new Promise<void>((resolve) => { started = resolve })
    const hanging = { run: vi.fn(() => { started(); return new Promise(() => {}) }) }
    const a = env({ RATE_LIMITER: namespace, AI_MAX_CONCURRENCY: '1', AI_TIMEOUT_MS: '300', AI: hanging })
    const b = env({ RATE_LIMITER: namespace, AI_MAX_CONCURRENCY: '1', AI_TIMEOUT_MS: '300', AI: hanging })
    const first = worker.fetch(request(), a)
    await inFlight
    const second = await worker.fetch(request(), b)
    expect(second.status).toBe(429)
    expect((await second.json()).error).toBe('busy')
    void first
  })
})

/** Namespace DO falso: cada nombre tiene su propia instancia y storage. */
function doNamespace() {
  const instances = new Map<string, any>()
  return {
    getByName: (name: string) => {
      if (!instances.has(name)) {
        const store = new Map<string, unknown>()
        instances.set(name, {
          storage: {
            get: async (k: string) => (store.has(k) ? store.get(k) : null),
            put: async (k: string, v: unknown) => { store.set(k, v) },
            delete: async (k: string) => { store.delete(k) },
            list: async () => new Map(store),
            setAlarm: async () => {},
          },
        })
      }
      const instance = new RateLimiter(instances.get(name) as any)
      return { fetch: async (input: string, init?: RequestInit) => instance.fetch(new Request(input, init)) }
    },
  }
}
