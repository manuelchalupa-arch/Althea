/**
 * Persistencia de los objetivos nutricionales calculados.
 *
 * El plan vive dentro del perfil (`userProfile.nutritionPlan`), así que no hay
 * cambio de esquema ni migración. Guardar un plan nuevo NUNCA toca el diario de
 * comidas, los macros históricos ni la hidratación: solo agrega una entrada al
 * historial de objetivos.
 */
import { db } from '@/services/storage/db'
import type { UserProfile } from '@/types'
import {
  computeNutritionPlan,
  suggestedActivityAdjustment,
  weightTrendAdjustment,
  type ExtraActivity,
  type NutritionInputs,
  type NutritionPlan,
} from './goalEngine'
import type { MacroGoals } from './macroService'

export interface NutritionPlanRecord {
  current: NutritionPlan
  /** Motivo y fecha de cada objetivo guardado (más nuevo primero). */
  history: Array<{ at: string; reason: string; plan: NutritionPlan }>
}

const HISTORY_LIMIT = 12

export async function loadNutritionPlan(): Promise<NutritionPlanRecord | null> {
  const p = await db.userProfile.get('me').catch(() => null)
  const record = p?.nutritionPlan
  return record && record.current ? record : null
}

export async function saveNutritionPlan(
  inputs: NutritionInputs,
  reason: string,
): Promise<{
  plan: NutritionPlan | null
  missing: string[]
  blocked: { reasons: string[]; referral: string } | null
}> {
  const result = computeNutritionPlan(inputs)
  if (!result.plan) {return result}

  const profile = await db.userProfile.get('me').catch(() => null)
  if (!profile) {throw new Error('Perfil no encontrado: completá tus datos primero.')}
  const prev = profile.nutritionPlan
  const history = [{ at: result.plan.createdAt, reason: reason.trim() || 'Objetivo recalculado', plan: result.plan }, ...(prev?.history || [])]
    .slice(0, HISTORY_LIMIT)
  await db.userProfile.put({
    ...profile,
    nutritionPlan: { current: result.plan, history },
    updatedAt: new Date().toISOString(),
  } as UserProfile)
  return result
}

/** El plan alimenta la tabla de consumo con el mismo `MacroGoals` de siempre. */
export function macroGoalsFromPlan(plan: NutritionPlan): MacroGoals {
  return {
    calories: plan.target.reference,
    protein: plan.macros.protein,
    carbs: plan.macros.carbs,
    fat: plan.macros.fat,
  }
}

/**
 * Actividad registrada del día que NO es el entrenamiento habitual ya incluido
 * en el factor de actividad: sesiones de cardio/deporte del módulo Actividad.
 * El entrenamiento de fuerza planificado no se suma (doble conteo).
 */
export async function extraActivityForDay(date: string): Promise<ExtraActivity[]> {
  const rows = await db.activitySessions.where('calendarDate').equals(date).toArray().catch(() => [])
  return rows
    .filter(r => Number(r.activeKcal) > 0)
    .map(r => ({
      id: r.id,
      label: r.activityName || r.activityId,
      date: r.calendarDate,
      durationMinutes: Number(r.durationMinutes) || 0,
      activeKcal: Number(r.activeKcal),
      method: r.calorieMethod || (r.metEstimated ? 'MET estimado' : 'MET'),
      estimated: r.calorieEstimated ?? true,
    }))
}

/** Ajuste sugerido por actividad extra + tendencia de peso, sin tocar la base. */
export async function suggestedAdjustments(plan: NutritionPlan, date: string) {
  const extras = await extraActivityForDay(date)
  const weights = await db.bodyMeasurements.toArray().catch(() => [])
  return {
    extras,
    activity: suggestedActivityAdjustment(plan, extras, date),
    trend: weightTrendAdjustment(
      plan,
      weights.filter(w => !w.isDemo && Number(w.weightKg) > 0)
        .map(w => ({ localDate: w.localDate, weightKg: Number(w.weightKg) })),
      date,
    ),
  }
}
