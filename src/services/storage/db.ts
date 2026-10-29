import Dexie, { type Table } from 'dexie'
import type { Exercise, Routine, RoutineDay, RoutineExercise, Session, SetLog, RecoveryCheck, HydrationLog, UserProfile, BodyMeasurement, WeeklySequence, PainLog } from '@/types'
import type { TrainingSession, SessionExercise, SetRecord, SessionEvent, PostWorkoutSurvey, NegativeSet, ExerciseObservation } from '@/services/training/domain'
import type { CustomExercise } from '@/services/training/customExercises'
import type { RoutineData } from './routineStore'
import type { DiaryEntry, AdherenceRecord } from './diaryStore'
import type { CustomFood } from './customFoodStore'
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
  /**
   * v24. Sesiones de actividad deportiva. Mapea sobre la forma de
   * `ActivitySession` (services/activity/activityService.ts) para que ese
   * módulo sea quien escriba y el atlas sólo lea. Campos opcionales: la
   * distancia, el peso o la intensidad pueden no existir y eso es válido.
   */
  activitySessions!: Table<{
    id: string
    userId: string
    activityId: string
    activityName: string
    modalidad?: string
    calendarDate: string
    startedAt: string
    durationMinutes?: number
    distanceMeters?: number
    distanceKm?: number | null
    distanceSource?: 'manual' | 'gps' | 'machine' | null
    weightKg?: number | null
    intensity?: string
    met?: number
    metSourceCode?: string
    metEstimated?: boolean
    variantId?: string
    variantLabel?: string
    sessionRpe?: number | null
    sessionLoad?: number | null
    grossKcal?: number | null
    netKcal?: number | null
    activeKcal?: number | null
    calorieMethod?: 'MET' | 'ACSM_WALK' | 'ACSM_RUN' | null
    calorieEstimated?: boolean
    inclinePercent?: number | null
    powerWatts?: number | null
    machineKcal?: number | null
    kcalFormula?: string | null
    notes?: string
    createdAt: string
    updatedAt: string
  }>
  sessionEvents!: Table<SessionEvent>
  postWorkoutSurveys!: Table<PostWorkoutSurvey>
  negativeSets!: Table<NegativeSet>
  exerciseObservations!: Table<ExerciseObservation>
  customExercises!: Table<CustomExercise>
  sharedExercises!: Table<CustomExercise>
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
  hydrationBottles!: Table<{ id: string; name?: string; capacityMl: number; active: boolean; order: number; updatedAt: string }>
  hydrationBottleLogs!: Table<{ id: string; localDate: string; bottleId: string; amountMl: number; time: string }>
  notifConfigs!: Table<{ id: string;[k: string]: unknown }>
  notifLog!: Table<{ id: string; date: string;[k: string]: unknown }>
  unifiedNotifConfigs!: Table<{ id: string; type: string; title: string; enabled: boolean; time: string; times: string[]; days: boolean[]; recurrence: string; requiredAction: boolean; updatedAt: string }>
  requiredActionStates!: Table<{ id: string; configId: string; date: string; status: 'pending' | 'completed'; completedAt?: string; createdAt: string }>
  feedbackThreads!: Table<import('@/services/feedback/feedbackTypes').FeedbackThread>
  feedbackMessages!: Table<import('@/services/feedback/feedbackTypes').FeedbackLocalMessage>
  feedbackOutbox!: Table<import('@/services/feedback/feedbackTypes').FeedbackOutboxEntry>
  restTimerState!: Table<{
    id: string
    endsAt: number | null
    pausedRemainingSec: number | null
    flash: boolean
    updatedAt: string
  }>
  customFoods!: Table<CustomFood>
  syncDeletes!: Table<{ table: string; docId: string; deletedAt: string }, number>
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
    // v19: Botellas de hidratación — configuración (2-3 botellas) y logs diarios por botella.
    // Solo aditivo. Config persiste en Dexie, no en localStorage. Logs por fecha con snapshot de capacidad.
    this.version(19).stores({
      hydrationBottles: 'id, active, order',
      hydrationBottleLogs: 'id, localDate, bottleId, time',
    })
    // v20: Notificaciones unificadas + acciones obligatorias (pending/completed) — Dexie, no React state.
    // Sistema reutilizable requiredAction. RecoveryCheck y futuras acciones usan mismo mecanismo.
    this.version(20).stores({
      unifiedNotifConfigs: 'id, type, enabled',
      requiredActionStates: 'id, configId, date, status',
    })
    // v22: Feedback usuario↔admin (solo aditivo). Espejo local de los hilos y
    // mensajes del usuario + cola de salida idempotente (outbox). NO entra en la
    // sincronización genérica users/{uid}: feedback vive en feedbackThreads (top-level)
    // con permisos propios en firestore.rules.
    this.version(22).stores({
      feedbackThreads: 'id, ownerId, status, category, lastActivityAt, updatedAt',
      feedbackMessages: 'id, threadId, createdAt, syncStatus',
      feedbackOutbox: 'id, kind, threadId, status, createdAt',
    })
    // v23: Cronómetro de descanso persistente — tiempo restante, estado y flash.
    // Almacenado por timerId para permitir múltiples cronómetros independientes
    // (entre series y entre ejercicios). Sobrevive a cierre/recarga de la app.
    this.version(23).stores({
      restTimerState: 'id, endsAt, pausedRemainingSec, flash, updatedAt',
    })
    // v24: Actividades deportivas (pádel, correr, ciclismo, natación, ...).
    // Solo aditivo. Es la ÚNICA fuente de verdad sporting: el atlas la lee en
    // modo solo lectura, sin duplicar datos ni crear una segunda tabla.
    // `weightKg` es el peso registrado en ESA sesión; si viene null, el cálculo
    // usa el peso corporal histórico de la fecha (nunca el actual por defecto).
    // v25 (solo índices): userId para aislamiento por cuenta, más campos de
    // snapshot (variante MET, RPE, carga, kcal) para que el historial no
    // recalcule al cambiar el perfil.
    this.version(24).stores({
      activitySessions: 'id, activityId, calendarDate, startedAt',
    })
    this.version(25).stores({
      activitySessions: 'id, userId, activityId, calendarDate, startedAt',
    })
    // v26: Alimentos personalizados creados manualmente por el usuario.
    // Solo aditivo. Fuente de verdad de las altas manuales (nombre, macros,
    // base de cálculo, sinónimos). No altera nutritionDiary: cada DiaryEntry
    // conserva su snapshot de macros, así que editar/borrar un alimento
    // personalizado nunca reescribe comidas ya registradas.
    this.version(26).stores({
      customFoods: 'id, name, updatedAt, source',
    })
    // v27: Rastreo de borrados para sincronización. Cuando una fila sincronizable
    // se elimina localmente, se anota aquí para que el envío a Firestore pueda
    // borrar el documento remoto correspondiente y el dato no resucite en la
    // siguiente descarga. Solo aditivo.
    this.version(27).stores({
      syncDeletes: '++id, table, docId',
    })
    // v28: Biblioteca compartida local cache
    this.version(28).stores({
      sharedExercises: 'id, muscle, bodyPart',
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
