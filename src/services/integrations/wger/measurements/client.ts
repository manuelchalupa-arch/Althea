// wgerMeasurementClient — Cliente HTTP para mediciones corporales.
// FASE 14: Progreso corporal.
//
// WGER permite almacenar métricas corporales con categoría, unidad y timestamp.
// No importar datos médicos o métricas sin correspondencia clara.

import type {
  WgerMeasurementCategoryListResponse,
  WgerMeasurementListResponse,
} from './types'

const BASE = 'https://wger.de/api/v2'

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {throw new Error(`Wger ${res.status} ${url}`)}
  return res.json() as Promise<T>
}

// ─── Measurement Categories ───
// GET /measurementcategory/

export function fetchMeasurementCategories(
  signal?: AbortSignal,
): Promise<WgerMeasurementCategoryListResponse> {
  return getJSON(`${BASE}/measurementcategory/?format=json`, signal)
}

// ─── Measurements ───
// GET /measurement/?category={id}&date={date}

export function fetchMeasurements(
  opts: { category?: number; date?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerMeasurementListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.category) {params.set('category', String(opts.category))}
  if (opts.date) {params.set('date', opts.date)}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/measurement/?${params}`, signal)
}
