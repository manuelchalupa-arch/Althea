const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 1_000

export interface RetryOptions {
  timeoutMs?: number
  maxRetries?: number
  baseDelayMs?: number
}

export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timeout after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
  }
}

export class RetryExhaustedError extends Error {
  public readonly cause: unknown
  constructor(attempts: number, cause: unknown) {
    super(`All ${attempts} attempts failed`)
    this.name = 'RetryExhaustedError'
    this.cause = cause
  }
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof TimeoutError) {return true}
  if (err instanceof TypeError && err.message.includes('fetch')) {return true}
  if (err instanceof DOMException && err.name === 'AbortError') {return true}
  return false
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new TimeoutError(timeoutMs)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs)

      if (!res.ok && isRetryableStatus(res.status) && attempt < maxRetries) {
        lastError = new Error(`HTTP ${res.status}`)
        const delay = baseDelayMs * 2 ** (attempt - 1)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }

      return res
    } catch (err) {
      lastError = err

      if (!isRetryableError(err) || attempt >= maxRetries) {
        throw err
      }

      const delay = baseDelayMs * 2 ** (attempt - 1)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw new RetryExhaustedError(maxRetries, lastError)
}
