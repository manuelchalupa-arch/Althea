// Tipos crudos de la API REST Wger /api/v2/ — workout sessions y logs.
// Referencia: https://wger.de/api/v2/
// FASE 6-9: Entrenamiento real, series, carga y progresiones.

import type { WgerListResponse } from '../wgerTypes'

// ─── Workout Session ───
// WGER conserva valores planificados y realizados.
// En Althea: Routine = planificación, TrainingSession = ejecución real.

export interface WgerWorkoutSession {
  id: number
  uuid: string
  workout: number
  date: string
  start_time: string | null
  end_time: string | null
  notes: string | null
  impression: '1' | '2' | '3' | null  // 1=bad, 2=neutral, 3=good
  time_start: string | null
  time_end: string | null
  created: string
  last_update: string
}

export interface WgerWorkoutSessionListResponse extends WgerListResponse<WgerWorkoutSession> {}

// ─── Workout Log ───
// Cada log = una serie real con peso y reps realizados.

export interface WgerWorkoutLog {
  id: number
  uuid: string
  workout_session: number
  exercise: number
  exercise_name: string
  repetition_unit: number
  repetition_unit_name: string
  weight_unit: number
  weight_unit_name: string
  weight: number | null
  repetitions: number
  rippetenz: number | null  // RIR (Reps in Reserve)
  order: number
  comment: string | null
  created: string
  last_update: string
}

export interface WgerWorkoutLogListResponse extends WgerListResponse<WgerWorkoutLog> {}

// ─── Repetition Unit ───
export interface WgerRepetitionUnit {
  id: number
  name: string
}

// ─── Weight Unit ───
export interface WgerTrainingWeightUnit {
  id: number
  name: string
}

// ─── Progression / Training Plan ───
// WGER tiene un sistema de progresiones basado en configuraciones.

export interface WgerTrainingPlan {
  id: number
  uuid: string
  name: string
  description: string | null
  created: string
  last_update: string
  start_date: string | null
  end_date: string | null
  is_active: boolean
  is_template: boolean
}

export interface WgerSetConfig {
  id: number
  training_plan: number
  exercise: number
  order: number
  sets: number
  reps: number | null
  weight: number | null
  weight_unit: number | null
  repetition_unit: number | null
  rippetenz: number | null
  rest: number | null
  comment: string | null
}

export interface WgerTrainingSlot {
  id: number
  training_plan: number
  day: number
  order: number
  comment: string | null
}

export interface WgerTrainingSlotEntry {
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
  comment: string | null
}

// ─── Progression Config ───
// WGER permite configurar progresiones de peso, reps, sets, RIR, rest.

export interface WgerProgressionConfig {
  id: number
  training_plan: number
  exercise: number
  progression_type: 'weight' | 'reps' | 'sets' | 'rir' | 'rest' | 'max' | 'min'
  progression_mode: 'absolute' | 'percentage' | 'fixed'
  value: number
  min_value: number | null
  max_value: number | null
  step: number | null
  condition: string | null
  iteration: number | null
  comment: string | null
}

// ─── Exercise Config ───
export interface WgerExerciseConfig {
  id: number
  training_plan: number
  exercise: number
  order: number
  sets: number
  reps: number | null
  weight: number | null
  weight_unit: number | null
  repetition_unit: number | null
  rippetenz: number | null
  rest: number | null
  comment: string | null
  progression_config: WgerProgressionConfig | null
}
