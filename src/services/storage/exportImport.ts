import { db } from './db'
import { v4 as uuid } from 'uuid'
import type { TrainingSession, SessionExercise, SetRecord, SessionEvent, PostWorkoutSurvey, NegativeSet, ExerciseObservation, ExerciseReplacement } from '@/services/training/domain'
import type { RoutineData } from './routineStore'
import type { DiaryEntry, AdherenceRecord } from './diaryStore'
import type { SessionOverrideData } from './sessionOverrideStore'
import type { RecoveryCheck, HydrationLog, BodyMeasurement, UserProfile, PainLog, Exercise, Routine, RoutineDay, RoutineExercise } from '@/types'
import type { CustomExercise } from '@/services/training/customExercises'
import type { ChatMessage, ChatConversation } from '@/services/ai/chatHistory'
import type { CoachDecision, CoachQA } from '@/services/ai/coachMemory'
import type { DecisionRecord } from '@/services/ai/decisionLogger'
import type { KnowledgeDocument } from '@/services/ai/knowledgeBase'
import type { ExerciseKnowledgeEntry } from '@/services/ai/exerciseKnowledge'

export const EXPORT_FORMAT_VERSION = 2
export const APP_VERSION = '0.21.0'

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
}

async function collectAllData(): Promise<Omit<ExportData, 'metadata'>> {
  const allRoutines = await db.routineStore.toArray()
  const routines = allRoutines.filter((r): r is RoutineData => 'dayExercises' in r)
  
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
  ])

  return {
    routines,
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
    schemaVersion: 15,
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
  const sessionExercises = await db.sessionExercises.toArray()
  const trainingSessions = await db.trainingSessions.toArray()
  const exercises = await db.exercises.toArray()

  const exerciseMap = new Map(exercises.map(e => [e.id, e.name]))

  const seMap = new Map(sessionExercises.map(se => [se.sessionExerciseId, se]))
  const sessionMap = new Map(trainingSessions.map(s => [s.sessionId, s]))

  const header = 'setRecordId,sessionId,calendarDate,sessionExerciseId,exerciseId,exerciseName,order,setType,plannedReps,plannedWeight,actualReps,actualWeight,status,completedAt,createdAt\n'
  const rows = setRecords.map(sr => {
    const se = seMap.get(sr.sessionExerciseId)
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
    if (!migrated.sessionExercises) migrated.sessionExercises = []
    if (!migrated.setRecords) migrated.setRecords = []
    if (!migrated.sessionEvents) migrated.sessionEvents = []
    if (!migrated.postWorkoutSurveys) migrated.postWorkoutSurveys = []
    if (!migrated.negativeSets) migrated.negativeSets = []
    if (!migrated.exerciseObservations) migrated.exerciseObservations = []
    if (!migrated.weeklySequences) migrated.weeklySequences = []
    if (!migrated.chatMessages) migrated.chatMessages = []
    if (!migrated.chatConversations) migrated.chatConversations = []
    if (!migrated.nutritionDiary) migrated.nutritionDiary = []
    if (!migrated.nutritionAdherence) migrated.nutritionAdherence = []
    if (!migrated.sessionOverrides) migrated.sessionOverrides = []
    if (!migrated.coachMemory) migrated.coachMemory = []
    if (!migrated.decisionLog) migrated.decisionLog = []
    if (!migrated.knowledgeDocuments) migrated.knowledgeDocuments = []
    if (!migrated.exerciseKnowledge) migrated.exerciseKnowledge = []
    if (!migrated.scoreSnapshots) migrated.scoreSnapshots = []
    if (!migrated.onboardingDrafts) migrated.onboardingDrafts = []
    if (!migrated.painLogs) migrated.painLogs = []
    if (!migrated.customExercises) migrated.customExercises = []
    if (!migrated.routineDays) migrated.routineDays = []
    if (!migrated.routineExercises) migrated.routineExercises = []
  }
  
  return migrated as ExportData
}

function validateExportData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!data || typeof data !== 'object') {
    errors.push('Datos inválidos: no es un objeto')
    return { valid: false, errors }
  }
  
  if (!data.metadata) {
    errors.push('Falta metadata de exportación')
  } else {
    if (!data.metadata.version || data.metadata.version < 1 || data.metadata.version > EXPORT_FORMAT_VERSION) {
      errors.push(`Versión de formato inválida: ${data.metadata.version} (actual: ${EXPORT_FORMAT_VERSION})`)
    }
    if (!data.metadata.exportedAt) {
      errors.push('Falta fecha de exportación')
    }
    if (!data.metadata.schemaVersion) {
      errors.push('Falta versión de esquema')
    }
  }
  
  const requiredTables = [
    'routines', 'trainingSessions', 'sessionExercises', 'setRecords',
    'sessionEvents', 'postWorkoutSurveys', 'negativeSets', 'exerciseObservations',
    'recoveryChecks', 'hydrationLogs', 'bodyMeasurements', 'userProfile',
    'customExercises', 'weeklySequences', 'chatMessages', 'chatConversations',
    'nutritionDiary', 'nutritionAdherence', 'sessionOverrides', 'coachMemory',
    'decisionLog', 'knowledgeDocuments', 'exerciseKnowledge', 'scoreSnapshots',
    'onboardingDrafts', 'painLogs'
  ]
  
  for (const table of requiredTables) {
    if (!Array.isArray(data[table])) {
      data[table] = []
    }
  }
  
  return { valid: errors.length === 0, errors }
}

async function detectConflicts(
  importedData: ExportData,
  options: ImportOptions
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = []
  
  if (options.mode === 'replace-all') return conflicts
  
  const routineIds = new Set(importedData.routines.map(r => r.id))
  const existingRoutines = await db.routineStore.where('id').anyOf([...routineIds]).toArray()
  for (const existing of existingRoutines) {
    const imported = importedData.routines.find(r => r.id === existing.id)
    if (imported && JSON.stringify(existing) !== JSON.stringify(imported)) {
      conflicts.push({
        table: 'routineStore',
        id: existing.id,
        local: existing,
        imported,
        suggestedResolution: existing.updatedAt > imported.updatedAt ? 'keep-local' : 'keep-imported'
      })
    }
  }
  
  const sessionIds = new Set(importedData.trainingSessions.map(s => s.sessionId))
  const existingSessions = await db.trainingSessions.where('sessionId').anyOf([...sessionIds]).toArray()
  for (const existing of existingSessions) {
    const imported = importedData.trainingSessions.find(s => s.sessionId === existing.sessionId)
    if (imported && JSON.stringify(existing) !== JSON.stringify(imported)) {
      conflicts.push({
        table: 'trainingSessions',
        id: existing.id,
        local: existing,
        imported,
        suggestedResolution: existing.updatedAt > imported.updatedAt ? 'keep-local' : 'keep-imported'
      })
    }
  }
  
  const profileIds = new Set(importedData.userProfile.map(p => p.id))
  const existingProfiles = await db.userProfile.where('id').anyOf([...profileIds]).toArray()
  for (const existing of existingProfiles) {
    const imported = importedData.userProfile.find(p => p.id === existing.id)
    if (imported && JSON.stringify(existing) !== JSON.stringify(imported)) {
      conflicts.push({
        table: 'userProfile',
        id: existing.id,
        local: existing,
        imported,
        suggestedResolution: 'keep-local'
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
      routines: 0, sessions: 0, sessionExercises: 0, setRecords: 0,
      sessionEvents: 0, surveys: 0, negativeSets: 0, observations: 0,
      recoveryChecks: 0, hydrationLogs: 0, bodyMeasurements: 0,
      userProfile: false, customExercises: 0, weeklySequences: 0,
      chatMessages: 0, chatConversations: 0, nutritionDiary: 0,
      nutritionAdherence: 0, sessionOverrides: 0, coachMemory: 0,
      decisionLog: 0, knowledgeDocuments: 0, exerciseKnowledge: 0,
      scoreSnapshots: 0, onboardingDrafts: 0, painLogs: 0,
    },
    errors: [],
    conflicts,
  }
  
  const tablesToImport = [
    { table: db.routineStore as any, data: data.routines ?? [], key: 'id', countKey: 'routines', name: 'routineStore' },
    { table: db.routineDays as any, data: data.routineDays ?? [], key: 'id', countKey: 'routines', name: 'routineDays' },
    { table: db.routineExercises as any, data: data.routineExercises ?? [], key: 'id', countKey: 'routines', name: 'routineExercises' },
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
  ]
  
  for (const { table, data: tableData, key, countKey, name } of tablesToImport) {
    if (!tableData.length) continue
    
    const conflictIds = new Set(conflicts.filter(c => c.table === name).map(c => c.id))
    
    let recordsToImport = tableData
    if (options.mode === 'merge') {
      recordsToImport = tableData.filter((d: any) => !conflictIds.has(d[key]))
    }
    
    if (options.mode === 'replace' && conflictIds.size > 0) {
      for (const id of conflictIds) {
        await table.delete(id)
      }
    }
    
    try {
      await table.bulkPut(recordsToImport as any[])
      ;(result.imported as any)[countKey] = recordsToImport.length
    } catch (e) {
      result.errors.push(`Error importando ${table.name}: ${e instanceof Error ? e.message : 'desconocido'}`)
    }
    
    options.onProgress?.(`Importando ${table.name}`, (result.imported as any)[countKey], tableData.length)
  }
  
  result.success = result.errors.length === 0
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
        routines: 0, sessions: 0, sessionExercises: 0, setRecords: 0,
        sessionEvents: 0, surveys: 0, negativeSets: 0, observations: 0,
        recoveryChecks: 0, hydrationLogs: 0, bodyMeasurements: 0,
        userProfile: false, routinesNew: 0, routinesUpdated: 0, routinesSkipped: 0,
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
    sessions: migrated.trainingSessions.length,
    sessionExercises: migrated.sessionExercises.length,
    setRecords: migrated.setRecords.length,
    sessionEvents: migrated.sessionEvents.length,
    surveys: migrated.postWorkoutSurveys.length,
    negativeSets: migrated.negativeSets.length,
    observations: migrated.exerciseObservations.length,
    recoveryChecks: migrated.recoveryChecks.length,
    hydrationLogs: migrated.hydrationLogs.length,
    bodyMeasurements: migrated.bodyMeasurements.length,
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
      errors: ['Conflictos detectados. Use confirmOverwrite=true o mode=replace para resolver.'],
      conflicts,
      verification: { passed: false, checks: {} as any, details: ['Conflictos sin resolver'] },
    }
  }
  
  options.onProgress?.('Iniciando importación', 0, 1)
  
  const applied = await db.transaction('rw', [
    db.routineStore, db.routineDays, db.routineExercises,
    db.trainingSessions, db.sessionExercises, db.setRecords,
    db.sessionEvents, db.postWorkoutSurveys, db.negativeSets,
    db.exerciseObservations, db.recoveryChecks, db.hydrationLogs,
    db.bodyMeasurements, db.userProfile, db.customExercises,
    db.weeklySequences, db.chatMessages, db.chatConversations,
    db.nutritionDiary, db.nutritionAdherence, db.sessionOverrides,
    db.coachMemory, db.decisionLog, db.knowledgeDocuments,
    db.exerciseKnowledge, db.scoreSnapshots, db.onboardingDrafts,
    db.painLogs,
  ], async () => {
    return await applyImport(migrated, options, conflicts)
  })
  
  const verification = await verifyImport(migrated)
  
  return {
    ...applied,
    verification,
  }
}