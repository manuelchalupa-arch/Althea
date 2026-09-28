// wgerClient — Cliente HTTP para la API REST Wger /api/v2/.
// Solo consume los endpoints necesarios. Sin autenticación para lectura.
// La API es pública para GET; no se usan tokens.

import type {
  WgerListResponse,
  WgerExerciseListItem,
  WgerExerciseInfo,
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
//
// Taxonomía (muscle/equipment/category), traducciones e ingredientes NO tienen
// fetcher propio: la taxonomía y las traducciones viajan dentro de exerciseinfo
// (las resuelve wgerMapper) y los ingredientes pertenecen al módulo de
// nutrición propio de Althea. Decisión documentada en el cierre de Wger.

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
