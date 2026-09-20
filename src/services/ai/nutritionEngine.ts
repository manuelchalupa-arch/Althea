// NUTRITION ENGINE — Macros, meal timing, suplementación, coherencia con entrenamiento
import type { UserProfile, TrainingGoal } from '@/types'
import { proteinRange, calcTMB, calcTDEE, calorieGoal, type ActivityLevel } from '@/utils/nutrition'

export interface NutritionContext {
  tdee: number | null
  calorieGoal: number | null
  macros: { protein: number; carbs: number; fat: number } | null
  proteinPerKg: number | null
  isAdequate: boolean
  gap: string | null
  // ─── Fase 3: Meal timing + suplementación ───
  mealTiming?: MealTimingRecommendation
  supplements?: SupplementRecommendation[]
  trainingNutrition?: TrainingNutritionAdvice
}

export interface MealTimingRecommendation {
  preWorkout: string
  postWorkout: string
  generalRule: string
  frequency: string
}

export interface SupplementRecommendation {
  name: string
  dosage: string
  timing: string
  reason: string
  priority: 'essential' | 'recommended' | 'optional'
}

export interface TrainingNutritionAdvice {
  caloricState: 'surplus' | 'maintenance' | 'deficit'
  deficitAggressive: boolean
  proteinAdequate: boolean
  message: string
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
  const goal = (userProfile.trainingGoal || 'hypertrophy') as TrainingGoal

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

  // ─── Fase 3: Meal timing ───
  const mealTiming = buildMealTiming(goal)

  // ─── Fase 3: Suplementación ───
  const supplements = buildSupplements(goal, w)

  // ─── Fase 3: Coherencia entrenamiento-nutrición ───
  const trainingNutrition = buildTrainingNutritionAdvice(goal, tdee, goalCals, prot, w, recentVolume)

  return {
    tdee,
    calorieGoal: goalCals,
    macros: { protein: prot, carbs, fat },
    proteinPerKg: prot / w,
    isAdequate,
    gap,
    mealTiming,
    supplements,
    trainingNutrition,
  }
}

function buildMealTiming(goal: TrainingGoal): MealTimingRecommendation {
  switch (goal) {
    case 'strength':
      return {
        preWorkout: 'Comida completa 2-3h antes (proteína + carbohidratos complejos). Snack liviano 30-60min antes si es necesario.',
        postWorkout: 'Proteína de rápida absorción (30-40g) + carbohidratos simples dentro de los 60min post-entreno.',
        generalRule: 'Distribuir proteína en 4-5 comidas (0.4-0.5g/kg por comida). Comida principal 2-3h antes de entrenar.',
        frequency: '4-5 comidas/día, intervalos de 3-4h.',
      }
    case 'fat_loss':
      return {
        preWorkout: 'Proteína + fibra 1-2h antes. Evitar carbohidratos simples pre-entreno.',
        postWorkout: 'Proteína (30-40g) + carbohidratos moderados. Priorizar proteína sobre volumen calórico.',
        generalRule: 'Déficit calórico moderado. Comidas densas en nutrientes, pocas calorías vacías.',
        frequency: '3-4 comidas/día, intervalos de 4-5h. Ayuno intermitente opcional.',
      }
    case 'hypertrophy':
      return {
        preWorkout: 'Comida rica en carbohidratos + proteína 2-3h antes. Snack 30-60min antes si entrenás temprano.',
        postWorkout: 'Proteína (30-40g) + carbohidratos (1-1.5g/kg) dentro de los 90min post-entreno.',
        generalRule: 'Superávit calórico moderado (+10%). Carbohidratos alrededor del entreno para máximo rendimiento.',
        frequency: '4-5 comidas/día, intervalos de 3h. Snacks entre comidas.',
      }
    case 'mobility':
      return {
        preWorkout: 'Ligero: fruta + nueces 30-60min antes. Evitar comidas pesadas.',
        postWorkout: 'Comida balanceada normal. Sin requerimiento especial post-movilidad.',
        generalRule: 'Equilibrio general. Hidratación constante. Antiinflamatorios naturales (cúrcuma, jengibre).',
        frequency: '3 comidas/día + snacks opcionales.',
      }
    case 'general_health':
    default:
      return {
        preWorkout: 'Comida balanceada 1-2h antes. No entrenar en ayunas si es intenso.',
        postWorkout: 'Proteína + carbohidratos moderados. Comida completa dentro de 2h.',
        generalRule: 'Equilibrio entre macros. Calidad de alimentos > cantidad exacta. Constancia.',
        frequency: '3-4 comidas/día.',
      }
  }
}

function buildSupplements(goal: TrainingGoal, weightKg: number): SupplementRecommendation[] {
  const base: SupplementRecommendation[] = [
    {
      name: 'Creatina monohidratada',
      dosage: '3-5g/día',
      timing: 'Post-entreno o en cualquier momento del día',
      reason: 'Mejora rendimiento en esfuerzos de alta intensidad. Evidencia sólida.',
      priority: 'essential',
    },
    {
      name: 'Proteína whey',
      dosage: `${Math.round(weightKg * 0.3)}-${Math.round(weightKg * 0.5)}g por porción`,
      timing: 'Post-entreno o entre comidas',
      reason: 'Conveniencia para cubrir necesidades proteicas diarias.',
      priority: 'recommended',
    },
  ]

  if (goal === 'fat_loss') {
    base.push({
      name: 'Cafeína',
      dosage: '200-400mg/día',
      timing: '30-60min pre-entreno',
      reason: 'Aumenta oxidación de grasas y rendimiento. Evitar después de las 14h.',
      priority: 'recommended',
    })
  }

  if (goal === 'hypertrophy' || goal === 'strength') {
    base.push({
      name: 'Beta-alanina',
      dosage: '3-6g/día',
      timing: 'Dividido en 2-3 dosis',
      reason: 'Mejora tolerancia al esfuerzo de alta intensidad. Útil para series largas.',
      priority: 'optional',
    })
  }

  base.push({
    name: 'Vitamina D3',
    dosage: '1000-2000 UI/día',
    timing: 'Con comida grasa',
    reason: 'Déficit común. Importante para salud ósea y función muscular.',
    priority: 'recommended',
  })

  base.push({
    name: 'Omega-3 (EPA/DHA)',
    dosage: '1-2g EPA+DHA/día',
    timing: 'Con comida',
    reason: 'Antiinflamatorio. Recuperación y salud cardiovascular.',
    priority: 'optional',
  })

  return base
}

function buildTrainingNutritionAdvice(
  goal: TrainingGoal,
  tdee: number | null,
  goalCals: number | null,
  proteinG: number,
  weightKg: number,
  recentVolume?: number,
): TrainingNutritionAdvice {
  const caloricState: TrainingNutritionAdvice['caloricState'] =
    goalCals && tdee ? goalCals > tdee * 1.05 ? 'surplus' : goalCals < tdee * 0.95 ? 'deficit' : 'maintenance' : 'maintenance'
  const deficitAggressive = caloricState === 'deficit' && goalCals != null && tdee != null && goalCals < tdee * 0.7
  const proteinAdequate = proteinG / weightKg >= 1.6

  let message = ''
  if (deficitAggressive) {message = 'El déficit calórico es agresivo (>30%). Podría afectar rendimiento y recuperación. Considerá un déficit del 15-20%.'}
  else if (caloricState === 'deficit' && goal === 'hypertrophy') {message = 'Estás en déficit: la hipertrofia será más lenta. Priorizá proteína y volumen de entrenamiento.'}
  else if (caloricState === 'surplus' && goal === 'fat_loss') {message = 'Tenés superávit pero tu objetivo es perder grasa. Revisá tu plan nutricional.'}
  else if (!proteinAdequate) {message = `Proteína por debajo de 1.6g/kg (${(proteinG/weightKg).toFixed(1)}g/kg). Aumentá ingestiones proteicas.`}
  else {message = 'Nutrición coherente con tu objetivo. Mantené la constancia.'}

  return { caloricState, deficitAggressive, proteinAdequate, message }
}
