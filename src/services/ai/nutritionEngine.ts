// NUTRITION ENGINE — Macros, meal timing, suplementación, coherencia
import type { UserProfile, TrainingGoal } from '@/types'
import { proteinRange, calcTMB, calcTDEE, calorieGoal, type ActivityLevel } from '@/utils/nutrition'

export interface NutritionContext {
  tdee: number | null
  calorieGoal: number | null
  macros: { protein: number; carbs: number; fat: number } | null
  proteinPerKg: number | null
  isAdequate: boolean
  gap: string | null
}

/** Analizar estado nutricional vs objetivo de entrenamiento */
export async function analyzeNutrition(
  userProfile: Partial<UserProfile>,
  recentVolume?: number,
): Promise<NutritionContext> {
  const w = userProfile.weightKg
  const h = userProfile.heightCm
  const age = userProfile.age
  const sex = userProfile.sex
  const activity = (userProfile.activityLevel || 'moderado') as ActivityLevel
  const goal = userProfile.trainingGoal || 'hypertrophy'

  if (!w || !h) {
    return { tdee: null, calorieGoal: null, macros: null, proteinPerKg: null, isAdequate: false, gap: 'Faltan peso y altura para calcular nutrición.' }
  }

  const tmb = calcTMB(w, h, age, sex)
  const tdee = calcTDEE(tmb, activity, userProfile.schedule?.availableDays?.length || 3)
  const goalCals = calorieGoal(tdee, goal)
  const protRange = proteinRange(w, goal)

  // Macros estimados
  const prot = protRange?.low || Math.round(w * 1.8)
  const fat = Math.round((goalCals || tdee || 2000) * 0.25 / 9)
  const carbs = Math.round(((goalCals || tdee || 2000) - prot * 4 - fat * 9) / 4)

  // Evaluar si es adecuado
  let isAdequate = true
  let gap: string | null = null
  if (tdee && tdee < 1200) {
    isAdequate = false
    gap = 'El TDEE estimado es muy bajo, revisá tu nivel de actividad.'
  }
  if (goal === 'fat_loss' && tdee && goalCals && goalCals < tdee * 0.7) {
    gap = 'El déficit es agresivo (>30%). Considerá un déficit más moderado.'
  }

  return {
    tdee,
    calorieGoal: goalCals,
    macros: { protein: prot, carbs, fat },
    proteinPerKg: prot / w,
    isAdequate,
    gap,
  }
}
