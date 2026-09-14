// TRAINING METHODS — Tipos y conocimiento del motor de métodos
// Cada método tiene: configuración, requisitos, compatibilidades, restricciones

export type TrainingMethodId =
  | 'strength'
  | 'hypertrophy'
  | 'strength_endurance'
  | 'power'
  | 'cardio_endurance'
  | 'hiit'
  | 'functional'
  | 'mobility'
  | 'balance_stability'
  | 'speed'
  | 'full_body'
  | 'torso_legs'
  | 'weider_split'

export type MethodCategory = 'anaerobic' | 'aerobic' | 'mixed' | 'structure' | 'preparation'

export interface TrainingMethod {
  id: TrainingMethodId
  name: string
  nameEs: string
  category: MethodCategory
  description: string
  descriptionEs: string

  // Configuración por defecto
  defaults: {
    setsPerExercise: number
    repsRange: [number, number]
    restSeconds: number
    intensityPercent?: [number, number] // % 1RM
    rpeRange?: [number, number]
    tempo?: string
  }

  // Qué necesita el usuario para usar este método
  requirements: {
    minExperienceLevel: 'beginner' | 'intermediate' | 'advanced'
    minDaysPerWeek: number
    maxDaysPerWeek: number
    minSessionMinutes: number
    requiredEquipment: string[] // 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cable' | 'none'
    technicalDemand: 'low' | 'medium' | 'high'
    cardiovascularDemand: 'low' | 'medium' | 'high'
    neuromuscularDemand: 'low' | 'medium' | 'high'
  }

  // Cuándo es apropiado
  suitability: {
    goals: Array<'strength' | 'fat_loss' | 'hypertrophy' | 'mobility' | 'general_health'> // TrainingGoal IDs
    bestFor: string[] // describes ideal scenarios
    avoidWhen: string[] // describes when NOT to use
  }

  // Estructura típica
  structure: {
    splitType: 'full_body' | 'upper_lower' | 'push_pull_legs' | 'body_part' | 'custom'
    typicalFrequency: number[] // days per week options
    exercisesPerSession: [number, number]
    primaryMovementPatterns: string[]
  }

  // Cómo progresar
  progression: {
    method: string
    deloadFrequency: number // weeks
    descriptionEs: string
  }

  // Qué ejercicios prioriza
  exerciseSelection: {
    primaryTypes: string[] // 'compound' | 'isolation' | 'olympic' | 'bodyweight' | 'machine'
    muscleGroupPriority: string[]
    avoidExercises?: string[]
  }
}

export interface UserProfile {
  trainingGoal?: string
  experienceLevel?: string
  sessionDurationMin?: number
  schedule?: { availableDays?: number[]; preferredTime?: string }
  weightKg?: number
  heightCm?: number
  limitations?: string[]
  painAreas?: string[]
  excludedExercises?: string[]
  equipment?: string[]
  cycle?: { weekMap?: (number | null)[]; dayNames?: Record<number, string> }
}

export interface MethodCompatibility {
  methodA: TrainingMethodId
  methodB: TrainingMethodId
  compatible: boolean
  interference: 'none' | 'low' | 'moderate' | 'high'
  recoveryImpact: 'minimal' | 'moderate' | 'significant'
  volumeMultiplier: number // how total volume scales when combined
  notes: string
}

export interface MixedMethod {
  id: string
  name: string
  components: Array<{
    methodId: TrainingMethodId
    weight: number // 0-1, proportion of total training
    purpose: string
  }>
  structure: {
    daysPerWeek: number
    sessionMinutes: number
    distribution: string // e.g., "40% fuerza, 30% hipertrofia, 20% movilidad, 10% cardio"
  }
  justification: string
  phase: string // 'base' | 'build' | 'peak' | 'deload' | 'transition'
  dynamic: boolean // can evolve over time
  createdAt: string
  updatedAt: string
}

export interface MethodRecommendation {
  primary: TrainingMethodId
  secondary: TrainingMethodId[]
  complementary: TrainingMethodId[]
  notRecommended: TrainingMethodId[]
  mixed?: MixedMethod
  justification: string
  confidence: number // 0-1
  factors: string[]
}
