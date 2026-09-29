// Tipos crudos de la API REST Wger /api/v2/ — estadísticas de rutinas.
// Referencia: https://wger.de/api/v2/
// FASE 10: Estadísticas.
//
// WGER puede servir como: validación, comparación, importación, enriquecimiento, compatibilidad.
// NO duplicar estadísticas si Althea ya puede calcularlas a partir de su historial canónico.
// Preferencia: Althea calcula sus propias métricas.

import type { WgerListResponse } from '../wgerTypes'

export interface WgerRoutineStructure {
  id: number
  routine: number
  days: Array<{
    id: number
    day: number
    name: string
    slots: Array<{
      id: number
      day: number
      order: number
      entries: Array<{
        id: number
        slot: number
        exercise: number
        order: number
        sets: number
        reps: number | null
        weight: number | null
        weight_unit: number | null
        repetition_unit: number | null
        rippetenz: number | null
        rest: number | null
      }>
    }>
  }>
}

export interface WgerRoutineDateSequence {
  id: number
  routine: number
  dates: string[]
}

export interface WgerRoutineStats {
  id: number
  routine: number
  total_workouts: number
  total_sets: number
  total_reps: number
  total_weight: number
  avg_weight: number
  max_weight: number
  min_weight: number
  last_workout: string | null
  first_workout: string | null
}

export interface WgerRoutineStructureResponse extends WgerListResponse<WgerRoutineStructure> {}
export interface WgerRoutineDateSequenceResponse extends WgerListResponse<WgerRoutineDateSequence> {}
export interface WgerRoutineStatsResponse extends WgerListResponse<WgerRoutineStats> {}
