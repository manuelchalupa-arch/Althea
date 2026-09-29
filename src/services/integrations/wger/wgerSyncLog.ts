// wgerSyncLog — Logging estructurado de sincronización WGER.
// FASE 23: Observabilidad.
//
// REGLAS:
// - Registrar: fecha, operación, entidad, éxito/fallo, duración, endpoint,
//   código HTTP, cantidad procesada, cantidad creada, cantidad actualizada,
//   cantidad omitida, cantidad en conflicto.
// - NO registrar: passwords, tokens, refresh tokens, información privada innecesaria.

// ─── Tipos ───

export type SyncLogStatus = 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'SKIPPED'

export type SyncLogOperation =
  | 'healthCheck'
  | 'pullExercises'
  | 'pullIngredients'
  | 'pullRoutines'
  | 'pushRoutine'
  | 'pullTrainingHistory'
  | 'pushTrainingSession'
  | 'pullNutritionPlans'
  | 'pushNutritionPlan'
  | 'pullMeasurements'
  | 'sync'

export type SyncLogEntity =
  | 'exercise'
  | 'ingredient'
  | 'routine'
  | 'trainingSession'
  | 'nutritionPlan'
  | 'measurement'
  | 'system'

export interface SyncLogEntry {
  id: string
  timestamp: string
  operation: SyncLogOperation
  entity: SyncLogEntity
  status: SyncLogStatus
  durationMs: number
  endpoint: string
  httpStatusCode: number | null
  processed: number
  created: number
  updated: number
  skipped: number
  conflicts: number
  error: string | null
  metadata: Record<string, string | number | boolean>
}

export interface SyncLogSummary {
  totalOperations: number
  successful: number
  failed: number
  partial: number
  totalDurationMs: number
  totalProcessed: number
  totalCreated: number
  totalUpdated: number
  totalSkipped: number
  totalConflicts: number
}

// ─── Almacenamiento en memoria (con límite) ───

const MAX_LOG_ENTRIES = 1000
const logEntries: SyncLogEntry[] = []

// ─── Crear entrada de log ───

export interface CreateSyncLogParams {
  operation: SyncLogOperation
  entity: SyncLogEntity
  status: SyncLogStatus
  durationMs: number
  endpoint: string
  httpStatusCode?: number | null
  processed?: number
  created?: number
  updated?: number
  skipped?: number
  conflicts?: number
  error?: string | null
  metadata?: Record<string, string | number | boolean>
}

export function createSyncLog(params: CreateSyncLogParams): SyncLogEntry {
  const entry: SyncLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    operation: params.operation,
    entity: params.entity,
    status: params.status,
    durationMs: params.durationMs,
    endpoint: sanitizeEndpoint(params.endpoint),
    httpStatusCode: params.httpStatusCode ?? null,
    processed: params.processed ?? 0,
    created: params.created ?? 0,
    updated: params.updated ?? 0,
    skipped: params.skipped ?? 0,
    conflicts: params.conflicts ?? 0,
    error: params.error ? sanitizeError(params.error) : null,
    metadata: params.metadata ?? {},
  }

  logEntries.push(entry)

  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.shift()
  }

  return entry
}

// ─── Helpers de sanitización ───

function sanitizeEndpoint(endpoint: string): string {
  return endpoint
    .replace(/token=[^&]*/g, 'token=[REDACTED]')
    .replace(/api_key=[^&]*/g, 'api_key=[REDACTED]')
    .replace(/password=[^&]*/g, 'password=[REDACTED]')
    .replace(/secret=[^&]*/g, 'secret=[REDACTED]')
}

function sanitizeError(error: string): string {
  return error
    .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
    .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
    .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
    .replace(/bearer\s+\S+/gi, 'bearer [REDACTED]')
}

// ─── Consultas ───

export function getSyncLogs(limit: number = 100): SyncLogEntry[] {
  return logEntries.slice(-limit)
}

export function getSyncLogsByOperation(operation: SyncLogOperation): SyncLogEntry[] {
  return logEntries.filter((entry) => entry.operation === operation)
}

export function getSyncLogsByEntity(entity: SyncLogEntity): SyncLogEntry[] {
  return logEntries.filter((entry) => entry.entity === entity)
}

export function getSyncLogsByStatus(status: SyncLogStatus): SyncLogEntry[] {
  return logEntries.filter((entry) => entry.status === status)
}

export function getSyncLogsByDateRange(start: Date, end: Date): SyncLogEntry[] {
  return logEntries.filter((entry) => {
    const timestamp = new Date(entry.timestamp)
    return timestamp >= start && timestamp <= end
  })
}

// ─── Resumen ───

export function getSyncLogSummary(): SyncLogSummary {
  return logEntries.reduce(
    (summary, entry) => {
      summary.totalOperations++
      if (entry.status === 'SUCCESS') {summary.successful++}
      if (entry.status === 'FAILURE') {summary.failed++}
      if (entry.status === 'PARTIAL') {summary.partial++}
      summary.totalDurationMs += entry.durationMs
      summary.totalProcessed += entry.processed
      summary.totalCreated += entry.created
      summary.totalUpdated += entry.updated
      summary.totalSkipped += entry.skipped
      summary.totalConflicts += entry.conflicts
      return summary
    },
    {
      totalOperations: 0,
      successful: 0,
      failed: 0,
      partial: 0,
      totalDurationMs: 0,
      totalProcessed: 0,
      totalCreated: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      totalConflicts: 0,
    },
  )
}

// ─── Limpieza ───

export function clearSyncLogs(): void {
  logEntries.length = 0
}

// ─── Exportar para debugging ───

export function exportSyncLogs(): string {
  return JSON.stringify(logEntries, null, 2)
}
