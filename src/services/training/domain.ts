// CAPA DOMINIO OFICIAL — módulo Entrenamiento (Althea)
// Única nomenclatura: SessionStatus / SessionExerciseStatus / SetRecordStatus / SetType.
// Planificación (Routine*) ≠ Ejecución (TrainingSession*) ≠ Historial (ExerciseHistoryEntry).

export type SessionStatus =
  | 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'PAUSED'
  | 'COMPLETING' | 'COMPLETED' | 'PARTIAL'
  | 'CANCELLED' | 'ABANDONED';

export type SessionExerciseStatus =
  | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL'
  | 'SKIPPED' | 'REPLACED' | 'EXTRA';

export type SetRecordStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED';

export type SetType =
  | 'NORMAL' | 'ASCENDING' | 'DESCENDING'
  | 'PYRAMID_ASCENDING' | 'PYRAMID_DESCENDING' | 'PYRAMID_FULL'
  | 'DROP_SET' | 'CUSTOM';

export type SessionEventType =
  | 'SESSION_CREATED' | 'SESSION_STARTED' | 'SESSION_PAUSED' | 'SESSION_RESUMED'
  | 'EXERCISE_STARTED' | 'SET_COMPLETED' | 'SET_SKIPPED'
  | 'EXERCISE_MODIFIED' | 'EXERCISE_REPLACED' | 'EXERCISE_SKIPPED' | 'EXERCISE_ADDED'
  | 'SESSION_COMPLETING' | 'SESSION_COMPLETED' | 'SESSION_PARTIAL'
  | 'SESSION_CANCELLED' | 'SESSION_ABANDONED';

// ---- Matriz única de transiciones (spec §4). No duplicar.
export const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  PLANNED: ['READY'],
  READY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETING', 'CANCELLED', 'ABANDONED'],
  PAUSED: ['IN_PROGRESS', 'COMPLETING', 'CANCELLED', 'ABANDONED'],
  COMPLETING: ['COMPLETED', 'PARTIAL'],
  COMPLETED: [],
  PARTIAL: [],
  CANCELLED: [],
  ABANDONED: [],
};

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return (SESSION_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransitionSession(from: SessionStatus, to: SessionStatus): void {
  if (!canTransitionSession(from, to)) throw new Error(`Transición inválida: ${from} → ${to}`);
}

// ---- Entidades oficiales (§29-31, §44)
export interface DayChange { reason: string; comment?: string; at: string }

export interface TrainingSession {
  sessionId: string;
  userId: string;
  routineId: string;
  cycleId?: string;
  weekId?: string;
  weekNumber?: number;
  plannedDay: number | null;
  plannedDayName?: string | null;
  actualDay: number | null;
  actualDayName?: string | null;
  calendarDate: string;
  routineName?: string;
  sessionStatus: SessionStatus;
  startedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  completingAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  abandonedAt?: string;
  endedAt?: string;
  totalPausedDurationSec?: number;
  currentExerciseId?: string;
  currentExerciseIndex?: number;
  currentSetIndex?: number;
  resumeCount?: number;
  plannedExerciseCount?: number;
  completedExerciseCount?: number;
  skippedExerciseCount?: number;
  modifiedExerciseCount?: number;
  replacedExerciseCount?: number;
  extraExerciseCount?: number;
  plannedSets?: number;
  completedSets?: number;
  totalReps?: number;
  totalVolume?: number;
  plannedMuscleGroups?: string[];
  actualMuscleGroups?: string[];
  dayChange?: DayChange;
  generalObservation?: string;
  cancelReason?: string;
  cancelComment?: string;
  abandonReason?: string;
  abandonComment?: string;
  surveyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedSetSnapshot { order: number; reps: number; weight: number; setType?: SetType }

export interface SessionExercise {
  sessionExerciseId: string;
  sessionId: string;
  exerciseId: string;
  routineExerciseId?: string;
  order: number;
  planned: boolean;
  completed: boolean;
  status: SessionExerciseStatus;
  plannedSetCount: number;
  actualSetCount: number;
  plannedSets: PlannedSetSnapshot[];
  actualSets?: Array<{ order: number; reps: number; weight: number; setType?: SetType }>;
  replacement?: ExerciseReplacement;
  negatives?: NegativeSet;
  observation?: ExerciseObservation;
  skipReason?: string;
  skipComment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SetRecord {
  setRecordId: string;
  sessionId: string;
  sessionExerciseId: string;
  exerciseId: string;
  order: number;
  setType: SetType;
  plannedReps: number;
  plannedWeight: number;
  actualReps: number;
  actualWeight: number;
  status: SetRecordStatus;
  observation?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NegativeSet {
  negativeSetId: string;
  sessionId: string;
  sessionExerciseId: string;
  exerciseId: string;
  quantity: number;
  weight: number;
  observation?: string;
  createdAt: string;
}

export interface ExerciseObservation {
  observationId: string;
  sessionId: string;
  sessionExerciseId?: string;
  exerciseId?: string;
  text: string;
  createdAt: string;
}

export interface ExerciseReplacement {
  replacementId: string;
  sessionId: string;
  sessionExerciseId: string;
  originalExerciseId: string;
  replacementExerciseId: string;
  reason: string;
  comment?: string;
  createdAt: string;
}

export interface SessionEvent {
  eventId: string;
  sessionId: string;
  type: SessionEventType;
  fromStatus?: SessionStatus;
  toStatus?: SessionStatus;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PostWorkoutSurvey {
  surveyId: string;
  sessionId: string;
  userId: string;
  calendarDate: string;
  energy: number;
  fatigue: number;
  pain: number;
  mood: number;
  motivation: number;
  perceivedExertion: number;
  stress: number;
  painArea?: string;
  painObservation?: string;
  createdAt: string;
}

export function validateSurvey(s: Partial<PostWorkoutSurvey>): string[] {
  const errs: string[] = [];
  const range = (v: unknown, lo: number, hi: number) => typeof v === 'number' && v >= lo && v <= hi;
  if (!range(s.energy, 1, 10)) errs.push('energy 1–10');
  if (!range(s.fatigue, 1, 10)) errs.push('fatigue 1–10');
  if (!range(s.pain, 0, 10)) errs.push('pain 0–10');
  if (!range(s.mood, 1, 10)) errs.push('mood 1–10');
  if (!range(s.motivation, 1, 10)) errs.push('motivation 1–10');
  if (!range(s.perceivedExertion, 1, 10)) errs.push('perceivedExertion 1–10');
  if (!range(s.stress, 1, 10)) errs.push('stress 1–10');
  if (typeof s.pain === 'number' && s.pain > 3 && !(s.painArea || '').trim() && !(s.painObservation || '').trim()) {
    errs.push('painArea u observación requerida si pain>3');
  }
  return errs;
}

export interface ExerciseHistoryEntry {
  userId: string;
  exerciseId: string;
  sessionId: string;
  calendarDate: string;
  order: number;
  reps: number;
  weight: number;
  volume: number;
  setType: SetType;
}

export interface MuscleTrainingMetric {
  userId: string;
  muscle: string;
  calendarDate: string;
  sessionId: string;
  sets: number;
  reps: number;
  volume: number;
}

// Identidad estable de serie: mismo sessionExercise + orden => mismo id (idempotente ante recargas).
export function setRecordIdFor(sessionExerciseId: string, order: number): string {
  return `${sessionExerciseId}:set:${order}`;
}

// Validación de integridad antes de cerrar (§12).
export function validateBeforeFinish(s: TrainingSession, exercises: SessionExercise[]): string[] {
  const errs: string[] = [];
  if (!s.sessionId) errs.push('READY sin sessionId');
  if (!s.routineId) errs.push('IN_PROGRESS sin rutina');
  if (!s.startedAt && (s.sessionStatus === 'COMPLETED' || s.sessionStatus === 'PARTIAL')) errs.push('COMPLETED sin startedAt');
  if (s.sessionStatus === 'PARTIAL' && !exercises.some((e) => e.status === 'SKIPPED' || e.status === 'PARTIAL' || e.status === 'PENDING')) {
    errs.push('PARTIAL sin pendientes identificados');
  }
  return errs;
}
