/**
 * Tests de la capa Durable Object del rate limit y de la cadena de degradación.
 *
 * Alcance: lógica del Worker aislada (CODE-VERIFIED). El DO no se puede
 * levantar en vitest, así que se ejercita la clase directamente contra un
 * storage falso que implementa la misma superficie. La validación de que
 * Cloudflare enruta y serializa correctamente es STAGING-VALIDATED.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimiter, checkRateLimit, resetMemoryRateLimits, RATE_LIMIT_MODE } from '../src/rate-limiter.js'

/** Storage falso con la misma superficie que el de un Durable Object. */
function fakeStorage(initial: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>(Object.entries(initial))
  const alarms: number[] = []
  return {
    map,
    alarms,
    get: vi.fn(async (k: string) => (map.has(k) ? map.get(k) : null)),
    put: vi.fn(async (k: string, v: unknown) => {
      map.set(k, v)
    }),
    delete: vi.fn(async (k: string) => {
      map.delete(k)
    }),
    list: vi.fn(async () => new Map(map)),
    setAlarm: vi.fn(async (t: number) => {
      alarms.push(t)
    }),
    deleteAlarm: vi.fn(async () => {
      alarms.length = 0
    }),
  }
}

function checkRequest(body: unknown) {
  return new Request('https://rate-limit.internal/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** KV falso con la firma exacta que espera `RateLimitConfig`/`RateLimiterEnv`. */
function fakeKv(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    map,
    get: vi.fn(async (k: string): Promise<string | null> => (map.has(k) ? (map.get(k) as string) : null)),
    put: vi.fn(async (k: string, v: string): Promise<void> => {
      map.set(k, v)
    }),
  }
}

const CFG = { max: 3, windowSeconds: 60, keyPrefix: 'test:do' }

describe('capa 1 — Durable Object', () => {
  let storage: ReturnType<typeof fakeStorage>
  let limiter: RateLimiter

  beforeEach(() => {
    storage = fakeStorage()
    limiter = new RateLimiter({ storage } as never)
  })

  it('permite hasta max y despues bloquea', async () => {
    const results = []
    for (let i = 0; i < CFG.max; i++) {
      const res = await limiter.fetch(checkRequest({ key: '1.1.1.1', ...CFG }))
      results.push((await res.json()).allowed)
    }
    const blocked = await limiter.fetch(checkRequest({ key: '1.1.1.1', ...CFG }))
    expect(results).toEqual([true, true, true])
    expect((await blocked.json()).allowed).toBe(false)
  })

  it('el contador es por clave: otra IP no se bloquea', async () => {
    for (let i = 0; i < CFG.max; i++) {
      await limiter.fetch(checkRequest({ key: '2.2.2.2', ...CFG }))
    }
    const sameIp = await limiter.fetch(checkRequest({ key: '2.2.2.2', ...CFG }))
    const otherIp = await limiter.fetch(checkRequest({ key: '3.3.3.3', ...CFG }))
    expect((await sameIp.json()).allowed).toBe(false)
    expect((await otherIp.json()).allowed).toBe(true)
  })

  it('devuelve remaining decreciente y resetSeconds positivo', async () => {
    const first = await (await limiter.fetch(checkRequest({ key: '4.4.4.4', ...CFG }))).json()
    expect(first.remaining).toBe(CFG.max - 1)
    expect(first.resetSeconds).toBeGreaterThan(0)
    expect(first.resetSeconds).toBeLessThanOrEqual(CFG.windowSeconds)
  })

  it('reinicia el contador cuando la ventana vencio', async () => {
    const key = 'counter:test:do:5.5.5.5'
    const vencido = { count: CFG.max, resetAt: Date.now() - 1000 }
    await storage.put(key, vencido)

    const res = await limiter.fetch(checkRequest({ key: '5.5.5.5', ...CFG }))
    expect((await res.json()).allowed).toBe(true)
  })

  it('programa la alarma de limpieza al consumir cuota', async () => {
    await limiter.fetch(checkRequest({ key: '6.6.6.6', ...CFG }))
    expect(storage.setAlarm).toHaveBeenCalledTimes(1)
    expect(storage.alarms[0]).toBeGreaterThan(Date.now())
  })

  it('no incrementa ni programa alarma cuando ya esta bloqueado', async () => {
    const key = 'counter:test:do:7.7.7.7'
    await storage.put(key, { count: CFG.max, resetAt: Date.now() + 60_000 })
    storage.setAlarm.mockClear()

    const res = await limiter.fetch(checkRequest({ key: '7.7.7.7', ...CFG }))
    const data = await res.json()
    expect(data.allowed).toBe(false)
    expect(data.remaining).toBe(0)
    expect(storage.setAlarm).not.toHaveBeenCalled()
  })

  it('rechaza metodos distintos de POST', async () => {
    const res = await limiter.fetch(new Request('https://rate-limit.internal/check', { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('rechaza body no-JSON', async () => {
    const res = await limiter.fetch(
      new Request('https://rate-limit.internal/check', { method: 'POST', body: 'no-json' }),
    )
    expect(res.status).toBe(400)
  })

  it('rechaza payload incompleto', async () => {
    const res = await limiter.fetch(checkRequest({ key: '8.8.8.8' }))
    expect(res.status).toBe(400)
  })

  it('la alarma purga solo contadores vencidos', async () => {
    const now = Date.now()
    await storage.put('vencido', { count: 5, resetAt: now - 1000 })
    await storage.put('vigente', { count: 2, resetAt: now + 60_000 })

    await limiter.alarm({ storage } as never, now)
    expect(storage.map.has('vencido')).toBe(false)
    expect(storage.map.has('vigente')).toBe(true)
  })
})

describe('cadena de degradacion', () => {
  beforeEach(() => {
    resetMemoryRateLimits()
  })

  /** Namespace DO falso: delega en una instancia real con storage propio. */
  function doNamespace() {
    const instances = new Map<string, RateLimiter>()
    return {
      getByName: vi.fn((name: string) => {
        if (!instances.has(name)) instances.set(name, new RateLimiter({ storage: fakeStorage() } as never))
        const instance = instances.get(name)!
        return {
          fetch: async (input: string, init?: RequestInit) => instance.fetch(new Request(input, init)),
        }
      }),
    }
  }

  it('usa la capa DO cuando el binding existe', async () => {
    const result = await checkRateLimit({ RATE_LIMITER: doNamespace() }, '9.9.9.9', CFG, Date.now())
    expect(result.mode).toBe(RATE_LIMIT_MODE.DURABLE_OBJECT)
    expect(result.degraded).toBe(false)
    expect(result.ok).toBe(true)
  })

  it('la capa DO es la que realmente corta el trafico', async () => {
    const env = { RATE_LIMITER: doNamespace() }
    const now = Date.now()
    for (let i = 0; i < CFG.max; i++) {
      expect((await checkRateLimit(env, '10.10.10.10', CFG, now)).ok).toBe(true)
    }
    const last = await checkRateLimit(env, '10.10.10.10', CFG, now)
    expect(last.ok).toBe(false)
    expect(last.remaining).toBe(0)
  })

  it('degrada a KV si el DO lanza', async () => {
    const broken = {
      getByName: vi.fn(() => ({
        fetch: vi.fn(async () => {
          throw new Error('DO no disponible')
        }),
      })),
    }
    const result = await checkRateLimit({ RATE_LIMITER: broken, RATE_LIMIT: fakeKv() }, '11.11.11.11', CFG, Date.now())
    expect(result.mode).toBe(RATE_LIMIT_MODE.KV)
    expect(result.degraded).toBe(true)
  })

  it('degrada a memoria si no hay ningun binding', async () => {
    const result = await checkRateLimit({}, '12.12.12.12', CFG, Date.now())
    expect(result.mode).toBe(RATE_LIMIT_MODE.MEMORY)
    expect(result.degraded).toBe(true)
  })

  it('degrada a memoria si el DO responde algo invalido', async () => {
    const nonsense = {
      getByName: vi.fn(() => ({
        fetch: vi.fn(async () => new Response('no-json', { status: 500 })),
      })),
    }
    const result = await checkRateLimit({ RATE_LIMITER: nonsense }, '13.13.13.13', CFG, Date.now())
    expect(result.mode).toBe(RATE_LIMIT_MODE.MEMORY)
    expect(result.degraded).toBe(true)
  })

  it('la capa KV sigue limitando por su cuenta', async () => {
    const env = { RATE_LIMIT: fakeKv() }
    const now = Date.now()
    const cfg = { max: 2, windowSeconds: 60, keyPrefix: 'test:kv' }
    expect((await checkRateLimit(env, '14.14.14.14', cfg, now)).ok).toBe(true)
    expect((await checkRateLimit(env, '14.14.14.14', cfg, now)).ok).toBe(true)
    const third = await checkRateLimit(env, '14.14.14.14', cfg, now)
    expect(third.ok).toBe(false)
    expect(third.mode).toBe(RATE_LIMIT_MODE.KV)
  })

  it('la capa KV hace fail-open si el namespace esta caido', async () => {
    const brokenKv = {
      get: vi.fn(async () => {
        throw new Error('KV caido')
      }),
      put: vi.fn(async () => undefined),
    }
    const result = await checkRateLimit({ RATE_LIMIT: brokenKv }, '15.15.15.15', CFG, Date.now())
    expect(result.ok).toBe(true)
    expect(result.degraded).toBe(true)
  })
})
