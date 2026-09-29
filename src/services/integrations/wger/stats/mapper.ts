// wgerStatsMapper — Convierte estadísticas WGER → modelo Althea.
// FASE 10: Estadísticas.
//
// WGER puede servir como: validación, comparación, importación, enriquecimiento, compatibilidad.
// NO duplicar estadísticas si Althea ya puede calcularlas a partir de su historial canónico.
// Preferencia: Althea calcula sus propias métricas.

import type { WgerRoutineStats, WgerRoutineStructure, WgerRoutineDateSequence } from './types'

// ─── Estadísticas de rutina Althea ───
// Althea calcula sus propias métricas a partir del historial canónico.
// Las estadísticas de WGER se usan solo como validación o comparación.

export interface AltheaRoutineStats {
  routineId: string
  source: 'wger'
  sourceId: number
  totalWorkouts: number
  totalSets: number
  totalReps: number
  totalWeight: number
  avgWeight: number
  maxWeight: number
  minWeight: number
  lastWorkout: string | null
  firstWorkout: string | null
}

// ─── Mapear WgerRoutineStats → AltheaRoutineStats ───
export function mapWgerRoutineStatsToAlthea(
  stats: WgerRoutineStats,
  altheaRoutineId: string,
): AltheaRoutineStats {
  return {
    routineId: altheaRoutineId,
    source: 'wger',
    sourceId: stats.routine,
    totalWorkouts: stats.total_workouts,
    totalSets: stats.total_sets,
    totalReps: stats.total_reps,
    totalWeight: stats.total_weight,
    avgWeight: stats.avg_weight,
    maxWeight: stats.max_weight,
    minWeight: stats.min_weight,
    lastWorkout: stats.last_workout,
    firstWorkout: stats.first_workout,
  }
}

// ─── Estructura de rutina ───
// WGER tiene una estructura de rutina que puede usarse para validación o comparación.

export interface AltheaRoutineStructure {
  routineId: string
  source: 'wger'
  sourceId: number
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
        weightUnit: number | null
        repetitionUnit: number | null
        rippetenz: number | null
        rest: number | null
      }>
    }>
  }>
}

// ─── Mapear WgerRoutineStructure → AltheaRoutineStructure ───
export function mapWgerRoutineStructureToAlthea(
  structure: WgerRoutineStructure,
  altheaRoutineId: string,
): AltheaRoutineStructure {
  return {
    routineId: altheaRoutineId,
    source: 'wger',
    sourceId: structure.routine,
    days: structure.days.map((day) => ({
      id: day.id,
      day: day.day,
      name: day.name,
      slots: day.slots.map((slot) => ({
        id: slot.id,
        day: slot.day,
        order: slot.order,
        entries: slot.entries.map((entry) => ({
          id: entry.id,
          slot: entry.slot,
          exercise: entry.exercise,
          order: entry.order,
          sets: entry.sets,
          reps: entry.reps,
          weight: entry.weight,
          weightUnit: entry.weight_unit,
          repetitionUnit: entry.repetition_unit,
          rippetenz: entry.rippetenz,
          rest: entry.rest,
        })),
      })),
    })),
  }
}

// ─── Secuencia de fechas ───
// WGER tiene secuencias de fechas que pueden usarse para validación o comparación.

export interface AltheaRoutineDateSequence {
  routineId: string
  source: 'wger'
  sourceId: number
  dates: string[]
}

// ─── Mapear WgerRoutineDateSequence → AltheaRoutineDateSequence ───
export function mapWgerRoutineDateSequenceToAlthea(
  sequence: WgerRoutineDateSequence,
  altheaRoutineId: string,
): AltheaRoutineDateSequence {
  return {
    routineId: altheaRoutineId,
    source: 'wger',
    sourceId: sequence.routine,
    dates: sequence.dates,
  }
}

// ─── Comparar estadísticas ───
// Compara estadísticas de WGER con las calculadas por Althea.
// No duplicar estadísticas si Althea ya puede calcularlas.

export interface StatsComparison {
  field: string
  altheaValue: number
  wgerValue: number
  difference: number
  match: boolean
}

export function compareStats(
  althea: { totalWorkouts: number; totalSets: number; totalReps: number; totalWeight: number },
  wger: AltheaRoutineStats,
): StatsComparison[] {
  const comparisons: StatsComparison[] = [
    {
      field: 'totalWorkouts',
      altheaValue: althea.totalWorkouts,
      wgerValue: wger.totalWorkouts,
      difference: Math.abs(althea.totalWorkouts - wger.totalWorkouts),
      match: althea.totalWorkouts === wger.totalWorkouts,
    },
    {
      field: 'totalSets',
      altheaValue: althea.totalSets,
      wgerValue: wger.totalSets,
      difference: Math.abs(althea.totalSets - wger.totalSets),
      match: althea.totalSets === wger.totalSets,
    },
    {
      field: 'totalReps',
      altheaValue: althea.totalReps,
      wgerValue: wger.totalReps,
      difference: Math.abs(althea.totalReps - wger.totalReps),
      match: althea.totalReps === wger.totalReps,
    },
    {
      field: 'totalWeight',
      altheaValue: althea.totalWeight,
      wgerValue: wger.totalWeight,
      difference: Math.abs(althea.totalWeight - wger.totalWeight),
      match: althea.totalWeight === wger.totalWeight,
    },
  ]

  return comparisons
}
