// wgerTrainingMapper — Convierte WgerWorkoutSession → TrainingSession (Althea).
// FASE 6: Entrenamiento real. PLANNED vs ACTUAL.
// NUNCA convertir un WorkoutLog remoto en modificación de rutina planificada.

import type { TrainingSession, SessionExercise, SetRecord, SessionStatus } from '@/services/training/domain'
import type { Load } from '@/services/training/loadModel'
import type { WgerWorkoutSession, WgerWorkoutLog } from './types'

// ─── Mapeo de impresión WGER → estado de sesión ───
function mapImpressionToStatus(impression: string | null): SessionStatus {
  switch (impression) {
    case '1': return 'COMPLETED'  // bad → completed but poor
    case '2': return 'COMPLETED'  // neutral
    case '3': return 'COMPLETED'  // good
    default: return 'COMPLETED'
  }
}

// ─── Mapeo de unidad de peso WGER → LoadType ───
function mapWeightUnitToLoadType(unitName: string): Load['unit'] {
  const u = unitName.toLowerCase()
  if (u.includes('kg') || u.includes('kilogram')) {return 'KG'}
  if (u.includes('lb') || u.includes('pound')) {return 'LB'}
  if (u.includes('plate') || u.includes('placa')) {return 'PLATE_COUNT'}
  if (u.includes('stack') || u.includes('lingote') || u.includes('bloque')) {return 'STACK_COUNT'}
  if (u.includes('unit') || u.includes('unidad')) {return 'UNIT'}
  return 'KG'  // default
}

// ─── Crear Load desde WGER ───
function createLoad(weight: number | null, unitName: string): Load | null {
  if (weight === null) {return null}
  const unit = mapWeightUnitToLoadType(unitName)
  return { value: weight, unit }
}

// ─── Mapear WgerWorkoutSession → TrainingSession ───
export function wgerSessionToAlthea(session: WgerWorkoutSession): TrainingSession {
  const status = mapImpressionToStatus(session.impression)
  const startedAt = session.start_time || session.time_start || undefined
  const endedAt = session.end_time || session.time_end || undefined

  return {
    id: `wger-session-${session.id}`,
    sessionId: `wger-session-${session.id}`,
    userId: 'wger-import',
    routineId: `wger-workout-${session.workout}`,
    cycleId: undefined,
    weekId: undefined,
    weekNumber: undefined,
    plannedDay: null,
    plannedDayName: null,
    actualDay: null,
    actualDayName: null,
    calendarDate: session.date,
    routineName: `WGER Workout ${session.workout}`,
    sessionStatus: status,
    startedAt,
    pausedAt: undefined,
    resumedAt: undefined,
    completingAt: undefined,
    completedAt: endedAt,
    cancelledAt: undefined,
    abandonedAt: undefined,
    endedAt,
    totalPausedDurationSec: undefined,
    currentExerciseId: undefined,
    currentExerciseIndex: undefined,
    currentSetIndex: undefined,
    resumeCount: undefined,
    plannedExerciseCount: undefined,
    completedExerciseCount: undefined,
    skippedExerciseCount: undefined,
    modifiedExerciseCount: undefined,
    replacedExerciseCount: undefined,
    extraExerciseCount: undefined,
    plannedSets: undefined,
    completedSets: undefined,
    totalReps: undefined,
    totalVolume: undefined,
    plannedMuscleGroups: undefined,
    actualMuscleGroups: undefined,
    dayChange: undefined,
    generalObservation: session.notes || undefined,
    cancelReason: undefined,
    cancelComment: undefined,
    abandonReason: undefined,
    abandonComment: undefined,
    surveyId: undefined,
    createdAt: session.created,
    updatedAt: session.last_update,
    isDemo: false,
  }
}

// ─── Mapear WgerWorkoutLog → SetRecord ───
// Cada serie real conserva su identidad propia.
// NUNCA agrupar series únicamente por peso/reps/timestamp.
export function wgerLogToAltheaSetRecord(
  log: WgerWorkoutLog,
  sessionExerciseId: string,
  sessionId: string,
  exerciseId: string,
): SetRecord {
  const load = createLoad(log.weight, log.weight_unit_name)
  const actualWeight = load ? load.value : null

  return {
    setRecordId: `wger-log-${log.id}`,
    sessionId,
    sessionExerciseId,
    exerciseId,
    order: log.order,
    setType: 'NORMAL',  // WGER no tiene tipos de serie avanzados
    plannedReps: log.repetitions,
    plannedWeight: actualWeight,
    actualReps: log.repetitions,
    actualWeight,
    status: 'COMPLETED',
    observation: log.comment || undefined,
    obs: log.comment || undefined,
    actualLoadText: load ? `${load.value} ${load.unit}` : undefined,
    completedAt: log.created,
    createdAt: log.created,
    updatedAt: log.last_update,
    isDemo: false,
  }
}

// ─── Agrupar logs por ejercicio ───
// Crea SessionExercise por cada ejercicio único en los logs.
export function groupLogsByExercise(logs: WgerWorkoutLog[]): Map<string, WgerWorkoutLog[]> {
  const groups = new Map<string, WgerWorkoutLog[]>()
  for (const log of logs) {
    const key = `${log.exercise}`
    const existing = groups.get(key) || []
    existing.push(log)
    groups.set(key, existing)
  }
  return groups
}

// ─── Crear SessionExercise desde logs agrupados ───
export function createSessionExerciseFromLogs(
  logs: WgerWorkoutLog[],
  sessionId: string,
  order: number,
): SessionExercise {
  const firstLog = logs[0]
  const exerciseId = `wger-exercise-${firstLog.exercise}`
  const setRecords = logs.map((log) =>
    wgerLogToAltheaSetRecord(log, `${sessionId}:exercise:${exerciseId}`, sessionId, exerciseId)
  )

  return {
    sessionExerciseId: `${sessionId}:exercise:${exerciseId}`,
    sessionId,
    exerciseId,
    exerciseName: firstLog.exercise_name,
    routineExerciseId: undefined,
    order,
    planned: false,
    completed: true,
    status: 'COMPLETED',
    plannedSetCount: logs.length,
    actualSetCount: logs.length,
    plannedSets: [],
    restSec: undefined,
    seriesType: 'NORMAL',
    tempo: undefined,
    targetRir: firstLog.rippetenz ?? undefined,
    targetRpe: undefined,
    notes: undefined,
    actualSets: setRecords.map((sr) => ({
      order: sr.order,
      reps: sr.actualReps,
      weight: sr.actualWeight,
      setType: sr.setType,
    })),
    replacement: undefined,
    negatives: undefined,
    observation: undefined,
    skipReason: undefined,
    skipComment: undefined,
    createdAt: firstLog.created,
    updatedAt: firstLog.last_update,
    isDemo: false,
  }
}

// ─── Mapear sesión completa con ejercicios y series ───
export function wgerSessionWithExercisesToAlthea(
  session: WgerWorkoutSession,
  logs: WgerWorkoutLog[],
): { session: TrainingSession; exercises: SessionExercise[] } {
  const altheaSession = wgerSessionToAlthea(session)
  const grouped = groupLogsByExercise(logs)

  const exercises: SessionExercise[] = []
  let order = 1
  for (const [, exerciseLogs] of grouped) {
    const sessionExercise = createSessionExerciseFromLogs(
      exerciseLogs,
      altheaSession.sessionId,
      order++,
    )
    exercises.push(sessionExercise)
  }

  // Actualizar contadores de sesión
  altheaSession.plannedExerciseCount = exercises.length
  altheaSession.completedExerciseCount = exercises.length
  altheaSession.plannedSets = exercises.reduce((sum, e) => sum + e.plannedSetCount, 0)
  altheaSession.completedSets = exercises.reduce((sum, e) => sum + e.actualSetCount, 0)
  altheaSession.totalReps = exercises.reduce((sum: number, e: SessionExercise) => sum + (e.actualSets?.reduce((s: number, a: { reps: number }) => s + a.reps, 0) ?? 0), 0)
  altheaSession.totalVolume = exercises.reduce((sum: number, e: SessionExercise) => sum + (e.actualSets?.reduce((s: number, a: { weight: number | null; reps: number }) => s + (a.weight || 0) * a.reps, 0) ?? 0), 0)

  return { session: altheaSession, exercises }
}
