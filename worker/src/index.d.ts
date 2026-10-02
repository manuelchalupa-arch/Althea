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
  /** Binding KV opcional para el rate limit distribuido. */
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
  /** true si el resultado no es fiable como control (KV caído o sin binding). */
  degraded?: boolean
  /** true si se usó la capa KV distribuida. */
  kvUsed?: boolean
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

export declare function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<TimeoutResult>

declare const worker: {
  fetch(request: Request, env?: WorkerEnv): Promise<Response>
}

export default worker
