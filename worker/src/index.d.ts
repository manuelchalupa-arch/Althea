/**
 * Tipos del Cloudflare Worker (JS plano en el runtime).
 * Ninguna credencial de proveedor aparece aquí: se usa el binding `AI`.
 */

export interface WorkerEnv {
  /** Allowlist de origins separada por coma. Sin valor o con `*` => 500. */
  CORS_ORIGIN?: string
  /** Proyecto de Firebase Auth usado para verificar el ID token. */
  FIREBASE_PROJECT_ID?: string
  /** Modelo fijado en servidor. */
  AI_MODEL?: string
  /** Timeout de inferencia en ms. Default 60000. */
  AI_TIMEOUT_MS?: string
  /** Máximo de inferencias simultáneas globales. Default 6. */
  AI_MAX_CONCURRENCY?: string
  /** Presupuesto diario de neuronas. Default 9000 (gratis: 10000). */
  AI_DAILY_NEURON_BUDGET?: string
  /** Binding de Cloudflare Workers AI. */
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> }
  /** Capa 1 del rate limit: Durable Objects (strongly consistent). */
  RATE_LIMITER?: {
    getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> }
  }
  /** Capa 2 del rate limit y del presupuesto diario: KV namespace. */
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
  degraded?: boolean
  mode?: string
}

export type ValidationResult =
  | { ok: true; messages: Array<{ role: string; content: string }>; task: 'chat' | 'routine' }
  | { ok: false; code: string }

export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; code: string }

export declare function parseAllowedOrigins(raw: string | undefined | null): string[]
export declare function resolveAllowedOrigin(
  requestOrigin: string | null | undefined,
  allowed: string[] | undefined | null,
): string | null
export declare function isJsonContentType(contentType: string | null): boolean
export declare function readBodyWithLimit(request: Request, limitBytes: number): Promise<BodyResult>
export declare function validateChatPayload(body: unknown): ValidationResult
export declare function checkRateLimit(
  env: WorkerEnv,
  key: string,
  cfg: RateLimitConfig,
  nowMs: number,
): Promise<RateLimitResult>
export declare function resetMemoryRateLimits(): void
export declare function resetConcurrency(): void
export declare function verifyFirebaseIdToken(token: unknown, projectId: unknown): Promise<string | null>
export declare function resetJwksCache(): void
export declare function estimateNeurons(messages: Array<{ content: string }>, maxCompletionTokens: number): number
export declare function reserveDailyNeurons(
  env: WorkerEnv,
  cost: number,
  nowMs?: number,
): Promise<{ ok: boolean; limit: number; remaining: number; resetSeconds: number; degraded: boolean; mode: string }>
export declare function utcDayKey(nowMs?: number): string
export declare function secondsUntilUtcMidnight(nowMs?: number): number

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
  reserveBudget(request: Request): Promise<Response>
  acquireSlot(request: Request): Promise<Response>
  releaseSlot(request: Request): Promise<Response>
  alarm(): Promise<void>
}

declare const worker: {
  fetch(request: Request, env?: WorkerEnv): Promise<Response>
}

export default worker
