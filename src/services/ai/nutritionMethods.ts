// NUTRITION METHODS — Tipos del sistema de selección inteligente de estrategias nutricionales

// ─── IDs de métodos nutricionales ───
export type NutritionMethodId =
  // Patrones alimentarios
  | 'mediterranean'
  | 'dash'
  | 'vegan'
  | 'paleo'
  | 'flexitarian'
  // Estrategias de distribución
  | 'intermittent_fasting'
  | 'carb_cycling'
  | 'around_training'
  // Estrategias de macronutrientes
  | 'high_protein'
  | 'intuitive_eating'
  // Dietas restrictivas/específicas
  | 'keto'
  | 'whole30'

// ─── Categorías ───
export type NutritionCategory =
  | 'pattern'        // patrón alimentario general
  | 'distribution'   // estrategia de distribución temporal
  | 'macronutrient'  // énfasis en macros
  | 'restrictive'    // dieta restrictiva/específica

// ─── Nivel de evidencia ───
export type EvidenceLevel = 'strong' | 'moderate' | 'limited' | 'insufficient' | 'popular_opinion'

// ─── Objetivos del usuario ───
export type NutritionGoal =
  | 'fat_loss'
  | 'muscle_gain'
  | 'maintenance'
  | 'performance'
  | 'health'
  | 'recomposition'

// ─── Tipo de entrenamiento ───
export type TrainingType =
  | 'strength'
  | 'hypertrophy'
  | 'endurance'
  | 'hiit'
  | 'functional'
  | 'mobility'
  | 'mixed'
  | 'general'

// ─── Método nutricional completo ───
export interface NutritionMethod {
  id: NutritionMethodId
  name: string
  nameEs: string
  category: NutritionCategory
  description: string
  descriptionEs: string

  // Características fundamentales
  characteristics: {
    energyApproach: string         // cómo maneja la energía
    proteinStrategy: string        // estrategia proteica
    carbStrategy: string           // estrategia de carbohidratos
    fatStrategy: string            // estrategia de grasas
    mealFrequency: string          // frecuencia típica de comidas
    timingRelevance: string        // importancia del timing
    restrictions: string[]         // qué restringe
    key_foods: string[]            // alimentos clave
  }

  // Requisitos para usar este método
  requirements: {
    minExperienceLevel: 'beginner' | 'intermediate' | 'advanced'
    minAdherenceHistory: number    // días mínimos de adherencia previa
    requiredContext: string[]      // qué contexto se necesita
    contraindications: string[]    // cuándo NO usar
  }

  // Idoneidad
  suitability: {
    goals: NutritionGoal[]
    trainingTypes: TrainingType[]
    bestFor: string[]
    avoidWhen: string[]
  }

  // Valores nutricionales típicos (porcentaje del TDEE o g/g/kg)
  defaults: {
    calorieModifier: number        // multiplicador sobre TDEE (1.0 = mantención)
    proteinPerKg: [number, number] // rango g/kg
    carbPercentage: [number, number] // % de calorías de carbos
    fatPercentage: [number, number]  // % de calorías de grasa
    mealFrequency: [number, number]  // rango de comidas/día
    restDaysModifier?: number      // modificador en días de descanso
  }

  // Nivel de evidencia
  evidence: {
    level: EvidenceLevel
    sources: string[]
    notesEs: string
  }

  // Adaptación según entrenamiento
  trainingAdaptation: {
    [key in TrainingType]?: {
      adjustments: string
      calorieModifier?: number
      proteinModifier?: number
    }
  }

  // Seguridad
  safety: {
    requiresSupervision: boolean
    riskGroups: string[]
    warnings: string[]
  }
}

// ─── Compatibilidad entre métodos ───
export interface NutritionCompatibility {
  methodA: NutritionMethodId
  methodB: NutritionMethodId
  compatible: boolean
  interference: 'none' | 'low' | 'moderate' | 'high'
  synergy: string     // describe sinergia si la hay
  notes: string
}

// ─── Recomendación de método nutricional ───
export interface NutritionMethodRecommendation {
  primary: NutritionMethodId
  secondary: NutritionMethodId[]
  complementary: NutritionMethodId[]
  notRecommended: NutritionMethodId[]
  mixed?: MixedNutritionMethod
  justification: string
  confidence: number
  factors: string[]
  safetyWarnings: string[]
}

// ─── Método mixto nutricional ───
export interface MixedNutritionMethod {
  id: string
  name: string
  components: Array<{
    methodId: NutritionMethodId
    weight: number           // 0-1, proporción de la estrategia
    purpose: string
    contribution: string     // qué aporta este componente
  }>
  strategy: {
    calorieModifier: number
    proteinPerKg: [number, number]
    carbPercentage: [number, number]
    fatPercentage: [number, number]
    mealFrequency: [number, number]
    timingStrategy: string
    keyPrinciples: string[]
  }
  justification: string
  phase: 'initial' | 'adaptation' | 'maintenance' | 'adjustment'
  dynamic: boolean
  createdAt: string
  updatedAt: string
}

// ─── Perfil nutricional del usuario (para el selector) ───
export interface NutritionUserProfile {
  trainingGoal?: string
  experienceLevel?: string
  weightKg?: number
  heightCm?: number
  age?: number
  sex?: string
  activityLevel?: string
  sessionDurationMin?: number
  daysPerWeek?: number
  trainingType?: string
  equipment?: string[]
  schedule?: { availableDays?: number[]; preferredTime?: string }
  nutritionPrefs?: {
    restrictions?: string[]
    allergies?: string[]
    dislikedFoods?: string[]
    mealFrequency?: number
    culturalPreferences?: string[]
    budget?: 'low' | 'medium' | 'high'
  }
  healthConditions?: string[]
  currentNutritionMethod?: string
  adherenceHistory?: { method: string; days: number; score: number }[]
  sleepHours?: number
  stressLevel?: number
  recoveryScore?: number
}

// ─── Resultado de scoring interno ───
export interface NutritionMethodScore {
  methodId: NutritionMethodId
  score: number           // 0-1
  breakdown: {
    goalFit: number
    trainingFit: number
    preferenceFit: number
    sustainability: number
    evidence: number
    safety: number
    complexity: number
  }
  reason: string
}
