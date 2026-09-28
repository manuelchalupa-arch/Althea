// wgerClient — Cliente HTTP para la API REST Wger /api/v2/.
// Solo consume los endpoints necesarios. Sin autenticación para lectura.
// La API es pública para GET; no se usan tokens.

import type {
  WgerListResponse,
  WgerMuscle,
  WgerEquipment,
  WgerCategory,
  WgerExerciseListItem,
  WgerExerciseInfo,
  WgerTranslation,
  WgerIngredient,
} from './wgerTypes'

const BASE = 'https://wger.de/api/v2'

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {throw new Error(`Wger ${res.status} ${url}`)}
  return res.json() as Promise<T>
}

// ─── Endpoints ───
// GET /exercise/           lista de ejercicios (IDs, sin nombres)
// GET /exerciseinfo/{id}/  detalle completo (músculos, equipo, traducciones, licencia)
// GET /exercise-translation/ traducciones con nombre/descripción
// GET /muscle/             músculos
// GET /equipment/          equipamiento
// GET /category/           categorías
// GET /ingredient/         ingredientes (Open Food Facts)

export function fetchExerciseList(
  opts: { limit?: number; offset?: number; language?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerExerciseListItem>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  if (opts.language) {params.set('language', String(opts.language))}
  return getJSON(`${BASE}/exercise/?${params}`, signal)
}

export function fetchExerciseInfo(
  id: number,
  signal?: AbortSignal,
): Promise<WgerExerciseInfo> {
  return getJSON(`${BASE}/exerciseinfo/${id}/?format=json`, signal)
}

export function fetchMuscles(signal?: AbortSignal): Promise<WgerListResponse<WgerMuscle>> {
  return getJSON(`${BASE}/muscle/?format=json`, signal)
}

export function fetchEquipment(signal?: AbortSignal): Promise<WgerListResponse<WgerEquipment>> {
  return getJSON(`${BASE}/equipment/?format=json`, signal)
}

export function fetchCategories(signal?: AbortSignal): Promise<WgerListResponse<WgerCategory>> {
  return getJSON(`${BASE}/category/?format=json`, signal)
}

export function fetchExerciseTranslations(
  opts: { exercise?: number; language?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerTranslation>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.exercise) {params.set('exercise', String(opts.exercise))}
  if (opts.language) {params.set('language', String(opts.language))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/exercise-translation/?${params}`, signal)
}

export function fetchIngredients(
  opts: { limit?: number; offset?: number; language?: number; search?: string } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerIngredient>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  if (opts.language) {params.set('language', String(opts.language))}
  if (opts.search) {params.set('search', opts.search)}
  return getJSON(`${BASE}/ingredient/?${params}`, signal)
}
