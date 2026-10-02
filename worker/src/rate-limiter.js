/**
 * ALTHEA — Rate limiting del Worker.
 *
 * Tres capas, de más fuerte a más débil. Se usa SIEMPRE la más fuerte
 * disponible y se declara cuál se usó (cabecera `X-RateLimit-Mode`).
 *
 *   1. DURABLE OBJECT (preferida)
 *      Contador serializado por clave dentro de un isolate dedicado.
 *      Strongmente consistente: es la única capa que es un boundary de
 *      seguridad real en el edge distribuido de Cloudflare, porque todas las
 *      peticiones de una clave pasan por el MISMO isolate y se serializan.
 *
 *   2. KV (intermedia)
 *      Eventualmente consistente. Frena abuso trivial y limita coste
 *      accidental, pero NO es un techo: dos isolates pueden leer el mismo
 *      contador antes de escribir. Se usa sólo como degradación de la (1).
 *
 *   3. MEMORIA DEL ISOLATE (emergencia)
 *      Sin garantía ninguna en un edge con múltiples isolates. Se marca
 *      `degraded` siempre. Existe para que el Coach funcione en desarrollo
 *      sin bindings, nunca para presumir de protección.
 *
 * Principio: si una capa falla, se degrada hacia abajo y SE DICE. Nunca se
 * degrada en silencio y nunca se afirma una garantía que no existe.
 */

/** Modos expuestos en `X-RateLimit-Mode` y en `RateLimitResult.mode`. */
export const RATE_LIMIT_MODE = {
  DURABLE_OBJECT: 'durable-object',
  KV: 'kv',
  MEMORY: 'memory-degraded',
  NONE: 'unavailable',
}

/** Prefijo de la petición interna DO→DO. */
const DO_CHECK_URL = 'https://rate-limit.internal/check'

// ─────────────────────────────────────────────────────────────────────────────
// Capa 1 — Durable Object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Durable Object contador de ventana fija.
 *
 * Se instancia uno por clave (`getByName`), de modo que las peticiones de esa
 * clave quedan serializadas y el contador es consistente.
 *
 * Lógica de ventana fija: se guarda `{ count, resetAt }`. Si `now >= resetAt`
 * la ventana venció y el contador vuelve a cero. Esto evita el caso del
 * "fixed window burst" al borde de la ventana... salvo en ese borde concreto,
 * que es la limitación conocida y documentada de la ventana fija. Se acepta de
 * forma consciente: es lo que permite un contador sin estado global real.
 */
export class RateLimiter {
  /**
   * @param {{ storage: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void>; setAlarm(t: number): Promise<void>; deleteAlarm(): Promise<void> } }} state
   */
  constructor(state) {
    this.state = state
  }

  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('method_not_allowed', { status: 405 })
    }

    let payload
    try {
      payload = await request.json()
    } catch {
      return new Response('invalid_json', { status: 400 })
    }

    const { key, max, windowSeconds, keyPrefix } = payload
    if (
      typeof key !== 'string' ||
      typeof keyPrefix !== 'string' ||
      !Number.isFinite(max) ||
      !Number.isFinite(windowSeconds)
    ) {
      return new Response('invalid_request', { status: 400 })
    }

    const now = Date.now()
    const windowMs = Math.max(1, windowSeconds) * 1000
    const storageKey = `counter:${keyPrefix}:${key}`

    let record = await this.state.storage.get(storageKey)
    if (
      record === null ||
      record === undefined ||
      typeof record.count !== 'number' ||
      typeof record.resetAt !== 'number' ||
      now >= record.resetAt
    ) {
      record = { count: 0, resetAt: now + windowMs }
    }

    const allowed = record.count < max

    if (allowed) {
      record.count += 1
      await this.state.storage.put(storageKey, record)
      // Limpieza del estado al expirar la ventana: sin esto el DO acumularía
      // una entrada por IP para siempre.
      try {
        await this.state.storage.setAlarm(record.resetAt)
      } catch {
        // setAlarm es una optimización de limpieza, no afecta al límite.
      }
    }

    const resetSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000))

    return Response.json({
      allowed,
      limit: max,
      remaining: Math.max(0, max - record.count),
      resetSeconds,
    })
  }

  /**
   * Alarma: purga contadores cuyas ventanas ya vencieron.
   * @param {{ storage: { list(opts?: unknown): Promise<Map<string, unknown>>; delete(k: string): Promise<void> } }} state
   * @param {number} timestamp
   */
  async alarm(state, timestamp) {
    const all = await state.storage.list()
    const now = typeof timestamp === 'number' ? timestamp : Date.now()
    for (const [key, value] of all) {
      if (value && typeof value.resetAt === 'number' && now >= value.resetAt) {
        await state.storage.delete(key)
      }
    }
  }
}

/**
 * Invoca la capa DO. Devuelve `null` si no hay binding o si falla, para que
 * el llamador degrade a la siguiente capa.
 */
async function checkDurableObject(env, key, cfg) {
  const namespace = env && env.RATE_LIMITER
  if (!namespace || typeof namespace.getByName !== 'function') return null

  try {
    const id = namespace.getByName(`${cfg.keyPrefix}|${key}`)
    if (!id || typeof id.fetch !== 'function') return null
    const res = await id.fetch(DO_CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        max: cfg.max,
        windowSeconds: cfg.windowSeconds,
        keyPrefix: cfg.keyPrefix,
      }),
    })
    if (!res || !res.ok) return null
    const data = await res.json()
    if (typeof data.allowed !== 'boolean') return null
    return {
      ok: data.allowed,
      limit: data.limit,
      remaining: data.remaining,
      resetSeconds: data.resetSeconds,
      degraded: false,
      mode: RATE_LIMIT_MODE.DURABLE_OBJECT,
    }
  } catch {
    // DO caído o ausente: se degrada. No se propaga el error al cliente.
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capa 2 — KV
// ─────────────────────────────────────────────────────────────────────────────

async function checkKv(env, key, cfg, nowMs) {
  const kv = env && env.RATE_LIMIT
  if (!kv || typeof kv.get !== 'function') return null

  const bucket = Math.floor(nowMs / 1000 / cfg.windowSeconds)
  const storageKey = `${cfg.keyPrefix}:${bucket}:${key}`

  let count = 0
  try {
    const raw = await kv.get(storageKey)
    if (raw !== null) {
      const parsed = Number.parseInt(raw, 10)
      if (Number.isFinite(parsed)) count = parsed
    }
  } catch {
    // KV caído: fail-OPEN deliberado. Perder el Coach por un fallo de rate
    // limiting sería peor que dejar pasar una petición extra. Se marca
    // `degraded` para que quede registro, no es claim de protección.
    return {
      ok: true,
      limit: cfg.max,
      remaining: cfg.max,
      resetSeconds: cfg.windowSeconds,
      degraded: true,
      mode: RATE_LIMIT_MODE.KV,
    }
  }

  const resetSeconds = cfg.windowSeconds - Math.floor((nowMs / 1000) % cfg.windowSeconds)

  if (count >= cfg.max) {
    return {
      ok: false,
      limit: cfg.max,
      remaining: 0,
      resetSeconds,
      degraded: true,
      mode: RATE_LIMIT_MODE.KV,
    }
  }

  try {
    await kv.put(storageKey, String(count + 1), { expirationTtl: cfg.windowSeconds * 2 })
  } catch {
    // sin escritura => sin incremento. Fail-open ya cubierto arriba.
  }

  return {
    ok: true,
    limit: cfg.max,
    remaining: Math.max(0, cfg.max - (count + 1)),
    resetSeconds: cfg.windowSeconds,
    degraded: true,
    mode: RATE_LIMIT_MODE.KV,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capa 3 — memoria del isolate (degradada)
// ─────────────────────────────────────────────────────────────────────────────

const memoryBuckets = new Map()

/** Limpia el fallback en memoria. Existe para tests. */
export function resetMemoryRateLimits() {
  memoryBuckets.clear()
}

async function checkMemory(key, cfg, nowMs) {
  const bucket = Math.floor(nowMs / 1000 / cfg.windowSeconds)
  const storageKey = `${cfg.keyPrefix}:${bucket}:${key}`
  const count = (memoryBuckets.get(storageKey) || 0) + 1
  memoryBuckets.set(storageKey, count)

  // Poda oportunista: no crecer sin límite.
  if (memoryBuckets.size > 5000) {
    for (const k of memoryBuckets.keys()) {
      if (!k.startsWith(`${cfg.keyPrefix}:${bucket}:`)) memoryBuckets.delete(k)
    }
  }

  const resetSeconds = cfg.windowSeconds - Math.floor((nowMs / 1000) % cfg.windowSeconds)
  if (count > cfg.max) {
    return {
      ok: false,
      limit: cfg.max,
      remaining: 0,
      resetSeconds,
      degraded: true,
      mode: RATE_LIMIT_MODE.MEMORY,
    }
  }
  return {
    ok: true,
    limit: cfg.max,
    remaining: cfg.max - count,
    resetSeconds,
    degraded: true,
    mode: RATE_LIMIT_MODE.MEMORY,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orquestación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comprueba y consume una unidad de cuota para `key`.
 *
 * Usa la capa más fuerte disponible: DO → KV → memoria. El resultado dice
 * siempre qué capa se usó (`mode`) y si es fiable (`degraded`).
 *
 * @param {object} env
 * @param {string} key
 * @param {{ max: number, windowSeconds: number, keyPrefix: string }} cfg
 * @param {number} nowMs
 * @returns {Promise<{ ok: boolean, limit: number, remaining: number, resetSeconds: number, degraded: boolean, mode: string }>}
 */
export async function checkRateLimit(env, key, cfg, nowMs) {
  const doResult = await checkDurableObject(env, key, cfg)
  if (doResult) return doResult

  const kvResult = await checkKv(env, key, cfg, nowMs)
  if (kvResult) return kvResult

  return checkMemory(key, cfg, nowMs)
}
