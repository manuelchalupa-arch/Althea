// wgerStatsClient — Cliente HTTP para estadísticas de rutinas.
// FASE 10: Estadísticas.
//
// WGER puede servir como: validación, comparación, importación, enriquecimiento, compatibilidad.
// NO duplicar estadísticas si Althea ya puede calcularlas a partir de su historial canónico.

import type {
  WgerRoutineStructureResponse,
  WgerRoutineDateSequenceResponse,
  WgerRoutineStatsResponse,
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

// ─── Routine Structure ───
// GET /routine/{id}/structure/

export function fetchRoutineStructure(
  routineId: number,
  signal?: AbortSignal,
): Promise<WgerRoutineStructureResponse> {
  return getJSON(`${BASE}/routine/${routineId}/structure/?format=json`, signal)
}

// ─── Routine Date Sequence Display ───
// GET /routine/{id}/date-sequence-display/

export function fetchRoutineDateSequenceDisplay(
  routineId: number,
  signal?: AbortSignal,
): Promise<WgerRoutineDateSequenceResponse> {
  return getJSON(`${BASE}/routine/${routineId}/date-sequence-display/?format=json`, signal)
}

// ─── Routine Date Sequence Gym ───
// GET /routine/{id}/date-sequence-gym/

export function fetchRoutineDateSequenceGym(
  routineId: number,
  signal?: AbortSignal,
): Promise<WgerRoutineDateSequenceResponse> {
  return getJSON(`${BASE}/routine/${routineId}/date-sequence-gym/?format=json`, signal)
}

// ─── Routine Logs ───
// GET /routine/{id}/logs/

export function fetchRoutineLogs(
  routineId: number,
  signal?: AbortSignal,
): Promise<WgerRoutineStatsResponse> {
  return getJSON(`${BASE}/routine/${routineId}/logs/?format=json`, signal)
}

// ─── Routine Stats ───
// GET /routine/{id}/stats/

export function fetchRoutineStats(
  routineId: number,
  signal?: AbortSignal,
): Promise<WgerRoutineStatsResponse> {
  return getJSON(`${BASE}/routine/${routineId}/stats/?format=json`, signal)
}
