// PR / 1RM calculations — recalculables desde setRecords/setLogs (fuente canónica).
// NO persistir PRs como hechos si derivan del historial.

import type { SetRecord } from './domain'

export type OneRMFormula = 'epley' | 'brzycki' | 'lander' | 'lombardi' | 'mayhew' | 'oConner' | 'wathan'

export interface OneRMResult {
  formula: OneRMFormula
  estimated1RM: number // kg
  weight: number
  reps: number
}

export interface ExercisePR {
  exerciseId: string
  // 1RM estimado (máximo entre fórmulas)
  maxEstimated1RM: OneRMResult | null
  // Records absolutos
  maxWeight: { weight: number; reps: number; date: string; setRecordId: string } | null
  maxReps: { weight: number; reps: number; date: string; setRecordId: string } | null
  maxVolume: { weight: number; reps: number; volume: number; date: string; setRecordId: string } | null
  // Best 1RM per formula
  bestByFormula: Record<OneRMFormula, OneRMResult | null>
}

export interface VolumeLandmark {
  period: 'weekly' | 'monthly'
  date: string // week start (Mon) or month start
  totalVolume: number
  totalSets: number
  totalReps: number
  exerciseCount: number
}

// ---- 1RM Formulas ----

/** Epley: 1RM = w * (1 + r/30) */
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0) return weight
  return weight * (1 + reps / 30)
}

/** Brzycki: 1RM = w * 36 / (37 - r) */
export function brzycki1RM(weight: number, reps: number): number {
  if (reps >= 37) return weight * 36 // asymptotic
  return (weight * 36) / (37 - reps)
}

/** Lander: 1RM = (100 * w) / (101.3 - 2.67123 * r) */
export function lander1RM(weight: number, reps: number): number {
  const denom = 101.3 - 2.67123 * reps
  if (denom <= 0) return weight
  return (100 * weight) / denom
}

/** Lombardi: 1RM = w * r^0.10 */
export function lombardi1RM(weight: number, reps: number): number {
  if (reps <= 0) return weight
  return weight * Math.pow(reps, 0.10)
}

/** Mayhew et al.: 1RM = (100 * w) / (52.2 + 41.9 * e^(-0.055 * r)) */
export function mayhew1RM(weight: number, reps: number): number {
  const denom = 52.2 + 41.9 * Math.exp(-0.055 * reps)
  return (100 * weight) / denom
}

/** O'Conner et al.: 1RM = w * (1 + 0.025 * r) */
export function oConner1RM(weight: number, reps: number): number {
  return weight * (1 + 0.025 * reps)
}

/** Wathan: 1RM = (100 * w) / (48.8 + 53.8 * e^(-0.075 * r)) */
export function wathan1RM(weight: number, reps: number): number {
  const denom = 48.8 + 53.8 * Math.exp(-0.075 * reps)
  return (100 * weight) / denom
}

export const ONE_RM_FORMULAS: Record<OneRMFormula, (weight: number, reps: number) => number> = {
  epley: epley1RM,
  brzycki: brzycki1RM,
  lander: lander1RM,
  lombardi: lombardi1RM,
  mayhew: mayhew1RM,
  oConner: oConner1RM,
  wathan: wathan1RM,
}

/** Calcular 1RM para una fórmula específica */
export function calculate1RM(formula: OneRMFormula, weight: number, reps: number): OneRMResult {
  const estimated1RM = Math.round(ONE_RM_FORMULAS[formula](weight, reps) * 10) / 10
  return { formula, estimated1RM, weight, reps }
}

/** Calcular 1RM con todas las fórmulas, retornar la máxima (conservadora para fuerza) */
export function calculateAll1RM(weight: number, reps: number): Record<OneRMFormula, OneRMResult> {
  const results: Record<OneRMFormula, OneRMResult> = {} as any
  let max: OneRMResult | null = null
  for (const formula of Object.keys(ONE_RM_FORMULAS) as OneRMFormula[]) {
    const r = calculate1RM(formula, weight, reps)
    results[formula] = r
    if (!max || r.estimated1RM > max.estimated1RM) { max = r }
  }
  return results
}

/** 1RM "consenso": media de Epley + Brzycki (las dos más usadas en literatura) */
export function consensus1RM(weight: number, reps: number): number {
  const e = epley1RM(weight, reps)
  const b = brzycki1RM(weight, reps)
  return Math.round(((e + b) / 2) * 10) / 10
}

// ---- PR Calculations ----

/** Unificar SetRecord oficiales + legacy setLogs para un ejercicio */
export function toUnifiedSets(sets: SetRecord[]): Array<{ weight: number; reps: number; date: string; setRecordId: string }> {
  return sets
    .filter(s => s.status === 'COMPLETED' && s.actualWeight > 0 && s.actualReps > 0)
    .map(s => ({
      weight: s.actualWeight,
      reps: s.actualReps,
      date: (s.completedAt || s.createdAt || '').slice(0, 10),
      setRecordId: s.setRecordId,
    }))
}

/** Calcular PRs para un ejercicio desde sus series completadas */
export function calculateExercisePRs(
  unifiedSets: Array<{ weight: number; reps: number; date: string; setRecordId: string }>
): ExercisePR {
  if (unifiedSets.length === 0) {
    return {
      exerciseId: '',
      maxEstimated1RM: null,
      maxWeight: null,
      maxReps: null,
      maxVolume: null,
      bestByFormula: {} as Record<OneRMFormula, OneRMResult | null>,
    }
  }

  // Max weight
  const maxW = unifiedSets.reduce((a, b) => (b.weight > a.weight ? b : a))
  // Max reps (peso > 0)
  const maxR = unifiedSets.reduce((a, b) => (b.reps > a.reps ? b : a))
  // Max volume
  const maxV = unifiedSets.reduce((a, b) => (b.weight * b.reps > a.weight * a.reps ? b : a))

  // Best 1RM per formula
  const bestByFormula: Record<OneRMFormula, OneRMResult | null> = {} as any
  let overallMax1RM: OneRMResult | null = null

  for (const set of unifiedSets) {
    const all = calculateAll1RM(set.weight, set.reps)
    for (const formula of Object.keys(all) as OneRMFormula[]) {
      const current = bestByFormula[formula]
      if (!current || all[formula].estimated1RM > current.estimated1RM) {
        bestByFormula[formula] = all[formula]
      }
      if (!overallMax1RM || all[formula].estimated1RM > overallMax1RM.estimated1RM) {
        overallMax1RM = all[formula]
      }
    }
  }

  return {
    exerciseId: '', // se llena al llamar
    maxEstimated1RM: overallMax1RM,
    maxWeight: { weight: maxW.weight, reps: maxW.reps, date: maxW.date, setRecordId: maxW.setRecordId },
    maxReps: { weight: maxR.weight, reps: maxR.reps, date: maxR.date, setRecordId: maxR.setRecordId },
    maxVolume: { weight: maxV.weight, reps: maxV.reps, volume: Math.round(maxV.weight * maxV.reps * 10) / 10, date: maxV.date, setRecordId: maxV.setRecordId },
    bestByFormula,
  }
}

/** Agregados semanales/mensuales de volumen desde sets unificados */
export function aggregateVolumeLandmarks(
  unifiedSets: Array<{ weight: number; reps: number; date: string }>,
  period: 'weekly' | 'monthly'
): VolumeLandmark[] {
  const buckets: Record<string, { volume: number; sets: number; reps: number; exercises: Set<string> }> = {}

  for (const s of unifiedSets) {
    const d = new Date(s.date + 'T12:00:00')
    let key: string
    if (period === 'weekly') {
      // Week start Monday
      const diff = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - diff)
      key = d.toISOString().slice(0, 10)
    } else {
      // Month start
      d.setDate(1)
      key = d.toISOString().slice(0, 10)
    }
    const vol = s.weight * s.reps
    if (!buckets[key]) { buckets[key] = { volume: 0, sets: 0, reps: 0, exercises: new Set() } }
    buckets[key].volume += vol
    buckets[key].sets += 1
    buckets[key].reps += s.reps
  }

  return Object.entries(buckets)
    .map(([date, v]) => ({
      period,
      date,
      totalVolume: Math.round(v.volume * 10) / 10,
      totalSets: v.sets,
      totalReps: v.reps,
      exerciseCount: v.exercises.size,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ---- Exercise History Entry (for detail view) ----

export interface ExerciseHistoryEntry {
  exerciseId: string
  date: string // YYYY-MM-DD
  sessionId: string
  order: number
  reps: number
  weight: number
  volume: number
  setType: string
  estimated1RM?: number
  setRecordId: string
}

/** Construir historial cronológico de un ejercicio desde sets unificados */
export function buildExerciseHistory(
  unifiedSets: Array<{ weight: number; reps: number; date: string; setRecordId: string; order?: number }>
): ExerciseHistoryEntry[] {
  return unifiedSets
    .map((s, i) => ({
      exerciseId: '', // se llena al llamar
      date: s.date,
      sessionId: '', // requeriría join con sessionExercises
      order: s.order ?? i + 1,
      reps: s.reps,
      weight: s.weight,
      volume: Math.round(s.weight * s.reps * 10) / 10,
      setType: 'NORMAL',
      estimated1RM: consensus1RM(s.weight, s.reps),
      setRecordId: s.setRecordId,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}