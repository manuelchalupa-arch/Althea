// wgerSyncQueue — Cola local para sincronización (Outbox/Inbox).
// FASE 17: Outbox/Inbox.
//
// REGLAS:
// - No perder cambios realizados offline.
// - Cuando vuelva internet: Dexie → Sync Queue → WGER → respuesta → confirmación → marca synced.
// - La cola es persistente en Dexie.
// - Operaciones idempotentes y reintentables.

import { db } from '@/services/storage/db'
import type { SyncOperation, SyncEntityType } from './wgerSyncEngine'

// ─── Tipos ───

export type QueueOperationStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CONFLICT'
  | 'RESOLVED'
  | 'SKIPPED'

export interface SyncQueueItem {
  id: string
  operation: SyncOperation | 'CONFLICT'
  entityType: SyncEntityType
  localEntityId: string
  remoteEntityId?: string
  payload: unknown
  attempts: number
  createdAt: string
  lastAttemptAt?: string
  nextRetryAt?: string
  status: QueueOperationStatus
  error?: string
  result?: unknown
}

export interface EnqueueOptions {
  operation: SyncOperation
  entityType: SyncEntityType
  localEntityId: string
  remoteEntityId?: string
  payload: unknown
}

// ─── Enqueue (Outbox) ───

export async function enqueueOperation(options: EnqueueOptions): Promise<string> {
  const id = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const item: SyncQueueItem = {
    id,
    operation: options.operation,
    entityType: options.entityType,
    localEntityId: options.localEntityId,
    remoteEntityId: options.remoteEntityId,
    payload: options.payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
    status: 'PENDING',
  }

  await db.syncQueue.put(item)
  return id
}

// ─── Obtener operaciones pendientes ───

export async function getPendingOperations(): Promise<SyncQueueItem[]> {
  return db.syncQueue
    .filter((op) => op.status === 'PENDING')
    .sortBy('createdAt')
}

// ─── Obtener operaciones fallidas ───

export async function getFailedOperations(): Promise<SyncQueueItem[]> {
  return db.syncQueue
    .filter((op) => op.status === 'FAILED')
    .sortBy('createdAt')
}

// ─── Marcar como completada ───

export async function markOperationCompleted(
  id: string,
  result?: unknown,
): Promise<void> {
  await db.syncQueue.update(id, {
    status: 'COMPLETED',
    lastAttemptAt: new Date().toISOString(),
    result,
    error: undefined,
  })
}

// ─── Marcar como fallida ───

export async function markOperationFailed(
  id: string,
  error: string,
): Promise<void> {
  const item = await db.syncQueue.get(id)
  if (!item) {return}

  const attempts = (item.attempts || 0) + 1
  const nextRetryAt = calculateNextRetry(attempts)

  await db.syncQueue.update(id, {
    status: 'FAILED',
    attempts,
    lastAttemptAt: new Date().toISOString(),
    nextRetryAt,
    error,
  })
}

// ─── Marcar como en sincronización ───

export async function markOperationSyncing(id: string): Promise<void> {
  await db.syncQueue.update(id, {
    status: 'SYNCING',
    lastAttemptAt: new Date().toISOString(),
  })
}

// ─── Calcular próximo retry (backoff exponencial) ───

function calculateNextRetry(attempts: number): string {
  const baseDelay = 1000
  const maxDelay = 300000
  const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay)
  const jitter = Math.random() * 1000
  return new Date(Date.now() + delay + jitter).toISOString()
}

// ─── Reintentar operaciones fallidas ───

export async function retryFailedOperations(): Promise<number> {
  const failed = await getFailedOperations()
  let retried = 0

  for (const op of failed) {
    if (op.nextRetryAt && new Date(op.nextRetryAt) > new Date()) {
      continue
    }

    await db.syncQueue.update(op.id, {
      status: 'PENDING',
      nextRetryAt: undefined,
      error: undefined,
    })
    retried++
  }

  return retried
}

// ─── Limpiar operaciones completadas antiguas ───

export async function cleanupCompletedOperations(olderThanDays: number = 30): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)

  const completed = await db.syncQueue
    .filter((op) =>
      op.status === 'COMPLETED' &&
      op.createdAt < cutoff.toISOString(),
    )
    .toArray()

  await db.syncQueue.bulkDelete(completed.map((op) => op.id))
  return completed.length
}

// ─── Obtener estadísticas de la cola ───

export interface QueueStats {
  pending: number
  syncing: number
  completed: number
  failed: number
  conflict: number
  total: number
}

export async function getQueueStats(): Promise<QueueStats> {
  const all = await db.syncQueue.toArray()

  return {
    pending: all.filter((op) => op.status === 'PENDING').length,
    syncing: all.filter((op) => op.status === 'SYNCING').length,
    completed: all.filter((op) => op.status === 'COMPLETED').length,
    failed: all.filter((op) => op.status === 'FAILED').length,
    conflict: all.filter((op) => op.status === 'CONFLICT').length,
    total: all.length,
  }
}

// ─── Procesar cola (Inbox) ───

export async function processQueue(
  processor: (item: SyncQueueItem) => Promise<{ success: boolean; result?: unknown; error?: string }>,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const pending = await getPendingOperations()
  let succeeded = 0
  let failed = 0

  for (const item of pending) {
    await markOperationSyncing(item.id)

    try {
      const { success, result, error } = await processor(item)

      if (success) {
        await markOperationCompleted(item.id, result)
        succeeded++
      } else {
        await markOperationFailed(item.id, error || 'Unknown error')
        failed++
      }
    } catch (err) {
      await markOperationFailed(item.id, err instanceof Error ? err.message : String(err))
      failed++
    }
  }

  return { processed: pending.length, succeeded, failed }
}
