import Dexie, { type Table } from 'dexie'
import type { Exercise, Routine, RoutineDay, RoutineExercise, Session, SetLog, RecoveryCheck, HydrationLog, UserProfile, BodyMeasurement, WeeklySequence, PainLog } from '@/types'
import type { TrainingSession, SessionExercise, SetRecord, SessionEvent, PostWorkoutSurvey, NegativeSet, ExerciseObservation } from '@/services/training/domain'
import type { CustomExercise } from '@/services/training/customExercises'
import type { RoutineData } from './routineStore'
import type { DiaryEntry, AdherenceRecord } from './diaryStore'
import type { SessionOverrideData } from './sessionOverrideStore'
import type { ChatMessage, ChatConversation } from '@/services/ai/chatHistory'
import type { CoachDecision, CoachQA } from '@/services/ai/coachMemory'
import type { DecisionRecord } from '@/services/ai/decisionLogger'
import type { KnowledgeDocument } from '@/services/ai/knowledgeBase'
import type { ExerciseKnowledgeEntry } from '@/services/ai/exerciseKnowledge'
import type { CycleVersion } from '@/services/planning/cycleVersions'

export type CoachMemoryEntry = CoachDecision | (CoachQA & { type: 'qa' }) | { id: string; type: 'prefs'; date: string; prefs: Record<string, unknown>; createdAt: string } | { id: string; type: 'score'; date: string; score: number; factors: any; createdAt: string } | { id: string; type: 'observation'; date: string; sessionId: string; sessionStatus: string; routineName: string;[k: string]: any }

export type OnboardingDraft = {
  id: string
  step: number
  data: Record<string, any>
  updatedAt: string
}

export class TrainDB extends Dexie {
  exercises!: Table<Exercise>
  routines!: Table<Routine>
  routineDays!: Table<RoutineDay>
  routineExercises!: Table<RoutineExercise>
  sessions!: Table<Session>
  setLogs!: Table<SetLog>
  recoveryChecks!: Table<RecoveryCheck>
  hydrationLogs!: Table<HydrationLog>
  userProfile!: Table<UserProfile>
  syncQueue!: Table<any>
  bodyMeasurements!: Table<BodyMeasurement>
  routineStore!: Table<RoutineData | { id: string; activeId: string; createdAt: string; updatedAt: string }>
  chatMessages!: Table<ChatMessage>
  chatConversations!: Table<ChatConversation>
  nutritionDiary!: Table<DiaryEntry>
  nutritionAdherence!: Table<AdherenceRecord>
  sessionOverrides!: Table<SessionOverrideData>
  coachMemory!: Table<CoachMemoryEntry>
  knowledgeDocuments!: Table<KnowledgeDocument>
  decisionLog!: Table<DecisionRecord>
  exerciseKnowledge!: Table<ExerciseKnowledgeEntry>
  trainingSessions!: Table<TrainingSession>
  sessionExercises!: Table<SessionExercise>
  setRecords!: Table<SetRecord>
  sessionEvents!: Table<SessionEvent>
  postWorkoutSurveys!: Table<PostWorkoutSurvey>
  negativeSets!: Table<NegativeSet>
  exerciseObservations!: Table<ExerciseObservation>
  customExercises!: Table<CustomExercise>
  weeklySequences!: Table<WeeklySequence>
  exerciseRecords!: Table<any>
  scoreSnapshots!: Table<any>
  exerciseState!: Table<any>
  sessionChanges!: Table<any>
  sessionObservations!: Table<any>
  exerciseGymCache!: Table<any>
  migrationStatus!: Table<any>
  onboardingDrafts!: Table<OnboardingDraft>
  painLogs!: Table<PainLog>
  cycleVersions!: Table<CycleVersion>
  notifConfigs!: Table<{ id: string;[k: string]: unknown }>
  notifLog!: Table<{ id: string; date: string;[k: string]: unknown }>
  constructor() {
    super('trainPWA')
    this.version(1).stores({
      exercises: 'id, groupMain, equipment, level, pattern, *tags',
      routines: 'id, createdAt',
      routineDays: 'id, routineId, weekday',
      routineExercises: 'id, routineDayId, exerciseId, order',
      sessions: 'id, localDate, createdAt',
      setLogs: 'id, sessionId, exerciseId, createdAt',
      recoveryChecks: 'id, localDate',
      hydrationLogs: 'id, localDate',
      userProfile: 'id',
      syncQueue: 'id, status, createdAt'
    })
    this.version(2).stores({
      bodyMeasurements: 'id, localDate, createdAt'
    }).upgrade(tx=>{
      return (tx as any).table('bodyMeasurements').toCollection().count()
    })
    this.version(3).stores({
      coachMemory: 'id, date, type, createdAt'
    })
    this.version(4).stores({
      weeklySequences: 'id, cycleId, weekNumber',
      trainingSessions: 'id, calendarDate, routineId',
      exerciseRecords: 'id, sessionId, exerciseId'
    })
    // v5: modelo oficial de ejecución — SessionExercise / SetRecord / eventos / encuesta / negativas.
    // sessions + setLogs quedan como capa física legacy de solo-lectura (ver migrateLegacyTrainingData).
    this.version(5).stores({
      sessionExercises: 'sessionExerciseId, sessionId, exerciseId',
      setRecords: 'setRecordId, sessionId, sessionExerciseId, exerciseId',
      sessionEvents: 'eventId, sessionId, type, timestamp',
      postWorkoutSurveys: 'surveyId, sessionId, calendarDate',
      negativeSets: 'negativeSetId, sessionId, sessionExerciseId',
      exerciseObservations: 'observationId, sessionId, sessionExerciseId',
    })
    // v6: ejercicios personalizados en Gym-shape (mismo universo que rutinas/entrenos).
    // db.exercises conserva el seed español legacy; customs van aquí con origin USER_CREATED.
    this.version(6).stores({
      customExercises: 'id, muscle, bodyPart',
    })
    // v7: Coach IA v2 — tablas de conocimiento, decisiones y score history.
    this.version(7).stores({
      knowledgeDocuments: 'id, topic, evidenceLevel, updatedAt',
      decisionLog: 'id, timestamp, type, createdAt',
      scoreSnapshots: 'id, date, score',
      exerciseKnowledge: 'id, muscle, movementPattern, exerciseDifficulty',
    })
    // v8: Chat conversacional — mensajes persistidos entre sesiones.
    this.version(8).stores({
      chatMessages: 'id, conversationId, role, createdAt',
      chatConversations: 'id, pageContext, createdAt, updatedAt',
    })
    // v9: Rutinas — migración de localStorage 'rutinas:list' a Dexie como fuente única.
    // routineStore guarda las rutinas completas (con dayExercises embebidos).
    // 'meta:activeId' guarda el ID de la rutina activa.
    this.version(9).stores({
      routineStore: 'id, createdAt, updatedAt',
    })
    // v10: Nutrición — migración de localStorage 'nutri:diario_v2:*' y 'nutrition:adherence' a Dexie.
    this.version(10).stores({
      nutritionDiary: 'id, date, mealType, addedAt',
      nutritionAdherence: 'id, methodId, date, createdAt',
    })
    // v11: Session overrides — migración de localStorage 'session:override:*', 'session:changed:*', 'session:observation:*'.
    this.version(11).stores({
      sessionOverrides: 'date',
    })
    // v12: Fix exerciseKnowledge index — 'exerciseDifficulty' → 'difficulty' (field name mismatch).
    this.version(12).stores({
      exerciseKnowledge: 'id, muscle, movementPattern, difficulty',
    })
    // v13: Migración localStorage restante → Dexie (exerciseState, sessionChanges, sessionObservations, exerciseGymCache, migrationStatus)
    this.version(13).stores({
      exerciseState: 'id, date, exerciseId',
      sessionChanges: 'id, date',
      sessionObservations: 'id, date',
      exerciseGymCache: 'key',
      migrationStatus: 'id',
    })
    // v14: Onboarding drafts — borrador de onboarding persistido en Dexie (fuente de verdad)
    // Permite reanudar onboarding tras cerrar/recargar la app
    this.version(14).stores({
      onboardingDrafts: 'id, updatedAt'
    })
    // v15: Pain logs — registro de dolor/molestias por ejercicio y sesión
    this.version(15).stores({
      painLogs: 'id, localDate, exerciseId, level, createdAt'
    })
    // v16: Demo data support — add isDemo field (no index, use in-memory filtering for test compatibility)
    this.version(16).stores({
      routineStore: 'id, createdAt, updatedAt',
      trainingSessions: 'id, calendarDate, routineId, sessionId',
    })
    // v17: Versionado de planificación — historial de ciclos (solo aditiva, sin migración de datos).
    // Las instalaciones existentes generan v1 de forma perezosa al guardar planificación.
    this.version(17).stores({
      cycleVersions: 'id, scope, status, effectiveFrom',
    })
    // v18: Notificaciones — configs y registro de disparos en Dexie (solo aditivo).
    // Migración perezosa desde localStorage una sola vez.
    this.version(18).stores({
      notifConfigs: 'id',
      notifLog: 'id, date',
    })
  }
}
export const db = new TrainDB()

export async function ensureSeeded() {
  const count = await db.exercises.count()
  if (count > 0) {return}
  const { exercises } = await import('@/data/exercises.json')
  await db.exercises.bulkPut(exercises as Exercise[])
}

export async function getTodayLocalDate(): Promise<string> {
  return new Date().toISOString().slice(0,10)
}

export async function saveOnboardingDraft(step: number, data: Record<string, any>): Promise<void> {
  await db.onboardingDrafts.put({
    id: 'onboarding-draft',
    step,
    data,
    updatedAt: new Date().toISOString()
  })
}

export async function getOnboardingDraft(): Promise<OnboardingDraft | null> {
  const draft = await db.onboardingDrafts.get('onboarding-draft')
  return draft ?? null
}

export async function clearOnboardingDraft(): Promise<void> {
  await db.onboardingDrafts.delete('onboarding-draft')
}
