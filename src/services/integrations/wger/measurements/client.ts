// wgerMeasurementClient — Cliente HTTP para mediciones corporales.
// FASE 14: Progreso corporal.
//
// WGER permite almacenar métricas corporales con categoría, unidad y timestamp.
// No importar datos médicos o métricas sin correspondencia clara.

import type {
  WgerMeasurementCategoryListResponse,
  WgerMeasurementListResponse,
} from './types'
import { WGER_API_BASE as BASE, getJSON } from '../wgerHttp'

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
