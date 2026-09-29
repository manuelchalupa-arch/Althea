// wgerSecurity — Seguridad para la integración WGER.
// FASE 22: Seguridad.
//
// REGLAS:
// - HTTPS only.
// - Validación de inputs con Zod.
// - Timeout y AbortController en todas las requests.
// - Manejo seguro de errores (no exponer tokens ni secretos).
// - Sanitización de strings.
// - No exponer tokens en logs ni errores.
// - Límites de tamaño en payloads.
// - Validación de respuestas inesperadas.
// - Comprobación de ownership antes de escribir recursos privados.
// - Nunca confiar ciegamente en una respuesta remota.

import { z } from 'zod'

// ─── Schemas Zod para validación ───

export const WgerIdSchema = z.number().int().positive()

export const WgerUrlSchema = z.string().url().max(2048)

export const WgerLanguageSchema = z.number().int().min(1).max(100)

export const WgerPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

export const WgerListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number().int().min(0),
    next: z.string().url().nullable(),
    previous: z.string().url().nullable(),
    results: z.array(itemSchema),
  })

export const WgerExerciseListItemSchema = z.object({
  id: WgerIdSchema,
  uuid: z.string().uuid(),
  created: z.string(),
  last_update: z.string(),
  category: WgerIdSchema,
  muscles: z.array(WgerIdSchema),
  muscles_secondary: z.array(WgerIdSchema),
  equipment: z.array(WgerIdSchema),
  variation_group: z.string().nullable(),
  license_author: z.string(),
})

export const WgerLicenseSchema = z.object({
  id: WgerIdSchema,
  full_name: z.string(),
  short_name: z.string(),
  url: z.string(),
})

export const WgerExerciseInfoSchema = z.object({
  id: WgerIdSchema,
  uuid: z.string().uuid(),
  created: z.string(),
  last_update: z.string(),
  category: z.object({ id: WgerIdSchema, name: z.string() }),
  muscles: z.array(z.object({ id: WgerIdSchema, name: z.string(), name_en: z.string(), is_front: z.boolean(), image_url_main: z.string(), image_url_secondary: z.string() })),
  muscles_secondary: z.array(z.object({ id: WgerIdSchema, name: z.string(), name_en: z.string(), is_front: z.boolean(), image_url_main: z.string(), image_url_secondary: z.string() })),
  equipment: z.array(z.object({ id: WgerIdSchema, name: z.string() })),
  license: WgerLicenseSchema,
  license_author: z.string(),
  images: z.array(z.object({
    id: WgerIdSchema,
    uuid: z.string().uuid(),
    exercise: WgerIdSchema,
    image: z.string().url(),
    is_main: z.boolean(),
    style: z.string(),
    license: WgerIdSchema,
    license_title: z.string(),
    license_object_url: z.string(),
    license_author: z.string(),
    license_author_url: z.string(),
    license_derivative_source_url: z.string(),
  })),
  translations: z.array(z.object({
    id: WgerIdSchema,
    uuid: z.string().uuid(),
    name: z.string(),
    exercise: WgerIdSchema,
    description: z.string(),
    description_source: z.string(),
    language: WgerLanguageSchema,
    aliases: z.array(z.string()),
    notes: z.array(z.string()),
  })),
  videos: z.array(z.unknown()),
})

export const WgerIngredientSchema = z.object({
  id: WgerIdSchema,
  uuid: z.string().uuid(),
  remote_id: z.string().nullable(),
  source_name: z.string(),
  source_url: z.string(),
  code: z.string(),
  name: z.string(),
  common_name: z.string(),
  brand: z.string(),
  energy: z.number(),
  protein: z.string().nullable(),
  carbohydrates: z.string().nullable(),
  carbohydrates_sugar: z.string().nullable(),
  fat: z.string().nullable(),
  fat_saturated: z.string().nullable(),
  fiber: z.string().nullable(),
  sodium: z.string().nullable(),
  is_vegan: z.boolean().nullable(),
  is_vegetarian: z.boolean().nullable(),
  nutriscore: z.string().nullable(),
  weight_units: z.array(z.object({
    id: WgerIdSchema,
    uuid: z.string().uuid(),
    ingredient: WgerIdSchema,
    gram: z.number(),
    name: z.string(),
  })),
  license: WgerIdSchema,
  license_title: z.string(),
  license_object_url: z.string(),
  license_author: z.string(),
  language: WgerLanguageSchema,
})

// ─── Configuración de seguridad ───

export const WGER_SECURITY_CONFIG = {
  baseUrl: 'https://wger.de/api/v2',
  timeoutMs: 10000,
  maxPayloadSizeBytes: 5 * 1024 * 1024,
  maxRetries: 3,
  retryDelayMs: 1000,
  userAgent: 'Althea-PWA/1.0',
} as const

// ─── Sanitización ───

export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
}

export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return ''
    }
    return parsed.toString()
  } catch {
    return ''
  }
}

export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeString(error.message)
  }
  return 'Unknown error'
}

// ─── Validación de respuestas ───

export interface ValidationResult<T> {
  success: boolean
  data?: T
  error?: string
}

export function validateResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string,
): ValidationResult<T> {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')

  return {
    success: false,
    error: `Invalid ${context} response: ${issues}`,
  }
}

// ─── Fetch seguro con timeout y AbortController ───

export interface SecureFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
}

export async function secureFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options: SecureFetchOptions = {},
): Promise<ValidationResult<T>> {
  const timeoutMs = options.timeoutMs || WGER_SECURITY_CONFIG.timeoutMs
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const sanitizedUrl = sanitizeUrl(url)
    if (!sanitizedUrl) {
      return { success: false, error: 'Invalid URL' }
    }

    const response = await fetch(sanitizedUrl, {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': WGER_SECURITY_CONFIG.userAgent,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ${response.statusText}`,
      }
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > WGER_SECURITY_CONFIG.maxPayloadSizeBytes) {
      return { success: false, error: 'Payload too large' }
    }

    const data: unknown = await response.json()
    return validateResponse(schema, data, url)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timeout' }
    }
    return { success: false, error: sanitizeErrorMessage(error) }
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── Verificación de ownership ───

export interface OwnershipCheck {
  ownerId: string
  resourceId: string
  resourceType: string
}

export function verifyOwnership(
  check: OwnershipCheck,
  currentUserId: string,
): { allowed: boolean; reason?: string } {
  if (check.ownerId !== currentUserId) {
    return {
      allowed: false,
      reason: `User ${currentUserId} does not own ${check.resourceType} ${check.resourceId}`,
    }
  }
  return { allowed: true }
}

// ─── Validación de inputs ───

export function validateId(id: number | string): ValidationResult<number> {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id
  const result = WgerIdSchema.safeParse(numId)

  if (result.success) {
    return { success: true, data: result.data }
  }

  return { success: false, error: 'Invalid ID' }
}

export function validatePagination(opts: { limit?: number; offset?: number }): ValidationResult<{ limit: number; offset: number }> {
  const result = WgerPaginationSchema.safeParse(opts)

  if (result.success) {
    return { success: true, data: result.data }
  }

  return { success: false, error: 'Invalid pagination parameters' }
}

// ─── Manejo seguro de errores ───

export class WgerSecurityError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_INPUT' | 'INVALID_RESPONSE' | 'TIMEOUT' | 'HTTP_ERROR' | 'OWNERSHIP_VIOLATION' | 'PAYLOAD_TOO_LARGE',
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'WgerSecurityError'
  }
}

export function handleSecurityError(error: unknown): WgerSecurityError {
  if (error instanceof WgerSecurityError) {
    return error
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new WgerSecurityError('Request timeout', 'TIMEOUT')
    }
    return new WgerSecurityError(sanitizeErrorMessage(error), 'HTTP_ERROR')
  }

  return new WgerSecurityError('Unknown security error', 'HTTP_ERROR')
}
