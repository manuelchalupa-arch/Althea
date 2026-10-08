// wgerSyncEngine — Motor de sincronización bidireccional WGER ↔ Althea.
// FASE 15: Sincronización bidireccional.
// FASE 16: Conflictos.
// FASE 17: Outbox/Inbox.
// FASE 18: Retries y rate limiting.
// FASE 19: Paginación.
// FASE 20: Cache + offline-first.
//
// REGLAS:
// - Idempotente: misma operación aplicada N veces = mismo resultado.
// - Reintentable: operaciones fallidas pueden reintentarse sin efectos secundarios.
// - Incremental: solo sincronizar lo que cambió desde la última sync.
// - Auditable: cada operación queda registrada en SyncQueue.
// - Reversible: operaciones pueden deshacerse (rollback).
// - NO duplicar registros: usar external IDs + hashes + local IDs + provider IDs + versiones.
// - NO depender únicamente de timestamps: usar hashes para detectar cambios reales.

import { db } from '@/services/storage/db'
import { fetchRoutine, fetchRoutines, fetchSlots, fetchSlotEntries, fetchWeightConfig, fetchRepetitionsConfig, fetchSetsConfig, fetchRirConfig, fetchRestConfig, createRoutine, updateRoutine, deleteRoutine, createWorkout, updateWorkout, deleteWorkout, createNutritionPlan, updateNutritionPlan, deleteNutritionPlan, createMeasurement, updateMeasurement, deleteMeasurement, fetchExerciseList, fetchExerciseInfo, fetchIngredients, fetchNutritionPlans, fetchWorkoutSessions, fetchMeasurements } from './wgerClient'
import { mapWgerRoutineToAlthea, type WgerRoutineWithDetails } from './wgerRoutineMapper'
import { enqueueOperation, getPendingOperations, markOperationCompleted, markOperationFailed } from './wgerSyncQueue'
import { detectConflict, resolveConflict } from './wgerConflictResolver'
import { getSyncStatus, updateSyncStatus, type WgerSyncStatus } from './wgerHealth'
import { getWgerAuthState } from './wgerAuth'
import type { SyncResourceState } from './wgerTypes'

// ─── Tipos ───

export type SyncDirection = 'wger-to-althea' | 'althea-to-wger' | 'bidirectional'
export type SyncEntityType = 'exercise' | 'routine' | 'ingredient' | 'trainingSession' | 'nutritionPlan' | 'measurement'
export type SyncOperation = 'create' | 'update' | 'delete'

export interface SyncResult {
  success: boolean
  synced: number
  failed: number
  conflicts: number
  errors: string[]
}

export interface SyncOptions {
  direction?: SyncDirection
  entityTypes?: SyncEntityType[]
  force?: boolean
  signal?: AbortSignal
}

// ─── Hash para detección de cambios ───

function computeHash(data: unknown): string {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(16)
}

// ─── Helper para construir WgerRoutineWithDetails ───

async function fetchRoutineWithDetails(routineId: number): Promise<WgerRoutineWithDetails | null> {
  try {
    const detail = await fetchRoutine(routineId)
    const days = detail.days || []

    const allSlots: import('./wgerTypes').WgerSlot[] = []
    const allSlotEntries: import('./wgerTypes').WgerSlotEntry[] = []

    for (const day of days) {
      const daySlots = await fetchSlots({ day: day.id })
      for (const slot of daySlots.results) {
        allSlots.push(slot)
        const entries = await fetchSlotEntries({ slot: slot.id })
        allSlotEntries.push(...entries.results)
      }
    }

    const weightConfigs = new Map()
    const repetitionsConfigs = new Map()
    const setsConfigs = new Map()
    const rirConfigs = new Map()
    const restConfigs = new Map()

    for (const entry of allSlotEntries) {
      const [wc, rc, sc, rc2, rc3] = await Promise.all([
        fetchWeightConfig({ slot_entry: entry.id }),
        fetchRepetitionsConfig({ slot_entry: entry.id }),
        fetchSetsConfig({ slot_entry: entry.id }),
        fetchRirConfig({ slot_entry: entry.id }),
        fetchRestConfig({ slot_entry: entry.id }),
      ])
      if (wc.results[0]) {weightConfigs.set(entry.id, wc.results[0])}
      if (rc.results[0]) {repetitionsConfigs.set(entry.id, rc.results[0])}
      if (sc.results[0]) {setsConfigs.set(entry.id, sc.results[0])}
      if (rc2.results[0]) {rirConfigs.set(entry.id, rc2.results[0])}
      if (rc3.results[0]) {restConfigs.set(entry.id, rc3.results[0])}
    }

    return {
      routine: detail,
      days,
      slots: allSlots,
      slotEntries: allSlotEntries,
      weightConfigs,
      repetitionsConfigs,
      setsConfigs,
      rirConfigs,
      restConfigs,
    }
  } catch {
    return null
  }
}

// ─── Sincronización WGER → Althea (Pull) ───

export async function syncWgerToAlthea(options: SyncOptions = {}): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, conflicts: 0, errors: [] }
  const status = getSyncStatus()

  if (status === 'SYNCING') {
    return { ...result, success: false, errors: ['Sync already in progress'] }
  }

  updateSyncStatus('SYNCING')

  try {
    const entityTypes = options.entityTypes || ['exercise', 'routine']

    for (const entityType of entityTypes) {
      try {
        if (entityType === 'exercise') {
          await syncExercisesIncrementalFromWger(result, options)
        } else if (entityType === 'routine') {
          await syncRoutinesIncrementalFromWger(result, options)
        } else if (entityType === 'ingredient') {
          await syncIngredientsIncrementalFromWger(result, options)
        } else if (entityType === 'trainingSession') {
          await syncTrainingSessionsIncrementalFromWger(result, options)
        } else if (entityType === 'nutritionPlan') {
          await syncNutritionPlansIncrementalFromWger(result, options)
        } else if (entityType === 'measurement') {
          await syncMeasurementsIncrementalFromWger(result, options)
        }
      } catch (err) {
        result.failed++
        result.errors.push(`${entityType}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    updateSyncStatus(result.failed > 0 ? 'FAILED' : 'SYNCED')
    result.success = result.failed === 0
  } catch (err) {
    updateSyncStatus('FAILED')
    result.success = false
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}

async function syncExercisesIncrementalFromWger(result: SyncResult, options: SyncOptions): Promise<void> {
  const state = await getOrCreateResourceState('exercise')
  const lastUpdateGte = state.lastSuccessfulSyncAt || undefined

  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchExerciseList({ limit, offset, language: 2 }, options.signal)
    hasMore = list.next !== null

    for (const item of list.results) {
      try {
        if (lastUpdateGte && item.last_update <= lastUpdateGte) {
          continue
        }

        const info = await fetchExerciseInfo(item.id, options.signal)
        const hash = computeHash(info)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-exercise-${item.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'exercise',
          localEntityId: `wger-exercise-${item.id}`,
          remoteEntityId: String(item.id),
          payload: { data: info, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: item.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`exercise ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
  state.lastSuccessfulSyncAt = new Date().toISOString()
  state.updatedAt = new Date().toISOString()
  await saveResourceState(state)
}

async function syncRoutinesIncrementalFromWger(result: SyncResult, options: SyncOptions): Promise<void> {
  const state = await getOrCreateResourceState('routine')
  const lastUpdateGte = state.lastSuccessfulSyncAt || undefined

  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchRoutines({ limit, offset }, options.signal)
    hasMore = list.next !== null

    for (const routine of list.results) {
      try {
        if (lastUpdateGte && routine.last_update <= lastUpdateGte) {
          continue
        }

        const detail = await fetchRoutineWithDetails(routine.id)
        if (!detail) {continue}

        const hash = computeHash(detail)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-routine-${routine.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const altheaRoutine = mapWgerRoutineToAlthea(detail, () => null)
        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'routine',
          localEntityId: `wger-routine-${routine.id}`,
          remoteEntityId: String(routine.id),
          payload: { data: altheaRoutine, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: routine.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`routine ${routine.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
  state.lastSuccessfulSyncAt = new Date().toISOString()
  state.updatedAt = new Date().toISOString()
  await saveResourceState(state)
}

async function syncIngredientsIncrementalFromWger(result: SyncResult, options: SyncOptions): Promise<void> {
  const state = await getOrCreateResourceState('ingredient')
  const lastUpdateGte = state.lastSuccessfulSyncAt || undefined

  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchIngredients({ limit, offset, lastUpdateGte }, options.signal)
    hasMore = list.next !== null

    for (const item of list.results) {
      try {
        const hash = computeHash(item)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-ingredient-${item.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'ingredient',
          localEntityId: `wger-ingredient-${item.id}`,
          remoteEntityId: String(item.id),
          payload: { data: item, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: item.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`ingredient ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
  state.lastSuccessfulSyncAt = new Date().toISOString()
  state.updatedAt = new Date().toISOString()
  await saveResourceState(state)
}

async function syncTrainingSessionsIncrementalFromWger(result: SyncResult, options: SyncOptions): Promise<void> {
  const state = await getOrCreateResourceState('trainingSession')
  const lastUpdateGte = state.lastSuccessfulSyncAt || undefined

  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchWorkoutSessions({ limit, offset, lastUpdateGte }, options.signal)
    hasMore = list.next !== null

    for (const session of list.results) {
      try {
        const hash = computeHash(session)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-workout-${session.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'trainingSession',
          localEntityId: `wger-workout-${session.id}`,
          remoteEntityId: String(session.id),
          payload: { data: session, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: session.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`workout session ${session.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
  state.lastSuccessfulSyncAt = new Date().toISOString()
  state.updatedAt = new Date().toISOString()
  await saveResourceState(state)
}

async function syncNutritionPlansIncrementalFromWger(result: SyncResult, options: SyncOptions): Promise<void> {
  const state = await getOrCreateResourceState('nutritionPlan')
  const lastUpdateGte = state.lastSuccessfulSyncAt || undefined

  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchNutritionPlans({ limit, offset, lastUpdateGte }, options.signal)
    hasMore = list.next !== null

    for (const plan of list.results) {
      try {
        const hash = computeHash(plan)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-nutritionplan-${plan.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'nutritionPlan',
          localEntityId: `wger-nutritionplan-${plan.id}`,
          remoteEntityId: String(plan.id),
          payload: { data: plan, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: plan.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`nutrition plan ${plan.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
  state.lastSuccessfulSyncAt = new Date().toISOString()
  state.updatedAt = new Date().toISOString()
  await saveResourceState(state)
}

async function syncMeasurementsIncrementalFromWger(result: SyncResult, options: SyncOptions): Promise<void> {
  const state = await getOrCreateResourceState('measurement')

  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchMeasurements({ limit, offset }, options.signal)
    hasMore = list.next !== null

    for (const measurement of list.results) {
      try {
        const hash = computeHash(measurement)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-measurement-${measurement.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'measurement',
          localEntityId: `wger-measurement-${measurement.id}`,
          remoteEntityId: String(measurement.id),
          payload: { data: measurement, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: measurement.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`measurement ${measurement.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
  state.lastSuccessfulSyncAt = new Date().toISOString()
  state.updatedAt = new Date().toISOString()
  await saveResourceState(state)
}

// ─── Sincronización Althea → WGER (Push) ───
// FASE 27: Push real con idempotencia y manejo de errores.

export async function syncAltheaToWger(options: SyncOptions = {}): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, conflicts: 0, errors: [] }
  const status = getSyncStatus()

  if (status === 'SYNCING') {
    return { ...result, success: false, errors: ['Sync already in progress'] }
  }

  const authState = getWgerAuthState()
  if (!authState.canWrite) {
    return { ...result, success: false, errors: ['WGER write operations require authentication'] }
  }

  updateSyncStatus('SYNCING')

  try {
    const allPendingOps = await getPendingOperations()
    const entityTypes = options.entityTypes
    const pendingOps = entityTypes
      ? allPendingOps.filter((op) => entityTypes.includes(op.entityType as SyncEntityType))
      : allPendingOps

    for (const op of pendingOps) {
      try {
        if (op.operation === 'CONFLICT') {
          continue
        }

        const operation = op.operation as SyncOperation

        if (await isAlreadySynced(op)) {
          await markOperationCompleted(op.id, { synced: true, idempotent: true })
          result.synced++
          continue
        }

        if (operation === 'delete') {
          await executeDelete(op)
          await markOperationCompleted(op.id, { deleted: true })
          result.synced++
        } else {
          const conflict = await detectConflict({
            operation,
            entityType: op.entityType,
            localEntityId: op.localEntityId,
            remoteEntityId: op.remoteEntityId,
            payload: op.payload,
          })
          if (conflict.hasConflict) {
            result.conflicts++
            continue
          }

          const remoteId = await executePush({ ...op, operation })
          await markOperationCompleted(op.id, { synced: true, remoteId })
          result.synced++
        }
      } catch (err) {
        await markOperationFailed(op.id, err instanceof Error ? err.message : String(err))
        result.failed++
        result.errors.push(`${op.entityType} ${op.localEntityId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    updateSyncStatus(result.failed > 0 ? 'FAILED' : 'SYNCED')
    result.success = result.failed === 0
  } catch (err) {
    updateSyncStatus('FAILED')
    result.success = false
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}

// ─── Idempotencia: verificar si ya fue sincronizado ───

async function isAlreadySynced(op: { localEntityId: string; entityType: string; payload?: unknown }): Promise<boolean> {
  const currentHash = op.payload && typeof op.payload === 'object' && 'hash' in op.payload
    ? (op.payload as { hash: string }).hash
    : null

  if (!currentHash) {return false}

  const existing = await db.syncQueue
    .filter((item) =>
      item.localEntityId === op.localEntityId &&
      item.entityType === op.entityType &&
      item.status === 'COMPLETED' &&
      item.result && typeof item.result === 'object' && 'remoteId' in item.result,
    )
    .first()

  if (!existing) {return false}

  const existingHash = existing.payload && typeof existing.payload === 'object' && 'hash' in existing.payload
    ? (existing.payload as { hash: string }).hash
    : null

  return existingHash === currentHash
}

// ─── Ejecutar push según tipo de entidad ───

async function executePush(op: { operation: SyncOperation; entityType: string; localEntityId: string; remoteEntityId?: string; payload?: unknown }): Promise<string | number> {
  const payload = op.payload as { data?: Record<string, unknown> } | undefined
  const data = payload?.data ?? {}

  switch (op.entityType) {
    case 'routine':
      return await pushRoutine(op, data)
    case 'trainingSession':
      return await pushWorkout(op, data)
    case 'nutritionPlan':
      return await pushNutritionPlan(op, data)
    case 'measurement':
      return await pushMeasurement(op, data)
    default:
      throw new Error(`Unsupported entity type for push: ${op.entityType}`)
  }
}

async function pushRoutine(op: { operation: SyncOperation; remoteEntityId?: string }, data: Record<string, unknown>): Promise<number> {
  if (op.operation === 'create') {
    const response = await createRoutine(data)
    return response.id
  } else if (op.operation === 'update' && op.remoteEntityId) {
    const response = await updateRoutine(Number(op.remoteEntityId), data)
    return response.id
  }
  throw new Error(`Invalid operation for routine: ${op.operation}`)
}

async function pushWorkout(op: { operation: SyncOperation; remoteEntityId?: string }, data: Record<string, unknown>): Promise<number> {
  if (op.operation === 'create') {
    const response = await createWorkout(data) as { id: number }
    return response.id
  } else if (op.operation === 'update' && op.remoteEntityId) {
    const response = await updateWorkout(Number(op.remoteEntityId), data) as { id: number }
    return response.id
  }
  throw new Error(`Invalid operation for workout: ${op.operation}`)
}

async function pushNutritionPlan(op: { operation: SyncOperation; remoteEntityId?: string }, data: Record<string, unknown>): Promise<number> {
  if (op.operation === 'create') {
    const response = await createNutritionPlan(data) as { id: number }
    return response.id
  } else if (op.operation === 'update' && op.remoteEntityId) {
    const response = await updateNutritionPlan(Number(op.remoteEntityId), data) as { id: number }
    return response.id
  }
  throw new Error(`Invalid operation for nutrition plan: ${op.operation}`)
}

async function pushMeasurement(op: { operation: SyncOperation; remoteEntityId?: string }, data: Record<string, unknown>): Promise<number> {
  if (op.operation === 'create') {
    const response = await createMeasurement(data) as { id: number }
    return response.id
  } else if (op.operation === 'update' && op.remoteEntityId) {
    const response = await updateMeasurement(Number(op.remoteEntityId), data) as { id: number }
    return response.id
  }
  throw new Error(`Invalid operation for measurement: ${op.operation}`)
}

// ─── Ejecutar delete según tipo de entidad ───

async function executeDelete(op: { entityType: string; remoteEntityId?: string }): Promise<void> {
  if (!op.remoteEntityId) {
    throw new Error('Cannot delete without remoteEntityId')
  }

  const remoteId = Number(op.remoteEntityId)

  switch (op.entityType) {
    case 'routine':
      await deleteRoutine(remoteId)
      break
    case 'trainingSession':
      await deleteWorkout(remoteId)
      break
    case 'nutritionPlan':
      await deleteNutritionPlan(remoteId)
      break
    case 'measurement':
      await deleteMeasurement(remoteId)
      break
    default:
      throw new Error(`Unsupported entity type for delete: ${op.entityType}`)
  }
}

// ─── Sincronización de entidad individual ───

export async function syncEntity(
  entityType: SyncEntityType,
  _localEntityId: string,
  direction: SyncDirection = 'bidirectional',
): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, conflicts: 0, errors: [] }

  try {
    if (direction === 'wger-to-althea' || direction === 'bidirectional') {
      const pullResult = await syncWgerToAlthea({ entityTypes: [entityType] })
      result.synced += pullResult.synced
      result.failed += pullResult.failed
      result.conflicts += pullResult.conflicts
      result.errors.push(...pullResult.errors)
    }

    if (direction === 'althea-to-wger' || direction === 'bidirectional') {
      const pushResult = await syncAltheaToWger({ entityTypes: [entityType] })
      result.synced += pushResult.synced
      result.failed += pushResult.failed
      result.conflicts += pushResult.conflicts
      result.errors.push(...pushResult.errors)
    }

    result.success = result.failed === 0
  } catch (err) {
    result.success = false
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}

// ─── Pull changes ───

export async function pullChanges(options: SyncOptions = {}): Promise<SyncResult> {
  return syncWgerToAlthea({ ...options, direction: 'wger-to-althea' })
}

// ─── Push changes ───

export async function pushChanges(options: SyncOptions = {}): Promise<SyncResult> {
  return syncAltheaToWger({ ...options, direction: 'althea-to-wger' })
}

// ─── Resolve conflict ───

export async function resolveConflictById(
  conflictId: string,
  resolution: 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'MERGE' | 'SKIP',
): Promise<boolean> {
  return resolveConflict(conflictId, resolution)
}

// ─── Retry failed sync ───

export async function retryFailedSync(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, conflicts: 0, errors: [] }

  try {
    const failedOps = await db.syncQueue
      .filter((op) => op.status === 'FAILED' && (op.attempts || 0) < 5)
      .toArray()

    for (const op of failedOps) {
      try {
        // Re-enqueue for retry
        await db.syncQueue.update(op.id, {
          status: 'PENDING',
          attempts: (op.attempts || 0) + 1,
          lastAttemptAt: new Date().toISOString(),
          nextRetryAt: null,
          error: null,
        })
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`retry ${op.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Now process the queue
    const syncResult = await syncAltheaToWger()
    result.synced += syncResult.synced
    result.failed += syncResult.failed
    result.conflicts += syncResult.conflicts
    result.errors.push(...syncResult.errors)

    result.success = result.failed === 0
  } catch (err) {
    result.success = false
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}

// ─── Get sync status ───

export function getSyncStatusInfo(): WgerSyncStatus {
  return getSyncStatus()
}

// ─── Fetch all pages helper (FASE 19) ───

export async function fetchAllWgerPages<T>(
  fetcher: (opts: { limit: number; offset: number }) => Promise<{ results: T[]; next: string | null; count: number }>,
  options: { limit?: number; maxPages?: number; signal?: AbortSignal } = {},
): Promise<T[]> {
  const limit = options.limit || 50
  const maxPages = options.maxPages || 100
  const allResults: T[] = []
  let offset = 0
  let page = 0
  let hasMore = true

  while (hasMore && page < maxPages) {
    if (options.signal?.aborted) {
      break
    }

    const response = await fetcher({ limit, offset })
    allResults.push(...response.results)
    hasMore = response.next !== null
    offset += limit
    page++
  }

  return allResults
}

// ─── Sincronización incremental con cursor pagination (FASE 27+) ───

export interface SyncCursor {
  entityType: SyncEntityType
  lastSyncAt: string
  lastId: number
  cursor: string | null
}

const SYNC_RESOURCE_TYPES: SyncEntityType[] = [
  'exercise',
  'ingredient',
  'routine',
  'trainingSession',
  'nutritionPlan',
  'measurement',
]

/**
 * Obtiene el estado de sincronización por recurso.
 * Si no existe, crea uno con valores por defecto.
 */
async function getOrCreateResourceState(entityType: SyncEntityType): Promise<SyncResourceState> {
  const existing = await db.syncQueue.get(`sync-state-${entityType}`)
  if (existing?.payload && typeof existing.payload === 'object') {
    const p = existing.payload as SyncResourceState
    return {
      entityType: p.entityType || entityType,
      lastSuccessfulSyncAt: p.lastSuccessfulSyncAt || null,
      lastCursor: p.lastCursor || null,
      lastId: p.lastId || 0,
      totalSynced: p.totalSynced || 0,
      updatedAt: p.updatedAt || new Date().toISOString(),
    }
  }

  return {
    entityType,
    lastSuccessfulSyncAt: null,
    lastCursor: null,
    lastId: 0,
    totalSynced: 0,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Guarda el estado de sincronización por recurso.
 */
async function saveResourceState(state: SyncResourceState): Promise<void> {
  await db.syncQueue.put({
    id: `sync-state-${state.entityType}`,
    operation: 'update',
    entityType: state.entityType as SyncEntityType,
    localEntityId: `sync-state-${state.entityType}`,
    payload: state,
    attempts: 0,
    createdAt: new Date().toISOString(),
    status: 'COMPLETED',
  })
}

/**
 * Obtiene los cursores de sincronización para todos los recursos.
 */
async function getCursors(): Promise<SyncCursor[]> {
  const cursors: SyncCursor[] = []

  for (const entityType of SYNC_RESOURCE_TYPES) {
    const state = await getOrCreateResourceState(entityType)
    cursors.push({
      entityType,
      lastSyncAt: state.lastSuccessfulSyncAt || new Date(0).toISOString(),
      lastId: state.lastId,
      cursor: state.lastCursor,
    })
  }

  return cursors
}

/**
 * Sincronización incremental con cursor pagination.
 * Solo descarga registros modificados desde la última sync.
 */
export async function syncIncremental(options: SyncOptions = {}): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, conflicts: 0, errors: [] }

  try {
    const cursors = await getCursors()
    const entityTypes = options.entityTypes || SYNC_RESOURCE_TYPES

    for (const cursor of cursors) {
      if (!entityTypes.includes(cursor.entityType)) {
        continue
      }

      try {
        const incrementalResult = await syncEntityIncremental(cursor, options)
        result.synced += incrementalResult.synced
        result.failed += incrementalResult.failed
        result.conflicts += incrementalResult.conflicts
        result.errors.push(...incrementalResult.errors)
      } catch (err) {
        result.failed++
        result.errors.push(`incremental ${cursor.entityType}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    result.success = result.failed === 0
  } catch (err) {
    result.success = false
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}

/**
 * Sincroniza un recurso incrementalmente.
 * Usa cursor pagination y filtros por fecha para no descargar toda la base.
 */
async function syncEntityIncremental(cursor: SyncCursor, options: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, conflicts: 0, errors: [] }

  const state = await getOrCreateResourceState(cursor.entityType)
  const lastUpdateGte = state.lastSuccessfulSyncAt || undefined

  try {
    switch (cursor.entityType) {
      case 'exercise':
        await syncExercisesIncremental(state, lastUpdateGte, result, options)
        break
      case 'ingredient':
        await syncIngredientsIncremental(state, lastUpdateGte, result, options)
        break
      case 'routine':
        await syncRoutinesIncremental(state, lastUpdateGte, result, options)
        break
      case 'trainingSession':
        await syncTrainingSessionsIncremental(state, lastUpdateGte, result, options)
        break
      case 'nutritionPlan':
        await syncNutritionPlansIncremental(state, lastUpdateGte, result, options)
        break
      case 'measurement':
        await syncMeasurementsIncremental(state, lastUpdateGte, result, options)
        break
    }

    state.lastSuccessfulSyncAt = new Date().toISOString()
    state.updatedAt = new Date().toISOString()
    await saveResourceState(state)
  } catch (err) {
    result.failed++
    result.errors.push(`${cursor.entityType}: ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}

/**
 * Sincroniza ejercicios incrementalmente.
 * Usa last_update__gte para filtrar solo registros modificados.
 */
async function syncExercisesIncremental(
  state: SyncResourceState,
  lastUpdateGte: string | undefined,
  result: SyncResult,
  options: SyncOptions,
): Promise<void> {
  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchExerciseList({ limit, offset, language: 2 }, options.signal)
    hasMore = list.next !== null

    for (const item of list.results) {
      try {
        if (lastUpdateGte && item.last_update <= lastUpdateGte) {
          continue
        }

        const info = await fetchExerciseInfo(item.id, options.signal)
        const hash = computeHash(info)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-exercise-${item.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'exercise',
          localEntityId: `wger-exercise-${item.id}`,
          remoteEntityId: String(item.id),
          payload: { data: info, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: item.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`exercise ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
}

/**
 * Sincroniza ingredientes incrementalmente.
 */
async function syncIngredientsIncremental(
  state: SyncResourceState,
  lastUpdateGte: string | undefined,
  result: SyncResult,
  options: SyncOptions,
): Promise<void> {
  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchIngredients({ limit, offset, lastUpdateGte }, options.signal)
    hasMore = list.next !== null

    for (const item of list.results) {
      try {
        const hash = computeHash(item)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-ingredient-${item.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'ingredient',
          localEntityId: `wger-ingredient-${item.id}`,
          remoteEntityId: String(item.id),
          payload: { data: item, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: item.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`ingredient ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
}

/**
 * Sincroniza rutinas incrementalmente.
 */
async function syncRoutinesIncremental(
  state: SyncResourceState,
  lastUpdateGte: string | undefined,
  result: SyncResult,
  options: SyncOptions,
): Promise<void> {
  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchRoutines({ limit, offset }, options.signal)
    hasMore = list.next !== null

    for (const routine of list.results) {
      try {
        if (lastUpdateGte && routine.last_update <= lastUpdateGte) {
          continue
        }

        const detail = await fetchRoutineWithDetails(routine.id)
        if (!detail) {continue}

        const hash = computeHash(detail)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-routine-${routine.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const altheaRoutine = mapWgerRoutineToAlthea(detail, () => null)
        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'routine',
          localEntityId: `wger-routine-${routine.id}`,
          remoteEntityId: String(routine.id),
          payload: { data: altheaRoutine, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: routine.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`routine ${routine.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
}

/**
 * Sincroniza sesiones de entrenamiento incrementalmente.
 */
async function syncTrainingSessionsIncremental(
  state: SyncResourceState,
  lastUpdateGte: string | undefined,
  result: SyncResult,
  options: SyncOptions,
): Promise<void> {
  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchWorkoutSessions({ limit, offset, lastUpdateGte }, options.signal)
    hasMore = list.next !== null

    for (const session of list.results) {
      try {
        const hash = computeHash(session)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-workout-${session.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'trainingSession',
          localEntityId: `wger-workout-${session.id}`,
          remoteEntityId: String(session.id),
          payload: { data: session, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: session.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`workout session ${session.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
}

/**
 * Sincroniza planes de nutrición incrementalmente.
 */
async function syncNutritionPlansIncremental(
  state: SyncResourceState,
  lastUpdateGte: string | undefined,
  result: SyncResult,
  options: SyncOptions,
): Promise<void> {
  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchNutritionPlans({ limit, offset, lastUpdateGte }, options.signal)
    hasMore = list.next !== null

    for (const plan of list.results) {
      try {
        const hash = computeHash(plan)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-nutritionplan-${plan.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'nutritionPlan',
          localEntityId: `wger-nutritionplan-${plan.id}`,
          remoteEntityId: String(plan.id),
          payload: { data: plan, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: plan.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`nutrition plan ${plan.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
}

/**
 * Sincroniza mediciones incrementalmente.
 */
async function syncMeasurementsIncremental(
  state: SyncResourceState,
  _lastUpdateGte: string | undefined,
  result: SyncResult,
  options: SyncOptions,
): Promise<void> {
  const limit = 50
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const list = await fetchMeasurements({ limit, offset }, options.signal)
    hasMore = list.next !== null

    for (const measurement of list.results) {
      try {
        const hash = computeHash(measurement)

        const existing = await db.syncQueue
          .filter((op) => op.localEntityId === `wger-measurement-${measurement.id}` && op.status === 'COMPLETED')
          .first()

        if (existing?.payload && typeof existing.payload === 'object' && 'hash' in existing.payload) {
          if ((existing.payload as { hash: string }).hash === hash) {
            continue
          }
        }

        const opId = await enqueueOperation({
          operation: existing ? 'update' : 'create',
          entityType: 'measurement',
          localEntityId: `wger-measurement-${measurement.id}`,
          remoteEntityId: String(measurement.id),
          payload: { data: measurement, hash, source: 'wger' },
        })

        await markOperationCompleted(opId, { remoteId: measurement.id, hash })
        state.totalSynced++
        result.synced++
      } catch (err) {
        result.failed++
        result.errors.push(`measurement ${measurement.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    offset += limit

    if (options.signal?.aborted) {
      break
    }
  }

  state.lastId = offset
}

// ─── Reconexión / Offline (FASE 27) ───

let wasOffline = false

export function initOfflineSync(): void {
  if (typeof window === 'undefined') {return}

  window.addEventListener('online', async () => {
    if (wasOffline) {
      wasOffline = false
      await syncAltheaToWger()
    }
  })

  window.addEventListener('offline', () => {
    wasOffline = true
  })
}

export async function retryWithReconnection(fn: () => Promise<SyncResult>, maxRetries = 3): Promise<SyncResult> {
  let lastResult: SyncResult = { success: false, synced: 0, failed: 0, conflicts: 0, errors: ['Not attempted'] }

  for (let i = 0; i < maxRetries; i++) {
    try {
      lastResult = await fn()
      if (lastResult.success || lastResult.failed === 0) {
        return lastResult
      }
    } catch (err) {
      lastResult = {
        success: false,
        synced: 0,
        failed: 1,
        conflicts: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      }
    }

    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)))
    }
  }

  return lastResult
}
