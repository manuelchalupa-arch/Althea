/** @deprecated Vocabulario español legacy del onboarding. Fuente oficial: TrainingGoal (campo trainingGoal). */
export type Goal = 'fuerza' | 'hipertrofia' | 'resistencia' | 'perdida_peso' | 'recomposicion' | 'mantenimiento' | 'personalizado' | 'movilidad'
export type Level = 'principiante' | 'intermedio' | 'avanzado'
export type CoachIntensity = 'profesional' | 'motivacional' | 'duro' | 'extremo'

// ─── Coach IA v2: perfiles objetivo ───
export type TrainingGoal = 'strength' | 'fat_loss' | 'hypertrophy' | 'mobility' | 'general_health'
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type MuscleGroup = 'pecho'|'espalda'|'hombros'|'biceps'|'triceps'|'cuadriceps'|'femorales'|'gluteos'|'gemelos'|'abdomen'|'cuerpo_completo'
export type Equipment = 'barra'|'mancuernas'|'maquina'|'polea'|'peso_corporal'|'banda'|'kettlebell'|'otro'
export type MovementPattern = 'push'|'pull'|'squat'|'hinge'|'lunge'|'carry'|'core'|'full'

export interface Exercise {
  id: string; name: string; alias?: string
  groupMain: MuscleGroup; groupsSecondary: MuscleGroup[]
  equipment: Equipment; level: Level; pattern: MovementPattern
  description: string; instructions: string[]; variantIds: string[]
  muscles: string[]; restrictions: string[]; tags: string[]
}

export interface Routine { id: string; name: string; description?: string; createdAt: string; updatedAt: string; archived?: boolean }
export interface RoutineDay { id: string; routineId: string; weekday: number; name: string }
export interface RoutineExercise {
  id: string; routineDayId: string; exerciseId: string; order: number
  targetSets: number; targetReps: number; targetWeight: number; restSec: number; rir?: number; rpe?: number; tempo?: string; notes?: string
}
// Nomenclatura oficial del módulo Entrenamiento: ver services/training/domain.ts
// (SessionStatus, SessionExerciseStatus, SetRecordStatus, SetType, TrainingSession,
// SessionExercise, SetRecord, SessionEvent, PostWorkoutSurvey). Este archivo re-exporta
// lo oficial y conserva los tipos legacy solo para lectura de datos antiguos.
export type {
  SessionStatus, SessionExerciseStatus, SetRecordStatus, SetType, SessionEventType,
  TrainingSession, SessionExercise, SetRecord, NegativeSet, ExerciseObservation,
  ExerciseReplacement, SessionEvent, PostWorkoutSurvey, ExerciseHistoryEntry,
  MuscleTrainingMetric, DayChange, PlannedSetSnapshot,
} from '@/services/training/domain';
/** @deprecated Capa física legacy de solo-lectura. Fuente oficial: TrainingSession. */
export interface Session { id: string; routineId?: string; localDate: string; startedAt: string; finishedAt?: string; createdAt: string; updatedAt: string }
/** @deprecated Capa física legacy de solo-lectura. Fuente oficial: SetRecord. */
export interface SetLog {
  id: string; sessionId: string; exerciseId: string; setNumber: number
  weight: number; reps: number; rpe?: number; rir?: number; completed: boolean; notes?: string; createdAt: string
}
export interface RecoveryCheck { id: string; localDate: string; energy: number; fatigue: number; stress: number; sleepHours?: number; sleepQuality?: number; soreness?: number; motivation: number; /** Estado de ánimo 1-10. Opcional: los registros antiguos solo guardan `motivation`. */ mood?: number; digestion?: number; hydration?: number; score: number; color: 'green'|'yellow'|'red'; perceivedExertion?: number; painArea?: string; painObservation?: string; notes?: string; isDemo?: boolean }
export interface HydrationLog { id: string; localDate: string; amountMl: number; time: string; isDemo?: boolean }
export interface PainLog {
  id: string
  localDate: string
  level: 'none' | 'mild' | 'moderate' | 'severe'
  zone: string
  exerciseId?: string
  moment: string
  notes?: string
  createdAt: string
}
export interface UserProfile {
  id: string;
  /** @deprecated Objetivo legacy español (onboarding). Fuente oficial: trainingGoal. */
  goal: Goal;
  /** @deprecated Objetivo legacy en texto libre (onboarding, español). Fuente oficial: trainingGoal. */
  level: Level; availableDays: number[]; trainingTime: string
  equipment: Equipment[]; units: { weight: 'kg'|'lb'; liquid: 'ml'|'oz' }; lang: string
  /**
   * FASE 2 S6 · Preferencia LEGACY del onboarding. Se consulta únicamente
   * cuando la persona no tiene método de entrenamiento configurado y no chose
   * un tono explícito. Leer siempre vía `resolveCoachTone()` (@/services/ai/coachPersonality).
   */
  coachIntensity: CoachIntensity; onboardingDone: boolean; hydrationGoalMl: number
  /** FASE 2 S6 · Método que la persona quiere VER en la pantalla del Coach. No es el método canónico del ciclo. */
  coachMethodView?: string
  /**
   * FASE 2 S6 · Tono canónico del Coach (preferencia explícita, editada en
   * Perfil). Se mantiene como `string` porque `mapTone` traduce a propósito los
   * valores legacy ('PROFESIONAL'|'MOTIVACIONAL'|'ESTRICTO'|'DURO').
   * No escribirlo desde otro lugar que no sea el selector de Perfil.
   */
  coachTone?: string
  createdAt: string; updatedAt: string
  cycle?: { startDate: string; trainingDays: { n:number; name:string }[]; weekMap: (number|null)[]; methodId?: string; methodJustification?: string }
  // Perfil onboarding Coach IA
  displayName?: string; email?: string
  age?: number; sex?: 'M'|'F'|'X'; heightCm?: number; weightKg?: number
  bodyFatPct?: number; muscleMassKg?: number
  bmi?: string; bmiCategory?: string; bmiCalculatedAt?: string
  targetWeightKg?: number
  /** @deprecated Objetivo legacy en texto libre (onboarding, español). Fuente oficial: trainingGoal. */
  goalPrimary?: string; goalsSecondary?: string[]; customGoal?: string
  needsDescription?: string
  /**
   * ENTRENAMIENTO · Limitaciones (equipamiento, movimiento, tiempo, espacio,
   * dolor). Fuente canónica de restricciones de entrenamiento.
   * Leer siempre vía `getTrainingLimitations()` (@/utils/restrictions).
   */
  limitations?: string[]; painAreas?: string[]; limitationDescription?: string
  /**
   * @deprecated FASE 2 S4 · Espejo legacy de ENTRENAMIENTO escrito solo por el
   * onboarding. Sin lectores desde S4: no usar. Las alimentarias viven en
   * `nutritionPrefs.restrictions`.
   */
  restrictions?: string[]; restrictionDescription?: string
  /** ENTRENAMIENTO · Ids de ejercicios excluidos. Canónico (`getExcludedExercises()`). */
  excludedExercises?: string[] // ids "biceps/barbell-curl"
  activityLevel?: 'sedentario'|'poco_activo'|'moderado'|'muy_activo'|'extremadamente_activo'
  coachContext?: any

  // ─── Coach IA v2: perfiles objetivo ───
  /** Fuente oficial del objetivo de entrenamiento (vocabulario inglés). */
  trainingGoal?: TrainingGoal
  experienceLevel?: ExperienceLevel
  trainingHistory?: {
    yearsOfTraining?: number
    totalSessions?: number
    consistencyPct?: number
  }
  preferences?: {
    sessionDurationMin?: number
    preferredEquipment?: string[]
    avoidExercises?: string[]
    painExercises?: string[]
    favoriteExercises?: string[]
  }
  schedule?: {
    availableDays?: number[]
    preferredTime?: string
    sessionTimeAvailable?: number
  }
  nutritionPrefs?: {
    /**
     * NUTRICIÓN · Restricciones alimentarias. Fuente canónica
     * (`getNutritionRestrictions()`). No mezclar con `restrictions`, que es
     * de entrenamiento.
     */
    restrictions?: string[]
    allergies?: string[]
    dislikedFoods?: string[]
    mealFrequency?: number
    supplementation?: string[]
  }
  bodyComposition?: {
    bodyFatPct?: number
    muscleMassKg?: number
    waistCm?: number
    chestCm?: number
    armCm?: number
    thighCm?: number
  }

  // ─── Coach IA v2: exigencia ───
  coachLevel?: number
  exigencia?: {
    entrenamiento: 1|2|3|4|5
    nutricion: 1|2|3|4|5
    recuperacion: 1|2|3|4|5
  }
  activeNutritionMethod?: string
  healthConditions?: string[]
  sessionDurationMin?: number
}
export interface BodyMeasurement { id: string; localDate: string; weightKg?: number; heightCm?: number; bodyFatPct?: number; muscleMassKg?: number; chestCm?: number; waistCm?: number; hipCm?: number; createdAt: string; isDemo?: boolean }
export interface WeeklySequence { id: string; cycleId: string; weekNumber: number; startDate: string; plannedDays: number[]; completedDays: number[]; partialDays?: number[]; createdAt: string }
/** @deprecated Reemplazado por el modelo oficial TrainingSession (domain.ts). Solo lectura legacy. */
export interface LegacyTrainingSession {
  id: string; userId?: string; routineId: string; cycleId?: string; weekNumber?: number;
  plannedDay: number | null; actualDay: number | null;
  plannedMuscleGroups: string[]; actualMuscleGroups: string[];
  calendarDate: string; startTime?: string; endTime?: string; durationMin?: number;
  exerciseRecords: LegacyExerciseRecord[];
  totalExercisesPlanned: number; totalExercisesCompleted: number; totalExercisesSkipped: number; totalExercisesModified: number; totalExercisesReplaced: number; totalExtraExercises: number;
  totalSetsPlanned: number; totalSetsCompleted: number; totalReps: number; totalVolume: number;
  energy?: number; fatigue?: number; pain?: number; mood?: number;
  generalNotes?: string; dayChangeReason?: string; dayChangeComment?: string;
  createdAt: string; updatedAt: string
}
/** @deprecated Reemplazado por el modelo oficial SessionExercise (domain.ts). Solo lectura legacy. */
export interface LegacyExerciseRecord {
  id: string; sessionId: string; exerciseId: string; exerciseName: string;
  plannedSets: number; completedSets: number; plannedReps: number; completedReps: number[];
  weightPerSet: number[]; rpe?: number; rir?: number; duration?: number;
  status: 'PENDIENTE'|'COMPLETADO'|'NO_REALIZADO'|'REEMPLAZADO'|'MODIFICADO'|'EXTRA';
  originalExerciseId?: string; isExtra?: boolean; isNegative?: boolean; negativeReps?: number; negativeWeight?: number;
  notes?: string; seriesType?: 'Normal'|'Ascendente'|'Descendente'|'Piramidal'|'DropSet'|'Otra';
}
