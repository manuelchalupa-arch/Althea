/**
 * Tipos del Cloudflare Worker.
 *
 * El Worker es JS plano (lo exige el runtime de Cloudflare). Este archivo le
 * da tipos al código que lo importa — principalmente los tests — para que un
 * cambio en la firma rompa la compilación en vez de fallar en silencio.
 */

export interface WorkerEnv {
  /** Allowlist de origins separada por coma. Sin valor o con `*` => 500. */
  CORS_ORIGIN?: string
  /** Secret server-side. Nunca en el frontend. */
  GROQ_API_KEY?: string
  /** URL del proveedor. Configurada en wrangler, nunca por el cliente. */
  GROQ_URL?: string
  /** Timeout de la llamada a Groq en ms. Default 60000. */
  GROQ_TIMEOUT_MS?: string
  /** Timeout de las llamadas WGER en ms. Default 15000. */
  WGER_TIMEOUT_MS?: string
  /** Capa 1 del rate limit: namespace de Durable Objects (strongly consistent). */
  RATE_LIMITER?: {
    getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> }
  }
  /** Capa 2 del rate limit: KV namespace (eventualmente consistente). */
  RATE_LIMIT?: {
    get(key: string): Promise<string | null>
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  }
}

export interface RateLimitConfig {
  max: number
  windowSeconds: number
  keyPrefix: string
}

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  resetSeconds: number
  /** true si el resultado no es fiable como control (capa degradada o caída). */
  degraded?: boolean
  /** Capa usada: 'durable-object' | 'kv' | 'memory-degraded'. */
  mode?: string
}

export type ValidationResult =
  | { ok: true; messages: Array<{ role: string; content: string }> }
  | { ok: false; code: string }

export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; code: string }

export type TimeoutResult = Response | { timeout: true } | { error: true }

export declare function parseAllowedOrigins(raw: string | undefined | null): string[]

export declare function resolveAllowedOrigin(
  requestOrigin: string | null | undefined,
  allowed: string[] | undefined | null,
): string | null

export declare function isJsonContentType(contentType: string | null): boolean

export declare function readBodyWithLimit(
  request: Request,
  limitBytes: number,
): Promise<BodyResult>

export declare function validateChatPayload(body: unknown): ValidationResult

export declare function checkRateLimit(
  env: WorkerEnv,
  key: string,
  cfg: RateLimitConfig,
  nowMs: number,
): Promise<RateLimitResult>

export declare function resetMemoryRateLimits(): void

export declare const RATE_LIMIT_MODE: {
  DURABLE_OBJECT: 'durable-object'
  KV: 'kv'
  MEMORY: 'memory-degraded'
  NONE: 'unavailable'
}

/** Durable Object contador de ventana fija. La capa fuerte del rate limit. */
export declare class RateLimiter {
  constructor(state: {
    storage: {
      get(key: string): Promise<unknown>
      put(key: string, value: unknown): Promise<void>
      delete(key: string): Promise<void>
      list(opts?: unknown): Promise<Map<string, unknown>>
      setAlarm(timestamp: number): Promise<void>
      deleteAlarm(): Promise<void>
    }
  })
  fetch(request: Request): Promise<Response>
  alarm(state: unknown, timestamp: number): Promise<void>
}

export declare function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<TimeoutResult>

declare const worker: {
  fetch(request: Request, env?: WorkerEnv): Promise<Response>
}

export default worker
