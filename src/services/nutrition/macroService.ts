import { getDiaryEntries } from '@/services/storage/diaryStore'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { calcTMB, calcTDEE, calorieGoal, proteinRange } from '@/utils/nutrition'
import { resolveTrainingGoal } from '@/utils/trainingGoal'

export type MacroTotals = { protein: number; carbs: number; fat: number; calories: number }
export type MacroGoals = { protein: number; carbs: number; fat: number; calories: number }
export type MacroStatus = 'normal' | 'cerca' | 'alcanzado' | 'superado'

export function macroStatus(consumed: number, goal: number): MacroStatus {
  if (goal <= 0) { return 'normal' }
  if (consumed > goal) { return 'superado' }
  if (consumed === goal) { return 'alcanzado' }
  if (consumed >= goal * 0.8) { return 'cerca' }
  return 'normal'
}

export function macroAlertMessage(macro: 'Proteínas' | 'Carbohidratos' | 'Grasas', status: MacroStatus): string | null {
  if (status === 'alcanzado') { return `${macro}: objetivo alcanzado (${status}).` }
  if (status === 'superado') {
    return `${macro}: objetivo superado — ya alcanzaste el objetivo, no conviene seguir aumentando este macro sin revisar el total diario.`
  }
  if (status === 'cerca') { return `${macro}: cerca del objetivo.` }
  return null
}

export function computeTotals(entries: Array<{ macros: { proteins: number; carbs: number; fats: number; calories: number } }>): MacroTotals {
  return entries.reduce(
    (acc, e) => ({
      protein: acc.protein + (e.macros.proteins || 0),
      carbs: acc.carbs + (e.macros.carbs || 0),
      fat: acc.fat + (e.macros.fats || 0),
      calories: acc.calories + (e.macros.calories || 0),
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )
}

export async function getMacroTotals(date?: string): Promise<MacroTotals> {
  const d = date || todayKey()
  const entries = await getDiaryEntries(d)
  return computeTotals(entries)
}

export async function getMacroGoals(): Promise<MacroGoals> {
  const p = await db.userProfile.get('me').catch(() => null)
  const w = p?.weightKg
  const h = p?.heightCm
  if (w && h) {
    const tmb = calcTMB(w, h, p.age, p.sex)
    const tdee = calcTDEE(tmb, p.activityLevel || 'moderado', p.schedule?.availableDays?.length || 3)
    const calGoal = calorieGoal(tdee, resolveTrainingGoal(p) || p.goalPrimary) || tdee || 2200
    const prot = proteinRange(w, resolveTrainingGoal(p) || p.goalPrimary)
    const protGoal = prot?.low || Math.round(w * 1.8)
    const fatGoal = Math.round(calGoal * 0.25 / 9)
    const carbGoal = Math.round((calGoal - protGoal * 4 - fatGoal * 9) / 4)
    return { calories: calGoal, protein: protGoal, carbs: carbGoal, fat: fatGoal }
  }
  return { calories: 2200, protein: 150, carbs: 250, fat: 70 }
}

export function getMacroStatuses(totals: MacroTotals, goals: MacroGoals): Record<'protein' | 'carbs' | 'fat', MacroStatus> {
  return {
    protein: macroStatus(totals.protein, goals.protein),
    carbs: macroStatus(totals.carbs, goals.carbs),
    fat: macroStatus(totals.fat, goals.fat),
  }
}

/**
 * El día va de 00:00:00 hasta justo antes de las 00:00:00 del día siguiente.
 * `date` ya es la clave civil local que escribe la capa central de fechas
 * (todayKey), asi que alcanza con comparar por igualdad: nunca se trunca en UTC.
 */
export function filterEntriesByDay<T extends { date: string }>(entries: T[], date: string): T[] {
  return entries.filter(e => e.date === date)
}

/**
 * Porcentaje de un segmento del circulo de macros.
 * `ratio` es consumido/objetivo y puede pasar de 1: el segmento se dibuja
 * completo y el excedente se informa aparte, sin romper el arco.
 */
export function macroPercent(consumed: number, goal: number): number {
  if (!goal || goal <= 0) { return 0 }
  if (consumed <= 0) { return 0 }
  return (consumed / goal) * 100
}
