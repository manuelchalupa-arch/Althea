// wgerTrainingClient — Cliente HTTP para workout sessions y logs.
// FASE 6-9: Entrenamiento real, series, carga y progresiones.

import type { WgerListResponse } from '../wgerTypes'
import type {
  WgerWorkoutSessionListResponse,
  WgerWorkoutLogListResponse,
  WgerWorkoutSession,
  WgerWorkoutLog,
  WgerTrainingPlan,
  WgerSetConfig,
  WgerTrainingSlotEntry,
  WgerProgressionConfig,
  WgerExerciseConfig,
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

// ─── Workout Sessions ───
// GET /workoutsession/?workout={id}&date={date}

export function fetchWorkoutSessions(
  opts: { workout?: number; date?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerWorkoutSessionListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.workout) {params.set('workout', String(opts.workout))}
  if (opts.date) {params.set('date', opts.date)}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/workoutsession/?${params}`, signal)
}

export function fetchWorkoutSession(
  id: number,
  signal?: AbortSignal,
): Promise<WgerWorkoutSession> {
  return getJSON(`${BASE}/workoutsession/${id}/?format=json`, signal)
}

// ─── Workout Logs ───
// GET /workoutlog/?workout_session={id}

export function fetchWorkoutLogs(
  opts: { workout_session?: number; exercise?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerWorkoutLogListResponse> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.workout_session) {params.set('workout_session', String(opts.workout_session))}
  if (opts.exercise) {params.set('exercise', String(opts.exercise))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/workoutlog/?${params}`, signal)
}

export function fetchWorkoutLog(
  id: number,
  signal?: AbortSignal,
): Promise<WgerWorkoutLog> {
  return getJSON(`${BASE}/workoutlog/${id}/?format=json`, signal)
}

// ─── Training Plans ───
// GET /trainingplan/?id={id}

export function fetchTrainingPlan(
  id: number,
  signal?: AbortSignal,
): Promise<WgerTrainingPlan> {
  return getJSON(`${BASE}/trainingplan/${id}/?format=json`, signal)
}

// ─── Set Configs ───
// GET /setconfig/?training_plan={id}

export function fetchSetConfigs(
  opts: { training_plan?: number; exercise?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerSetConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.training_plan) {params.set('training_plan', String(opts.training_plan))}
  if (opts.exercise) {params.set('exercise', String(opts.exercise))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/setconfig/?${params}`, signal)
}

// ─── Slot Entries ───
// GET /slotentry/?slot={id}

export function fetchSlotEntries(
  opts: { slot?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerTrainingSlotEntry>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.slot) {params.set('slot', String(opts.slot))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/slotentry/?${params}`, signal)
}

// ─── Progression Configs ───
// GET /progressionconfig/?training_plan={id}

export function fetchProgressionConfigs(
  opts: { training_plan?: number; exercise?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerProgressionConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.training_plan) {params.set('training_plan', String(opts.training_plan))}
  if (opts.exercise) {params.set('exercise', String(opts.exercise))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/progressionconfig/?${params}`, signal)
}

// ─── Exercise Configs ───
// GET /exerciseconfig/?training_plan={id}

export function fetchExerciseConfigs(
  opts: { training_plan?: number; exercise?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<WgerListResponse<WgerExerciseConfig>> {
  const params = new URLSearchParams({ format: 'json' })
  if (opts.training_plan) {params.set('training_plan', String(opts.training_plan))}
  if (opts.exercise) {params.set('exercise', String(opts.exercise))}
  if (opts.limit) {params.set('limit', String(opts.limit))}
  if (opts.offset) {params.set('offset', String(opts.offset))}
  return getJSON(`${BASE}/exerciseconfig/?${params}`, signal)
}

// ─── Repetition Units ───
export function fetchRepetitionUnits(
  signal?: AbortSignal,
): Promise<WgerListResponse<{ id: number; name: string }>> {
  return getJSON(`${BASE}/repetitionunit/?format=json`, signal)
}

// ─── Weight Units ───
export function fetchWeightUnits(
  signal?: AbortSignal,
): Promise<WgerListResponse<{ id: number; name: string }>> {
  return getJSON(`${BASE}/weightunit/?format=json`, signal)
}
