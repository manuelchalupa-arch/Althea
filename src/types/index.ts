export type Goal = 'fuerza' | 'hipertrofia' | 'resistencia' | 'perdida_peso' | 'recomposicion' | 'mantenimiento' | 'personalizado'
export type Level = 'principiante' | 'intermedio' | 'avanzado'
export type CoachIntensity = 'profesional' | 'motivacional' | 'duro' | 'extremo'
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
export interface RecoveryCheck { id: string; localDate: string; energy: number; fatigue: number; stress: number; sleepHours: number; sleepQuality: number; soreness: number; motivation: number; digestion: number; hydration: number; score: number; color: 'green'|'yellow'|'red' }
export interface HydrationLog { id: string; localDate: string; amountMl: number; time: string }
export interface UserProfile {
  id: string; goal: Goal; level: Level; availableDays: number[]; trainingTime: string
  equipment: Equipment[]; units: { weight: 'kg'|'lb'; liquid: 'ml'|'oz' }; lang: string
  coachIntensity: CoachIntensity; onboardingDone: boolean; hydrationGoalMl: number
  createdAt: string; updatedAt: string
  cycle?: { startDate: string; trainingDays: { n:number; name:string }[]; weekMap: (number|null)[] }
  // Perfil onboarding Coach IA
  displayName?: string; email?: string
  age?: number; sex?: 'M'|'F'|'X'; heightCm?: number; weightKg?: number
  bodyFatPct?: number; muscleMassKg?: number
  bmi?: string; bmiCategory?: string; bmiCalculatedAt?: string
  targetWeightKg?: number
  goalPrimary?: string; goalsSecondary?: string[]; customGoal?: string
  needsDescription?: string
  limitations?: string[]; painAreas?: string[]; limitationDescription?: string
  restrictions?: string[]; restrictionDescription?: string
  excludedExercises?: string[] // ids "biceps/barbell-curl"
  activityLevel?: 'sedentario'|'poco_activo'|'moderado'|'muy_activo'|'extremadamente_activo'
  coachContext?: any
}
export interface BodyMeasurement { id: string; localDate: string; weightKg?: number; heightCm?: number; bodyFatPct?: number; muscleMassKg?: number; chestCm?: number; waistCm?: number; hipCm?: number; createdAt: string }
export interface WeeklySequence { id: string; cycleId: string; weekNumber: number; startDate: string; plannedDays: number[]; completedDays: number[]; createdAt: string }
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
