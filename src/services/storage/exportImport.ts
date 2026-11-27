import { db } from './db'
import type { TrainingSession, SessionExercise, SetRecord, SessionEvent, PostWorkoutSurvey, NegativeSet, ExerciseObservation } from '@/services/training/domain'
import type { RoutineData } from './routineStore'
import type { DiaryEntry, AdherenceRecord } from './diaryStore'
import type { SessionOverrideData } from './sessionOverrideStore'
import type { RecoveryCheck, HydrationLog, BodyMeasurement, UserProfile, PainLog, RoutineDay, RoutineExercise } from '@/types'
import type { CustomExercise } from '@/services/training/customExercises'
import type { ChatMessage, ChatConversation } from '@/services/ai/chatHistory'
import type { DecisionRecord } from '@/services/ai/decisionLogger'
import type { KnowledgeDocument } from '@/services/ai/knowledgeBase'
import type { ExerciseKnowledgeEntry } from '@/services/ai/exerciseKnowledge'

export const EXPORT_FORMAT_VERSION = 5
export const APP_VERSION = '0.21.0'

// Versiones de respaldo: v4 es compatible con los archivos generados por
// la rama anterior; v5 agrega la selección de rutina activa y exige validar
// el manifiesto completo antes de restaurar.
const EXPORT_TABLES_V4 = [
  'routines',
  'routineDays',
  'routineExercises',
  'trainingSessions',
  'sessionExercises',
  'setRecords',
  'sessionEvents',
  'postWorkoutSurveys',
  'negativeSets',
  'exerciseObservations',
  'recoveryChecks',
  'hydrationLogs',
  'bodyMeasurements',
  'userProfile',
  'customExercises',
  'weeklySequences',
  'chatMessages',
  'chatConversations',
  'nutritionDiary',
  'nutritionAdherence',
  'sessionOverrides',
  'coachMemory',
  'decisionLog',
  'knowledgeDocuments',
  'exerciseKnowledge',
  'scoreSnapshots',
  'onboardingDrafts',
  'painLogs',
  'cfWods',
  'cfSchedule',
  'cfResults',
  'cfMarks',
  'activitySessions',
  'exerciseRecords',
  'cycleVersions',
  'hydrationBottles',
  'hydrationBottleLogs',
  'notifConfigs',
  'notifLog',
  'unifiedNotifConfigs',
  'requiredActionStates',
  'customFoods',
  'exerciseState',
  'sessionChanges',
  'sessionObservations',
  'legacyRoutines',
  'legacySessions',
  'legacySetLogs',
  'feedbackThreads',
  'feedbackMessages',
  'feedbackOutbox',
  'restTimerState',
  'cfTimerState',
  'syncQueue',
  'syncDeletes',
] as const
const EXPORT_TABLES_V5 = [
  'routines',
  'routineDays',
  'routineExercises',
  'trainingSessions',
  'sessionExercises',
  'setRecords',
  'sessionEvents',
  'postWorkoutSurveys',
  'negativeSets',
  'exerciseObservations',
  'recoveryChecks',
  'hydrationLogs',
  'bodyMeasurements',
  'userProfile',
  'customExercises',
  'weeklySequences',
  'chatMessages',
  'chatConversations',
  'nutritionDiary',
  'nutritionAdherence',
  'sessionOverrides',
  'coachMemory',
  'decisionLog',
  'knowledgeDocuments',
  'exerciseKnowledge',
  'scoreSnapshots',
  'onboardingDrafts',
  'painLogs',
  'cfWods',
  'cfSchedule',
  'cfResults',
  'cfMarks',
  'activitySessions',
  'exerciseRecords',
  'cycleVersions',
  'hydrationBottles',
  'hydrationBottleLogs',
  'notifConfigs',
  'notifLog',
  'unifiedNotifConfigs',
  'requiredActionStates',
  'customFoods',
  'exerciseState',
  'sessionChanges',
  'sessionObservations',
  'legacyRoutines',
  'legacySessions',
  'legacySetLogs',
  'feedbackThreads',
  'feedbackMessages',
  'feedbackOutbox',
  'restTimerState',
  'cfTimerState',
  'syncQueue',
  'syncDeletes',
  'routineStoreMeta',
] as const

export interface ExportMetadata {
  version: number
  appVersion: string
  exportedAt: string
  schemaVersion: number
  tables: string[]
  recordCounts: Record<string, number>
  exportedBy: string
}

export interface ImportOptions {
  mode: 'merge' | 'replace' | 'replace-all'
  confirmOverwrite?: boolean
  skipValidation?: boolean
  onProgress?: (stage: string, current: number, total: number) => void
}

export interface ImportPreview {
  summary: {
    routines: number
    routineDays: number
    routineExercises: number
    routineStoreMeta: number
    sessions: number
    sessionExercises: number
    setRecords: number
    sessionEvents: number
    surveys: number
    negativeSets: number
    observations: number
    recoveryChecks: number
    hydrationLogs: number
    hydrationBottles: number
    hydrationBottleLogs: number
    customFoods: number
    notificationConfigs: number
    bodyMeasurements: number
    legacyRoutines: number
    legacySessions: number
    legacySetLogs: number
    feedbackThreads: number
    feedbackMessages: number
    feedbackOutbox: number
    restTimerState: number
    cfTimerState: number
    syncQueue: number
    syncDeletes: number
    userProfile: boolean
    routinesNew: number
    routinesUpdated: number
    routinesSkipped: number
    conflicts: ConflictInfo[]
  }
  conflicts: ConflictInfo[]
  warnings: string[]
  canImport: boolean
}

export interface ConflictInfo {
  table: string
  id: string
  local: any
  imported: any
  suggestedResolution: 'keep-local' | 'keep-imported' | 'duplicate'
}

export interface ImportResult {
  success: boolean
  imported: {
    routines: number
    routineDays: number
    routineExercises: number
    routineStoreMeta: number
    sessions: number
    sessionExercises: number
    setRecords: number
    sessionEvents: number
    surveys: number
    negativeSets: number
    observations: number
    recoveryChecks: number
    hydrationLogs: number
    bodyMeasurements: number
    userProfile: boolean
    customExercises: number
    weeklySequences: number
    chatMessages: number
    chatConversations: number
    nutritionDiary: number
    nutritionAdherence: number
    sessionOverrides: number
    coachMemory: number
    decisionLog: number
    knowledgeDocuments: number
    exerciseKnowledge: number
    scoreSnapshots: number
    onboardingDrafts: number
    painLogs: number
    cfWods: number
    cfSchedule: number
    cfResults: number
    cfMarks: number
    activitySessions: number
    exerciseRecords: number
    cycleVersions: number
    hydrationBottles: number
    hydrationBottleLogs: number
    notifConfigs: number
    notifLog: number
    unifiedNotifConfigs: number
    requiredActionStates: number
    customFoods: number
    exerciseState: number
    sessionChanges: number
    sessionObservations: number
    legacyRoutines: number
    legacySessions: number
    legacySetLogs: number
    feedbackThreads: number
    feedbackMessages: number
    feedbackOutbox: number
    restTimerState: number
    cfTimerState: number
    syncQueue: number
    syncDeletes: number
  }
  errors: string[]
  conflicts: ConflictInfo[]
  verification: VerificationResult
}

export interface VerificationResult {
  passed: boolean
  checks: {
    recordCounts: boolean
    referentialIntegrity: boolean
    sessionExerciseLinks: boolean
    setRecordLinks: boolean
    routineExerciseLinks: boolean
    noOrphanRecords: boolean
  }
  details: string[]
}

export interface ExportData {
  metadata: ExportMetadata
  routines: RoutineData[]
  routineDays: RoutineDay[]
  routineExercises: RoutineExercise[]
  trainingSessions: TrainingSession[]
  sessionExercises: SessionExercise[]
  setRecords: SetRecord[]
  sessionEvents: SessionEvent[]
  postWorkoutSurveys: PostWorkoutSurvey[]
  negativeSets: NegativeSet[]
  exerciseObservations: ExerciseObservation[]
  recoveryChecks: RecoveryCheck[]
  hydrationLogs: HydrationLog[]
  bodyMeasurements: BodyMeasurement[]
  userProfile: UserProfile[]
  customExercises: CustomExercise[]
  weeklySequences: any[]
  chatMessages: ChatMessage[]
  chatConversations: ChatConversation[]
  nutritionDiary: DiaryEntry[]
  nutritionAdherence: AdherenceRecord[]
  sessionOverrides: SessionOverrideData[]
  coachMemory: any[]
  decisionLog: DecisionRecord[]
  knowledgeDocuments: KnowledgeDocument[]
  exerciseKnowledge: ExerciseKnowledgeEntry[]
  scoreSnapshots: any[]
  onboardingDrafts: any[]
  painLogs: PainLog[]
  /** Preferencia local necesaria para restaurar qué rutina estaba activa. */
  routineStoreMeta: Array<{ id: string; activeId: string; createdAt: string; updatedAt: string }>
  // Añadidas aditivamente (sin bump de versión): antes el respaldo omitía
  // CrossFit, actividad, historial de ejercicios y versiones de ciclo.
  // Opcionales para seguir leyendo archivos antiguos.
  cfWods?: any[]
  cfSchedule?: any[]
  cfResults?: any[]
  cfMarks?: any[]
  activitySessions?: any[]
  exerciseRecords?: any[]
  cycleVersions?: any[]
  hydrationBottles?: any[]
  hydrationBottleLogs?: any[]
  notifConfigs?: any[]
  notifLog?: any[]
  unifiedNotifConfigs?: any[]
  requiredActionStates?: any[]
  customFoods?: any[]
  exerciseState?: any[]
  sessionChanges?: any[]
  sessionObservations?: any[]
  legacyRoutines?: any[]
  legacySessions?: any[]
  legacySetLogs?: any[]
  feedbackThreads?: any[]
  feedbackMessages?: any[]
  feedbackOutbox?: any[]
  restTimerState?: any[]
  cfTimerState?: any[]
  syncQueue?: any[]
  syncDeletes?: any[]
}

async function collectAllData(): Promise<Omit<ExportData, 'metadata'>> {
  const allRoutines = await db.routineStore.toArray()
  const routines = allRoutines.filter((r): r is RoutineData => 'dayExercises' in r)
  const routineStoreMeta = allRoutines.filter((r): r is { id: string; activeId: string; createdAt: string; updatedAt: string } =>
    'activeId' in r && typeof r.activeId === 'string'
  )
  
  const [
    routineDays,
    routineExercises,
    trainingSessions,
    sessionExercises,
    setRecords,
    sessionEvents,
    postWorkoutSurveys,
    negativeSets,
    exerciseObservations,
    recoveryChecks,
    hydrationLogs,
    bodyMeasurements,
    userProfile,
    customExercises,
    weeklySequences,
    chatMessages,
    chatConversations,
    nutritionDiary,
    nutritionAdherence,
    sessionOverrides,
    coachMemory,
    decisionLog,
    knowledgeDocuments,
    exerciseKnowledge,
    scoreSnapshots,
    onboardingDrafts,
    painLogs,
    cfWods,
    cfSchedule,
    cfResults,
    cfMarks,
    activitySessions,
    exerciseRecords,
    cycleVersions,
    hydrationBottles,
    hydrationBottleLogs,
    notifConfigs,
    notifLog,
    unifiedNotifConfigs,
    requiredActionStates,
    customFoods,
    exerciseState,
    sessionChanges,
    sessionObservations,
    legacyRoutines,
    legacySessions,
    legacySetLogs,
    feedbackThreads,
    feedbackMessages,
    feedbackOutbox,
    restTimerState,
    cfTimerState,
    syncQueue,
    syncDeletes,
  ] = await Promise.all([
    db.routineDays.toArray(),
    db.routineExercises.toArray(),
    db.trainingSessions.toArray(),
    db.sessionExercises.toArray(),
    db.setRecords.toArray(),
    db.sessionEvents.toArray(),
    db.postWorkoutSurveys.toArray(),
    db.negativeSets.toArray(),
    db.exerciseObservations.toArray(),
    db.recoveryChecks.toArray(),
    db.hydrationLogs.toArray(),
    db.bodyMeasurements.toArray(),
    db.userProfile.toArray(),
    db.customExercises.toArray(),
    db.weeklySequences.toArray(),
    db.chatMessages.toArray(),
    db.chatConversations.toArray(),
    db.nutritionDiary.toArray(),
    db.nutritionAdherence.toArray(),
    db.sessionOverrides.toArray(),
    db.coachMemory.toArray(),
    db.decisionLog.toArray(),
    db.knowledgeDocuments.toArray(),
    db.exerciseKnowledge.toArray(),
    db.scoreSnapshots.toArray(),
    db.onboardingDrafts.toArray(),
    db.painLogs.toArray(),
    db.cfWods.toArray(),
    db.cfSchedule.toArray(),
    db.cfResults.toArray(),
    db.cfMarks.toArray(),
    db.activitySessions.toArray(),
    db.exerciseRecords.toArray(),
    db.cycleVersions.toArray(),
    db.hydrationBottles.toArray(),
    db.hydrationBottleLogs.toArray(),
    db.notifConfigs.toArray(),
    db.notifLog.toArray(),
    db.unifiedNotifConfigs.toArray(),
    db.requiredActionStates.toArray(),
    db.customFoods.toArray(),
    db.exerciseState.toArray(),
    db.sessionChanges.toArray(),
    db.sessionObservations.toArray(),
    db.routines.toArray(),
    db.sessions.toArray(),
    db.setLogs.toArray(),
    db.feedbackThreads.toArray(),
    db.feedbackMessages.toArray(),
    db.feedbackOutbox.toArray(),
    db.restTimerState.toArray(),
    db.cfTimerState.toArray(),
    db.syncQueue.toArray(),
    db.syncDeletes.toArray(),
  ])

  return {
    routines,
    routineStoreMeta,
    routineDays,
    routineExercises,
    trainingSessions,
    sessionExercises,
    setRecords,
    sessionEvents,
    postWorkoutSurveys,
    negativeSets,
    exerciseObservations,
    recoveryChecks,
    hydrationLogs,
    bodyMeasurements,
    userProfile,
    customExercises,
    weeklySequences,
    chatMessages,
    chatConversations,
    nutritionDiary,
    nutritionAdherence,
    sessionOverrides,
    coachMemory,
    decisionLog,
    knowledgeDocuments,
    exerciseKnowledge,
    scoreSnapshots,
    onboardingDrafts,
    painLogs,
    cfWods,
    cfSchedule,
    cfResults,
    cfMarks,
    activitySessions,
    exerciseRecords,
    cycleVersions,
    hydrationBottles,
    hydrationBottleLogs,
    notifConfigs,
    notifLog,
    unifiedNotifConfigs,
    requiredActionStates,
    customFoods,
    exerciseState,
    sessionChanges,
    sessionObservations,
    legacyRoutines,
    legacySessions,
    legacySetLogs,
    feedbackThreads,
    feedbackMessages,
    feedbackOutbox,
    restTimerState,
    cfTimerState,
    syncQueue,
    syncDeletes,
  }
}

function buildMetadata(data: Omit<ExportData, 'metadata'>): ExportMetadata {
  const tables = Object.keys(data) as (keyof Omit<ExportData, 'metadata'>)[]
  const recordCounts: Record<string, number> = {}
  for (const table of tables) {
    recordCounts[table] = (data[table] as any[]).length
  }
  return {
    version: EXPORT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: 29,
    tables,
    recordCounts,
    exportedBy: 'Althea PWA',
  }
}

export async function exportJSON(): Promise<Blob> {
  const data = await collectAllData()
  const metadata = buildMetadata(data)
  const exportData: ExportData = { metadata, ...data }
  return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
}

export async function exportCSV(): Promise<Blob> {
  const setRecords = await db.setRecords.toArray()
  const trainingSessions = await db.trainingSessions.toArray()
  const exercises = await db.exercises.toArray()

  const exerciseMap = new Map(exercises.map(e => [e.id, e.name]))

  const sessionMap = new Map(trainingSessions.map(s => [s.sessionId, s]))

  const header = 'setRecordId,sessionId,calendarDate,sessionExerciseId,exerciseId,exerciseName,order,setType,plannedReps,plannedWeight,actualReps,actualWeight,status,completedAt,createdAt\n'
  const rows = setRecords.map(sr => {
    const session = sessionMap.get(sr.sessionId)
    const exName = exerciseMap.get(sr.exerciseId) || sr.exerciseId
    return [
      sr.setRecordId,
      sr.sessionId,
      session?.calendarDate || '',
      sr.sessionExerciseId,
      sr.exerciseId,
      exName,
      sr.order,
      sr.setType,
      sr.plannedReps,
      sr.plannedWeight,
      sr.actualReps,
      sr.actualWeight,
      sr.status,
      sr.completedAt || '',
      sr.createdAt,
    ].join(',')
  }).join('\n')

  return new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function migrateExportData(data: any, fromVersion: number): ExportData {
  let migrated = { ...data }
  
  if (fromVersion < 2) {
    if (!migrated.sessionExercises) {migrated.sessionExercises = []}
    if (!migrated.setRecords) {migrated.setRecords = []}
    if (!migrated.sessionEvents) {migrated.sessionEvents = []}
    if (!migrated.postWorkoutSurveys) {migrated.postWorkoutSurveys = []}
    if (!migrated.negativeSets) {migrated.negativeSets = []}
    if (!migrated.exerciseObservations) {migrated.exerciseObservations = []}
    if (!migrated.weeklySequences) {migrated.weeklySequences = []}
    if (!migrated.chatMessages) {migrated.chatMessages = []}
    if (!migrated.chatConversations) {migrated.chatConversations = []}
    if (!migrated.nutritionDiary) {migrated.nutritionDiary = []}
    if (!migrated.nutritionAdherence) {migrated.nutritionAdherence = []}
    if (!migrated.sessionOverrides) {migrated.sessionOverrides = []}
    if (!migrated.coachMemory) {migrated.coachMemory = []}
    if (!migrated.decisionLog) {migrated.decisionLog = []}
    if (!migrated.knowledgeDocuments) {migrated.knowledgeDocuments = []}
    if (!migrated.exerciseKnowledge) {migrated.exerciseKnowledge = []}
    if (!migrated.scoreSnapshots) {migrated.scoreSnapshots = []}
    if (!migrated.onboardingDrafts) {migrated.onboardingDrafts = []}
    if (!migrated.painLogs) {migrated.painLogs = []}
    if (!migrated.customExercises) {migrated.customExercises = []}
    if (!migrated.routineDays) {migrated.routineDays = []}
    if (!migrated.routineExercises) {migrated.routineExercises = []}
  }
  
  // v3/v4: tablas aditivas de hidratación, notificaciones, alimentos,
  // feedback, cronómetros y estado de sincronización. Archivos v1-v3 compatibles.
  const additiveTables = [
    'hydrationBottles', 'hydrationBottleLogs', 'notifConfigs', 'notifLog',
    'unifiedNotifConfigs', 'requiredActionStates', 'customFoods',
    'exerciseState', 'sessionChanges', 'sessionObservations',
    'legacyRoutines', 'legacySessions', 'legacySetLogs',
    'feedbackThreads', 'feedbackMessages', 'feedbackOutbox',
    'restTimerState', 'cfTimerState', 'syncQueue', 'syncDeletes', 'routineStoreMeta',
  ]
  for (const table of additiveTables) {
    if (!Array.isArray(migrated[table])) { migrated[table] = [] }
  }

  return migrated as ExportData
}

function validateExportData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Datos inválidos: no es un objeto')
    return { valid: false, errors }
  }

  const metadata = data.metadata
  const formatVersion = Number(metadata?.version)

  if (!metadata || typeof metadata !== 'object') {
    errors.push('Falta metadata de exportación')
  } else {
    if (!Number.isInteger(formatVersion) || formatVersion < 1 || formatVersion > EXPORT_FORMAT_VERSION) {
      errors.push(`Versión de formato inválida: ${metadata.version} (actual: ${EXPORT_FORMAT_VERSION})`)
    }
    if (typeof metadata.exportedAt !== 'string' || !metadata.exportedAt) {
      errors.push('Falta fecha de exportación')
    }
    if (!Number.isInteger(Number(metadata.schemaVersion)) || Number(metadata.schemaVersion) < 1) {
      errors.push('Falta versión de esquema')
    } else if (Number(metadata.schemaVersion) > 29) {
      errors.push('El respaldo proviene de una versión de esquema más nueva. Actualizá Althea antes de importarlo para evitar pérdida de información.')
    }
  }

  // Los manifiestos v4/v5 contienen tanto la lista de tablas como sus conteos.
  // Validarlos evita aceptar un respaldo truncado como si estuviera completo.
  if (formatVersion >= 4 && formatVersion <= EXPORT_FORMAT_VERSION) {
    const expectedTables: readonly string[] = formatVersion === 4 ? EXPORT_TABLES_V4 : EXPORT_TABLES_V5
    const expectedSet = new Set(expectedTables)
    const actualTables = Object.keys(data).filter(key => key !== 'metadata')
    const declaredTables = metadata?.tables
    const recordCounts = metadata?.recordCounts

    if (!Array.isArray(declaredTables)) {
      errors.push('El respaldo no contiene el manifiesto de tablas.')
    } else {
      const declared = new Set<string>(declaredTables.filter((table: unknown): table is string => typeof table === 'string'))
      for (const table of expectedTables) {
        if (!declared.has(table)) {
          errors.push(`El respaldo está incompleto: falta la tabla ${table} en el manifiesto.`)
        }
      }
      for (const table of declaredTables) {
        if (typeof table !== 'string' || !expectedSet.has(table)) {
          errors.push(`El manifiesto contiene una tabla desconocida: ${String(table)}.`)
        }
      }
      for (const table of actualTables) {
        if (!declared.has(table)) {
          errors.push(`La tabla ${table} no figura en el manifiesto del respaldo.`)
        }
      }
      for (const table of declaredTables) {
        if (!actualTables.includes(table)) {
          errors.push(`El respaldo está incompleto: no contiene la tabla ${String(table)}.`)
        }
      }
    }

    if (!recordCounts || typeof recordCounts !== 'object' || Array.isArray(recordCounts)) {
      errors.push('El respaldo no contiene los conteos de registros.')
    } else {
      for (const table of expectedTables) {
        if (!Array.isArray(data[table])) {
          errors.push(`El respaldo está incompleto o dañado: ${table} no es una lista válida.`)
          continue
        }
        const expectedCount = recordCounts[table]
        if (!Number.isInteger(expectedCount) || expectedCount < 0 || expectedCount !== data[table].length) {
          errors.push(`El conteo del respaldo no coincide en ${table}.`)
        }
      }
      for (const table of Object.keys(recordCounts)) {
        if (!expectedSet.has(table)) {
          errors.push(`El manifiesto de conteos contiene una tabla desconocida: ${table}.`)
        }
      }
    }
  } else {
    // Copias antiguas (v1-v3): se completan solo las tablas agregadas después
    // de su formato. Nunca se aplica este fallback a un respaldo v4/v5 dañado.
    for (const table of EXPORT_TABLES_V5) {
      if (!Array.isArray(data[table])) { data[table] = [] }
    }
  }

  return { valid: errors.length === 0, errors }
}

/** Comparación determinista: IndexedDB y JSON pueden devolver las mismas
 * propiedades en distinto orden. Se normalizan claves y fechas antes de comparar. */
function stableSerialize(value: any): string {
  if (value instanceof Date) { return JSON.stringify(value.toISOString()) }
  if (Array.isArray(value)) { return `[${value.map(stableSerialize).join(',')}]` }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function recordsEquivalent(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

async function detectConflicts(
  importedData: ExportData,
  options: ImportOptions
): Promise<ConflictInfo[]> {
  if (options.mode !== 'merge') { return [] }

  // La política de seguridad de la restauración es uniforme:
  // si una clave primaria ya existe, el registro local prevalece en TODAS
  // las tablas. No se decide por timestamp ni por el tipo de dato.
  const tables = [
    { name: 'routineStore', table: db.routineStore, records: importedData.routines ?? [], key: 'id' },
    { name: 'routineStoreMeta', table: db.routineStore, records: importedData.routineStoreMeta ?? [], key: 'id' },
    { name: 'routineDays', table: db.routineDays, records: importedData.routineDays ?? [], key: 'id' },
    { name: 'routineExercises', table: db.routineExercises, records: importedData.routineExercises ?? [], key: 'id' },
    { name: 'trainingSessions', table: db.trainingSessions, records: importedData.trainingSessions ?? [], key: 'id' },
    { name: 'sessionExercises', table: db.sessionExercises, records: importedData.sessionExercises ?? [], key: 'sessionExerciseId' },
    { name: 'setRecords', table: db.setRecords, records: importedData.setRecords ?? [], key: 'setRecordId' },
    { name: 'sessionEvents', table: db.sessionEvents, records: importedData.sessionEvents ?? [], key: 'eventId' },
    { name: 'postWorkoutSurveys', table: db.postWorkoutSurveys, records: importedData.postWorkoutSurveys ?? [], key: 'surveyId' },
    { name: 'negativeSets', table: db.negativeSets, records: importedData.negativeSets ?? [], key: 'negativeSetId' },
    { name: 'exerciseObservations', table: db.exerciseObservations, records: importedData.exerciseObservations ?? [], key: 'observationId' },
    { name: 'recoveryChecks', table: db.recoveryChecks, records: importedData.recoveryChecks ?? [], key: 'id' },
    { name: 'hydrationLogs', table: db.hydrationLogs, records: importedData.hydrationLogs ?? [], key: 'id' },
    { name: 'bodyMeasurements', table: db.bodyMeasurements, records: importedData.bodyMeasurements ?? [], key: 'id' },
    { name: 'userProfile', table: db.userProfile, records: importedData.userProfile ?? [], key: 'id' },
    { name: 'customExercises', table: db.customExercises, records: importedData.customExercises ?? [], key: 'id' },
    { name: 'weeklySequences', table: db.weeklySequences, records: importedData.weeklySequences ?? [], key: 'id' },
    { name: 'chatMessages', table: db.chatMessages, records: importedData.chatMessages ?? [], key: 'id' },
    { name: 'chatConversations', table: db.chatConversations, records: importedData.chatConversations ?? [], key: 'id' },
    { name: 'nutritionDiary', table: db.nutritionDiary, records: importedData.nutritionDiary ?? [], key: 'id' },
    { name: 'nutritionAdherence', table: db.nutritionAdherence, records: importedData.nutritionAdherence ?? [], key: 'id' },
    { name: 'sessionOverrides', table: db.sessionOverrides, records: importedData.sessionOverrides ?? [], key: 'date' },
    { name: 'coachMemory', table: db.coachMemory, records: importedData.coachMemory ?? [], key: 'id' },
    { name: 'decisionLog', table: db.decisionLog, records: importedData.decisionLog ?? [], key: 'id' },
    { name: 'knowledgeDocuments', table: db.knowledgeDocuments, records: importedData.knowledgeDocuments ?? [], key: 'id' },
    { name: 'exerciseKnowledge', table: db.exerciseKnowledge, records: importedData.exerciseKnowledge ?? [], key: 'id' },
    { name: 'scoreSnapshots', table: db.scoreSnapshots, records: importedData.scoreSnapshots ?? [], key: 'id' },
    { name: 'onboardingDrafts', table: db.onboardingDrafts, records: importedData.onboardingDrafts ?? [], key: 'id' },
    { name: 'painLogs', table: db.painLogs, records: importedData.painLogs ?? [], key: 'id' },
    { name: 'cfWods', table: db.cfWods, records: importedData.cfWods ?? [], key: 'id' },
    { name: 'cfSchedule', table: db.cfSchedule, records: importedData.cfSchedule ?? [], key: 'id' },
    { name: 'cfResults', table: db.cfResults, records: importedData.cfResults ?? [], key: 'id' },
    { name: 'cfMarks', table: db.cfMarks, records: importedData.cfMarks ?? [], key: 'id' },
    { name: 'activitySessions', table: db.activitySessions, records: importedData.activitySessions ?? [], key: 'id' },
    { name: 'exerciseRecords', table: db.exerciseRecords, records: importedData.exerciseRecords ?? [], key: 'id' },
    { name: 'cycleVersions', table: db.cycleVersions, records: importedData.cycleVersions ?? [], key: 'id' },
    { name: 'hydrationBottles', table: db.hydrationBottles, records: importedData.hydrationBottles ?? [], key: 'id' },
    { name: 'hydrationBottleLogs', table: db.hydrationBottleLogs, records: importedData.hydrationBottleLogs ?? [], key: 'id' },
    { name: 'notifConfigs', table: db.notifConfigs, records: importedData.notifConfigs ?? [], key: 'id' },
    { name: 'notifLog', table: db.notifLog, records: importedData.notifLog ?? [], key: 'id' },
    { name: 'unifiedNotifConfigs', table: db.unifiedNotifConfigs, records: importedData.unifiedNotifConfigs ?? [], key: 'id' },
    { name: 'requiredActionStates', table: db.requiredActionStates, records: importedData.requiredActionStates ?? [], key: 'id' },
    { name: 'customFoods', table: db.customFoods, records: importedData.customFoods ?? [], key: 'id' },
    { name: 'exerciseState', table: db.exerciseState, records: importedData.exerciseState ?? [], key: 'id' },
    { name: 'sessionChanges', table: db.sessionChanges, records: importedData.sessionChanges ?? [], key: 'id' },
    { name: 'sessionObservations', table: db.sessionObservations, records: importedData.sessionObservations ?? [], key: 'id' },
    { name: 'legacyRoutines', table: db.routines, records: importedData.legacyRoutines ?? [], key: 'id' },
    { name: 'legacySessions', table: db.sessions, records: importedData.legacySessions ?? [], key: 'id' },
    { name: 'legacySetLogs', table: db.setLogs, records: importedData.legacySetLogs ?? [], key: 'id' },
    { name: 'feedbackThreads', table: db.feedbackThreads, records: importedData.feedbackThreads ?? [], key: 'id' },
    { name: 'feedbackMessages', table: db.feedbackMessages, records: importedData.feedbackMessages ?? [], key: 'id' },
    { name: 'feedbackOutbox', table: db.feedbackOutbox, records: importedData.feedbackOutbox ?? [], key: 'id' },
    { name: 'restTimerState', table: db.restTimerState, records: importedData.restTimerState ?? [], key: 'id' },
    { name: 'cfTimerState', table: db.cfTimerState, records: importedData.cfTimerState ?? [], key: 'id' },
    { name: 'syncQueue', table: db.syncQueue, records: importedData.syncQueue ?? [], key: 'id' },
    { name: 'syncDeletes', table: db.syncDeletes, records: importedData.syncDeletes ?? [], key: 'id' },
  ] as const

  const conflicts: ConflictInfo[] = []
  const seen = new Set<string>()

  for (const spec of tables) {
    // Los marcadores syncDeletes usan PK autonumérica local. Se combinan por
    // (tabla, documento) en applyImport para poder re-generar su id sin perder
    // tombstones de otro dispositivo que hayan colisionado numéricamente.
    if (spec.name === 'syncDeletes') { continue }
    const records = spec.records.filter((record: any) => record?.[spec.key] !== undefined && record?.[spec.key] !== null)
    if (records.length === 0) { continue }

    const keys = records.map((record: any) => record[spec.key])
    const existingRows = await (spec.table as any).bulkGet(keys)
    records.forEach((imported: any, index: number) => {
      const local = existingRows[index]
      if (!local || recordsEquivalent(local, imported)) { return }
      const id = String(imported[spec.key])
      const uniqueKey = `${spec.name}:${id}`
      if (seen.has(uniqueKey)) { return }
      seen.add(uniqueKey)
      conflicts.push({
        table: spec.name,
        id,
        local,
        imported,
        suggestedResolution: 'keep-local',
      })
    })
  }

  // trainingSessions también tiene un identificador lógico único sessionId.
  // Evita que un respaldo con otro PK choque con una sesión local existente.
  const incomingSessions = importedData.trainingSessions ?? []
  if (incomingSessions.length > 0) {
    const sessionIds = [...new Set(incomingSessions.map(session => session.sessionId).filter(Boolean))]
    const existingSessions = await db.trainingSessions.where('sessionId').anyOf(sessionIds).toArray()
    for (const local of existingSessions) {
      const imported = incomingSessions.find(session => session.sessionId === local.sessionId)
      if (!imported || recordsEquivalent(local, imported)) { continue }
      const id = String(imported.id)
      const uniqueKey = `trainingSessions:${id}`
      if (seen.has(uniqueKey)) { continue }
      seen.add(uniqueKey)
      conflicts.push({
        table: 'trainingSessions',
        id,
        local,
        imported,
        suggestedResolution: 'keep-local',
      })
    }
  }

  return conflicts
}

async function applyImport(
  data: ExportData,
  options: ImportOptions,
  conflicts: ConflictInfo[]
): Promise<Omit<ImportResult, 'verification'>> {
  const result: Omit<ImportResult, 'verification'> = {
    success: false,
    imported: {
      routines: 0, routineDays: 0, routineExercises: 0, routineStoreMeta: 0,
      sessions: 0, sessionExercises: 0, setRecords: 0,
      sessionEvents: 0, surveys: 0, negativeSets: 0, observations: 0,
      recoveryChecks: 0, hydrationLogs: 0, bodyMeasurements: 0,
      userProfile: false, customExercises: 0, weeklySequences: 0,
      chatMessages: 0, chatConversations: 0, nutritionDiary: 0,
      nutritionAdherence: 0, sessionOverrides: 0, coachMemory: 0,
      decisionLog: 0, knowledgeDocuments: 0, exerciseKnowledge: 0,
      scoreSnapshots: 0, onboardingDrafts: 0, painLogs: 0,
      cfWods: 0, cfSchedule: 0, cfResults: 0, cfMarks: 0,
      activitySessions: 0, exerciseRecords: 0, cycleVersions: 0,
      hydrationBottles: 0, hydrationBottleLogs: 0, notifConfigs: 0, notifLog: 0,
      unifiedNotifConfigs: 0, requiredActionStates: 0, customFoods: 0,
      exerciseState: 0, sessionChanges: 0, sessionObservations: 0,
      legacyRoutines: 0, legacySessions: 0, legacySetLogs: 0,
      feedbackThreads: 0, feedbackMessages: 0, feedbackOutbox: 0,
      restTimerState: 0, cfTimerState: 0, syncQueue: 0, syncDeletes: 0,
    },
    errors: [],
    conflicts,
  }
  
  const tablesToImport = [
    { table: db.routineStore as any, data: data.routines ?? [], key: 'id', countKey: 'routines', name: 'routineStore' },
    { table: db.routineStore as any, data: data.routineStoreMeta ?? [], key: 'id', countKey: 'routineStoreMeta', name: 'routineStoreMeta' },
    { table: db.routineDays as any, data: data.routineDays ?? [], key: 'id', countKey: 'routineDays', name: 'routineDays' },
    { table: db.routineExercises as any, data: data.routineExercises ?? [], key: 'id', countKey: 'routineExercises', name: 'routineExercises' },
    { table: db.trainingSessions as any, data: data.trainingSessions ?? [], key: 'id', countKey: 'sessions', name: 'trainingSessions' },
    { table: db.sessionExercises as any, data: data.sessionExercises ?? [], key: 'sessionExerciseId', countKey: 'sessionExercises', name: 'sessionExercises' },
    { table: db.setRecords as any, data: data.setRecords ?? [], key: 'setRecordId', countKey: 'setRecords', name: 'setRecords' },
    { table: db.sessionEvents as any, data: data.sessionEvents ?? [], key: 'eventId', countKey: 'sessionEvents', name: 'sessionEvents' },
    { table: db.postWorkoutSurveys as any, data: data.postWorkoutSurveys ?? [], key: 'surveyId', countKey: 'surveys', name: 'postWorkoutSurveys' },
    { table: db.negativeSets as any, data: data.negativeSets ?? [], key: 'negativeSetId', countKey: 'negativeSets', name: 'negativeSets' },
    { table: db.exerciseObservations as any, data: data.exerciseObservations ?? [], key: 'observationId', countKey: 'observations', name: 'exerciseObservations' },
    { table: db.recoveryChecks as any, data: data.recoveryChecks ?? [], key: 'id', countKey: 'recoveryChecks', name: 'recoveryChecks' },
    { table: db.hydrationLogs as any, data: data.hydrationLogs ?? [], key: 'id', countKey: 'hydrationLogs', name: 'hydrationLogs' },
    { table: db.bodyMeasurements as any, data: data.bodyMeasurements ?? [], key: 'id', countKey: 'bodyMeasurements', name: 'bodyMeasurements' },
    { table: db.userProfile as any, data: data.userProfile ?? [], key: 'id', countKey: 'userProfile', name: 'userProfile' },
    { table: db.customExercises as any, data: data.customExercises ?? [], key: 'id', countKey: 'customExercises', name: 'customExercises' },
    { table: db.weeklySequences as any, data: data.weeklySequences ?? [], key: 'id', countKey: 'weeklySequences', name: 'weeklySequences' },
    { table: db.chatMessages as any, data: data.chatMessages ?? [], key: 'id', countKey: 'chatMessages', name: 'chatMessages' },
    { table: db.chatConversations as any, data: data.chatConversations ?? [], key: 'id', countKey: 'chatConversations', name: 'chatConversations' },
    { table: db.nutritionDiary as any, data: data.nutritionDiary ?? [], key: 'id', countKey: 'nutritionDiary', name: 'nutritionDiary' },
    { table: db.nutritionAdherence as any, data: data.nutritionAdherence ?? [], key: 'id', countKey: 'nutritionAdherence', name: 'nutritionAdherence' },
    { table: db.sessionOverrides as any, data: data.sessionOverrides ?? [], key: 'date', countKey: 'sessionOverrides', name: 'sessionOverrides' },
    { table: db.coachMemory as any, data: data.coachMemory ?? [], key: 'id', countKey: 'coachMemory', name: 'coachMemory' },
    { table: db.decisionLog as any, data: data.decisionLog ?? [], key: 'id', countKey: 'decisionLog', name: 'decisionLog' },
    { table: db.knowledgeDocuments as any, data: data.knowledgeDocuments ?? [], key: 'id', countKey: 'knowledgeDocuments', name: 'knowledgeDocuments' },
    { table: db.exerciseKnowledge as any, data: data.exerciseKnowledge ?? [], key: 'id', countKey: 'exerciseKnowledge', name: 'exerciseKnowledge' },
    { table: db.scoreSnapshots as any, data: data.scoreSnapshots ?? [], key: 'id', countKey: 'scoreSnapshots', name: 'scoreSnapshots' },
    { table: db.onboardingDrafts as any, data: data.onboardingDrafts ?? [], key: 'id', countKey: 'onboardingDrafts', name: 'onboardingDrafts' },
    { table: db.painLogs as any, data: data.painLogs ?? [], key: 'id', countKey: 'painLogs', name: 'painLogs' },
    { table: db.cfWods as any, data: data.cfWods ?? [], key: 'id', countKey: 'cfWods', name: 'cfWods' },
    { table: db.cfSchedule as any, data: data.cfSchedule ?? [], key: 'id', countKey: 'cfSchedule', name: 'cfSchedule' },
    { table: db.cfResults as any, data: data.cfResults ?? [], key: 'id', countKey: 'cfResults', name: 'cfResults' },
    { table: db.cfMarks as any, data: data.cfMarks ?? [], key: 'id', countKey: 'cfMarks', name: 'cfMarks' },
    { table: db.activitySessions as any, data: data.activitySessions ?? [], key: 'id', countKey: 'activitySessions', name: 'activitySessions' },
    { table: db.exerciseRecords as any, data: data.exerciseRecords ?? [], key: 'id', countKey: 'exerciseRecords', name: 'exerciseRecords' },
    { table: db.cycleVersions as any, data: data.cycleVersions ?? [], key: 'id', countKey: 'cycleVersions', name: 'cycleVersions' },
    { table: db.hydrationBottles as any, data: data.hydrationBottles ?? [], key: 'id', countKey: 'hydrationBottles', name: 'hydrationBottles' },
    { table: db.hydrationBottleLogs as any, data: data.hydrationBottleLogs ?? [], key: 'id', countKey: 'hydrationBottleLogs', name: 'hydrationBottleLogs' },
    { table: db.notifConfigs as any, data: data.notifConfigs ?? [], key: 'id', countKey: 'notifConfigs', name: 'notifConfigs' },
    { table: db.notifLog as any, data: data.notifLog ?? [], key: 'id', countKey: 'notifLog', name: 'notifLog' },
    { table: db.unifiedNotifConfigs as any, data: data.unifiedNotifConfigs ?? [], key: 'id', countKey: 'unifiedNotifConfigs', name: 'unifiedNotifConfigs' },
    { table: db.requiredActionStates as any, data: data.requiredActionStates ?? [], key: 'id', countKey: 'requiredActionStates', name: 'requiredActionStates' },
    { table: db.customFoods as any, data: data.customFoods ?? [], key: 'id', countKey: 'customFoods', name: 'customFoods' },
    { table: db.exerciseState as any, data: data.exerciseState ?? [], key: 'id', countKey: 'exerciseState', name: 'exerciseState' },
    { table: db.sessionChanges as any, data: data.sessionChanges ?? [], key: 'id', countKey: 'sessionChanges', name: 'sessionChanges' },
    { table: db.sessionObservations as any, data: data.sessionObservations ?? [], key: 'id', countKey: 'sessionObservations', name: 'sessionObservations' },
    { table: db.routines as any, data: data.legacyRoutines ?? [], key: 'id', countKey: 'legacyRoutines', name: 'legacyRoutines' },
    { table: db.sessions as any, data: data.legacySessions ?? [], key: 'id', countKey: 'legacySessions', name: 'legacySessions' },
    { table: db.setLogs as any, data: data.legacySetLogs ?? [], key: 'id', countKey: 'legacySetLogs', name: 'legacySetLogs' },
    { table: db.feedbackThreads as any, data: data.feedbackThreads ?? [], key: 'id', countKey: 'feedbackThreads', name: 'feedbackThreads' },
    { table: db.feedbackMessages as any, data: data.feedbackMessages ?? [], key: 'id', countKey: 'feedbackMessages', name: 'feedbackMessages' },
    { table: db.feedbackOutbox as any, data: data.feedbackOutbox ?? [], key: 'id', countKey: 'feedbackOutbox', name: 'feedbackOutbox' },
    { table: db.restTimerState as any, data: data.restTimerState ?? [], key: 'id', countKey: 'restTimerState', name: 'restTimerState' },
    { table: db.cfTimerState as any, data: data.cfTimerState ?? [], key: 'id', countKey: 'cfTimerState', name: 'cfTimerState' },
    { table: db.syncQueue as any, data: data.syncQueue ?? [], key: 'id', countKey: 'syncQueue', name: 'syncQueue' },
    { table: db.syncDeletes as any, data: data.syncDeletes ?? [], key: 'id', countKey: 'syncDeletes', name: 'syncDeletes' },
  ]
  
  let activeTableName = 'base local'
  try {
    const transactionTables = [...new Set(tablesToImport.map(item => item.table))]
    await db.transaction('rw', transactionTables, async () => {
      for (const { table, data: tableData, key, countKey, name } of tablesToImport) {
        activeTableName = table.name
        if (!tableData.length) { continue }
    
    const conflictIds = new Set(conflicts.filter(c => c.table === name).map(c => String(c.id)))

    let recordsToImport = tableData
    if (options.mode === 'merge' && name === 'syncDeletes') {
      // syncDeletes usa id autonumérico local: el mismo id puede apuntar a
      // distintos borrados en dos dispositivos. Deduplicar por tabla/docId y
      // asignar un nuevo id si el id exportado ya está ocupado por otro tombstone.
      const importedLogicalKeys = new Set<string>()
      recordsToImport = []
      for (const record of tableData) {
        const hasLogicalKey = record?.table !== undefined && record?.table !== null && record?.docId !== undefined && record?.docId !== null
        const logicalKey = hasLogicalKey ? `${String(record.table)}\u0000${String(record.docId)}` : null
        if (logicalKey && importedLogicalKeys.has(logicalKey)) { continue }
        if (logicalKey) { importedLogicalKeys.add(logicalKey) }
        const existingLogical = hasLogicalKey
          ? await db.syncDeletes.where('table').equals(record.table).filter((row: any) => row.docId === record.docId).first()
          : undefined
        if (existingLogical) { continue }
        const existingId = record?.id !== undefined && record?.id !== null ? await db.syncDeletes.get(record.id) : undefined
        if (existingId) {
          const withoutLocalAutoId = { ...record }
          delete withoutLocalAutoId.id
          recordsToImport.push(withoutLocalAutoId)
        } else {
          recordsToImport.push(record)
        }
      }
    } else if (options.mode === 'merge') {
      // Segunda barrera dentro de la transacción: aunque aparezca una
      // escritura local después de generar el preview, jamás se sobrescribe.
      const primaryKeys = tableData
        .map((record: any) => record?.[key])
        .filter((value: unknown) => value !== undefined && value !== null)
      const existingRows = await table.bulkGet(primaryKeys)
      const existingPrimaryKeys = new Set(
        primaryKeys.filter((_: unknown, index: number) => existingRows[index] !== undefined).map(String),
      )
      let existingSessionIds = new Set<string>()
      if (name === 'trainingSessions') {
        const sessionIds = [...new Set(tableData.map((record: any) => record?.sessionId).filter(Boolean))]
        const existingSessions = await db.trainingSessions.where('sessionId').anyOf(sessionIds).toArray()
        existingSessionIds = new Set(existingSessions.map(session => session.sessionId))
      }
      recordsToImport = tableData.filter((record: any) => {
        const keyValue = String(record?.[key])
        return !conflictIds.has(keyValue)
          && !existingPrimaryKeys.has(keyValue)
          && !(name === 'trainingSessions' && existingSessionIds.has(record?.sessionId))
      })
    }
    
    if (options.mode === 'replace' && conflictIds.size > 0) {
      for (const id of conflictIds) {
        await table.delete(id)
      }
    }
    
        if (recordsToImport.length > 0) {
          await table.bulkPut(recordsToImport as any[])
        }
        ;(result.imported as any)[countKey] = recordsToImport.length

        options.onProgress?.(`Importando ${table.name}`, (result.imported as any)[countKey], tableData.length)
      }
    })
    result.success = true
  } catch (error) {
    // La transacción única garantiza rollback de todas las tablas: no se deja
    // una restauración a medias si falla una sola escritura.
    result.errors.push(
      `La importación se revirtió por completo en ${activeTableName}: ${error instanceof Error ? error.message : 'error desconocido'}`,
    )
    for (const key of Object.keys(result.imported)) {
      if (key === 'userProfile') {
        ;(result.imported as any)[key] = false
      } else {
        ;(result.imported as any)[key] = 0
      }
    }
    result.success = false
  }
  return result
}

async function verifyImport(importedData: ExportData): Promise<VerificationResult> {
  const checks = {
    recordCounts: true,
    referentialIntegrity: true,
    sessionExerciseLinks: true,
    setRecordLinks: true,
    routineExerciseLinks: true,
    noOrphanRecords: true,
  }
  const details: string[] = []
  
  try {
    const sessionIds = new Set((await db.trainingSessions.toArray()).map(s => s.sessionId))
    const sessionExerciseSessionIds = new Set((await db.sessionExercises.toArray()).map(se => se.sessionId))
    for (const seSessionId of sessionExerciseSessionIds) {
      if (!sessionIds.has(seSessionId)) {
        checks.referentialIntegrity = false
        checks.sessionExerciseLinks = false
        details.push(`SessionExercise huérfano: sessionId ${seSessionId}`)
      }
    }
    
    const seIds = new Set((await db.sessionExercises.toArray()).map(se => se.sessionExerciseId))
    const setRecordSEIds = new Set((await db.setRecords.toArray()).map(sr => sr.sessionExerciseId))
    for (const srSeId of setRecordSEIds) {
      if (!seIds.has(srSeId)) {
        checks.referentialIntegrity = false
        checks.setRecordLinks = false
        details.push(`SetRecord huérfano: sessionExerciseId ${srSeId}`)
      }
    }
    
    // Comprobar cada tabla exportada. El conteo no se da por correcto por
    // defecto: se verifican las claves que realmente quedaron en Dexie.
    const countSpecs: Array<{ name: string; table: any; records: any[]; key: string }> = [
      { name: 'Rutinas', table: db.routineStore, records: importedData.routines ?? [], key: 'id' },
      { name: 'Preferencia de rutina activa', table: db.routineStore, records: importedData.routineStoreMeta ?? [], key: 'id' },
      { name: 'Días de rutina', table: db.routineDays, records: importedData.routineDays ?? [], key: 'id' },
      { name: 'Ejercicios de rutina', table: db.routineExercises, records: importedData.routineExercises ?? [], key: 'id' },
      { name: 'Sesiones', table: db.trainingSessions, records: importedData.trainingSessions ?? [], key: 'id' },
      { name: 'Ejercicios de sesión', table: db.sessionExercises, records: importedData.sessionExercises ?? [], key: 'sessionExerciseId' },
      { name: 'Series', table: db.setRecords, records: importedData.setRecords ?? [], key: 'setRecordId' },
      { name: 'Eventos de sesión', table: db.sessionEvents, records: importedData.sessionEvents ?? [], key: 'eventId' },
      { name: 'Encuestas', table: db.postWorkoutSurveys, records: importedData.postWorkoutSurveys ?? [], key: 'surveyId' },
      { name: 'Series negativas', table: db.negativeSets, records: importedData.negativeSets ?? [], key: 'negativeSetId' },
      { name: 'Observaciones de ejercicios', table: db.exerciseObservations, records: importedData.exerciseObservations ?? [], key: 'observationId' },
      { name: 'Recuperación', table: db.recoveryChecks, records: importedData.recoveryChecks ?? [], key: 'id' },
      { name: 'Hidratación', table: db.hydrationLogs, records: importedData.hydrationLogs ?? [], key: 'id' },
      { name: 'Mediciones', table: db.bodyMeasurements, records: importedData.bodyMeasurements ?? [], key: 'id' },
      { name: 'Perfil', table: db.userProfile, records: importedData.userProfile ?? [], key: 'id' },
      { name: 'Ejercicios propios', table: db.customExercises, records: importedData.customExercises ?? [], key: 'id' },
      { name: 'Secuencias semanales', table: db.weeklySequences, records: importedData.weeklySequences ?? [], key: 'id' },
      { name: 'Mensajes del Coach', table: db.chatMessages, records: importedData.chatMessages ?? [], key: 'id' },
      { name: 'Conversaciones del Coach', table: db.chatConversations, records: importedData.chatConversations ?? [], key: 'id' },
      { name: 'Diario nutricional', table: db.nutritionDiary, records: importedData.nutritionDiary ?? [], key: 'id' },
      { name: 'Adherencia nutricional', table: db.nutritionAdherence, records: importedData.nutritionAdherence ?? [], key: 'id' },
      { name: 'Cambios de sesión', table: db.sessionOverrides, records: importedData.sessionOverrides ?? [], key: 'date' },
      { name: 'Memoria del Coach', table: db.coachMemory, records: importedData.coachMemory ?? [], key: 'id' },
      { name: 'Decisiones', table: db.decisionLog, records: importedData.decisionLog ?? [], key: 'id' },
      { name: 'Documentos de conocimiento', table: db.knowledgeDocuments, records: importedData.knowledgeDocuments ?? [], key: 'id' },
      { name: 'Conocimiento de ejercicios', table: db.exerciseKnowledge, records: importedData.exerciseKnowledge ?? [], key: 'id' },
      { name: 'Puntuaciones', table: db.scoreSnapshots, records: importedData.scoreSnapshots ?? [], key: 'id' },
      { name: 'Borradores de onboarding', table: db.onboardingDrafts, records: importedData.onboardingDrafts ?? [], key: 'id' },
      { name: 'Registros de dolor', table: db.painLogs, records: importedData.painLogs ?? [], key: 'id' },
      { name: 'WODs', table: db.cfWods, records: importedData.cfWods ?? [], key: 'id' },
      { name: 'Programación CrossFit', table: db.cfSchedule, records: importedData.cfSchedule ?? [], key: 'id' },
      { name: 'Resultados CrossFit', table: db.cfResults, records: importedData.cfResults ?? [], key: 'id' },
      { name: 'Marcas CrossFit', table: db.cfMarks, records: importedData.cfMarks ?? [], key: 'id' },
      { name: 'Actividad deportiva', table: db.activitySessions, records: importedData.activitySessions ?? [], key: 'id' },
      { name: 'Récords de ejercicios', table: db.exerciseRecords, records: importedData.exerciseRecords ?? [], key: 'id' },
      { name: 'Versiones de ciclos', table: db.cycleVersions, records: importedData.cycleVersions ?? [], key: 'id' },
      { name: 'Botellas', table: db.hydrationBottles, records: importedData.hydrationBottles ?? [], key: 'id' },
      { name: 'Registros por botella', table: db.hydrationBottleLogs, records: importedData.hydrationBottleLogs ?? [], key: 'id' },
      { name: 'Avisos heredados', table: db.notifConfigs, records: importedData.notifConfigs ?? [], key: 'id' },
      { name: 'Historial de avisos', table: db.notifLog, records: importedData.notifLog ?? [], key: 'id' },
      { name: 'Avisos unificados', table: db.unifiedNotifConfigs, records: importedData.unifiedNotifConfigs ?? [], key: 'id' },
      { name: 'Acciones obligatorias', table: db.requiredActionStates, records: importedData.requiredActionStates ?? [], key: 'id' },
      { name: 'Alimentos personalizados', table: db.customFoods, records: importedData.customFoods ?? [], key: 'id' },
      { name: 'Estado de ejercicios', table: db.exerciseState, records: importedData.exerciseState ?? [], key: 'id' },
      { name: 'Cambios históricos', table: db.sessionChanges, records: importedData.sessionChanges ?? [], key: 'id' },
      { name: 'Observaciones históricas', table: db.sessionObservations, records: importedData.sessionObservations ?? [], key: 'id' },
      { name: 'Rutinas heredadas', table: db.routines, records: importedData.legacyRoutines ?? [], key: 'id' },
      { name: 'Sesiones heredadas', table: db.sessions, records: importedData.legacySessions ?? [], key: 'id' },
      { name: 'Series heredadas', table: db.setLogs, records: importedData.legacySetLogs ?? [], key: 'id' },
      { name: 'Hilos de feedback', table: db.feedbackThreads, records: importedData.feedbackThreads ?? [], key: 'id' },
      { name: 'Mensajes de feedback', table: db.feedbackMessages, records: importedData.feedbackMessages ?? [], key: 'id' },
      { name: 'Cola de feedback', table: db.feedbackOutbox, records: importedData.feedbackOutbox ?? [], key: 'id' },
      { name: 'Cronómetro de descanso', table: db.restTimerState, records: importedData.restTimerState ?? [], key: 'id' },
      { name: 'Cronómetro CrossFit', table: db.cfTimerState, records: importedData.cfTimerState ?? [], key: 'id' },
      { name: 'Cola de sincronización', table: db.syncQueue, records: importedData.syncQueue ?? [], key: 'id' },
      // syncDeletes se verifica por su identidad lógica (tabla + docId), no por el id autonumérico.
    ]
    const countResults = await Promise.all(countSpecs.map(async ({ name, table, records, key }) => {
      if (records.length === 0) { return { name, missing: 0 } }
      const ids = records.map(record => record?.[key])
      const invalidKeys = ids.filter(id => id === undefined || id === null || id === '').length
      const validIds = ids.filter(id => id !== undefined && id !== null && id !== '')
      const found = await table.bulkGet(validIds)
      const missing = invalidKeys + found.filter((record: unknown) => record === undefined).length
      return { name, missing }
    }))
    const missingImportedRecords = countResults.reduce((sum, result) => sum + result.missing, 0)
    const importedDeleteMarkers = importedData.syncDeletes ?? []
    let missingDeleteMarkers = 0
    for (const marker of importedDeleteMarkers) {
      if (marker?.table === undefined || marker?.table === null || marker?.docId === undefined || marker?.docId === null) {
        missingDeleteMarkers += 1
        continue
      }
      const exists = await db.syncDeletes.where('table').equals(marker.table)
        .filter((row: any) => row.docId === marker.docId).first()
      if (!exists) { missingDeleteMarkers += 1 }
    }
    checks.recordCounts = missingImportedRecords === 0 && missingDeleteMarkers === 0
    if (!checks.recordCounts) {
      const affected = countResults.filter(result => result.missing > 0)
        .map(result => `${result.name}: ${result.missing}`)
      details.push(`Registros no verificados después de importar: ${affected.join(', ')}`)
      if (missingDeleteMarkers > 0) {
        details.push(`Marcadores de borrado no verificados: ${missingDeleteMarkers}`)
      }
    }

    const routineIds = new Set((await db.routineStore.toArray()).map(r => r.id))
    const sessionRoutineIds = new Set((await db.trainingSessions.toArray()).map(s => s.routineId))
    for (const sRoutineId of sessionRoutineIds) {
      if (!routineIds.has(sRoutineId)) {
        checks.routineExerciseLinks = false
        details.push(`Sesión referencia rutina inexistente: ${sRoutineId}`)
      }
    }
    
    details.push('Verificación completada')
  } catch (e) {
    checks.noOrphanRecords = false
    details.push(`Error en verificación: ${e instanceof Error ? e.message : 'desconocido'}`)
  }
  
  return {
    passed: Object.values(checks).every(v => v),
    checks,
    details,
  }
}

export async function generateImportPreview(file: File): Promise<ImportPreview> {
  const txt = await file.text()
  const data = JSON.parse(txt)
  
  const validation = validateExportData(data)
  if (!validation.valid) {
    return {
      summary: {
        routines: 0, routineDays: 0, routineExercises: 0, routineStoreMeta: 0,
        sessions: 0, sessionExercises: 0, setRecords: 0,
        sessionEvents: 0, surveys: 0, negativeSets: 0, observations: 0,
        recoveryChecks: 0, hydrationLogs: 0, hydrationBottles: 0,
        hydrationBottleLogs: 0, customFoods: 0, notificationConfigs: 0,
        bodyMeasurements: 0, legacyRoutines: 0, legacySessions: 0, legacySetLogs: 0,
        feedbackThreads: 0, feedbackMessages: 0, feedbackOutbox: 0,
        restTimerState: 0, cfTimerState: 0, syncQueue: 0, syncDeletes: 0, userProfile: false,
        routinesNew: 0, routinesUpdated: 0, routinesSkipped: 0,
        conflicts: [],
      },
      conflicts: [],
      warnings: validation.errors,
      canImport: false,
    }
  }
  
  const migrated = migrateExportData(data, data.metadata?.version || 1)
  const conflicts = await detectConflicts(migrated, { mode: 'merge' })
  
  const routineIds = new Set(migrated.routines.map(r => r.id))
  const existingRoutines = await db.routineStore.where('id').anyOf([...routineIds]).toArray()
  const existingIds = new Set(existingRoutines.map(r => r.id))
  
  const summary = {
    routines: migrated.routines.length,
    routineDays: migrated.routineDays.length,
    routineExercises: migrated.routineExercises.length,
    routineStoreMeta: (migrated.routineStoreMeta ?? []).length,
    sessions: migrated.trainingSessions.length,
    sessionExercises: migrated.sessionExercises.length,
    setRecords: migrated.setRecords.length,
    sessionEvents: migrated.sessionEvents.length,
    surveys: migrated.postWorkoutSurveys.length,
    negativeSets: migrated.negativeSets.length,
    observations: migrated.exerciseObservations.length,
    recoveryChecks: migrated.recoveryChecks.length,
    hydrationLogs: migrated.hydrationLogs.length,
    hydrationBottles: (migrated.hydrationBottles ?? []).length,
    hydrationBottleLogs: (migrated.hydrationBottleLogs ?? []).length,
    customFoods: (migrated.customFoods ?? []).length,
    notificationConfigs: (migrated.notifConfigs ?? []).length + (migrated.unifiedNotifConfigs ?? []).length,
    bodyMeasurements: migrated.bodyMeasurements.length,
    legacyRoutines: (migrated.legacyRoutines ?? []).length,
    legacySessions: (migrated.legacySessions ?? []).length,
    legacySetLogs: (migrated.legacySetLogs ?? []).length,
    feedbackThreads: (migrated.feedbackThreads ?? []).length,
    feedbackMessages: (migrated.feedbackMessages ?? []).length,
    feedbackOutbox: (migrated.feedbackOutbox ?? []).length,
    restTimerState: (migrated.restTimerState ?? []).length,
    cfTimerState: (migrated.cfTimerState ?? []).length,
    syncQueue: (migrated.syncQueue ?? []).length,
    syncDeletes: (migrated.syncDeletes ?? []).length,
    userProfile: migrated.userProfile.length > 0,
    routinesNew: migrated.routines.filter(r => !existingIds.has(r.id)).length,
    routinesUpdated: migrated.routines.filter(r => existingIds.has(r.id)).length,
    routinesSkipped: 0,
    conflicts,
  }
  
  return {
    summary,
    conflicts,
    warnings: validation.errors,
    canImport: validation.valid,
  }
}

export async function importJSON(file: File, options: ImportOptions = { mode: 'merge' }): Promise<ImportResult> {
  if (options.mode !== 'merge') {
    throw new Error('La importación por reemplazo está deshabilitada hasta implementar un reemplazo transaccional completo y verificable. Usá Combinar para conservar los datos actuales.')
  }
  const txt = await file.text()
  let data = JSON.parse(txt)
  
  const validation = validateExportData(data)
  if (!validation.valid) {
    return {
      success: false,
      imported: {} as any,
      errors: validation.errors,
      conflicts: [],
      verification: { passed: false, checks: {} as any, details: validation.errors },
    }
  }
  
  const migrated = migrateExportData(data, data.metadata?.version || 1)
  const conflicts = await detectConflicts(migrated, options)
  
  if (conflicts.length > 0 && options.mode === 'merge' && !options.confirmOverwrite) {
    return {
      success: false,
      imported: {} as any,
      errors: ['Hay registros con la misma clave. Confirmá Combinar para conservar los datos locales y omitir las filas duplicadas.'],
      conflicts,
      verification: { passed: false, checks: {} as any, details: ['Conflictos sin resolver'] },
    }
  }
  
  options.onProgress?.('Iniciando importación', 0, 1)
  
  const applied = await applyImport(migrated, options, conflicts)
  
  const verification = await verifyImport(migrated)
  if (!verification.passed) {
    applied.errors.push(...verification.details.map(detail => `Verificación: ${detail}`))
  }
  
  return {
    ...applied,
    success: applied.success && verification.passed,
    verification,
  }
}