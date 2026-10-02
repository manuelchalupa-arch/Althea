/**
 * Tipos de la capa de rate limiting del Worker.
 *
 * El Worker es JS plano (lo exige el runtime de Cloudflare). Este archivo le
 * da tipos al código que lo importa — principalmente los tests — para que un
 * cambio en la firma rompa la compilación en vez de fallar en silencio.
 */

export interface RateLimitConfig {
  max: number
  windowSeconds: number
  keyPrefix: string
}

export type RateLimitMode = 'durable-object' | 'kv' | 'memory-degraded' | 'unavailable'

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  resetSeconds: number
  /** true si el resultado no es fiable como control (capa degradada o caída). */
  degraded: boolean
  /** Capa usada. Viaja en la cabecera `X-RateLimit-Mode`. */
  mode: RateLimitMode
}

export interface RateLimiterEnv {
  RATE_LIMITER?: {
    getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> }
  }
  RATE_LIMIT?: {
    get(key: string): Promise<string | null>
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  }
}

export interface DurableObjectState {
  storage: {
    get(key: string): Promise<unknown>
    put(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    list(options?: unknown): Promise<Map<string, unknown>>
    setAlarm(timestamp: number): Promise<void>
    deleteAlarm(): Promise<void>
  }
}

export declare const RATE_LIMIT_MODE: {
  DURABLE_OBJECT: 'durable-object'
  KV: 'kv'
  MEMORY: 'memory-degraded'
  NONE: 'unavailable'
}

/** Durable Object contador de ventana fija. Capa fuerte del rate limit. */
export declare class RateLimiter {
  constructor(state: DurableObjectState)
  fetch(request: Request): Promise<Response>
  alarm(state: DurableObjectState, timestamp: number): Promise<void>
}

/**
 * Comprueba y consume una unidad de cuota. Usa la capa más fuerte disponible:
 * Durable Object → KV → memoria, y declara siempre cuál se usó.
 */
export declare function checkRateLimit(
  env: RateLimiterEnv,
  key: string,
  cfg: RateLimitConfig,
  nowMs: number,
): Promise<RateLimitResult>

/** Limpia el fallback en memoria. Existe para tests. */
export declare function resetMemoryRateLimits(): void
